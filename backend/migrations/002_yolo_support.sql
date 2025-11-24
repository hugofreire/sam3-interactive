-- SAM3 Dataset Labeling - YOLO Export Support
-- Version: 002
-- Created: 2025-11-24
-- Purpose: Add image dimensions and original image persistence for YOLO export

-- ============================================================================
-- ALTER CROPS TABLE
-- Add columns needed for YOLO normalized bbox calculations and image tracking
-- ============================================================================

-- Add source image dimensions (required for YOLO bbox normalization)
ALTER TABLE crops ADD COLUMN source_width INTEGER;
ALTER TABLE crops ADD COLUMN source_height INTEGER;

-- Add path to persisted original image
ALTER TABLE crops ADD COLUMN persisted_image_path TEXT;

-- Create index for efficient image grouping (needed for image-level splitting)
CREATE INDEX IF NOT EXISTS idx_crops_persisted_image ON crops(persisted_image_path);

-- ============================================================================
-- UPDATE PROJECT METADATA
-- Track schema version for future migrations
-- ============================================================================

UPDATE project_metadata SET value = '002' WHERE key = 'schema_version';
UPDATE project_metadata SET value = datetime('now') WHERE key = 'updated_at';

-- ============================================================================
-- NOTES FOR DEVELOPERS
-- ============================================================================
--
-- YOLO Format Requirements:
-- 1. source_width, source_height: Used to normalize bbox from pixels to 0-1 range
--    - YOLO format: class_id center_x center_y width height (all normalized)
--    - Conversion: cx = (x + w/2) / source_width, cy = (y + h/2) / source_height
--
-- 2. persisted_image_path: Path to original image in datasets/{projectId}/images/
--    - Copied from uploads/ on first crop save to survive cleanup
--    - Multiple crops can share same persisted_image_path
--    - Used during export to copy full images to train/val/test/images/
--
-- Migration Strategy:
-- - New columns allow NULL for backwards compatibility
-- - Existing crops without dimensions: export will skip or fail gracefully
-- - New crops: dimensions captured during upload, persisted on crop save
--
