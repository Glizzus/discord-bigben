CREATE TABLE IF NOT EXISTS servers (
    serverId BIGINT UNSIGNED NOT NULL PRIMARY KEY,

    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS soundCrons (
    soundCronId INT AUTO_INCREMENT PRIMARY KEY,
    serverId BIGINT UNSIGNED NOT NULL,

    name VARCHAR(255) NOT NULL,
    cron VARCHAR(255) NOT NULL,
    audio VARCHAR(255) NOT NULL,

    mute BOOLEAN DEFAULT FALSE,
    description TEXT,

    FOREIGN KEY (serverId) REFERENCES servers(serverId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS excludedChannels (
    exclusionId INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    soundCronId INT NOT NULL,
    channelId BIGINT UNSIGNED NOT NULL,

    FOREIGN KEY (soundCronId) REFERENCES soundCrons(soundCronId) ON DELETE CASCADE
);
