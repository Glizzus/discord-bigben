package main

import (
	"context"
	"database/sql"
	"fmt"
)

type Repo interface {
	// AssociateServerWithAudio associates a server with an audio file.
	// It does not insert the audio file - it assumes the audio file already exists.
	// If you need to insert the audio file, use InsertAudioForServer.
	AssociateServerWithAudio(ctx context.Context, audioURL string, serverID int64) error

	// RemoveAudioForServer removes the association between a server and an audio file.
	// If the audio file is not associated with the server, it returns an error.
	RemoveAudioForServer(ctx context.Context, audioURL string, serverID int64) error

	// InsertAudioForServer inserts an audio file and associates it with a server.
	// If the audio file already exists, it will not be inserted again. The size will not be updated if the audio already exists.
	InsertAudioForServer(ctx context.Context, audioURL string, audioSize, serverID int64) error

	// AudioHasServers checks if an audio file is associated with any servers.
	// It returns true if the audio file is associated with any servers, false otherwise.
	AudioHasServers(ctx context.Context, audioURL string) (bool, error)

	// RemoveAudio removes an audio file.
	RemoveAudio(ctx context.Context, audioURL string) error

	// GetServerStorageSize returns the total size of audio files associated with a server.
	GetServerStorageSize(ctx context.Context, serverID int64) (int64, error)
}

type MariaDBRepo struct {
	DB *sql.DB
}

type ErrAudioNotFound struct {
	URL string
}

func (e ErrAudioNotFound) Error() string {
	return fmt.Sprintf("audio not found: %s", e.URL)
}

func (m *MariaDBRepo) AssociateServerWithAudio(ctx context.Context, audioURL string, serverID int64) error {
	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	const insertServerQuery = `
	INSERT INTO servers (id)
	VALUES (?)
	ON DUPLICATE KEY UPDATE id = id
	`

	if _, err := tx.ExecContext(ctx, insertServerQuery, serverID); err != nil {
		return fmt.Errorf("failed to insert server: %w", err)
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
		return fmt.Errorf("failed to insert server-audio association: %w", err)
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
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

	const insertServerQuery = `
	INSERT INTO servers (id)
	VALUES (?)
	ON DUPLICATE KEY UPDATE id = id
	`
	if _, err := tx.ExecContext(ctx, insertServerQuery, serverID); err != nil {
		return fmt.Errorf("failed to insert server: %w", err)
	}

	const insertAudioQuery = `
	INSERT INTO audio (url, size)
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
	SELECT COALESCE(SUM(audio.size), 0)
	FROM audio
	JOIN server_audio ON audio.id = server_audio.audio_id
	WHERE server_audio.server_id = ?
	`

	var totalSize int64
	if err := m.DB.QueryRowContext(ctx, query, serverID).Scan(&totalSize); err != nil {
		return 0, fmt.Errorf("failed to get server storage size: %w", err)
	}

	return totalSize, nil
}
