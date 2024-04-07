ALTER TABLE soundcrons
ADD CONSTRAINT soundcron_server_name_unique UNIQUE (soundcron_name, server_id);
