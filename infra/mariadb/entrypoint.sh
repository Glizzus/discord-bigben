#!/bin/sh

script="
CREATE DATABASE IF NOT EXISTS ${CAMPA_DATABASE};
\! echo database ${CAMPA_DATABASE} created

CREATE USER IF NOT EXISTS '${CAMPA_USER}'@'%' IDENTIFIED BY '${CAMPA_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE on ${CAMPA_DATABASE}.* TO ${CAMPA_USER};
\! echo user ${CAMPA_USER} created

CREATE USER IF NOT EXISTS '${FLYWAY_USER}'@'%' IDENTIFIED BY '${FLYWAY_PASSWORD}';
GRANT ALL PRIVILEGES ON ${CAMPA_DATABASE}.* TO ${FLYWAY_USER};
\! echo user ${FLYWAY_USER} created
"

until mariadb-admin ping --host "$MARIADB_HOST" --password="$MARIADB_ROOT_PASSWORD" --silent; do
  echo 'Waiting for MariaDB to start...'
  sleep 1
done

mariadb --host "$MARIADB_HOST" --password="$MARIADB_ROOT_PASSWORD" --execute "$script"
