-- PinGGo — Database Schema
-- Run once on a fresh database. Docker Compose mounts this automatically.

CREATE DATABASE IF NOT EXISTS pinggo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pinggo;

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid          CHAR(36) UNIQUE NOT NULL,
  username      VARCHAR(50) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  skylab_id     INT UNSIGNED,
  avatar_url    VARCHAR(500),
  status        ENUM('online','away','dnd','offline') DEFAULT 'offline',
  last_seen     DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_uuid (uuid),
  INDEX idx_email (email),
  INDEX idx_skylab_id (skylab_id)
);

-- ── Channels (DMs, groups, public channels) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid        CHAR(36) UNIQUE NOT NULL,
  name        VARCHAR(100),
  description VARCHAR(255),
  type        ENUM('channel','direct','group','private') NOT NULL DEFAULT 'channel',
  is_private  BOOLEAN DEFAULT FALSE,
  created_by  BIGINT UNSIGNED,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_uuid (uuid)
);

-- ── Channel membership ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id    BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  role          ENUM('owner','admin','member') DEFAULT 'member',
  joined_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_read_at  DATETIME,
  PRIMARY KEY (channel_id, user_id),
  INDEX idx_user_channels (user_id),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);

-- ── Messages ──────────────────────────────────────────────────────────────────
-- Cursor-based pagination relies on (channel_id, id DESC) index.
CREATE TABLE IF NOT EXISTS messages (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid        CHAR(36) UNIQUE NOT NULL,
  channel_id  BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  content     TEXT,
  type        ENUM('text','file','system','reply') DEFAULT 'text',
  parent_id   BIGINT UNSIGNED,   -- thread/reply support
  edited_at   DATETIME,
  deleted_at  DATETIME,          -- soft delete
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  file_name VARCHAR(255),
  file_size  INT UNSIGNED,
  file_type VARCHAR(100),       -- for file messages
  file_key VARCHAR(1024) NULL,
  INDEX idx_channel_cursor (channel_id, id),
  INDEX idx_user (user_id),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (parent_id)  REFERENCES messages(id) ON DELETE SET NULL
);

-- ── File attachments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attachments (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id  BIGINT UNSIGNED NOT NULL,
  s3_key      VARCHAR(500) NOT NULL,
  filename    VARCHAR(255),
  mimetype    VARCHAR(100),
  size_bytes  INT UNSIGNED,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- ── Emoji reactions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reactions (
  message_id  BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  emoji       VARCHAR(50) NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);
