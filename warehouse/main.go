package main

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/mysql"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	_ "github.com/go-sql-driver/mysql"
	"github.com/sethvargo/go-envconfig"
)

type AudioData struct {
	Body          io.ReadCloser
	ContentType   string
	ContentLength int64
}

// helper function to pull audioURL from request
// and return an error if it is not present
func pullPathParams(w http.ResponseWriter, r *http.Request) (guildID int64, audioURL string, err error) {
	guildIDStr := r.PathValue("guildID")
	if guildIDStr == "" {
		http.Error(w, "guildID is required", http.StatusBadRequest)
		return 0, "", fmt.Errorf("guildID is required")
	}

	guildID, err = strconv.ParseInt(guildIDStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid guildID - must be an unsigned int64", http.StatusBadRequest)
		return 0, "", fmt.Errorf("invalid guildID")
	}

	audioURL = r.PathValue("audioURL")
	if audioURL == "" {
		http.Error(w, "audioURL is required", http.StatusBadRequest)
		return 0, "", fmt.Errorf("audioURL is required")
	}
	return guildID, audioURL, nil
}

// helper function to write plain text OK response
func returnOK(w http.ResponseWriter) {
	if _, err := w.Write([]byte("OK")); err != nil {
		slog.Error("error writing response", "error", err)
	}
}

// helper function to construct mux with the given audio service
func constructMux(service Service) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		returnOK(w)
	})

	mux.HandleFunc("POST /soundcron/{guildID}/{audioURL}", func(w http.ResponseWriter, r *http.Request) {
		guildID, audioURL, err := pullPathParams(w, r)
		if err != nil {
			return
		}
		if err := service.InsertAudioForServer(r.Context(), audioURL, guildID); err != nil {
			slog.Error("error inserting audio for server", "error", err)
			http.Error(w, "error associating server with audio", http.StatusInternalServerError)
			return
		}
		returnOK(w)
	})

	mux.HandleFunc("GET /soundcron/{guildID}/{audioURL}", func(w http.ResponseWriter, r *http.Request) {
		// For now, we don't use the guildID here. It might be good for metrics later.
		_, audioURL, err := pullPathParams(w, r)
		if err != nil {
			return
		}

		stream, err := service.StreamAudio(r.Context(), audioURL)

		// In these below operations, we will return a vague error to the client,
		// but for internal purposes, we need to know whether the error happened
		// from Minio to Warehouse, or from Warehouse to the client.
		if err != nil {
			slog.Error("error streaming audio from minio", "error", err)
			goto errorOut
		}
		defer func() {
			if err = stream.Body.Close(); err != nil {
				slog.Error("error closing stream", "error", err)
			}
		}()

		w.Header().Set("Content-Length", strconv.FormatInt(stream.ContentLength, 10))
		w.Header().Set("Content-Type", stream.ContentType)
		_, err = io.Copy(w, stream.Body)
		if err != nil {
			slog.Error("error streaming audio to client", "error", err)
			goto errorOut
		}
		return

		// This goto is nice for now, but anything more complex should be refactored
	errorOut:
		http.Error(w, "error streaming audio", http.StatusInternalServerError)
	})

	mux.HandleFunc("DELETE /soundcron/{guildID}/{audioURL}", func(w http.ResponseWriter, r *http.Request) {
		guildID, audioURL, err := pullPathParams(w, r)
		if err != nil {
			return
		}

		if err := service.RemoveAudioForServer(r.Context(), audioURL, guildID); err != nil {
			slog.Error("error removing audio for server", "error", err)
			http.Error(w, "error removing audio for server", http.StatusInternalServerError)
			return
		}
		returnOK(w)
	})
	return mux
}

type MariaDBConfig struct {
	Host     string `env:"HOST, default=localhost"`
	Port     string `env:"PORT, default=3306"`
	User     string `env:"USER, required"`
	Password string `env:"PASSWORD, required"`
	Database string `env:"DATABASE, required"`
}

func (c MariaDBConfig) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?multiStatements=true", c.User, c.Password, c.Host, c.Port, c.Database)
}

type MinioConfig struct {
	Endpoint  string `env:"ENDPOINT, required"`
	AccessKey string `env:"ACCESS_KEY, required"`
	SecretKey string `env:"SECRET_KEY, required"`
	Bucket    string `env:"BUCKET, default=audio"`
}

type Config struct {
	Minio   MinioConfig   `env:", prefix=MINIO_"`
	MariaDB MariaDBConfig `env:", prefix=MARIADB_"`
	Host    string        `env:"HOST, default=localhost"`
	Port    string        `env:"PORT, default=10002"`
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

	db, err := sql.Open("mysql", config.MariaDB.DSN())
	if err != nil {
		log.Fatalf("error connecting to database: %v", err)
	}
	defer db.Close()

	driver, err := mysql.WithInstance(db, &mysql.Config{})
	if err != nil {
		log.Fatalf("error creating migration driver: %v", err)
	}

	m, err := migrate.NewWithDatabaseInstance(
		"file:///migrations",
		"mysql",
		driver,
	)
	if err != nil {
		log.Fatalf("error creating migration instance: %v", err)
	}

	if err := m.Up(); err != nil {
		if err == migrate.ErrNoChange {
			slog.Info("no migrations to apply")
		} else {
			log.Fatalf("error applying migrations: %v", err)
		}
	}

	storage, err := NewMinioAudioStorage(
		config.Minio.Endpoint,
		config.Minio.AccessKey,
		config.Minio.SecretKey,
		config.Minio.Bucket)
	if err != nil {
		log.Fatalf("error creating minio audio service: %v", err)
	}

	repo := &MariaDBRepo{DB: db}
	var oneFiftyMB int64 = 150 * 1024 * 1024
	service := Service{Repo: repo, Storage: storage, Downloader: &StdLibDownloader{}, ServerStorageLimit: oneFiftyMB}

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
