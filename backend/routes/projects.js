/**
 * Project Management API Routes
 * Handles CRUD operations for projects, labels, images, and undo
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const exportModule = require('../export');

// Configure multer for batch image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Store in project's images directory
        const projectId = req.params.id;
        const imagesDir = db.getProjectImagesDir(projectId);
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        cb(null, imagesDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp|bmp|tiff/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

// ==================== PROJECT ROUTES ====================

/**
 * POST /api/projects
 * Create new project
 */
router.post('/', async (req, res) => {
    try {
        const { name, description, settings } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Project name is required'
            });
        }

        log(`Creating project: "${name}"`);

        const project = await db.createProject({
            name: name.trim(),
            description: description || '',
            settings: settings || {
                background_mode: 'transparent',
                default_labels: []
            }
        });

        log(`✅ Project created: ${project.id}`);

        res.json({
            success: true,
            project: project
        });

    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/projects
 * Get all projects with stats
 */
router.get('/', async (req, res) => {
    try {
        log('Fetching all projects');

        const projects = await db.getAllProjects();

        res.json({
            success: true,
            projects: projects,
            total: projects.length
        });

    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/projects/:id
 * Get project by ID with detailed stats
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        log(`Fetching project: ${id}`);

        const project = await db.getProjectById(id);

        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        res.json({
            success: true,
            project: project
        });

    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/projects/:id
 * Update project
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, settings } = req.body;

        log(`Updating project: ${id}`);

        // Check if project exists
        const existingProject = await db.getProjectById(id);
        if (!existingProject) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Update project
        await db.updateProject(id, {
            name,
            description,
            settings
        });

        // Fetch updated project
        const updatedProject = await db.getProjectById(id);

        log(`✅ Project updated: ${id}`);

        res.json({
            success: true,
            project: updatedProject
        });

    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/projects/:id
 * Delete project and all associated data
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        log(`Deleting project: ${id}`);

        // Check if project exists
        const existingProject = await db.getProjectById(id);
        if (!existingProject) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Delete project (this will also delete all crops and close DB)
        await db.deleteProject(id);

        log(`✅ Project deleted: ${id}`);

        res.json({
            success: true,
            message: 'Project deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/projects/:id/export/zip
 * Export project as YOLO-format ZIP with train/val/test split
 */
router.post('/:id/export/zip', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            split = { train: 0.7, val: 0.2, test: 0.1 },
            includeMetadata = true
        } = req.body;

        log(`Exporting project (YOLO format): ${id}`);

        // Validate split ratios
        const totalRatio = (split.train || 0) + (split.val || 0) + (split.test || 0);
        if (Math.abs(totalRatio - 1.0) > 0.01) {
            return res.status(400).json({
                success: false,
                error: 'Split ratios must sum to 1.0'
            });
        }

        // Check if project exists
        const project = await db.getProjectById(id);
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Create YOLO export
        const result = await exportModule.createYOLOZIP(id, {
            split,
            includeMetadata
        });

        log(`✅ YOLO export created: ${result.zipFilename}`);

        res.json({
            success: true,
            format: 'yolov8',
            downloadUrl: `/api/downloads/${result.zipFilename}`,
            filename: result.zipFilename,
            stats: result.stats
        });

    } catch (error) {
        console.error('Error exporting project:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== PROJECT LABELS ROUTES ====================

/**
 * GET /api/projects/:id/labels
 * Get all predefined labels for a project
 */
router.get('/:id/labels', async (req, res) => {
    try {
        const { id } = req.params;

        log(`Fetching labels for project: ${id}`);

        // Ensure project DB is initialized
        await db.initProjectDatabase(id);

        const labels = await db.getProjectLabels(id);

        res.json({
            success: true,
            labels: labels,
            total: labels.length
        });

    } catch (error) {
        console.error('Error fetching labels:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/projects/:id/labels
 * Add a new predefined label to project
 */
router.post('/:id/labels', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, color, keyboard_shortcut, sort_order } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Label name is required'
            });
        }

        log(`Creating label "${name}" for project: ${id}`);

        // Ensure project DB is initialized
        await db.initProjectDatabase(id);

        const label = await db.createProjectLabel(id, {
            name: name.trim(),
            color: color || null,
            keyboard_shortcut: keyboard_shortcut || null,
            sort_order: sort_order || 0
        });

        log(`✅ Label created: ${label.id} - ${name}`);

        res.json({
            success: true,
            label: label
        });

    } catch (error) {
        // Handle unique constraint violation
        if (error.message.includes('UNIQUE constraint')) {
            return res.status(409).json({
                success: false,
                error: 'Label with this name already exists'
            });
        }
        console.error('Error creating label:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/projects/:id/labels/:labelId
 * Update a predefined label
 */
router.put('/:id/labels/:labelId', async (req, res) => {
    try {
        const { id, labelId } = req.params;
        const { name, color, keyboard_shortcut, sort_order } = req.body;

        log(`Updating label ${labelId} for project: ${id}`);

        // Ensure project DB is initialized
        await db.initProjectDatabase(id);

        await db.updateProjectLabel(id, labelId, {
            name,
            color,
            keyboard_shortcut,
            sort_order
        });

        // Get updated labels
        const labels = await db.getProjectLabels(id);
        const updatedLabel = labels.find(l => l.id === parseInt(labelId));

        log(`✅ Label updated: ${labelId}`);

        res.json({
            success: true,
            label: updatedLabel
        });

    } catch (error) {
        console.error('Error updating label:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/projects/:id/labels/:labelId
 * Delete a predefined label (fails if in use)
 */
router.delete('/:id/labels/:labelId', async (req, res) => {
    try {
        const { id, labelId } = req.params;

        log(`Deleting label ${labelId} from project: ${id}`);

        // Ensure project DB is initialized
        await db.initProjectDatabase(id);

        await db.deleteProjectLabel(id, labelId);

        log(`✅ Label deleted: ${labelId}`);

        res.json({
            success: true,
            message: 'Label deleted successfully'
        });

    } catch (error) {
        if (error.code === 'LABEL_IN_USE') {
            return res.status(409).json({
                success: false,
                error: error.message,
                count: error.count
            });
        }
        console.error('Error deleting label:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== PROJECT IMAGES ROUTES ====================

/**
 * GET /api/projects/:id/images
 * Get all images for a project with stats
 */
router.get('/:id/images', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, limit, offset } = req.query;

        log(`Fetching images for project: ${id}`);

        // Ensure project DB is initialized
        await db.initProjectDatabase(id);

        const images = await db.getProjectImages(id, {
            status,
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : 0
        });

        const stats = await db.getImageStats(id);

        res.json({
            success: true,
            images: images,
            stats: stats
        });

    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/projects/:id/images/batch
 * Upload multiple images at once
 */
router.post('/:id/images/batch', upload.array('images', 100), async (req, res) => {
    try {
        const { id } = req.params;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No files uploaded'
            });
        }

        log(`Batch uploading ${files.length} images to project: ${id}`);

        // Ensure project DB is initialized
        await db.initProjectDatabase(id);

        const results = [];
        const errors = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                // Get image dimensions using sharp
                const metadata = await sharp(file.path).metadata();

                const image = await db.createProjectImage(id, {
                    original_filename: file.originalname,
                    stored_filename: file.filename,
                    file_path: `images/${file.filename}`,
                    width: metadata.width,
                    height: metadata.height,
                    file_size: file.size,
                    status: 'pending',
                    sort_order: i
                });

                results.push(image);
            } catch (err) {
                errors.push({
                    filename: file.originalname,
                    error: err.message
                });
                // Clean up failed file
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            }
        }

        log(`✅ Batch upload complete: ${results.length} success, ${errors.length} errors`);

        res.json({
            success: true,
            uploaded: results.length,
            failed: errors.length,
            images: results,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Error in batch upload:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/projects/:id/images/:imageId/status
 * Update image status
 */
router.put('/:id/images/:imageId/status', async (req, res) => {
    try {
        const { id, imageId } = req.params;
        const { status } = req.body;

        if (!['pending', 'in_progress', 'completed'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Must be: pending, in_progress, or completed'
            });
        }

        log(`Updating image ${imageId} status to: ${status}`);

        // Ensure project DB is initialized
        await db.initProjectDatabase(id);

        await db.updateImageStatus(id, imageId, status);

        // Get updated image
        const image = await db.getProjectImageById(id, imageId);

        // If completed, get next pending image for auto-advance
        let nextImage = null;
        if (status === 'completed') {
            nextImage = await db.getNextPendingImage(id);
        }

        log(`✅ Image status updated: ${imageId} -> ${status}`);

        res.json({
            success: true,
            image: image,
            nextImage: nextImage
        });

    } catch (error) {
        console.error('Error updating image status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/projects/:id/images/:imageId/serve
 * Serve image file
 */
router.get('/:id/images/:imageId/serve', async (req, res) => {
    try {
        const { id, imageId } = req.params;

        // Ensure project DB is initialized
        await db.initProjectDatabase(id);

        const image = await db.getProjectImageById(id, imageId);

        if (!image) {
            return res.status(404).json({
                success: false,
                error: 'Image not found'
            });
        }

        const imagePath = path.join(db.getProjectDir(id), image.file_path);

        if (!fs.existsSync(imagePath)) {
            return res.status(404).json({
                success: false,
                error: 'Image file not found'
            });
        }

        res.sendFile(imagePath);

    } catch (error) {
        console.error('Error serving image:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/projects/:id/images/:imageId
 * Delete a project image
 */
router.delete('/:id/images/:imageId', async (req, res) => {
    try {
        const { id, imageId } = req.params;

        log(`Deleting image ${imageId} from project: ${id}`);

        // Ensure project DB is initialized
        await db.initProjectDatabase(id);

        await db.deleteProjectImage(id, imageId);

        log(`✅ Image deleted: ${imageId}`);

        res.json({
            success: true,
            message: 'Image deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/projects/:id/images/next
 * Get next pending image (for auto-advance)
 */
router.get('/:id/images/next', async (req, res) => {
    try {
        const { id } = req.params;

        log(`Getting next pending image for project: ${id}`);

        // Ensure project DB is initialized
        await db.initProjectDatabase(id);

        const nextImage = await db.getNextPendingImage(id);

        res.json({
            success: true,
            image: nextImage
        });

    } catch (error) {
        console.error('Error getting next image:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== UNDO ROUTES ====================

/**
 * POST /api/projects/:id/undo
 * Undo last crop action
 */
router.post('/:id/undo', async (req, res) => {
    try {
        const { id } = req.params;

        log(`Undoing last action for project: ${id}`);

        // Ensure project DB is initialized
        await db.initProjectDatabase(id);

        const entry = await db.popUndoEntry(id);

        if (!entry) {
            return res.status(404).json({
                success: false,
                error: 'Nothing to undo'
            });
        }

        // Handle undo based on action type
        if (entry.action_type === 'crop_create') {
            // Delete the crop that was created
            try {
                await db.deleteCrop(id, entry.crop_id);
                log(`✅ Undo: Deleted crop ${entry.crop_id}`);
            } catch (err) {
                // Crop may already be deleted, that's ok
                log(`Undo: Crop ${entry.crop_id} already deleted or not found`);
            }
        }

        res.json({
            success: true,
            undone: entry,
            message: `Undid ${entry.action_type}`
        });

    } catch (error) {
        console.error('Error undoing action:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
