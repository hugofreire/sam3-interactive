/**
 * SAM3 Dataset Labeling - Database Manager
 *
 * Manages SQLite connections for project databases:
 * - Main DB: backend/datasets/projects.db (global project list)
 * - Project DBs: backend/datasets/{project_id}/metadata.db (per-project)
 *
 * Features:
 * - Connection pooling (cache open DBs)
 * - Automatic migrations
 * - Promisified queries
 * - CRUD helpers for projects and crops
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Paths
const DATASETS_DIR = path.join(__dirname, 'datasets');
const MAIN_DB_PATH = path.join(DATASETS_DIR, 'projects.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Connection pool: { projectId: db, ... }
const dbPool = new Map();

// Main database connection (for global project list)
let mainDB = null;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Ensure directory exists
 */
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Promisified db.run()
 */
function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
}

/**
 * Promisified db.get()
 */
function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

/**
 * Promisified db.all()
 */
function dbAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

/**
 * Promisified db.exec()
 */
function dbExec(db, sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

// ============================================================================
// MAIN DATABASE (Global Project List)
// ============================================================================

/**
 * Initialize main database for storing global project list
 */
async function initMainDatabase() {
    ensureDir(DATASETS_DIR);

    return new Promise((resolve, reject) => {
        mainDB = new sqlite3.Database(MAIN_DB_PATH, (err) => {
            if (err) {
                reject(err);
            } else {
                console.log('[DB] Main database connected:', MAIN_DB_PATH);
                resolve();
            }
        });
    }).then(async () => {
        // Create projects table in main DB
        const schema = `
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                settings TEXT DEFAULT '{}'
            );

            CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at);
        `;

        await dbExec(mainDB, schema);
        console.log('[DB] Main database schema initialized');
    });
}

/**
 * Get main database connection
 */
function getMainDB() {
    if (!mainDB) {
        throw new Error('Main database not initialized');
    }
    return mainDB;
}

// ============================================================================
// PROJECT DATABASE (Per-Project)
// ============================================================================

/**
 * Get project database path
 */
function getProjectDBPath(projectId) {
    return path.join(DATASETS_DIR, projectId, 'metadata.db');
}

/**
 * Get project directory path
 */
function getProjectDir(projectId) {
    return path.join(DATASETS_DIR, projectId);
}

/**
 * Get project crops directory path
 */
function getProjectCropsDir(projectId) {
    return path.join(DATASETS_DIR, projectId, 'crops');
}

/**
 * Get project images directory path (for persisted originals)
 */
function getProjectImagesDir(projectId) {
    return path.join(DATASETS_DIR, projectId, 'images');
}

/**
 * Initialize or open a project database
 */
async function initProjectDatabase(projectId) {
    // Check if already open
    if (dbPool.has(projectId)) {
        return dbPool.get(projectId);
    }

    // Ensure project directories exist
    const projectDir = getProjectDir(projectId);
    const cropsDir = getProjectCropsDir(projectId);
    ensureDir(projectDir);
    ensureDir(cropsDir);

    const dbPath = getProjectDBPath(projectId);

    // Open database
    const db = await new Promise((resolve, reject) => {
        const connection = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                reject(err);
            } else {
                console.log(`[DB] Project database opened: ${projectId}`);
                resolve(connection);
            }
        });
    });

    // Run migrations
    await runMigrations(db);

    // Cache connection
    dbPool.set(projectId, db);

    return db;
}

/**
 * Run database migrations
 */
async function runMigrations(db) {
    // Get current schema version
    let currentVersion = '000';
    try {
        const result = await dbGet(db, "SELECT value FROM project_metadata WHERE key = 'schema_version'", []);
        if (result) {
            currentVersion = result.value;
        }
    } catch (err) {
        // Table doesn't exist yet, start from scratch
        currentVersion = '000';
    }

    // Run migrations in order
    const migrations = ['001_initial.sql', '002_yolo_support.sql', '003_image_management.sql'];

    for (const migrationFile of migrations) {
        const migrationVersion = migrationFile.split('_')[0];

        if (migrationVersion > currentVersion) {
            const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);

            if (fs.existsSync(migrationPath)) {
                const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
                await dbExec(db, migrationSQL);
                console.log(`[DB] Applied migration: ${migrationFile}`);
            }
        }
    }

    console.log('[DB] Migrations completed');
}

/**
 * Get project database connection (must be initialized first)
 */
function getProjectDB(projectId) {
    if (!dbPool.has(projectId)) {
        throw new Error(`Project database not initialized: ${projectId}`);
    }
    return dbPool.get(projectId);
}

/**
 * Close project database connection
 */
async function closeProjectDB(projectId) {
    if (dbPool.has(projectId)) {
        const db = dbPool.get(projectId);
        await new Promise((resolve, reject) => {
            db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        dbPool.delete(projectId);
        console.log(`[DB] Project database closed: ${projectId}`);
    }
}

/**
 * Close all database connections
 */
async function closeAll() {
    // Close all project DBs
    const closePromises = [];
    for (const projectId of dbPool.keys()) {
        closePromises.push(closeProjectDB(projectId));
    }
    await Promise.all(closePromises);

    // Close main DB
    if (mainDB) {
        await new Promise((resolve, reject) => {
            mainDB.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        mainDB = null;
        console.log('[DB] Main database closed');
    }
}

// ============================================================================
// PROJECT CRUD OPERATIONS
// ============================================================================

/**
 * Create new project
 */
async function createProject({ name, description = '', settings = {} }) {
    const projectId = uuidv4();
    const settingsJSON = JSON.stringify(settings);

    // Insert into main DB
    await dbRun(
        mainDB,
        'INSERT INTO projects (id, name, description, settings) VALUES (?, ?, ?, ?)',
        [projectId, name, description, settingsJSON]
    );

    // Initialize project database
    await initProjectDatabase(projectId);

    // Update project metadata in project DB
    const projectDB = getProjectDB(projectId);
    await dbRun(
        projectDB,
        "INSERT OR REPLACE INTO project_metadata (key, value) VALUES ('project_id', ?)",
        [projectId]
    );
    await dbRun(
        projectDB,
        "INSERT OR REPLACE INTO project_metadata (key, value) VALUES ('project_name', ?)",
        [name]
    );

    console.log(`[DB] Project created: ${projectId} - ${name}`);

    return {
        id: projectId,
        name,
        description,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        settings
    };
}

/**
 * Get all projects
 */
async function getAllProjects() {
    const rows = await dbAll(
        mainDB,
        'SELECT * FROM projects ORDER BY created_at DESC',
        []
    );

    // Enhance with crop counts
    const projects = await Promise.all(rows.map(async (row) => {
        let numCrops = 0;
        let numLabels = 0;

        try {
            // Try to get stats from project DB if it exists
            const dbPath = getProjectDBPath(row.id);
            if (fs.existsSync(dbPath)) {
                // Initialize if not already open
                if (!dbPool.has(row.id)) {
                    await initProjectDatabase(row.id);
                }

                const projectDB = getProjectDB(row.id);
                const cropCount = await dbGet(projectDB, 'SELECT COUNT(*) as count FROM crops', []);
                const labelCount = await dbGet(projectDB, 'SELECT COUNT(*) as count FROM labels', []);

                numCrops = cropCount ? cropCount.count : 0;
                numLabels = labelCount ? labelCount.count : 0;
            }
        } catch (err) {
            console.error(`[DB] Error getting stats for project ${row.id}:`, err);
        }

        return {
            id: row.id,
            name: row.name,
            description: row.description,
            created_at: row.created_at,
            updated_at: row.updated_at,
            settings: JSON.parse(row.settings || '{}'),
            num_crops: numCrops,
            num_labels: numLabels
        };
    }));

    return projects;
}

/**
 * Get project by ID
 */
async function getProjectById(projectId) {
    const row = await dbGet(
        mainDB,
        'SELECT * FROM projects WHERE id = ?',
        [projectId]
    );

    if (!row) {
        return null;
    }

    // Get stats from project DB
    let numCrops = 0;
    let numLabels = 0;
    let labels = [];

    try {
        if (!dbPool.has(projectId)) {
            await initProjectDatabase(projectId);
        }

        const projectDB = getProjectDB(projectId);
        const cropCount = await dbGet(projectDB, 'SELECT COUNT(*) as count FROM crops', []);
        const labelRows = await dbAll(projectDB, 'SELECT label, count FROM labels ORDER BY count DESC', []);

        numCrops = cropCount ? cropCount.count : 0;
        numLabels = labelRows.length;
        labels = labelRows.map(l => ({ label: l.label, count: l.count }));
    } catch (err) {
        console.error(`[DB] Error getting stats for project ${projectId}:`, err);
    }

    return {
        id: row.id,
        name: row.name,
        description: row.description,
        created_at: row.created_at,
        updated_at: row.updated_at,
        settings: JSON.parse(row.settings || '{}'),
        stats: {
            total_crops: numCrops,
            labels: labels
        }
    };
}

/**
 * Update project
 */
async function updateProject(projectId, { name, description, settings }) {
    const updates = [];
    const params = [];

    if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
    }
    if (description !== undefined) {
        updates.push('description = ?');
        params.push(description);
    }
    if (settings !== undefined) {
        updates.push('settings = ?');
        params.push(JSON.stringify(settings));
    }

    updates.push("updated_at = datetime('now')");
    params.push(projectId);

    const sql = `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`;
    await dbRun(mainDB, sql, params);

    console.log(`[DB] Project updated: ${projectId}`);
}

/**
 * Delete project
 */
async function deleteProject(projectId) {
    // Close project DB if open
    await closeProjectDB(projectId);

    // Delete project directory
    const projectDir = getProjectDir(projectId);
    if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
    }

    // Delete from main DB
    await dbRun(mainDB, 'DELETE FROM projects WHERE id = ?', [projectId]);

    console.log(`[DB] Project deleted: ${projectId}`);
}

// ============================================================================
// CROP CRUD OPERATIONS
// ============================================================================

/**
 * Create crop
 */
async function createCrop(projectId, cropData) {
    const {
        label,
        filename,
        source_image,
        source_session_id,
        bbox,
        mask_score,
        mask_area,
        background_mode = 'transparent',
        source_width,
        source_height,
        persisted_image_path
    } = cropData;

    const cropId = uuidv4();
    const file_path = path.join('crops', filename);

    const projectDB = getProjectDB(projectId);

    await dbRun(
        projectDB,
        `INSERT INTO crops (
            id, label, filename, file_path, source_image, source_session_id,
            bbox, mask_score, mask_area, background_mode,
            source_width, source_height, persisted_image_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            cropId,
            label,
            filename,
            file_path,
            source_image,
            source_session_id,
            JSON.stringify(bbox),
            mask_score,
            mask_area,
            background_mode,
            source_width,
            source_height,
            persisted_image_path
        ]
    );

    console.log(`[DB] Crop created: ${cropId} - ${label}`);

    return {
        id: cropId,
        label,
        filename,
        file_path,
        source_image,
        bbox,
        mask_score,
        mask_area,
        background_mode,
        source_width,
        source_height,
        persisted_image_path
    };
}

/**
 * Get all crops in project
 */
async function getCrops(projectId, { label, limit = 100, offset = 0 } = {}) {
    const projectDB = getProjectDB(projectId);

    let sql = 'SELECT * FROM crops';
    const params = [];

    if (label) {
        sql += ' WHERE label = ?';
        params.push(label);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await dbAll(projectDB, sql, params);

    return rows.map(row => ({
        id: row.id,
        label: row.label,
        filename: row.filename,
        file_path: row.file_path,
        source_image: row.source_image,
        source_session_id: row.source_session_id,
        bbox: JSON.parse(row.bbox),
        mask_score: row.mask_score,
        mask_area: row.mask_area,
        background_mode: row.background_mode,
        source_width: row.source_width,
        source_height: row.source_height,
        persisted_image_path: row.persisted_image_path,
        created_at: row.created_at
    }));
}

/**
 * Get crop by ID
 */
async function getCropById(projectId, cropId) {
    const projectDB = getProjectDB(projectId);

    const row = await dbGet(
        projectDB,
        'SELECT * FROM crops WHERE id = ?',
        [cropId]
    );

    if (!row) {
        return null;
    }

    return {
        id: row.id,
        label: row.label,
        filename: row.filename,
        file_path: row.file_path,
        source_image: row.source_image,
        source_session_id: row.source_session_id,
        bbox: JSON.parse(row.bbox),
        mask_score: row.mask_score,
        mask_area: row.mask_area,
        background_mode: row.background_mode,
        source_width: row.source_width,
        source_height: row.source_height,
        persisted_image_path: row.persisted_image_path,
        created_at: row.created_at
    };
}

/**
 * Update crop label
 */
async function updateCropLabel(projectId, cropId, newLabel) {
    const projectDB = getProjectDB(projectId);

    await dbRun(
        projectDB,
        'UPDATE crops SET label = ? WHERE id = ?',
        [newLabel, cropId]
    );

    console.log(`[DB] Crop label updated: ${cropId} -> ${newLabel}`);
}

/**
 * Delete crop
 */
async function deleteCrop(projectId, cropId) {
    const projectDB = getProjectDB(projectId);

    // Get crop info
    const crop = await getCropById(projectId, cropId);
    if (!crop) {
        throw new Error('Crop not found');
    }

    // Delete file
    const fullPath = path.join(DATASETS_DIR, projectId, crop.file_path);
    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }

    // Delete from DB
    await dbRun(projectDB, 'DELETE FROM crops WHERE id = ?', [cropId]);

    console.log(`[DB] Crop deleted: ${cropId}`);
}

/**
 * Get all crops grouped by source image (for YOLO export)
 * Returns: Map<persisted_image_path, Crop[]>
 */
async function getCropsGroupedByImage(projectId) {
    const projectDB = getProjectDB(projectId);

    const rows = await dbAll(
        projectDB,
        'SELECT * FROM crops WHERE persisted_image_path IS NOT NULL ORDER BY persisted_image_path, created_at',
        []
    );

    const grouped = new Map();

    rows.forEach(row => {
        const crop = {
            id: row.id,
            label: row.label,
            filename: row.filename,
            file_path: row.file_path,
            source_image: row.source_image,
            source_session_id: row.source_session_id,
            bbox: JSON.parse(row.bbox),
            mask_score: row.mask_score,
            mask_area: row.mask_area,
            background_mode: row.background_mode,
            source_width: row.source_width,
            source_height: row.source_height,
            persisted_image_path: row.persisted_image_path,
            created_at: row.created_at
        };

        if (!grouped.has(row.persisted_image_path)) {
            grouped.set(row.persisted_image_path, []);
        }
        grouped.get(row.persisted_image_path).push(crop);
    });

    return grouped;
}

// ============================================================================
// PROJECT IMAGES OPERATIONS
// ============================================================================

/**
 * Create project image entry
 */
async function createProjectImage(projectId, imageData) {
    const {
        original_filename,
        stored_filename,
        file_path,
        width,
        height,
        file_size = null,
        status = 'pending',
        sort_order = 0
    } = imageData;

    const imageId = uuidv4();
    const projectDB = getProjectDB(projectId);

    await dbRun(
        projectDB,
        `INSERT INTO project_images (
            id, original_filename, stored_filename, file_path,
            width, height, file_size, status, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [imageId, original_filename, stored_filename, file_path, width, height, file_size, status, sort_order]
    );

    console.log(`[DB] Project image created: ${imageId} - ${original_filename}`);

    return {
        id: imageId,
        original_filename,
        stored_filename,
        file_path,
        width,
        height,
        file_size,
        status,
        sort_order,
        created_at: new Date().toISOString()
    };
}

/**
 * Get all project images with optional filters
 */
async function getProjectImages(projectId, { status, limit, offset = 0 } = {}) {
    const projectDB = getProjectDB(projectId);

    let sql = 'SELECT * FROM project_images';
    const params = [];

    if (status) {
        sql += ' WHERE status = ?';
        params.push(status);
    }

    sql += ' ORDER BY sort_order ASC, created_at ASC';

    if (limit) {
        sql += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
    }

    const rows = await dbAll(projectDB, sql, params);

    return rows.map(row => ({
        id: row.id,
        original_filename: row.original_filename,
        stored_filename: row.stored_filename,
        file_path: row.file_path,
        width: row.width,
        height: row.height,
        file_size: row.file_size,
        status: row.status,
        sort_order: row.sort_order,
        created_at: row.created_at,
        completed_at: row.completed_at
    }));
}

/**
 * Get project image by ID
 */
async function getProjectImageById(projectId, imageId) {
    const projectDB = getProjectDB(projectId);

    const row = await dbGet(
        projectDB,
        'SELECT * FROM project_images WHERE id = ?',
        [imageId]
    );

    if (!row) return null;

    return {
        id: row.id,
        original_filename: row.original_filename,
        stored_filename: row.stored_filename,
        file_path: row.file_path,
        width: row.width,
        height: row.height,
        file_size: row.file_size,
        status: row.status,
        sort_order: row.sort_order,
        created_at: row.created_at,
        completed_at: row.completed_at
    };
}

/**
 * Update image status
 */
async function updateImageStatus(projectId, imageId, status) {
    const projectDB = getProjectDB(projectId);

    let sql = 'UPDATE project_images SET status = ?';
    const params = [status];

    if (status === 'completed') {
        sql += ", completed_at = datetime('now')";
    }

    sql += ' WHERE id = ?';
    params.push(imageId);

    await dbRun(projectDB, sql, params);
    console.log(`[DB] Image status updated: ${imageId} -> ${status}`);
}

/**
 * Get next pending image (for auto-advance)
 */
async function getNextPendingImage(projectId) {
    const projectDB = getProjectDB(projectId);

    const row = await dbGet(
        projectDB,
        "SELECT * FROM project_images WHERE status = 'pending' ORDER BY sort_order ASC, created_at ASC LIMIT 1",
        []
    );

    if (!row) return null;

    return {
        id: row.id,
        original_filename: row.original_filename,
        stored_filename: row.stored_filename,
        file_path: row.file_path,
        width: row.width,
        height: row.height,
        file_size: row.file_size,
        status: row.status,
        sort_order: row.sort_order,
        created_at: row.created_at,
        completed_at: row.completed_at
    };
}

/**
 * Get image statistics
 */
async function getImageStats(projectId) {
    const projectDB = getProjectDB(projectId);

    const stats = await dbAll(
        projectDB,
        'SELECT status, COUNT(*) as count FROM project_images GROUP BY status',
        []
    );

    const result = {
        pending: 0,
        in_progress: 0,
        completed: 0,
        total: 0
    };

    stats.forEach(row => {
        result[row.status] = row.count;
        result.total += row.count;
    });

    return result;
}

/**
 * Delete project image
 */
async function deleteProjectImage(projectId, imageId) {
    const projectDB = getProjectDB(projectId);

    // Get image info
    const image = await getProjectImageById(projectId, imageId);
    if (!image) {
        throw new Error('Image not found');
    }

    // Delete file
    const fullPath = path.join(DATASETS_DIR, projectId, image.file_path);
    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }

    // Delete from DB
    await dbRun(projectDB, 'DELETE FROM project_images WHERE id = ?', [imageId]);

    console.log(`[DB] Project image deleted: ${imageId}`);
}

// ============================================================================
// PROJECT LABELS OPERATIONS (Predefined Labels)
// ============================================================================

/**
 * Create predefined project label
 */
async function createProjectLabel(projectId, labelData) {
    const {
        name,
        color = null,
        keyboard_shortcut = null,
        sort_order = 0
    } = labelData;

    const projectDB = getProjectDB(projectId);

    const result = await dbRun(
        projectDB,
        `INSERT INTO project_labels (name, color, keyboard_shortcut, sort_order)
         VALUES (?, ?, ?, ?)`,
        [name, color, keyboard_shortcut, sort_order]
    );

    console.log(`[DB] Project label created: ${name}`);

    return {
        id: result.lastID,
        name,
        color,
        keyboard_shortcut,
        sort_order,
        created_at: new Date().toISOString()
    };
}

/**
 * Get all predefined project labels
 */
async function getProjectLabels(projectId) {
    const projectDB = getProjectDB(projectId);

    const rows = await dbAll(
        projectDB,
        'SELECT * FROM project_labels ORDER BY sort_order ASC, id ASC',
        []
    );

    return rows.map(row => ({
        id: row.id,
        name: row.name,
        color: row.color,
        keyboard_shortcut: row.keyboard_shortcut,
        sort_order: row.sort_order,
        created_at: row.created_at
    }));
}

/**
 * Update predefined project label
 */
async function updateProjectLabel(projectId, labelId, updates) {
    const projectDB = getProjectDB(projectId);

    const { name, color, keyboard_shortcut, sort_order } = updates;
    const setClauses = [];
    const params = [];

    if (name !== undefined) {
        setClauses.push('name = ?');
        params.push(name);
    }
    if (color !== undefined) {
        setClauses.push('color = ?');
        params.push(color);
    }
    if (keyboard_shortcut !== undefined) {
        setClauses.push('keyboard_shortcut = ?');
        params.push(keyboard_shortcut);
    }
    if (sort_order !== undefined) {
        setClauses.push('sort_order = ?');
        params.push(sort_order);
    }

    if (setClauses.length === 0) return;

    params.push(labelId);
    const sql = `UPDATE project_labels SET ${setClauses.join(', ')} WHERE id = ?`;

    await dbRun(projectDB, sql, params);
    console.log(`[DB] Project label updated: ${labelId}`);
}

/**
 * Delete predefined project label
 * Returns error if label is in use by crops
 */
async function deleteProjectLabel(projectId, labelId) {
    const projectDB = getProjectDB(projectId);

    // Get label name first
    const label = await dbGet(projectDB, 'SELECT name FROM project_labels WHERE id = ?', [labelId]);
    if (!label) {
        throw new Error('Label not found');
    }

    // Check if label is in use
    const usage = await dbGet(
        projectDB,
        'SELECT COUNT(*) as count FROM crops WHERE label = ?',
        [label.name]
    );

    if (usage && usage.count > 0) {
        const error = new Error(`Label "${label.name}" is in use by ${usage.count} crops`);
        error.code = 'LABEL_IN_USE';
        error.count = usage.count;
        throw error;
    }

    // Delete label
    await dbRun(projectDB, 'DELETE FROM project_labels WHERE id = ?', [labelId]);
    console.log(`[DB] Project label deleted: ${labelId}`);
}

// ============================================================================
// UNDO HISTORY OPERATIONS
// ============================================================================

/**
 * Add entry to undo history (keeps max 10)
 */
async function addUndoEntry(projectId, { action_type, crop_id, crop_data, image_id = null }) {
    const projectDB = getProjectDB(projectId);

    // Insert new entry
    await dbRun(
        projectDB,
        `INSERT INTO undo_history (action_type, crop_id, crop_data, image_id)
         VALUES (?, ?, ?, ?)`,
        [action_type, crop_id, JSON.stringify(crop_data), image_id]
    );

    // Keep only last 10 entries
    await dbRun(
        projectDB,
        `DELETE FROM undo_history WHERE id NOT IN (
            SELECT id FROM undo_history ORDER BY created_at DESC LIMIT 10
        )`,
        []
    );

    console.log(`[DB] Undo entry added: ${action_type} for crop ${crop_id}`);
}

/**
 * Pop (get and remove) last undo entry
 */
async function popUndoEntry(projectId) {
    const projectDB = getProjectDB(projectId);

    // Get last entry
    const entry = await dbGet(
        projectDB,
        'SELECT * FROM undo_history ORDER BY created_at DESC LIMIT 1',
        []
    );

    if (!entry) return null;

    // Delete it
    await dbRun(projectDB, 'DELETE FROM undo_history WHERE id = ?', [entry.id]);

    console.log(`[DB] Undo entry popped: ${entry.action_type} for crop ${entry.crop_id}`);

    return {
        id: entry.id,
        action_type: entry.action_type,
        crop_id: entry.crop_id,
        crop_data: JSON.parse(entry.crop_data),
        image_id: entry.image_id,
        created_at: entry.created_at
    };
}

/**
 * Clear undo history for project
 */
async function clearUndoHistory(projectId) {
    const projectDB = getProjectDB(projectId);
    await dbRun(projectDB, 'DELETE FROM undo_history', []);
    console.log(`[DB] Undo history cleared for project ${projectId}`);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Initialization
    initMainDatabase,
    initProjectDatabase,
    closeProjectDB,
    closeAll,

    // Helpers
    getMainDB,
    getProjectDB,
    getProjectDir,
    getProjectCropsDir,
    getProjectImagesDir,

    // Utility functions for queries
    dbRun,
    dbGet,
    dbAll,
    dbExec,

    // Project operations
    createProject,
    getAllProjects,
    getProjectById,
    updateProject,
    deleteProject,

    // Crop operations
    createCrop,
    getCrops,
    getCropById,
    getCropsGroupedByImage,
    updateCropLabel,
    deleteCrop,

    // Project images operations
    createProjectImage,
    getProjectImages,
    getProjectImageById,
    updateImageStatus,
    getNextPendingImage,
    getImageStats,
    deleteProjectImage,

    // Project labels operations (predefined labels)
    createProjectLabel,
    getProjectLabels,
    updateProjectLabel,
    deleteProjectLabel,

    // Undo history operations
    addUndoEntry,
    popUndoEntry,
    clearUndoHistory
};
