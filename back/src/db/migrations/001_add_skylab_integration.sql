-- Migration: Add Skylab integration support
-- Date: 2026-08-20
-- Description: Adds skylab_id column to users table for Skylab integration

USE pinggo;

-- Add skylab_id column if it doesn't exist
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS skylab_id INT UNSIGNED AFTER password_hash,
  ADD INDEX IF NOT EXISTS idx_skylab_id (skylab_id);

-- Allow empty password_hash for Skylab users
ALTER TABLE users 
  MODIFY COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT '';
