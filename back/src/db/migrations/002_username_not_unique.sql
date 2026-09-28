-- Migration: username is a display name, not an identifier
-- Date: 2026-09-28
-- Description: Skylab users are created from their Labit display name ("Name"), which is not
-- unique across contacts. Identity is the uuid (derived from email) / skylab_id.
-- Run once. Safe on a database created from schema.sql before this change.

USE pinggo;

ALTER TABLE users
  DROP INDEX username,
  MODIFY COLUMN username VARCHAR(100) NOT NULL,
  ADD INDEX idx_username (username);
