ALTER TABLE soundcrons
    ADD timezone VARCHAR(255) DEFAULT 'UTC' NOT NULL
    AFTER cron;
