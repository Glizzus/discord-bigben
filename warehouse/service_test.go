package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
)

type mockRepo struct {
	associateServerWithAudio func() error
	removeAudioForServer     func() error

	insertAudioForServer func() error
	audioHasServers      func() (bool, error)

	getAudioSize               func() (int64, error)
	removeAudio                func() error
	getServerStorageSizeReturn func() (int64, error)
}

func NewMockRepo() *mockRepo {
	repo := &mockRepo{}
	repo.reset()
	return repo
}

func (m *mockRepo) AssociateServerWithAudio(ctx context.Context, audioURL string, serverID int64) error {
	return m.associateServerWithAudio()
}

func (m *mockRepo) RemoveAudioForServer(ctx context.Context, audioURL string, serverID int64) error {
	return m.removeAudioForServer()
}

func (m *mockRepo) InsertAudioForServer(ctx context.Context, audioURL string, audioSize, serverID int64) error {
	return m.insertAudioForServer()
}

func (m *mockRepo) AudioHasServers(ctx context.Context, audioURL string) (bool, error) {
	return m.audioHasServers()
}

func (m *mockRepo) GetAudioSize(ctx context.Context, audioURL string) (int64, error) {
	return m.getAudioSize()
}

func (m *mockRepo) RemoveAudio(ctx context.Context, audioURL string) error {
	return m.removeAudio()
}

func (m *mockRepo) GetServerStorageSize(ctx context.Context, serverID int64) (int64, error) {
	return m.getServerStorageSizeReturn()
}

func (m *mockRepo) reset() {
	m.associateServerWithAudio = func() error { return ErrAudioNotFound{URL: "audioURL"} }
	m.removeAudioForServer = func() error { return nil }

	m.insertAudioForServer = func() error { return nil }
	m.audioHasServers = func() (bool, error) { return true, nil }

	m.getAudioSize = func() (int64, error) { return 0, ErrAudioNotFound{URL: "audioURL"} }
	m.removeAudio = func() error { return nil }
	m.getServerStorageSizeReturn = func() (int64, error) { return 1, nil }
}

type mockStorage struct {
	stash  func() error
	stream func() (*AudioData, error)
	delete func() error
}

func (m *mockStorage) Stash(ctx context.Context, audioURL string, data AudioData) error {
	return m.stash()
}

func (m *mockStorage) Stream(ctx context.Context, audioURL string) (*AudioData, error) {
	return m.stream()
}

func (m *mockStorage) Delete(ctx context.Context, audioURL string) error {
	return m.delete()
}

func (m *mockStorage) reset() {
	simpleData := &AudioData{
		ContentType:   "application/json",
		ContentLength: 2,
		Body:          io.NopCloser(strings.NewReader("{}")),
	}
	m.stash = func() error { return nil }
	m.stream = func() (*AudioData, error) { return simpleData, nil }
	m.delete = func() error { return nil }
}

func NewMockStorage() *mockStorage {
	storage := &mockStorage{}
	storage.reset()
	return storage
}

type mockDownloader struct {
	head func() (int64, string, error)
	get  func() (io.ReadCloser, error)
}

func NewMockDownloader() *mockDownloader {
	downloader := &mockDownloader{}
	downloader.reset()
	return downloader
}

func (m *mockDownloader) Head(ctx context.Context, audioURL string) (int64, string, error) {
	return m.head()
}

func (m *mockDownloader) Get(ctx context.Context, audioURL string) (io.ReadCloser, error) {
	return m.get()
}

func (m *mockDownloader) reset() {
	m.head = func() (int64, string, error) { return 2, "application/json", nil }
	m.get = func() (io.ReadCloser, error) { return io.NopCloser(strings.NewReader("{}")), nil }
}

func TestService_InsertAudioForServer(t *testing.T) {

	const serverStorageLimit = 300

	repo := NewMockRepo()
	storage := NewMockStorage()
	downloader := NewMockDownloader()

	tests := []struct {
		name         string
		configure    func()
		validateFunc func(*InsertAudioResult, error) bool
	}{
		{
			name: "unknown error when checking if audio initially exists",
			configure: func() {
				repo.getAudioSize = func() (int64, error) { return 0, fmt.Errorf("8675309") }
			},
			validateFunc: func(result *InsertAudioResult, err error) bool {
				return strings.Contains(err.Error(), "8675309")
			},
		},
		{
			name: "audio initially exists, but error when checking if server has enough storage",
			configure: func() {
				repo.getAudioSize = func() (int64, error) { return 150, nil }
				repo.getServerStorageSizeReturn = func() (int64, error) { return 0, fmt.Errorf("dvorak") }
			},
			validateFunc: func(result *InsertAudioResult, err error) bool {
				return strings.Contains(err.Error(), "dvorak")
			},
		},
		{
			name: "audio initially exists, but server does not have enough storage",
			configure: func() {
				repo.getAudioSize = func() (int64, error) { return 150, nil }
				repo.getServerStorageSizeReturn = func() (int64, error) { return 200, nil }
			},
			validateFunc: func(result *InsertAudioResult, err error) bool {
				var actualErr ErrNotEnoughStorage
				if !errors.As(err, &actualErr) {
					t.Logf("expected ErrNotEnoughStorage, got %T", err)
					return false
				}
				if actualErr.Available != 200 || actualErr.Required != 150 {
					t.Logf("expected ErrNotEnoughStorage{Available: 200, Required: 150}, got %v", actualErr)
					return false
				}
				return true
			},
		},
		{
			name: "audio initially exists, server has enough storage, but unknown error making the association",
			configure: func() {
				repo.getAudioSize = func() (int64, error) { return 150, nil }
				repo.getServerStorageSizeReturn = func() (int64, error) { return 150, nil }
				repo.associateServerWithAudio = func() error { return fmt.Errorf("dogmeat") }
			},
			validateFunc: func(result *InsertAudioResult, err error) bool {
				return strings.Contains(err.Error(), "dogmeat")
			},
		},
		{
			name: "audio initially exists, server has enough storage, everything succeeds",
			configure: func() {
				repo.getAudioSize = func() (int64, error) { return 150, nil }
				repo.associateServerWithAudio = func() error { return nil }
				repo.getServerStorageSizeReturn = func() (int64, error) { return 5, nil }
				downloader.head = func() (int64, string, error) {
					t.Errorf("head should not have been called because the audio already exists")
					return 0, "", nil
				}
			},
			validateFunc: func(result *InsertAudioResult, err error) bool {
				return result.RemainingStorage == 145 && err == nil
			},
		},

		{
			name: "audio does not initially exist, error when getting audio size",
			configure: func() {
				downloader.head = func() (int64, string, error) { return 0, "", fmt.Errorf("qwerty") }
			},
			validateFunc: func(result *InsertAudioResult, err error) bool {
				return strings.Contains(err.Error(), "qwerty")
			},
		},
		{
			name: "audio does not initially exist, error when getting server storage size",
			configure: func() {
				downloader.head = func() (int64, string, error) { return 150, "application/json", nil }
				repo.getServerStorageSizeReturn = func() (int64, error) { return 0, fmt.Errorf("asdfgh") }
			},
			validateFunc: func(result *InsertAudioResult, err error) bool {
				return strings.Contains(err.Error(), "asdfgh")
			},
		},
		{
			name: "audio does not initially exist, server does not have enough storage",
			configure: func() {
				repo.getServerStorageSizeReturn = func() (int64, error) { return 150, nil }
				downloader.head = func() (int64, string, error) { return 200, "application/json", nil }
			},
			validateFunc: func(result *InsertAudioResult, err error) bool {
				var actualErr ErrNotEnoughStorage
				if !errors.As(err, &actualErr) {
					t.Logf("expected ErrNotEnoughStorage, got %T", err)
					return false
				}
				if actualErr.Available != 150 || actualErr.Required != 200 {
					t.Logf("expected ErrNotEnoughStorage{Available: 150, Required: 200}, got %v", actualErr)
					return false
				}
				return true
			},
		},
		{
			name: "audio does not initially exist, server has enough storage, error when downloading",
			configure: func() {
				repo.getServerStorageSizeReturn = func() (int64, error) { return 150, nil }
				downloader.head = func() (int64, string, error) { return 150, "application/json", nil }
				downloader.get = func() (io.ReadCloser, error) { return nil, fmt.Errorf("zxcvbn") }
			},
			validateFunc: func(result *InsertAudioResult, err error) bool {
				return strings.Contains(err.Error(), "zxcvbn")
			},
		},
		{
			name: "audio does not initially exist, server has enough storage, error when storing",
			configure: func() {
				storage.stash = func() error { return fmt.Errorf("zelinavega") }
			},
			validateFunc: func(result *InsertAudioResult, err error) bool {
				return strings.Contains(err.Error(), "zelinavega")
			},
		},
		{
			name: "audio does not initially exist, server has enough storage, error when inserting",
			configure: func() {
				repo.insertAudioForServer = func() error { return fmt.Errorf("johncena") }
			},
			validateFunc: func(result *InsertAudioResult, err error) bool {
				return strings.Contains(err.Error(), "johncena")
			},
		},
		{
			name:      "audio does not initially exist, server has enough storage, everything succeeds",
			configure: func() {},
			validateFunc: func(result *InsertAudioResult, err error) bool {
				// 300 - 2 (from the head request) - 1 (used storage) = 297
				return result.RemainingStorage == 297 && err == nil
			},
		},
	}

	s := &Service{
		Repo:               repo,
		Storage:            storage,
		Downloader:         downloader,
		ServerStorageLimit: serverStorageLimit,
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			test.configure()

			result, err := s.InsertAudioForServer(context.Background(), "audioURL", 1)
			if !test.validateFunc(result, err) {
				t.Errorf("unexpected result: %v, %v", result, err)
			}

			repo.reset()
			storage.reset()
			downloader.reset()
		})
	}
}

func TestService_RemoveAudioForServer(t *testing.T) {
	repo := NewMockRepo()
	storage := NewMockStorage()

	tests := []struct {
		name      string
		configure func()
		errorFunc func(error) bool
	}{
		{
			name: "Repo.RemoveAudioForServer returns error",
			configure: func() {
				repo.removeAudioForServer = func() error { return fmt.Errorf("123456") }
			},
			errorFunc: func(err error) bool { return strings.Contains(err.Error(), "123456") },
		},
		{
			name: "Repo.AudioHasServers returns error",
			configure: func() {
				repo.audioHasServers = func() (bool, error) { return false, fmt.Errorf("qwerty") }
			},
			errorFunc: func(err error) bool { return strings.Contains(err.Error(), "qwerty") },
		},
		{
			name: "Repo.AudioHasServers returns true, no error",
			configure: func() {
				repo.removeAudio = func() error {
					return fmt.Errorf("repo.removeAudio should not have been called because the audio is associated with a server")
				}
			},
			errorFunc: func(err error) bool { return err == nil },
		},
		{
			name: "Repo.RemoveAudio returns error",
			configure: func() {
				repo.audioHasServers = func() (bool, error) { return false, nil }
				repo.removeAudio = func() error { return fmt.Errorf("gunther") }
			},
			errorFunc: func(err error) bool { return strings.Contains(err.Error(), "gunther") },
		},
		{
			name: "Storage.Delete returns error",
			configure: func() {
				repo.audioHasServers = func() (bool, error) { return false, nil }
				storage.delete = func() error { return fmt.Errorf("tripleh") }
			},
			errorFunc: func(err error) bool { return strings.Contains(err.Error(), "tripleh") },
		},
		{
			name: "Repo.AudioHasServers returns false and everything succeeds",
			configure: func() {
				repo.audioHasServers = func() (bool, error) { return false, nil }
			},
			errorFunc: func(err error) bool { return err == nil },
		},
	}

	s := &Service{
		Repo:    repo,
		Storage: storage,
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			test.configure()

			err := s.RemoveAudioForServer(context.Background(), "audioURL", 1)
			if !test.errorFunc(err) {
				t.Errorf("unexpected error: %v", err)
			}

			repo.reset()
			storage.reset()
			
		})
	}
}
