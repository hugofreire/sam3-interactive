/**
 * Training API Routes
 *
 * Endpoints for YOLO11 training management
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const training = require('../training');

// Multer for inference image upload (preserve file extension for YOLO)
const storage = multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `${uuidv4()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

function log(message) {
    console.log(`[${new Date().toISOString()}] [TrainingAPI] ${message}`);
}

/**
 * POST /api/projects/:projectId/training/start
 * Start a training job
 */
router.post('/start', async (req, res) => {
    const { projectId } = req.params;
    const config = req.body || {};

    log(`Starting training for project ${projectId}`);
    log(`Config: ${JSON.stringify(config)}`);

    try {
        const result = await training.startTraining(projectId, config);
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        log(`Error starting training: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/projects/:projectId/training/status
 * Get training status
 */
router.get('/status', (req, res) => {
    const { projectId } = req.params;

    try {
        const status = training.getTrainingStatus(projectId);
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        log(`Error getting status: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/projects/:projectId/training/stop
 * Stop a running training job
 */
router.post('/stop', (req, res) => {
    const { projectId } = req.params;

    log(`Stopping training for project ${projectId}`);

    try {
        const result = training.stopTraining(projectId);
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        log(`Error stopping training: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/projects/:projectId/training/logs
 * Get training logs
 */
router.get('/logs', (req, res) => {
    const { projectId } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    try {
        const result = training.getTrainingLogs(projectId, limit);
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        log(`Error getting logs: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/projects/:projectId/training/clear
 * Clear completed job from memory
 */
router.post('/clear', (req, res) => {
    const { projectId } = req.params;

    try {
        const cleared = training.clearJob(projectId);
        res.json({
            success: true,
            cleared
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/projects/:projectId/models
 * List trained models
 */
router.get('/models', (req, res) => {
    const { projectId } = req.params;

    try {
        const result = training.listModels(projectId);
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        log(`Error listing models: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/projects/:projectId/models/:runId/download/:format
 * Download a trained model
 */
router.get('/models/:runId/download/:format', async (req, res) => {
    const { projectId, runId, format } = req.params;

    log(`Downloading model ${runId} format ${format} for project ${projectId}`);

    try {
        const { filePath, fileName, isDirectory } = training.getModelPath(projectId, runId, format);

        if (isDirectory) {
            // NCNN model is a folder, need to zip it
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.pipe(res);
            archive.directory(filePath, false);
            archive.finalize();
        } else {
            // Single file download
            res.download(filePath, fileName);
        }
    } catch (error) {
        log(`Error downloading model: ${error.message}`);
        res.status(404).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/projects/:projectId/inference
 * Run inference on an uploaded image
 */
router.post('/inference', upload.single('image'), async (req, res) => {
    const { projectId } = req.params;
    const { runId, conf = 0.5 } = req.body;

    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'No image uploaded'
        });
    }

    if (!runId) {
        return res.status(400).json({
            success: false,
            error: 'runId is required'
        });
    }

    log(`Running inference for project ${projectId}, model ${runId}`);

    try {
        const result = await training.runInference(
            projectId,
            runId,
            req.file.path,
            parseFloat(conf)
        );

        // Clean up uploaded file
        fs.unlink(req.file.path, () => {});

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        log(`Error running inference: ${error.message}`);

        // Clean up uploaded file
        if (req.file) {
            fs.unlink(req.file.path, () => {});
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/projects/:projectId/inference/url
 * Run inference on an image by URL or path
 */
router.post('/inference/url', async (req, res) => {
    const { projectId } = req.params;
    const { runId, imageUrl, imagePath, conf = 0.5 } = req.body;

    if (!runId) {
        return res.status(400).json({
            success: false,
            error: 'runId is required'
        });
    }

    // Use imagePath if provided, otherwise we'd need to download imageUrl
    const targetPath = imagePath || imageUrl;

    if (!targetPath) {
        return res.status(400).json({
            success: false,
            error: 'imagePath or imageUrl is required'
        });
    }

    log(`Running inference for project ${projectId}, model ${runId}, image ${targetPath}`);

    try {
        const result = await training.runInference(
            projectId,
            runId,
            targetPath,
            parseFloat(conf)
        );

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        log(`Error running inference: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
