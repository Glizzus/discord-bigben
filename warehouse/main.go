package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/sethvargo/go-envconfig"
)

// AudioService is an interface that defines the methods for interacting with audio files.
type AudioService interface {
	// Fetch downloads an audio file from a URL and stores it in the service.
	Fetch(ctx context.Context, audioURL string) error
	// Stream returns a reader for the audio file stored in the service.
	Stream(ctx context.Context, audioURL string) (*AudioStream, error)
	// Delete removes the audio file from the service.
	Delete(ctx context.Context, audioURL string) error
}

// AudioStream is a struct that represents a stream of audio data.
type AudioStream struct {
	// Data is the reader for the audio data.
	Data io.ReadCloser
	// ContentLength is the length of the audio data in bytes. If it is not known, it is set to -1.
	ContentLength string
	// ContentType is the MIME type of the audio data. If it is not known, it is set to an empty string.
	ContentType string
}

// MinioAudioService is an implementation of the AudioService interface that uses Minio as the storage backend.
type MinioAudioService struct {
	client *minio.Client
	bucket string
}

// NewMinioAudioService creates a new MinioAudioService.
// This does not initialize the service; in order to do that, you must call Init.
func NewMinioAudioService(endpoint, accessKey, secretKey, bucket string) (*MinioAudioService, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false,
	})
	if err != nil {
		return nil, fmt.Errorf("error constructing minio client: %w", err)
	}
	return &MinioAudioService{client: client, bucket: bucket}, nil
}

// Fetch downloads an audio file from a URL and stores it in Minio.
func (s *MinioAudioService) Fetch(ctx context.Context, audioURL string) error {
	audioReq, err := http.NewRequestWithContext(ctx, http.MethodGet, audioURL, nil)
	if err != nil {
		return fmt.Errorf("error creating request to fetch audio %s: %w", audioURL, err)
	}

	audioRes, err := http.DefaultClient.Do(audioReq)
	if err != nil {
		return fmt.Errorf("error fetching audio %s: %w", audioURL, err)
	}
	defer func() {
		if err = audioRes.Body.Close(); err != nil {
			slog.Error("error closing response body for audio", "audioURL", audioURL, "error", err)
		}
	}()

	// Some nuance here is that if the content length is not known,
	// it is set to -1. This is also the same convention for uploading
	// to minio. Therefore, we can just pass this value along.
	contentLength := audioRes.ContentLength

	// We need to escape the URL to make it safe for use as a key
	key := url.QueryEscape(audioURL)
	_, err = s.client.PutObject(ctx, s.bucket, key, audioRes.Body, contentLength, minio.PutObjectOptions{
		ContentType: audioRes.Header.Get("Content-Type"),
	})
	if err != nil {
		return fmt.Errorf("error storing audio %s in Minio: %w", audioURL, err)
	}
	return nil
}

// Stream returns a reader for the audio file stored in Minio.
func (s *MinioAudioService) Stream(ctx context.Context, audioURL string) (*AudioStream, error) {
	key := url.QueryEscape(audioURL)
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("error getting audio %s from Minio: %w", audioURL, err)
	}

	stream := &AudioStream{}
	info, err := obj.Stat()
	if err != nil {
		return nil, fmt.Errorf("error doing object stat for audio %s: %w", audioURL, err)
	}

	stream.Data = obj
	stream.ContentLength = strconv.FormatInt(info.Size, 10)
	stream.ContentType = info.ContentType
	return stream, nil
}

// Delete removes the audio file from Minio.
func (s *MinioAudioService) Delete(ctx context.Context, audioURL string) error {
	key := url.QueryEscape(audioURL)
	if err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("error deleting audio %s from Minio: %w", audioURL, err)
	}
	return nil
}

// helper function to pull audioURL from request
// and return an error if it is not present
func pullAudioURL(w http.ResponseWriter, r *http.Request) string {
	audioURL := r.PathValue("audioURL")
	if audioURL == "" {
		http.Error(w, "audioURL is required", http.StatusBadRequest)
		return ""
	}
	return audioURL
}

// helper function to write plain text OK response
func returnOK(w http.ResponseWriter) {
	if _, err := w.Write([]byte("OK")); err != nil {
		slog.Error("error writing response", "error", err)
	}
}

// helper function to construct mux with the given audio service
func constructMux(service AudioService) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		returnOK(w)
	})

	mux.HandleFunc("POST /audio/{audioURL}", func(w http.ResponseWriter, r *http.Request) {
		audioURL := pullAudioURL(w, r)
		if audioURL == "" {
			return
		}
		if err := service.Fetch(r.Context(), audioURL); err != nil {
			slog.Error("error fetching audio", "error", err)
			http.Error(w, "error fetching audio", http.StatusInternalServerError)
			return
		}
		returnOK(w)
	})

	mux.HandleFunc("GET /audio/{audioURL}", func(w http.ResponseWriter, r *http.Request) {
		audioURL := pullAudioURL(w, r)
		if audioURL == "" {
			return
		}
		stream, err := service.Stream(r.Context(), audioURL)

		// In these below operations, we will return a vague error to the client,
		// but for internal purposes, we need to know whether the error happened
		// from Minio to Warehouse, or from Warehouse to the client.
		if err != nil {
			slog.Error("error streaming audio from minio", "error", err)
			goto errorOut
		}
		defer func() {
			if err = stream.Data.Close(); err != nil {
				slog.Error("error closing stream", "error", err)
			}
		}()

		w.Header().Set("Content-Length", stream.ContentLength)
		w.Header().Set("Content-Type", stream.ContentType)
		_, err = io.Copy(w, stream.Data)
		if err != nil {
			slog.Error("error streaming audio to client", "error", err)
			goto errorOut
		}
		return

		// This goto is nice for now, but anything more complex should be refactored
	errorOut:
		http.Error(w, "error streaming audio", http.StatusInternalServerError)
	})

	mux.HandleFunc("DELETE /audio/{audioURL}", func(w http.ResponseWriter, r *http.Request) {
		audioURL := pullAudioURL(w, r)
		if audioURL == "" {
			return
		}
		if err := service.Delete(r.Context(), audioURL); err != nil {
			slog.Error("error deleting audio", "error", err)
			http.Error(w, "error deleting audio", http.StatusInternalServerError)
			return
		}
		returnOK(w)
	})
	return mux
}

type MinioConfig struct {
	Endpoint  string `env:"ENDPOINT, required"`
	AccessKey string `env:"ACCESS_KEY, required"`
	SecretKey string `env:"SECRET_KEY, required"`
	Bucket    string `env:"BUCKET, default=audio"`
}

type Config struct {
	Minio MinioConfig `env:", prefix=MINIO_"`
	Host  string      `env:"HOST, default=localhost"`
	Port  string      `env:"PORT, default=10002"`
}

func main() {
	if os.Getenv("WAREHOUSE_DEBUG") != "" {
		slog.SetLogLoggerLevel(slog.LevelDebug)
		slog.Debug("Debug logging enabled")
	}

	var config Config
	err := envconfig.ProcessWith(context.Background(), &envconfig.Config{
		Lookuper: envconfig.PrefixLookuper("WAREHOUSE_", envconfig.OsLookuper()),
		Target:   &config,
	})
	if err != nil {
		log.Fatalf("error parsing config: %v", err)
	}

	service, err := NewMinioAudioService(
		config.Minio.Endpoint,
		config.Minio.AccessKey,
		config.Minio.SecretKey,
		config.Minio.Bucket)
	if err != nil {
		log.Fatalf("error creating minio audio service: %v", err)
	}

	mux := constructMux(service)
	server := &http.Server{
		Addr:              config.Host + ":" + config.Port,
		ReadHeaderTimeout: 10 * time.Second,
		Handler:           mux,
	}

	slog.Info("Starting warehouse server", "host", config.Host, "port", config.Port)
	if err = server.ListenAndServe(); err != nil {
		log.Fatalf("error starting server: %v", err)
	}
}
