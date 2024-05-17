package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
)

// Repo is an interface that defines the methods for interacting with the database.
type Repo interface {
	// AssociateServerWithAudio associates an audio file with a server.
	// It assumes that the audio already exists in the database.
	// The server does not need to exist in the database.
	// If the audio file does not exist, it returns ErrAudioNotFound.
	//
	// If you want to create a new audio file and associate it with a server, use InsertAudioForServer.
	AssociateServerWithAudio(ctx context.Context, audioURL string, serverID int64) error

	// RemoveAudioForServer removes an audio file from a server.
	// If the audio file is not associated with the server, it returns ErrAudioNotFound.
	RemoveAudioForServer(ctx context.Context, audioURL string, serverID int64) error

	// InsertAudioForServer creates a new audio file and associates it with a server.
	// If the server does not exist, it will be created.
	// Behavior is undefined if the audio file already exists.
	//
	// If you know the audio file already exists and want to associate it with a server, use AssociateServerWithAudio.
	InsertAudioForServer(ctx context.Context, audioURL string, audioSize, serverID int64) error

	// AudioHasServers reports whether an audio file is associated with any servers.
	AudioHasServers(ctx context.Context, audioURL string) (bool, error)

	// GetAudioSize returns the size of an audio file.
	// If the audio file does not exist, it returns ErrAudioNotFound.
	GetAudioSize(ctx context.Context, audioURL string) (int64, error)

	// RemoveAudio removes an audio file from the database.
	// If the audio file does not exist, it returns ErrAudioNotFound.
	RemoveAudio(ctx context.Context, audioURL string) error

	// GetServerStorageSize returns the total size of audio files associated with a server.
	// Behavior is undefined if the server does not exist.
	//
	// Example:
	//  repo.InsertAudioForServer(ctx, "audio.mp3", 100, 1) // server 1 has an audio file of size 100
	//  repo.InsertAudioForServer(ctx, "audio2.mp3", 200, 1) // server 1 has a second audio file of size 200
	//  size, err := repo.GetServerStorageSize(ctx, 1) // size == 300
	GetServerStorageSize(ctx context.Context, serverID int64) (int64, error)
}

// MariaDBRepo is an implementation of the Repo interface that uses MariaDB as the database.
// It is assumed that the database schema is already set up.
// No attempt to maintain compatibility with MySQL is made.
type MariaDBRepo struct {
	DB *sql.DB
}

// ErrAudioNotFound is an error that occurs when an audio file is not found.
type ErrAudioNotFound struct {
	URL string
}

func (e ErrAudioNotFound) Error() string {
	return fmt.Sprintf("audio not found: %s", e.URL)
}

// ensureServerExists ensures that a server exists in the database.
// It also handles logging, as well as wrapping any errors.
func ensureServerExists(ctx context.Context, tx *sql.Tx, serverID int64) error {
	const insertServerQuery = `
	INSERT INTO servers (id)
	VALUES (?)
	ON DUPLICATE KEY UPDATE id = id
	`

	res, err := tx.ExecContext(ctx, insertServerQuery, serverID)
	if err != nil {
		return fmt.Errorf("failed to execute server insert query: %w", err)
	}

	// The rowsAffected check is only used for logging
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		slog.ErrorContext(ctx, "failed to get rows affected when inserting server", "error", err)
	} else {
		switch rowsAffected {
		case 0:
			slog.DebugContext(ctx, "server already exists", "serverID", serverID)
		case 1:
			slog.InfoContext(ctx, "server inserted", "serverID", serverID)
		default:
			// This should never happen
			slog.ErrorContext(ctx, "somehow more than 1 row was affected in server insert", "rowsAffected", rowsAffected, "serverID", serverID)
		}
	}

	return nil
}

func (m *MariaDBRepo) AssociateServerWithAudio(ctx context.Context, audioURL string, serverID int64) error {
	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if err := ensureServerExists(ctx, tx, serverID); err != nil {
		return err
	}

	const query = `
	INSERT INTO server_audio (server_id, audio_id)
	SELECT ?, id
	FROM audio
	WHERE url = ?
	ON DUPLICATE KEY UPDATE server_id = server_id
	`

	res, err := tx.ExecContext(ctx, query, serverID, audioURL)
	if err != nil {
		return fmt.Errorf("failed to execute server-audio association query: %w", err)
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected when associating server with audio: %w", err)
	}

	if rowsAffected == 0 {
		return ErrAudioNotFound{URL: audioURL}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

func (m *MariaDBRepo) RemoveAudioForServer(ctx context.Context, audioURL string, serverID int64) error {
	const query = `
	DELETE server_audio
	FROM server_audio
	JOIN audio ON server_audio.audio_id = audio.id
	WHERE server_audio.server_id = ? AND audio.url = ?
	`

	res, err := m.DB.ExecContext(ctx, query, serverID, audioURL)
	if err != nil {
		return fmt.Errorf("failed to remove audio for server: %w", err)
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return ErrAudioNotFound{URL: audioURL}
	}

	return nil
}

func (m *MariaDBRepo) InsertAudioForServer(ctx context.Context, audioURL string, audioSize, serverID int64) error {
	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if err := ensureServerExists(ctx, tx, serverID); err != nil {
		return err
	}

	const insertAudioQuery = `
	INSERT INTO audio (url, file_size)
	VALUES (?, ?)
	ON DUPLICATE KEY UPDATE url = url
	`
	res, err := tx.ExecContext(ctx, insertAudioQuery, audioURL, audioSize)
	if err != nil {
		return fmt.Errorf("failed to insert audio: %w", err)
	}

	audioID, err := res.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get last insert ID: %w", err)
	}

	const insertServerAudioQuery = `
	INSERT INTO server_audio (server_id, audio_id)
	VALUES (?, ?)
	ON DUPLICATE KEY UPDATE server_id = server_id
	`
	_, err = tx.ExecContext(ctx, insertServerAudioQuery, serverID, audioID)
	if err != nil {
		return fmt.Errorf("failed to insert server-audio association: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

func (m *MariaDBRepo) AudioHasServers(ctx context.Context, audioURL string) (bool, error) {
	const query = `
	SELECT EXISTS (
		SELECT 1
		FROM audio
		JOIN server_audio ON audio.id = server_audio.audio_id
		WHERE audio.url = ?
	)
	`

	var exists bool
	if err := m.DB.QueryRowContext(ctx, query, audioURL).Scan(&exists); err != nil {
		return false, fmt.Errorf("failed to check if audio has servers: %w", err)
	}

	return exists, nil
}

func (m *MariaDBRepo) GetAudioSize(ctx context.Context, audioURL string) (int64, error) {
	const query = `
	SELECT file_size AS size
	FROM audio
	WHERE url = ?
	`

	var size int64
	if err := m.DB.QueryRowContext(ctx, query, audioURL).Scan(&size); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrAudioNotFound{URL: audioURL}
		}
		return 0, fmt.Errorf("failed to get audio size: %w", err)
	}

	return size, nil
}

func (m *MariaDBRepo) RemoveAudio(ctx context.Context, audioURL string) error {
	const query = `
	DELETE FROM audio
	WHERE url = ?
	`

	res, err := m.DB.ExecContext(ctx, query, audioURL)
	if err != nil {
		return fmt.Errorf("failed to remove audio: %w", err)
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return ErrAudioNotFound{URL: audioURL}
	}

	return nil
}

func (m *MariaDBRepo) GetServerStorageSize(ctx context.Context, serverID int64) (int64, error) {
	const query = `
	SELECT COALESCE(SUM(audio.file_size), 0)
	FROM audio
	JOIN server_audio ON audio.id = server_audio.audio_id
	WHERE server_audio.server_id = ?
	`

	var totalSize int64
	if err := m.DB.QueryRowContext(ctx, query, serverID).Scan(&totalSize); err != nil {
		return 0, fmt.Errorf("failed to get server storage size for server %d: %w", serverID, err)
	}

	return totalSize, nil
}
