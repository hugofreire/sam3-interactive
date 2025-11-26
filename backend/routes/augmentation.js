/**
 * Data Augmentation API Routes
 *
 * Endpoints for generating synthetic training data via image augmentation.
 */

const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');

function log(message) {
    console.log(`[${new Date().toISOString()}] [Augmentation] ${message}`);
}

/**
 * Get augmentation stats for a project
 * GET /api/projects/:projectId/augmentation/stats
 */
router.get('/:projectId/augmentation/stats', async (req, res) => {
    const { projectId } = req.params;

    try {
        const projectDB = db.getProjectDB(projectId);

        // Get source images count (unique persisted_image_path with is_synthetic = 0)
        const sourceImages = await db.dbAll(projectDB,
            `SELECT DISTINCT persisted_image_path FROM crops
             WHERE persisted_image_path IS NOT NULL AND (is_synthetic = 0 OR is_synthetic IS NULL)`,
            []
        );

        // Get total original bboxes
        const originalBboxes = await db.dbGet(projectDB,
            `SELECT COUNT(*) as count FROM crops
             WHERE persisted_image_path IS NOT NULL AND (is_synthetic = 0 OR is_synthetic IS NULL)`,
            []
        );

        // Get enhanced images count
        const enhancedImages = await db.dbAll(projectDB,
            `SELECT COUNT(*) as count FROM enhanced_images`,
            []
        ).catch(() => [{ count: 0 }]);

        // Get synthetic bboxes count
        const syntheticBboxes = await db.dbGet(projectDB,
            `SELECT COUNT(*) as count FROM crops WHERE is_synthetic = 1`,
            []
        ).catch(() => ({ count: 0 }));

        res.json({
            success: true,
            stats: {
                sourceImages: sourceImages.length,
                originalBboxes: originalBboxes?.count || 0,
                enhancedImages: enhancedImages[0]?.count || 0,
                syntheticBboxes: syntheticBboxes?.count || 0
            }
        });
    } catch (error) {
        log(`Error getting stats: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get source images with their bboxes for augmentation
 * GET /api/projects/:projectId/augmentation/sources
 */
router.get('/:projectId/augmentation/sources', async (req, res) => {
    const { projectId } = req.params;

    try {
        // Only get original (non-synthetic) crops for augmentation sources
        const cropsGrouped = await db.getCropsGroupedByImage(projectId, { onlyOriginal: true });

        const sources = [];
        for (const [imagePath, crops] of cropsGrouped) {
            // bbox is already parsed in getCropsGroupedByImage
            const bboxes = crops.map(c => c.bbox);
            const labels = crops.map(c => c.label);

            sources.push({
                imagePath,
                bboxCount: crops.length,
                labels: [...new Set(labels)],
                bboxes,
                allLabels: labels
            });
        }

        res.json({
            success: true,
            sources,
            totalImages: sources.length,
            totalBboxes: sources.reduce((sum, s) => sum + s.bboxCount, 0)
        });
    } catch (error) {
        log(`Error getting sources: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Preview augmentation on a single image
 * POST /api/projects/:projectId/augmentation/preview
 */
router.post('/:projectId/augmentation/preview', async (req, res) => {
    const { projectId } = req.params;
    const { imagePath, bboxes, labels, augmentations, intensity = 1.0 } = req.body;

    if (!imagePath || !bboxes || !labels || !augmentations) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: imagePath, bboxes, labels, augmentations'
        });
    }

    const fullImagePath = path.join(__dirname, '..', 'datasets', projectId, imagePath);

    if (!fs.existsSync(fullImagePath)) {
        return res.status(404).json({
            success: false,
            error: `Image not found: ${imagePath}`
        });
    }

    try {
        const result = await runAugmentCommand('preview', {
            image: fullImagePath,
            bboxes: JSON.stringify(bboxes),
            labels: JSON.stringify(labels),
            augmentations: augmentations.join(','),
            intensity: intensity.toString()
        });

        res.json(result);
    } catch (error) {
        log(`Preview error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Generate augmented images and add to dataset
 * POST /api/projects/:projectId/augmentation/generate
 */
router.post('/:projectId/augmentation/generate', async (req, res) => {
    const { projectId } = req.params;
    const {
        augmentations = ['flip_h', 'rotate_15', 'brightness', 'hue_saturation'],
        variationsPerImage = 3,
        intensity = 1.0
    } = req.body;

    log(`Generating augmentations for project ${projectId}`);
    log(`Augmentations: ${augmentations.join(', ')}, variations: ${variationsPerImage}`);

    try {
        // Get source images with bboxes (only original, not synthetic)
        const cropsGrouped = await db.getCropsGroupedByImage(projectId, { onlyOriginal: true });

        if (cropsGrouped.size === 0) {
            return res.status(400).json({
                success: false,
                error: 'No source images found for augmentation'
            });
        }

        const projectDir = path.join(__dirname, '..', 'datasets', projectId);
        const augmentedDir = path.join(projectDir, 'augmented');
        fs.mkdirSync(augmentedDir, { recursive: true });

        const results = [];
        let totalGenerated = 0;
        let totalBboxes = 0;

        for (const [imagePath, crops] of cropsGrouped) {
            const fullImagePath = path.join(projectDir, imagePath);

            if (!fs.existsSync(fullImagePath)) {
                log(`Skipping missing image: ${imagePath}`);
                continue;
            }

            // bbox is already parsed in getCropsGroupedByImage
            const bboxes = crops.map(c => c.bbox);
            const labels = crops.map(c => c.label);

            // Generate variations for this image
            for (let i = 0; i < variationsPerImage; i++) {
                // Pick random combination of augmentations
                const selectedAugs = selectRandomAugmentations(augmentations);
                const augName = selectedAugs.sort().join('_');

                const enhancedId = uuidv4();
                const outputFilename = `aug_${Date.now()}_${i}_${augName}.jpg`;
                const outputPath = path.join(augmentedDir, outputFilename);
                const relativeOutputPath = `augmented/${outputFilename}`;

                try {
                    const result = await runAugmentCommand('generate', {
                        image: fullImagePath,
                        bboxes: JSON.stringify(bboxes),
                        labels: JSON.stringify(labels),
                        augmentations: selectedAugs.join(','),
                        output: outputPath,
                        intensity: intensity.toString()
                    });

                    if (result.success) {
                        // Save enhanced image record
                        const projectDB = db.getProjectDB(projectId);
                        await db.dbRun(projectDB,
                            `INSERT INTO enhanced_images (id, source_image_path, enhanced_image_path, augmentation_type, width, height)
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [enhancedId, imagePath, relativeOutputPath, augName, result.width, result.height]
                        );

                        // Create synthetic crops for each bbox
                        for (let j = 0; j < result.bboxes.length; j++) {
                            const cropId = uuidv4();
                            const bbox = result.bboxes[j];
                            const label = result.labels[j];

                            await db.dbRun(projectDB,
                                `INSERT INTO crops (id, label, filename, file_path, source_image, bbox, source_width, source_height, persisted_image_path, enhanced_image_id, is_synthetic)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                                [
                                    cropId,
                                    label,
                                    outputFilename,
                                    relativeOutputPath,
                                    path.basename(imagePath),
                                    JSON.stringify(bbox),
                                    result.width,
                                    result.height,
                                    relativeOutputPath,
                                    enhancedId
                                ]
                            );
                            totalBboxes++;
                        }

                        results.push({
                            enhancedId,
                            sourceImage: imagePath,
                            outputPath: relativeOutputPath,
                            augmentations: selectedAugs,
                            bboxCount: result.bboxes.length
                        });
                        totalGenerated++;
                    }
                } catch (augError) {
                    log(`Augmentation failed for ${imagePath}: ${augError.message}`);
                }
            }
        }

        log(`Generated ${totalGenerated} augmented images with ${totalBboxes} bboxes`);

        res.json({
            success: true,
            imagesGenerated: totalGenerated,
            totalBboxes,
            results
        });

    } catch (error) {
        log(`Generation error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Delete all synthetic data for a project
 * DELETE /api/projects/:projectId/augmentation/clear
 */
router.delete('/:projectId/augmentation/clear', async (req, res) => {
    const { projectId } = req.params;

    try {
        const projectDB = db.getProjectDB(projectId);

        // Delete synthetic crops
        await db.dbRun(projectDB, `DELETE FROM crops WHERE is_synthetic = 1`, []);

        // Delete enhanced images records
        await db.dbRun(projectDB, `DELETE FROM enhanced_images`, []);

        // Delete augmented files
        const augmentedDir = path.join(__dirname, '..', 'datasets', projectId, 'augmented');
        if (fs.existsSync(augmentedDir)) {
            fs.rmSync(augmentedDir, { recursive: true });
        }

        log(`Cleared all synthetic data for project ${projectId}`);

        res.json({ success: true, message: 'All synthetic data cleared' });
    } catch (error) {
        log(`Clear error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Helper: Select random subset of augmentations
 */
function selectRandomAugmentations(enabled) {
    const result = [];

    // Always include at least one geometric transform
    const geometric = enabled.filter(a =>
        a.includes('flip') || a.includes('rotate') || a.includes('scale')
    );
    if (geometric.length > 0) {
        // Pick 1-2 geometric
        const count = Math.min(geometric.length, Math.random() < 0.5 ? 1 : 2);
        const shuffled = geometric.sort(() => Math.random() - 0.5);
        result.push(...shuffled.slice(0, count));
    }

    // Add color augmentations
    const color = enabled.filter(a =>
        a.includes('brightness') || a.includes('contrast') ||
        a.includes('hue') || a.includes('saturation') || a === 'color'
    );
    if (color.length > 0 && Math.random() < 0.7) {
        result.push(color[Math.floor(Math.random() * color.length)]);
    }

    // Sometimes add blur
    if (enabled.includes('blur') && Math.random() < 0.3) {
        result.push('blur');
    }

    // Ensure at least one augmentation
    if (result.length === 0 && enabled.length > 0) {
        result.push(enabled[0]);
    }

    // Add rotation angle variants
    return result.map(a => {
        if (a === 'rotate') {
            const angles = [15, 30, -15, -30];
            return `rotate_${angles[Math.floor(Math.random() * angles.length)]}`;
        }
        return a;
    });
}

/**
 * Helper: Run Python augmentation command
 */
function runAugmentCommand(command, args) {
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '..', 'augment.py');
        const cmdArgs = [pythonScript, command];

        // Add arguments
        for (const [key, value] of Object.entries(args)) {
            cmdArgs.push(`--${key}`, value);
        }

        log(`Running: python ${cmdArgs.slice(1).join(' ').substring(0, 100)}...`);

        const childProc = spawn('python', cmdArgs, {
            env: { ...process.env }
        });

        let stdout = '';
        let stderr = '';

        childProc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        childProc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        childProc.on('close', (code) => {
            if (code === 0) {
                try {
                    // Find last JSON line
                    const lines = stdout.trim().split('\n');
                    for (let i = lines.length - 1; i >= 0; i--) {
                        try {
                            const result = JSON.parse(lines[i]);
                            resolve(result);
                            return;
                        } catch (e) {
                            continue;
                        }
                    }
                    reject(new Error('No valid JSON in output'));
                } catch (e) {
                    reject(new Error(`Failed to parse output: ${e.message}`));
                }
            } else {
                reject(new Error(`Process exited with code ${code}: ${stderr}`));
            }
        });

        childProc.on('error', (error) => {
            reject(error);
        });
    });
}

module.exports = router;
