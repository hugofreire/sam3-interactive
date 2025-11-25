-- SAM3 Dataset Labeling - Image Management Support
-- Migration: 003
-- Purpose: Track project images with status, predefined labels, and undo history

-- ============================================================================
-- PROJECT_IMAGES TABLE
-- Stores all images added to a project with their labeling status
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_images (
    id TEXT PRIMARY KEY,                     -- UUID for image
    original_filename TEXT NOT NULL,         -- Original upload filename
    stored_filename TEXT NOT NULL,           -- Filename in images/ directory
    file_path TEXT NOT NULL,                 -- Full path: images/{stored_filename}
    width INTEGER NOT NULL,                  -- Image width in pixels
    height INTEGER NOT NULL,                 -- Image height in pixels
    file_size INTEGER,                       -- File size in bytes
    status TEXT DEFAULT 'pending',           -- pending | in_progress | completed
    sort_order INTEGER DEFAULT 0,            -- For manual ordering
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT                        -- When marked as complete
);

CREATE INDEX IF NOT EXISTS idx_project_images_status ON project_images(status);
CREATE INDEX IF NOT EXISTS idx_project_images_order ON project_images(sort_order);

-- ============================================================================
-- PROJECT_LABELS TABLE
-- Predefined labels defined at project creation for consistent labeling
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,               -- Label name (e.g., "car", "person")
    color TEXT,                              -- Hex color for UI (e.g., "#FF5733")
    keyboard_shortcut TEXT,                  -- Optional: "1"-"9" for quick select
    sort_order INTEGER DEFAULT 0,            -- Display order
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_project_labels_name ON project_labels(name);
CREATE INDEX IF NOT EXISTS idx_project_labels_order ON project_labels(sort_order);

-- ============================================================================
-- UNDO_HISTORY TABLE
-- Tracks recent crop actions for undo support (Z key)
-- ============================================================================
CREATE TABLE IF NOT EXISTS undo_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,               -- 'crop_create' | 'crop_delete'
    crop_id TEXT NOT NULL,                   -- Reference to crop
    crop_data TEXT NOT NULL,                 -- JSON snapshot of crop at action time
    image_id TEXT,                           -- Reference to project_images.id
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_undo_history_created ON undo_history(created_at DESC);

-- ============================================================================
-- CROPS TABLE EXTENSION
-- Link crops to project_images for better tracking
-- Note: SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we use a try approach
-- The migration runner will silently fail on duplicate column errors
-- ============================================================================

-- ============================================================================
-- UPDATE PROJECT METADATA
-- ============================================================================
INSERT OR REPLACE INTO project_metadata (key, value) VALUES ('schema_version', '003');
INSERT OR REPLACE INTO project_metadata (key, value) VALUES ('updated_at', datetime('now'));
