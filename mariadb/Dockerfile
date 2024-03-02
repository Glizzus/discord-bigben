FROM mariadb:10.3

# We copy these instead of using a volume because we want to ensure that the
# image is cached when there are no schema changes, and that the schema is
# always up to date when there are changes.
COPY ./system/*.sql /docker-entrypoint-initdb.d/
COPY ./app/*.sql /docker-entrypoint-initdb.d/
