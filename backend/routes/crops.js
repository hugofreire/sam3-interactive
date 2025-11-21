/**
 * Crop Management API Routes
 * Handles CRUD operations for crops and crop image serving
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../database');
const path = require('path');
const fs = require('fs').promises;

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

// ==================== CROP ROUTES ====================

/**
 * POST /api/projects/:projectId/crops
 * Create new crop from segmentation
 * Note: This will be enhanced later to actually create the crop image from SAM3 mask
 */
router.post('/', async (req, res) => {
    try {
        const { projectId } = req.params;

        // Debug: log received params
        if (!projectId) {
            console.error('projectId not found in req.params:', req.params);
            return res.status(400).json({
                success: false,
                error: 'Project ID is required'
            });
        }

        const {
            sessionId,
            maskIndex,
            label,
            backgroundMode = 'transparent',
            sourceImage,
            bbox,
            maskScore,
            maskArea
        } = req.body;

        // Validate required fields
        if (!label || !label.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Label is required'
            });
        }

        if (!sourceImage) {
            return res.status(400).json({
                success: false,
                error: 'Source image is required'
            });
        }

        log(`Creating crop: project=${projectId}, label="${label}"`);

        // Initialize project database if not already open
        await db.initProjectDatabase(projectId);

        // Generate unique filename
        const timestamp = Date.now();
        const filename = `crop_${timestamp}_${Math.random().toString(36).substr(2, 9)}.png`;

        // Prepare crop data
        let cropData = {
            label: label.trim(),
            filename: filename,
            source_image: sourceImage,
            source_session_id: sessionId || null,
            bbox: bbox || [0, 0, 100, 100],
            mask_score: maskScore || null,
            mask_area: maskArea || null,
            background_mode: backgroundMode
        };

        // If sessionId and maskIndex provided, generate crop image from SAM3 mask
        if (sessionId && maskIndex !== undefined) {
            log(`Generating crop image from SAM3 mask (session=${sessionId}, mask=${maskIndex})`);

            const sendCommand = req.app.locals.sendCommand;
            if (!sendCommand) {
                throw new Error('SAM3 service not available');
            }

            // Build output path
            const projectDir = db.getProjectDir(projectId);
            const outputPath = path.join(projectDir, 'crops', filename);

            // Call Python service to generate crop
            const cropResult = await sendCommand({
                command: 'crop_from_mask',
                session_id: sessionId,
                mask_index: parseInt(maskIndex),
                output_path: outputPath,
                background_mode: backgroundMode,
                padding: 10
            });

            if (!cropResult.success) {
                throw new Error(`Crop generation failed: ${cropResult.error}`);
            }

            // Update crop data with actual values from Python service
            cropData.bbox = cropResult.bbox;
            cropData.mask_area = cropResult.mask_area;

            log(`✅ Crop image generated: ${filename} (${cropResult.crop_width}x${cropResult.crop_height})`);
        }

        // Create crop metadata in database
        const crop = await db.createCrop(projectId, cropData);

        log(`✅ Crop created: ${crop.id} - ${label}`);

        // Return crop info with URL
        res.json({
            success: true,
            crop: {
                ...crop,
                url: `/api/crops/${crop.id}` // Will serve the actual image later
            }
        });

    } catch (error) {
        console.error('Error creating crop:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/projects/:projectId/crops
 * Get all crops for a project with optional filtering
 */
router.get('/', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { label, limit, offset } = req.query;

        log(`Fetching crops: project=${projectId}, label=${label || 'all'}`);

        // Initialize project database if not already open
        await db.initProjectDatabase(projectId);

        const crops = await db.getCrops(projectId, {
            label: label,
            limit: limit ? parseInt(limit) : 100,
            offset: offset ? parseInt(offset) : 0
        });

        res.json({
            success: true,
            crops: crops,
            total: crops.length
        });

    } catch (error) {
        console.error('Error fetching crops:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/crops/:cropId
 * Get crop metadata by ID
 * Query param: ?projectId=xxx (required)
 */
router.get('/:cropId', async (req, res) => {
    try {
        const { cropId } = req.params;
        const { projectId } = req.query;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                error: 'projectId query parameter is required'
            });
        }

        log(`Fetching crop: ${cropId}`);

        // Initialize project database if not already open
        await db.initProjectDatabase(projectId);

        const crop = await db.getCropById(projectId, cropId);

        if (!crop) {
            return res.status(404).json({
                success: false,
                error: 'Crop not found'
            });
        }

        res.json({
            success: true,
            crop: crop
        });

    } catch (error) {
        console.error('Error fetching crop:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/crops/:cropId/image
 * Serve crop image file
 * Query param: ?projectId=xxx (required)
 */
router.get('/:cropId/image', async (req, res) => {
    try {
        const { cropId } = req.params;
        const { projectId } = req.query;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                error: 'projectId query parameter is required'
            });
        }

        // Initialize project database if not already open
        await db.initProjectDatabase(projectId);

        const crop = await db.getCropById(projectId, cropId);

        if (!crop) {
            return res.status(404).json({
                success: false,
                error: 'Crop not found'
            });
        }

        // Build full file path
        const projectDir = db.getProjectDir(projectId);
        const fullPath = path.join(projectDir, crop.file_path);

        // Check if file exists
        try {
            await fs.access(fullPath);
        } catch (err) {
            return res.status(404).json({
                success: false,
                error: 'Crop image file not found'
            });
        }

        // Serve image file
        res.sendFile(fullPath);

    } catch (error) {
        console.error('Error serving crop image:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/crops/:cropId
 * Update crop label
 * Query param: ?projectId=xxx (required)
 */
router.put('/:cropId', async (req, res) => {
    try {
        const { cropId } = req.params;
        const { projectId } = req.query;
        const { label } = req.body;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                error: 'projectId query parameter is required'
            });
        }

        if (!label || !label.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Label is required'
            });
        }

        log(`Updating crop label: ${cropId} -> "${label}"`);

        // Initialize project database if not already open
        await db.initProjectDatabase(projectId);

        // Check if crop exists
        const existingCrop = await db.getCropById(projectId, cropId);
        if (!existingCrop) {
            return res.status(404).json({
                success: false,
                error: 'Crop not found'
            });
        }

        // Update label
        await db.updateCropLabel(projectId, cropId, label.trim());

        // Fetch updated crop
        const updatedCrop = await db.getCropById(projectId, cropId);

        log(`✅ Crop label updated: ${cropId}`);

        res.json({
            success: true,
            crop: updatedCrop
        });

    } catch (error) {
        console.error('Error updating crop:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/crops/:cropId
 * Delete crop and its image file
 * Query param: ?projectId=xxx (required)
 */
router.delete('/:cropId', async (req, res) => {
    try {
        const { cropId } = req.params;
        const { projectId } = req.query;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                error: 'projectId query parameter is required'
            });
        }

        log(`Deleting crop: ${cropId}`);

        // Initialize project database if not already open
        await db.initProjectDatabase(projectId);

        // Check if crop exists
        const existingCrop = await db.getCropById(projectId, cropId);
        if (!existingCrop) {
            return res.status(404).json({
                success: false,
                error: 'Crop not found'
            });
        }

        // Delete crop (this will also delete the file)
        await db.deleteCrop(projectId, cropId);

        log(`✅ Crop deleted: ${cropId}`);

        res.json({
            success: true,
            message: 'Crop deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting crop:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
