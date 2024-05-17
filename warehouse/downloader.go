package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
)

// Downloader is an interface that defines the methods for downloading files.
type Downloader interface {
	Head(ctx context.Context, url string) (size int64, contentType string, err error)
	Get(ctx context.Context, url string) (body io.ReadCloser, err error)
}

type StdLibDownloader struct{}

// helper function that quickly creates and executes a request, complete with error wrapping
func reqHelper(ctx context.Context, method, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating %s request: %w", method, err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error executing %s request: %w", method, err)
	}

	return resp, nil
}

func (s *StdLibDownloader) Head(ctx context.Context, url string) (size int64, contentType string, err error) {
	resp, err := reqHelper(ctx, http.MethodHead, url)
	if err != nil {
		return 0, "", err
	}

	defer func() {
		if err := resp.Body.Close(); err != nil {
			slog.Error("error closing response body", "error", err)
		}
	}()

	return resp.ContentLength, resp.Header.Get("Content-Type"), nil
}

func (s *StdLibDownloader) Get(ctx context.Context, url string) (io.ReadCloser, error) {
	resp, err := reqHelper(ctx, http.MethodGet, url)
	if err != nil {
		return nil, err
	}

	return resp.Body, nil
}
