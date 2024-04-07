CREATE TABLE IF NOT EXISTS servers (
    server_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS soundcrons (
    soundcron_id INT AUTO_INCREMENT PRIMARY KEY,
    server_id BIGINT UNSIGNED NOT NULL,

    soundcron_name VARCHAR(255) NOT NULL,
    cron VARCHAR(255) NOT NULL,
    audio VARCHAR(255) NOT NULL,

    mute BOOLEAN DEFAULT FALSE,
    soundcron_description TEXT,

    FOREIGN KEY (server_id) REFERENCES servers (server_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS excluded_channels (
    exclusion_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    soundcron_id INT NOT NULL,
    channel_id BIGINT UNSIGNED NOT NULL,

    FOREIGN KEY (soundcron_id) REFERENCES soundcrons (soundcron_id)
    ON DELETE CASCADE
);
