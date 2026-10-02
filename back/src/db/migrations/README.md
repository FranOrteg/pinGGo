# Database Migrations

This folder contains SQL migration scripts to update the database schema.

## Running Migrations

### Manual execution

Connect to your MySQL database and run the migration files in order:

```bash
mysql -u root -p pinggo < 001_add_skylab_integration.sql
```

### Docker Compose

If using Docker, you can execute migrations with:

```bash
docker-compose exec db mysql -u root -p pinggo < /path/to/migration.sql
```

Or copy the file into the container and execute:

```bash
docker cp back/src/db/migrations/001_add_skylab_integration.sql pinggo-db:/tmp/
docker-compose exec db mysql -u root -p pinggo < /tmp/001_add_skylab_integration.sql
```

## Migration History

- `001_add_skylab_integration.sql` (2026-08-20) - Adds Skylab integration support
  - Adds `skylab_id` column to `users` table
  - Allows empty `password_hash` for Skylab users
- `002_username_not_unique.sql` (2026-09-28) - `username` is a display name
  - Drops the UNIQUE index on `users.username` (Labit contacts can share a name)
  - Widens `username` to VARCHAR(100) and adds a non-unique index
- `003_datetimes_to_utc.sql` (2026-10-02) - All DATETIME values in UTC
  - The backend now pins every MySQL session to UTC (`db/pool.js`); before, MySQL servers in
    local time (production: Europe/Madrid) stored local times that the app showed +1/+2 h
  - Converts existing rows with `CONVERT_TZ(..., 'SYSTEM', '+00:00')` (DST-aware per date)
  - Run once **with the backend stopped and before starting the new code**: rows written by the
    new code are already UTC and would be shifted too. Re-running is a no-op (`schema_migrations`)
