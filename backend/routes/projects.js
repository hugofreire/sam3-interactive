/**
 * Project Management API Routes
 * Handles CRUD operations for projects
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const exportModule = require('../export');

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

module.exports = router;
