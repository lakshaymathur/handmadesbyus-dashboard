#!/bin/sh
# Creates the integration-test database next to the dev database, and marks both as
# disposable so `npm run db:reset` and the integration tests may wipe them
# (src/db/reset.ts refuses any database without this comment).
# Runs once, when Postgres initialises an empty data folder.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v devdb="$POSTGRES_DB" -v testdb="$POSTGRES_TEST_DB" <<'SQL'
CREATE DATABASE :"testdb";
COMMENT ON DATABASE :"devdb" IS 'disposable-local';
COMMENT ON DATABASE :"testdb" IS 'disposable-local';
SQL
