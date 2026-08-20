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
