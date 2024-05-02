package main

import (
	"io"
	"log"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"context"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func getMinioClient() *minio.Client {
	endpoint := os.Getenv("WAREHOUSE_MINIO_ENDPOINT")
	accessKeyID := os.Getenv("WAREHOUSE_MINIO_ACCESS_KEY")
	secretAccessKey := os.Getenv("WAREHOUSE_MINIO_SECRET_KEY")

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKeyID, secretAccessKey, ""),
		Secure: false,
	})
	if err != nil {
		log.Fatalf("Failed to create minio client: %v", err)
	}
	return client
}

func main() {

	const debugVar = "WAREHOUSE_DEBUG"
	if os.Getenv(debugVar) != "" {
		slog.SetLogLoggerLevel(slog.LevelDebug)
		slog.Debug("Debug logging enabled")
	}

	minioClient := getMinioClient()
	if err := minioClient.MakeBucket(context.Background(), "audio", minio.MakeBucketOptions{}); err != nil {
		exists, errBucketExists := minioClient.BucketExists(context.Background(), "audio")
		if errBucketExists == nil && exists {
			slog.Debug("We already own 'audio' bucket")
		} else {
			slog.Debug("Failed to create 'audio' bucket", "error", err)
			return
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})

	mux.HandleFunc("POST /audio/{audioURL}", func(w http.ResponseWriter, r *http.Request) {
		audioURL := r.PathValue("audioURL")
		if audioURL == "" {
			http.Error(w, "audioURL is required", http.StatusBadRequest)
			return
		}

		audioReq, err := http.NewRequestWithContext(r.Context(), "GET", audioURL, nil)
		if err != nil {
			http.Error(w, "error creating audio request", http.StatusInternalServerError)
			return
		}

		audioRes, err := http.DefaultClient.Do(audioReq)
		if err != nil {
			http.Error(w, "error fetching audio", http.StatusInternalServerError)
			return
		}
		defer audioRes.Body.Close()

		// Some nuance here is that if the content length is not known,
		// it is set to -1. This is also the same convention for uploading
		// to minio. Therefore, we can just pass this value along.
		contentLength := audioRes.ContentLength

		// We need to escape the URL to make it safe for use as a key
		key := url.QueryEscape(audioURL)
		_, err = minioClient.PutObject(r.Context(), "audio", key, audioRes.Body, contentLength, minio.PutObjectOptions{
			ContentType: audioRes.Header.Get("Content-Type"),
		})
		if err != nil {
			http.Error(w, "error uploading audio", http.StatusInternalServerError)
			return
		}

		w.Write([]byte("OK"))
	})

	mux.HandleFunc("GET /audio/{audioURL}", func(w http.ResponseWriter, r *http.Request) {
		audioURL := r.PathValue("audioURL")
		if audioURL == "" {
			http.Error(w, "audioURL is required", http.StatusBadRequest)
			return
		}
		slog.Debug("Fetching audio", "audioURL", audioURL)

		key := url.QueryEscape(audioURL)
		obj, err := minioClient.GetObject(r.Context(), "audio", key, minio.GetObjectOptions{})
		if err != nil {
			http.Error(w, "error fetching audio", http.StatusInternalServerError)
			return
		}
		defer obj.Close()

		info, err := obj.Stat()
		if err != nil {
			http.Error(w, "error fetching audio", http.StatusInternalServerError)
			return
		}

		if info.ContentType != "" {
			w.Header().Set("Content-Type", info.ContentType)
		}
		w.Header().Set("Content-Length", strconv.FormatInt(info.Size, 10))

		_, err = io.Copy(w, obj)
		if err != nil {
			http.Error(w, "error streaming audio", http.StatusInternalServerError)
			return
		}
	})

	mux.HandleFunc("DELETE /audio/{audioURL}", func(w http.ResponseWriter, r *http.Request) {
		audioURL := r.PathValue("audioURL")
		if audioURL == "" {
			http.Error(w, "audioURL is required", http.StatusBadRequest)
			return
		}

		key := url.QueryEscape(audioURL)
		err := minioClient.RemoveObject(r.Context(), "audio", key, minio.RemoveObjectOptions{})
		if err != nil {
			http.Error(w, "error deleting audio", http.StatusInternalServerError)
			return
		}

		w.Write([]byte("OK"))
	})

	const port = "10002"
	slog.Info("Starting warehouse server", "port", port)
	http.ListenAndServe(":"+port, mux)
}
