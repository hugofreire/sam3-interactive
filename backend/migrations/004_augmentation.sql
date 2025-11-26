-- Migration 004: Data Augmentation Support
-- Adds tables and columns for tracking enhanced/augmented images

-- Track enhanced images (augmented versions of source images)
CREATE TABLE IF NOT EXISTS enhanced_images (
    id TEXT PRIMARY KEY,
    source_image_path TEXT NOT NULL,      -- Original image path (persisted_image_path)
    enhanced_image_path TEXT NOT NULL,    -- New augmented image path
    augmentation_type TEXT NOT NULL,      -- e.g., "rotate_30_flip_h_brightness"
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Index for querying by source image
CREATE INDEX IF NOT EXISTS idx_enhanced_source ON enhanced_images(source_image_path);

-- Add columns to crops table for synthetic data tracking (idempotent)
-- Check if columns exist before adding them
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we wrap in a try pattern via trigger
-- This is handled by the migration runner checking column existence

-- Index for filtering synthetic crops
CREATE INDEX IF NOT EXISTS idx_crops_synthetic ON crops(is_synthetic);
