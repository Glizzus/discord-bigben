ALTER TABLE soundCrons
ADD CONSTRAINT soundCronNameServerIdUnique UNIQUE (name, serverId);

