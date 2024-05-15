package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
)

type Downloader interface {
	Head(ctx context.Context, url string) (int64, string, error)
	Get(ctx context.Context, url string) (io.ReadCloser, error)
}

type StdLibDownloader struct{}

func (s *StdLibDownloader) Head(ctx context.Context, url string) (int64, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
	if err != nil {
		return 0, "", fmt.Errorf("error creating HEAD request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, "", fmt.Errorf("error fetching HEAD: %w", err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			slog.Error("error closing response body", "error", err)
		}
	}()

	return resp.ContentLength, resp.Header.Get("Content-Type"), nil
}

func (s *StdLibDownloader) Get(ctx context.Context, url string) (io.ReadCloser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating GET request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error fetching GET: %w", err)
	}

	return resp.Body, nil
}

type Service struct {
	Downloader Downloader
	Repo    Repo
	Storage AudioStorage
	ServerStorageLimit int64
}

type ErrNotEnoughStorage struct {
	Available int64
	Required  int64
}

func (e ErrNotEnoughStorage) Error() string {
	return fmt.Sprintf("not enough storage available: available=%d, required=%d", e.Available, e.Required)
}

func (s *Service) InsertAudioForServer(ctx context.Context, audioURL string, serverID int64) error {
	/* Optimistically attempt to associate the server with the audio.
	The audio most likely does not exist in the database, so this will fail. */
	err := s.Repo.AssociateServerWithAudio(ctx, audioURL, serverID)
	if err == nil {
		slog.Debug("audio already existed in database", "audioURL", audioURL)
		return nil
	}
	// This means it is a "real" error, so we should return it.
	if !errors.As(err, &ErrAudioNotFound{}) {
		return fmt.Errorf("error associating server with audio: %w", err)
	}
	slog.Debug("audio did not exist in database", "audioURL", audioURL)

	var wg sync.WaitGroup
	wg.Add(2)

	// We use a buffered error channel to fail fast if there is an error.
	errChan := make(chan error, 1)

	/* We pull the size from the HEAD request because HEAD requests are more likely
	to have accurate content-lengths than GET requests, which can be chunked.
	We pull the content-type from the HEAD request because it makes more semantic sense. */
	var audioSize int64
	var contentType string

	var storageSpace int64

	go func() {
		defer wg.Done()
		audioSize, contentType, err = s.Downloader.Head(ctx, audioURL)
		if err != nil {
			select {
			case errChan <- fmt.Errorf("error getting audio size of remote before download: %w", err):
			default:
			}
		}
		if audioSize == -1 {
			select {
			case errChan <- fmt.Errorf("audio size is unknown before download: %s", audioURL):
			default:
			}
		}
	}()

	go func() {
		defer wg.Done()
		storageSpace, err = s.Repo.GetServerStorageSize(ctx, serverID)
		if err != nil {
			select {
			case errChan <- fmt.Errorf("error getting storage size: %w", err):
			default:
			}
		}
	}()

	// This goroutine closes the error channel if all goroutines complete successfully.
	go func() {
		wg.Wait()
		close(errChan)
	}()

	for err := range errChan {
		if err != nil {
			return err
		}
	}

	// Do a subtraction here to avoid overflow
	if storageSpace > s.ServerStorageLimit-audioSize {
		return ErrNotEnoughStorage{
			Available: storageSpace,
			Required:  audioSize,
		}
	}

	body, err := s.Downloader.Get(ctx, audioURL)
	if err != nil {
		return fmt.Errorf("error getting audio: %w", err)
	}

	data := AudioData{
		Body:        body,
		ContentType: contentType,
		ContentLength: audioSize,
	}

	errChan = make(chan error, 2)

	wg.Add(2)
	var mutex sync.Mutex
	rollbacks := []func() error{}

	go func() {
		defer wg.Done()
		if err := s.Storage.Stash(ctx, audioURL, data); err != nil {
			errChan <- fmt.Errorf("error storing audio: %w", err)
		}
		mutex.Lock()
		rollbacks = append(rollbacks, func() error {
			slog.Debug("rolling back storage", "audioURL", audioURL)
			return s.Storage.Delete(ctx, audioURL)
		})
		mutex.Unlock()
	}()

	go func() {
		defer wg.Done()
		if err := s.Repo.InsertAudioForServer(ctx, audioURL, audioSize, serverID); err != nil {
			errChan <- fmt.Errorf("error inserting audio for server: %w", err)
		}
		mutex.Lock()
		rollbacks = append(rollbacks, func() error {
			slog.Debug("rolling back database", "audioURL", audioURL)
			return s.Repo.RemoveAudioForServer(ctx, audioURL, serverID)
		})
		mutex.Unlock()
	}()

	go func() {
		wg.Wait()
		close(errChan)
	}()

	for err := range errChan {
		if err != nil {
			// Ensure no more rollbacks are being added
			mutex.Lock()
			for _, rollback := range rollbacks {
				if err := rollback(); err != nil {
					slog.Error("error rolling back", "error", err)
				}
			}
			mutex.Unlock()
			return err
		}
	}

	return nil
}

func (s *Service) RemoveAudioForServer(ctx context.Context, audioURL string, serverID int64) error {
	/* We will not run this concurrently because if the audio is sucessfully removed from the database,
	but not from the storage, then that is fine. It is our fault, and it will not count against the user's storage size.
	Also, bucket storage is dirt cheap */
	if err := s.Repo.RemoveAudioForServer(ctx, audioURL, serverID); err != nil {
		return fmt.Errorf("error removing audio for server: %w", err)
	}

	if hasServers, err := s.Repo.AudioHasServers(ctx, audioURL); err != nil {
		return fmt.Errorf("error checking if audio has servers: %w", err)
	} else if hasServers {
		// If the audio has servers, we don't want to delete it from storage.
		return nil
	}

	// This removes the audio entirely, not just its association with the server.
	if err := s.Repo.RemoveAudio(ctx, audioURL); err != nil {
		return fmt.Errorf("error removing audio: %w", err)
	}

	if err := s.Storage.Delete(ctx, audioURL); err != nil {
		return fmt.Errorf("error deleting audio: %w", err)
	}

	return nil
}

func (s *Service) StreamAudio(ctx context.Context, audioURL string) (*AudioData, error) {
	return s.Storage.Stream(ctx, audioURL)
}
