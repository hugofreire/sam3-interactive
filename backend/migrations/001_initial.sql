-- SAM3 Dataset Labeling - Initial Database Schema
-- Version: 001
-- Created: 2025-11-21

-- ============================================================================
-- CROPS TABLE
-- Stores metadata for each cropped and labeled object
-- ============================================================================
CREATE TABLE IF NOT EXISTS crops (
    id TEXT PRIMARY KEY,                    -- UUID for crop
    label TEXT NOT NULL,                    -- Class label (e.g., "car", "person")
    filename TEXT NOT NULL,                 -- Filename (e.g., "crop_001.png")
    file_path TEXT NOT NULL,                -- Full path relative to project root

    -- Source information
    source_image TEXT NOT NULL,             -- Original image filename
    source_session_id TEXT,                 -- SAM3 session ID (if available)

    -- Segmentation metadata (stored as JSON for flexibility)
    bbox TEXT NOT NULL,                     -- JSON: [x, y, width, height]
    mask_score REAL,                        -- SAM3 confidence score (0.0 - 1.0)
    mask_area INTEGER,                      -- Pixel count of mask
    background_mode TEXT DEFAULT 'transparent',  -- transparent|white|black|original

    -- Timestamps
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_crops_label ON crops(label);
CREATE INDEX IF NOT EXISTS idx_crops_created ON crops(created_at);
CREATE INDEX IF NOT EXISTS idx_crops_source ON crops(source_image);

-- ============================================================================
-- LABELS TABLE
-- Tracks all unique labels in this project with counts
-- ============================================================================
CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT UNIQUE NOT NULL,             -- Unique label name
    count INTEGER DEFAULT 0,                -- Number of crops with this label
    color TEXT,                             -- Hex color for UI visualization
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_labels_name ON labels(label);

-- ============================================================================
-- EXPORT HISTORY TABLE
-- Tracks all export operations for this project
-- ============================================================================
CREATE TABLE IF NOT EXISTS export_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    export_type TEXT NOT NULL,              -- 'zip' | 'roboflow_api' | 'coco_json'
    file_path TEXT,                         -- Path to exported ZIP (if applicable)
    num_samples INTEGER,                    -- Total samples exported
    split TEXT,                             -- JSON: {"train": 70, "val": 20, "test": 10}
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- PROJECT METADATA TABLE (stored in each project DB)
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_metadata (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Insert initial project metadata
INSERT OR IGNORE INTO project_metadata (key, value) VALUES
    ('schema_version', '001'),
    ('created_at', datetime('now')),
    ('updated_at', datetime('now'));

-- ============================================================================
-- TRIGGERS
-- Auto-update label counts when crops are added/removed/updated
-- ============================================================================

-- Trigger: Increment label count when crop inserted
CREATE TRIGGER IF NOT EXISTS increment_label_count
AFTER INSERT ON crops
BEGIN
    INSERT INTO labels (label, count)
    VALUES (NEW.label, 1)
    ON CONFLICT(label) DO UPDATE SET count = count + 1;
END;

-- Trigger: Decrement label count when crop deleted
CREATE TRIGGER IF NOT EXISTS decrement_label_count
AFTER DELETE ON crops
BEGIN
    UPDATE labels SET count = count - 1 WHERE label = OLD.label;
    DELETE FROM labels WHERE count = 0;
END;

-- Trigger: Update label counts when crop label changes
CREATE TRIGGER IF NOT EXISTS update_label_count
AFTER UPDATE OF label ON crops
WHEN OLD.label != NEW.label
BEGIN
    -- Decrement old label
    UPDATE labels SET count = count - 1 WHERE label = OLD.label;
    DELETE FROM labels WHERE count = 0;

    -- Increment new label
    INSERT INTO labels (label, count)
    VALUES (NEW.label, 1)
    ON CONFLICT(label) DO UPDATE SET count = count + 1;
END;
