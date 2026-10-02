-- Migration: store every DATETIME in UTC
-- Date: 2026-10-02
-- Description: DATETIME values are written by MySQL (CURRENT_TIMESTAMP / NOW()) and read by the
-- backend as UTC. On servers whose MySQL runs in local time (production: Europe/Madrid) they were
-- stored in local time, so the app showed them +1 h (winter) / +2 h (summer). The backend now pins
-- each session to UTC (db/pool.js); this converts the rows written before that.
--
-- CONVERT_TZ(..., 'SYSTEM', '+00:00') uses the MySQL server's own zone, including the DST offset of
-- each date, and needs no time zone tables. On a server already running in UTC it changes nothing.
--
-- Run ONCE, with the backend stopped. A second run is a no-op (guarded by schema_migrations).

USE pinggo;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name        VARCHAR(100) PRIMARY KEY,
  applied_at  DATETIME NOT NULL
);

DROP PROCEDURE IF EXISTS migrate_003_datetimes_to_utc;

DELIMITER //
CREATE PROCEDURE migrate_003_datetimes_to_utc()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '003_datetimes_to_utc') THEN
    START TRANSACTION;

    UPDATE users SET
      created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00'),
      last_seen  = CONVERT_TZ(last_seen,  'SYSTEM', '+00:00');

    UPDATE channels SET
      created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00');

    UPDATE channel_members SET
      joined_at    = CONVERT_TZ(joined_at,    'SYSTEM', '+00:00'),
      last_read_at = CONVERT_TZ(last_read_at, 'SYSTEM', '+00:00');

    UPDATE messages SET
      created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00'),
      edited_at  = CONVERT_TZ(edited_at,  'SYSTEM', '+00:00'),
      deleted_at = CONVERT_TZ(deleted_at, 'SYSTEM', '+00:00');

    UPDATE reactions SET
      created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00');

    INSERT INTO schema_migrations (name, applied_at) VALUES ('003_datetimes_to_utc', UTC_TIMESTAMP());

    COMMIT;
  END IF;
END //
DELIMITER ;

CALL migrate_003_datetimes_to_utc();
DROP PROCEDURE migrate_003_datetimes_to_utc;
