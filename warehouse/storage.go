package main

import (
	"context"
	"fmt"
	"net/url"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// AudioStorage is an interface that defines the methods for interacting with audio files.
type AudioStorage interface {
	// Stash downloads an audio file from a URL and stores it in the service.
	Stash(ctx context.Context, audioURL string, data AudioData) error
	// Stream returns a reader for the audio file stored in the service.
	Stream(ctx context.Context, audioURL string) (*AudioData, error)
	// Delete removes the audio file from the service.
	Delete(ctx context.Context, audioURL string) error
}

// MinioAudioStorage is an implementation of the AudioService interface that uses Minio as the storage backend.
type MinioAudioStorage struct {
	client *minio.Client
	bucket string
}

// NewMinioAudioStorage creates a new MinioAudioService.
// This does not initialize the service; in order to do that, you must call Init.
func NewMinioAudioStorage(endpoint, accessKey, secretKey, bucket string) (*MinioAudioStorage, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false,
	})
	if err != nil {
		return nil, fmt.Errorf("error constructing minio client: %w", err)
	}
	return &MinioAudioStorage{client: client, bucket: bucket}, nil
}

// Stash downloads an audio file from a URL and stores it in Minio.
func (s *MinioAudioStorage) Stash(ctx context.Context, audioURL string, data AudioData) error {
	key := url.QueryEscape(audioURL)
	_, err := s.client.PutObject(ctx, s.bucket, key, data.Body, data.ContentLength, minio.PutObjectOptions{
		ContentType: data.ContentType,
	})
	if err != nil {
		return fmt.Errorf("error storing audio %s in Minio: %w", audioURL, err)
	}
	return nil
}

// Stream returns a reader for the audio file stored in Minio.
func (s *MinioAudioStorage) Stream(ctx context.Context, audioURL string) (*AudioData, error) {
	key := url.QueryEscape(audioURL)
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("error getting audio %s from Minio: %w", audioURL, err)
	}

	stream := &AudioData{}
	info, err := obj.Stat()
	if err != nil {
		return nil, fmt.Errorf("error doing object stat for audio %s: %w", audioURL, err)
	}

	stream.Body = obj
	stream.ContentLength = info.Size
	stream.ContentType = info.ContentType
	return stream, nil
}

// Delete removes the audio file from Minio.
func (s *MinioAudioStorage) Delete(ctx context.Context, audioURL string) error {
	key := url.QueryEscape(audioURL)
	if err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("error deleting audio %s from Minio: %w", audioURL, err)
	}
	return nil
}
