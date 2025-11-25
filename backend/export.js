/**
 * YOLO Dataset Export Logic
 * Handles exporting projects as YOLO-format ZIP files with train/val/test split
 *
 * YOLO Directory Structure:
 * dataset.zip
 * ├── train/
 * │   ├── images/
 * │   │   ├── image001.jpg
 * │   │   └── image002.jpg
 * │   └── labels/
 * │       ├── image001.txt
 * │       └── image002.txt
 * ├── val/
 * │   ├── images/
 * │   └── labels/
 * ├── test/
 * │   ├── images/
 * │   └── labels/
 * ├── data.yaml
 * └── metadata.json (optional, for traceability)
 *
 * YOLO Label Format (per line):
 * class_id center_x center_y width height
 * All values normalized to 0-1 range
 */

const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const db = require('./database');

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Get stable class mapping from labels table
 * Returns: { className: classId, ... } ordered alphabetically
 */
async function getClassMapping(projectId) {
    const projectDB = db.getProjectDB(projectId);
    const labels = await db.dbAll(projectDB, 'SELECT label FROM labels ORDER BY label ASC', []);

    const classMap = {};
    labels.forEach((row, index) => {
        classMap[row.label] = index;
    });

    return classMap;
}

/**
 * Split images (not crops) into train/val/test sets
 * Ensures all boxes from same image stay in same split
 *
 * @param {Map<string, Crop[]>} cropsGroupedByImage - Map of persisted_image_path -> crops
 * @param {Object} splitRatios - { train: 0.7, val: 0.2, test: 0.1 }
 * @returns {Object} - { train: Map<>, val: Map<>, test: Map<> }
 */
function splitImages(cropsGroupedByImage, splitRatios = { train: 0.7, val: 0.2, test: 0.1 }) {
    // Get all image paths
    const imagePaths = Array.from(cropsGroupedByImage.keys());
    const total = imagePaths.length;

    log(`Splitting ${total} images (image-level split)`);

    // Shuffle images for random distribution
    const shuffled = [...imagePaths].sort(() => Math.random() - 0.5);

    // Calculate split counts, ensuring minimum 1 for each non-zero split
    let trainCount = Math.floor(total * splitRatios.train);
    let valCount = Math.floor(total * splitRatios.val);
    let testCount = total - trainCount - valCount;

    // Ensure val has at least 1 image if val ratio > 0 and we have enough images
    if (splitRatios.val > 0 && valCount === 0 && total >= 2) {
        valCount = 1;
        // Take from train if train has more than 1
        if (trainCount > 1) {
            trainCount--;
        } else {
            testCount--;
        }
    }

    // Calculate split indices
    const trainEnd = trainCount;
    const valEnd = trainEnd + valCount;

    // Split image paths
    const trainPaths = shuffled.slice(0, trainEnd);
    const valPaths = shuffled.slice(trainEnd, valEnd);
    const testPaths = shuffled.slice(valEnd);

    // Build split maps
    const splits = {
        train: new Map(),
        val: new Map(),
        test: new Map()
    };

    trainPaths.forEach(path => splits.train.set(path, cropsGroupedByImage.get(path)));
    valPaths.forEach(path => splits.val.set(path, cropsGroupedByImage.get(path)));
    testPaths.forEach(path => splits.test.set(path, cropsGroupedByImage.get(path)));

    // Count total boxes in each split
    const countBoxes = (splitMap) => {
        let count = 0;
        splitMap.forEach(crops => count += crops.length);
        return count;
    };

    log(`Split result: train=${trainPaths.length} images (${countBoxes(splits.train)} boxes), val=${valPaths.length} images (${countBoxes(splits.val)} boxes), test=${testPaths.length} images (${countBoxes(splits.test)} boxes)`);

    return splits;
}

/**
 * Convert bbox from [x, y, w, h] pixels to YOLO format [cx, cy, w, h] normalized
 * Clips bbox to image bounds and clamps output to [0, 1] range
 *
 * @param {Array} bbox - [x, y, width, height] in pixels
 * @param {Number} imgWidth - Image width in pixels
 * @param {Number} imgHeight - Image height in pixels
 * @returns {Array} - [center_x, center_y, width, height] normalized 0-1, clamped
 */
function bboxToYOLO(bbox, imgWidth, imgHeight) {
    let [x, y, w, h] = bbox;

    // Clip bbox to image bounds (handle boxes extending beyond image)
    const x1 = Math.max(0, x);
    const y1 = Math.max(0, y);
    const x2 = Math.min(imgWidth, x + w);
    const y2 = Math.min(imgHeight, y + h);

    // Recalculate width/height after clipping
    w = x2 - x1;
    h = y2 - y1;

    // Calculate center point
    const centerX = (x1 + w / 2) / imgWidth;
    const centerY = (y1 + h / 2) / imgHeight;

    // Normalize width and height
    const normWidth = w / imgWidth;
    const normHeight = h / imgHeight;

    // Clamp all values to [0, 1] for safety
    const clamp = (val) => Math.max(0, Math.min(1, val));

    return [clamp(centerX), clamp(centerY), clamp(normWidth), clamp(normHeight)];
}

/**
 * Generate YOLO label file content for an image
 *
 * @param {Array} crops - All crops for this image
 * @param {Object} classMap - { className: classId }
 * @returns {String} - Label file content (one line per box)
 */
function generateYOLOLabels(crops, classMap) {
    const lines = [];
    const MIN_BOX_SIZE = 0.001; // Minimum normalized box dimension

    crops.forEach(crop => {
        const classId = classMap[crop.label];
        const imgWidth = crop.source_width;
        const imgHeight = crop.source_height;

        if (!imgWidth || !imgHeight) {
            log(`⚠️  Skipping crop ${crop.id}: missing image dimensions`);
            return;
        }

        // Convert bbox to YOLO format (with clipping and clamping)
        const [cx, cy, w, h] = bboxToYOLO(crop.bbox, imgWidth, imgHeight);

        // Skip boxes that are too small after clipping
        if (w < MIN_BOX_SIZE || h < MIN_BOX_SIZE) {
            log(`⚠️  Skipping crop ${crop.id}: box too small after clipping (${w.toFixed(4)} x ${h.toFixed(4)})`);
            return;
        }

        // YOLO format: class_id center_x center_y width height
        // All values space-separated, normalized to 6 decimal places
        lines.push(`${classId} ${cx.toFixed(6)} ${cy.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}`);
    });

    return lines.join('\n');
}

/**
 * Generate data.yaml for YOLO training
 *
 * @param {Object} classMap - { className: classId }
 * @returns {String} - YAML content
 */
function generateDataYAML(classMap) {
    // Get class names in order of class IDs
    const classNames = Object.keys(classMap).sort((a, b) => classMap[a] - classMap[b]);

    const yaml = `# YOLO Dataset Configuration
# Generated by SAM3 Dataset Labeling Tool
# ${new Date().toISOString()}

path: ../datasets  # Dataset root (optional)
train: train/images
val: val/images
test: test/images

# Number of classes
nc: ${classNames.length}

# Class names (in order of class IDs)
names: [${classNames.map(name => `'${name}'`).join(', ')}]
`;

    return yaml;
}

/**
 * Generate metadata.json for traceability (optional, not used by YOLO)
 *
 * @param {Object} project - Project details
 * @param {Object} splits - Split maps
 * @param {Object} classMap - Class mapping
 * @param {Object} splitRatios - Split ratios used
 * @returns {Object} - Metadata object
 */
function generateMetadataJSON(project, splits, classMap, splitRatios) {
    const countBoxes = (splitMap) => {
        let count = 0;
        splitMap.forEach(crops => count += crops.length);
        return count;
    };

    const countImages = (splitMap) => splitMap.size;

    return {
        project_name: project.name,
        project_id: project.id,
        description: project.description || '',
        format: 'yolov8',
        created_at: project.created_at,
        exported_at: new Date().toISOString(),
        total_images: countImages(splits.train) + countImages(splits.val) + countImages(splits.test),
        total_boxes: countBoxes(splits.train) + countBoxes(splits.val) + countBoxes(splits.test),
        classes: Object.keys(classMap).sort((a, b) => classMap[a] - classMap[b]),
        class_mapping: classMap,
        num_classes: Object.keys(classMap).length,
        split: splitRatios,
        split_counts: {
            train: {
                images: countImages(splits.train),
                boxes: countBoxes(splits.train)
            },
            val: {
                images: countImages(splits.val),
                boxes: countBoxes(splits.val)
            },
            test: {
                images: countImages(splits.test),
                boxes: countBoxes(splits.test)
            }
        }
    };
}

/**
 * Create YOLO-format ZIP file with dataset export
 *
 * @param {String} projectId - Project UUID
 * @param {Object} options - Export options { split, includeMetadata }
 * @returns {Promise<Object>} - { zipPath, stats }
 */
async function createYOLOZIP(projectId, options = {}) {
    const {
        split = { train: 0.7, val: 0.2, test: 0.1 },
        includeMetadata = true
    } = options;

    log(`Starting YOLO export for project: ${projectId}`);

    // Get project details
    const project = await db.getProjectById(projectId);
    if (!project) {
        throw new Error('Project not found');
    }

    // Get class mapping (stable, alphabetically ordered)
    const classMap = await getClassMapping(projectId);
    if (Object.keys(classMap).length === 0) {
        throw new Error('No labels found in project');
    }

    log(`Class mapping: ${JSON.stringify(classMap)}`);

    // Get all crops grouped by image
    const cropsGroupedByImage = await db.getCropsGroupedByImage(projectId);
    if (cropsGroupedByImage.size === 0) {
        throw new Error('No crops with persisted images found in project');
    }

    log(`Found ${cropsGroupedByImage.size} images with crops`);

    // Split at image level (not crop level)
    const splits = splitImages(cropsGroupedByImage, split);

    // Generate metadata
    const metadata = generateMetadataJSON(project, splits, classMap, split);

    // Generate data.yaml
    const dataYAML = generateDataYAML(classMap);

    // Create exports directory if not exists
    const exportsDir = path.join(__dirname, 'exports');
    if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const sanitizedName = project.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const zipFilename = `${sanitizedName}_yolo_${timestamp}_${Date.now()}.zip`;
    const zipPath = path.join(exportsDir, zipFilename);

    log(`Creating YOLO ZIP: ${zipFilename}`);

    // Create ZIP archive
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });

        output.on('close', () => {
            log(`✅ YOLO export complete: ${archive.pointer()} bytes`);
            resolve({
                zipPath: zipPath,
                zipFilename: zipFilename,
                stats: {
                    format: 'yolov8',
                    total_images: metadata.total_images,
                    total_boxes: metadata.total_boxes,
                    train_images: splits.train.size,
                    val_images: splits.val.size,
                    test_images: splits.test.size,
                    classes: Object.keys(classMap).sort((a, b) => classMap[a] - classMap[b]),
                    num_classes: Object.keys(classMap).length,
                    size_bytes: archive.pointer()
                }
            });
        });

        archive.on('error', (err) => {
            log(`❌ YOLO export error: ${err.message}`);
            reject(err);
        });

        archive.pipe(output);

        // Get project directory
        const projectDir = db.getProjectDir(projectId);

        // Helper function to add images and labels for a split
        const addSplitToArchive = (splitName, splitMap) => {
            splitMap.forEach((crops, persistedImagePath) => {
                // Add original image
                const imagePath = path.join(projectDir, persistedImagePath);
                const imageFilename = path.basename(persistedImagePath);
                const archiveImagePath = `${splitName}/images/${imageFilename}`;

                if (fs.existsSync(imagePath)) {
                    archive.file(imagePath, { name: archiveImagePath });
                } else {
                    log(`⚠️  Missing image: ${imagePath}`);
                    return; // Skip this image
                }

                // Generate and add label file
                const labelContent = generateYOLOLabels(crops, classMap);
                const labelFilename = path.parse(imageFilename).name + '.txt';
                const archiveLabelPath = `${splitName}/labels/${labelFilename}`;

                archive.append(labelContent, { name: archiveLabelPath });
            });
        };

        // Add train split
        addSplitToArchive('train', splits.train);

        // Add val split
        addSplitToArchive('val', splits.val);

        // Add test split
        addSplitToArchive('test', splits.test);

        // Add data.yaml
        archive.append(dataYAML, { name: 'data.yaml' });

        // Add metadata.json (optional, for traceability)
        if (includeMetadata) {
            const metadataJSON = JSON.stringify(metadata, null, 2);
            archive.append(metadataJSON, { name: 'metadata.json' });
        }

        // Finalize archive
        archive.finalize();
    });
}

/**
 * Cleanup old export files (older than 7 days)
 */
function cleanupOldExports() {
    const exportsDir = path.join(__dirname, 'exports');

    if (!fs.existsSync(exportsDir)) {
        return;
    }

    const files = fs.readdirSync(exportsDir);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    let deletedCount = 0;

    files.forEach(file => {
        const filePath = path.join(exportsDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
            fs.unlinkSync(filePath);
            deletedCount++;
            log(`Deleted old export: ${file}`);
        }
    });

    if (deletedCount > 0) {
        log(`Cleaned up ${deletedCount} old export(s)`);
    }
}

module.exports = {
    createYOLOZIP,
    splitImages,
    getClassMapping,
    bboxToYOLO,
    generateYOLOLabels,
    generateDataYAML,
    generateMetadataJSON,
    cleanupOldExports
};
