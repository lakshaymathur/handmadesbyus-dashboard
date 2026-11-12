#!/bin/sh
# Creates the integration-test database next to the dev database.
# Runs once, when Postgres initialises an empty data folder.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v testdb="$POSTGRES_TEST_DB" <<'SQL'
CREATE DATABASE :"testdb";
SQL
