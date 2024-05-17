package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
)

type Service struct {
	Downloader         Downloader
	Repo               Repo
	Storage            AudioStorage
	ServerStorageLimit int64
}

// ErrNotEnough Storage is an error that occurs when there is not enough storage available to store an audio file.
// It indicates how much storage is available, and how much is required to store the audio file.
type ErrNotEnoughStorage struct {
	// Available is the amount of storage available, in bytes.
	Available int64

	// Required is the amount of storage required for the failed operation, in bytes.
	Required int64
}

func (e ErrNotEnoughStorage) Error() string {
	return fmt.Sprintf("not enough storage available: available=%d, required=%d", e.Available, e.Required)
}

// InsertAudioResult is the result of inserting an audio file for a server.
// It indicates helpful information about the state after the insertion.
type InsertAudioResult struct {
	RemainingStorage int64
}

// helper function to check if the audio already exists in the database and associate it with the server.
// If the audio exists, it will indicate whether the server has enough storage space.
// If the server does have enough, the associate will be made, and the remaining storage space will be returned.
func (s *Service) tryAssociateExisting(ctx context.Context, repo Repo, audioURL string, serverID int64) (remainingStorage int64, err error) {
	// Check if the audio already exists in the database (we do this indirectly by getting the size)
	audioSize, err := repo.GetAudioSize(ctx, audioURL)
	if err != nil {
		audioNotFound := &ErrAudioNotFound{}
		if errors.As(err, audioNotFound) {
			slog.DebugContext(ctx, "audio did not exist in database", "audioURL", audioURL)
			return 0, audioNotFound
		}
		return 0, fmt.Errorf("error getting audio size: %w", err)
	}
	slog.DebugContext(ctx, "audio already existed in database", "audioURL", audioURL)

	// Get the server's storage size
	storageSpace, err := repo.GetServerStorageSize(ctx, serverID)
	if err != nil {
		return 0, fmt.Errorf("error getting server storage size for server %d: %w", serverID, err)
	}

	// Check if the server has enough storage space
	remainingStorage = s.ServerStorageLimit - storageSpace - audioSize
	if remainingStorage < 0 {
		return 0, ErrNotEnoughStorage{
			Available: storageSpace,
			Required:  audioSize,
		}
	}

	// By this point, the audio exists and the server has enough space; make the association
	err = repo.AssociateServerWithAudio(ctx, audioURL, serverID)
	if err != nil {
		if errors.As(err, &ErrAudioNotFound{}) {
			// If this happens, something went wrong. We just got the size of the audio above, so it should exist.
			return 0, fmt.Errorf("audio did not exist in database, even though we just got its size: %w", err)
		}
		return 0, fmt.Errorf("error attempting to associate server with audio: %w", err)
	}

	return remainingStorage, nil
}

type initialCheckResult struct {
	audioSize        int64
	contentType      string
	remainingStorage int64
}

// helper function to get the audio size of the remote audio and check if the server has enough storage space.
// If the server does not have enough storage space, ErrNotEnoughStorage will be returned.
// If everything is successful, the audio size, content type, and remaining storage space will be returned.
func (s *Service) headAudioAndCheckStorage(ctx context.Context, audioURL string, serverID int64) (*initialCheckResult, error) {
	// This context will be used to cancel the other goroutine if one of them fails
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(2)

	var audioSize int64
	var contentType string
	var storageSpace int64

	// We only send one error so that we can fail fast
	errChan := make(chan error, 1)

	go func() {
		defer wg.Done()
		size, typ, err := s.Downloader.Head(ctx, audioURL)
		if err != nil {
			cancel()
			errChan <- fmt.Errorf("error getting audio size of remote audio: %w", err)
			return
		}
		if audioSize == -1 {
			cancel()
			errChan <- fmt.Errorf("audio size is unknown, even during a HEAD request: %s", audioURL)
			return
		}
		audioSize = size
		contentType = typ
	}()

	go func() {
		defer wg.Done()
		space, err := s.Repo.GetServerStorageSize(ctx, serverID)
		if err != nil {
			cancel()
			errChan <- fmt.Errorf("error getting server storage size: %w", err)
			return
		}
		storageSpace = space
	}()

	go func() {
		wg.Wait()
		close(errChan)
	}()

	for err := range errChan {
		// Return the first error that occurs
		if err != nil {
			return nil, err
		}
	}

	remainingStorage := s.ServerStorageLimit - storageSpace - audioSize
	if remainingStorage < 0 {
		return nil, ErrNotEnoughStorage{
			Available: storageSpace,
			Required:  audioSize,
		}
	}

	return &initialCheckResult{
		audioSize:        audioSize,
		contentType:      contentType,
		remainingStorage: remainingStorage,
	}, nil
}

// helper function to store the audio in the storage and associate it with the server in the database
// It will rollback the storage and the database if an error occurs
func (s *Service) storeAudio(ctx context.Context, audioURL string, serverID int64, data AudioData) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var wg sync.WaitGroup
	errChan := make(chan error, 1)

	wg.Add(2)
	var storageRollback func() error
	var databaseRollback func() error

	go func() {
		defer wg.Done()
		if err := s.Storage.Stash(ctx, audioURL, data); err != nil {
			cancel()
			errChan <- fmt.Errorf("error storing audio: %w", err)
			return
		}
		storageRollback = func() error {
			slog.DebugContext(ctx, "rolling back storage", "audioURL", audioURL)
			return s.Storage.Delete(ctx, audioURL)
		}
	}()

	go func() {
		defer wg.Done()
		if err := s.Repo.InsertAudioForServer(ctx, audioURL, data.ContentLength, serverID); err != nil {
			cancel()
			errChan <- fmt.Errorf("error inserting audio for server: %w", err)
			return
		}
		databaseRollback = func() error {
			slog.DebugContext(ctx, "rolling back database", "audioURL", audioURL)
			return s.Repo.RemoveAudioForServer(ctx, audioURL, serverID)
		}
	}()

	go func() {
		wg.Wait()
		close(errChan)
	}()

	var rollbackOnce sync.Once

	for err := range errChan {
		if err == nil {
			continue
		}
		rollbackOnce.Do(func() {
			if storageRollback != nil {
				if err := storageRollback(); err != nil {
					slog.ErrorContext(ctx, "error rolling back storage", "error", err)
				}
			}
			if databaseRollback != nil {
				if err := databaseRollback(); err != nil {
					slog.ErrorContext(ctx, "error rolling back database", "error", err)
				}
			}
		})
		return err
	}
	return nil
}

// InsertAudioForServer inserts an audio file for a server.
//
// Returns:
// - *InsertAudioResult: if the audio was successfully inserted.
// - error: if the audio could not be inserted.
// Anything else will be considered an internal error.
func (s *Service) InsertAudioForServer(ctx context.Context, audioURL string, serverID int64) (*InsertAudioResult, error) {
	/* Optimistically attempt to associate the server with the audio.
	The audio most likely does not exist in the database, so this will fail. */
	remainingStorage, err := s.tryAssociateExisting(ctx, s.Repo, audioURL, serverID)
	if err == nil {
		return &InsertAudioResult{RemainingStorage: remainingStorage}, nil
	}

	var errNotFound *ErrAudioNotFound
	if !errors.As(err, &errNotFound) {
		slog.Debug("error: %v", err)
		return nil, err
	}

	// Get information about the audio and check if the server has enough storage
	result, err := s.headAudioAndCheckStorage(ctx, audioURL, serverID)
	if err != nil {
		return nil, err
	}

	body, err := s.Downloader.Get(ctx, audioURL)
	if err != nil {
		return nil, fmt.Errorf("error getting audio: %w", err)
	}

	data := AudioData{
		Body:          body,
		ContentType:   result.contentType,
		ContentLength: result.audioSize,
	}

	if err := s.storeAudio(ctx, audioURL, serverID, data); err != nil {
		return nil, fmt.Errorf("error storing audio: %w", err)
	}

	return &InsertAudioResult{RemainingStorage: result.remainingStorage}, nil
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
