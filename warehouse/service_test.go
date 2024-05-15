package main

import (
	"context"
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
	repo := NewMockRepo()
	storage := NewMockStorage()
	downloader := NewMockDownloader()

	tests := []struct {
		name      string
		configure func()
		errorFunc func(error) bool
	}{
		{
			name: "Repo.AssociateServerWithAudio succeeds",
			configure: func() {
				repo.associateServerWithAudio = func() error { return nil }
			},
			errorFunc: func(err error) bool { return err == nil },
		},
		{
			name: "Repo.AssociateServerWithAudio returns unknown error",
			configure: func() {
				repo.associateServerWithAudio = func() error { return fmt.Errorf("123456") }
			},
			errorFunc: func(err error) bool { return strings.Contains(err.Error(), "123456") },
		},
		{
			name: "Downloader.Head returns error",
			configure: func() {
				downloader.head = func() (int64, string, error) { return 0, "", fmt.Errorf("qwerty") }
			},
			errorFunc: func(err error) bool { return strings.Contains(err.Error(), "qwerty") },
		},
		{
			name: "Repo.GetServerStorageSize returns error",
			configure: func() {
				repo.getServerStorageSizeReturn = func() (int64, error) { return 0, fmt.Errorf("codyrhodes") }
			},
			errorFunc: func(err error) bool { return strings.Contains(err.Error(), "codyrhodes") },
		},
		{
			name: "Repo.GetServerStorageSize + Downloader.Head > ServerStorageLimit returns error",
			configure: func() {
				repo.getServerStorageSizeReturn = func() (int64, error) { return 150, nil }
				downloader.head = func() (int64, string, error) { return 200, "application/json", nil }
			},
			// TODO: This should have it's own error type because it is user-facing
			errorFunc: func(err error) bool { return err != nil },
		},
		{
			name: "Downloader.Get returns error",
			configure: func() {
				downloader.get = func() (io.ReadCloser, error) { return nil, fmt.Errorf("randyorton") }
			},
			errorFunc: func(err error) bool { return strings.Contains(err.Error(), "randyorton") },
		},
		{
			name: "Storage.Stash returns error",
			configure: func() {
				storage.stash = func() error { return fmt.Errorf("zelinavega") }
			},
			errorFunc: func(err error) bool { return strings.Contains(err.Error(), "zelinavega") },
		},
		{
			name: "InsertAudioForServer returns error",
			configure: func() {
				repo.insertAudioForServer = func() error { return fmt.Errorf("johncena") }
			},
			errorFunc: func(err error) bool { return strings.Contains(err.Error(), "johncena") },
		},
	}

	s := &Service{
		Repo:               repo,
		Storage:            storage,
		Downloader:         downloader,
		ServerStorageLimit: 300,
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			test.configure()

			err := s.InsertAudioForServer(context.Background(), "audioURL", 1)
			if !test.errorFunc(err) {
				t.Errorf("unexpected error: %v", err)
			}

			repo.reset()
			storage.reset()
			downloader.reset()
		})
	}
}
