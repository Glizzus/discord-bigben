FROM mariadb:10.3

COPY ./system/*.sql /docker-entrypoint-initdb.d/
COPY ./app/*.sql /docker-entrypoint-initdb.d/
