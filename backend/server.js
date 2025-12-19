const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const db = require('./database');
const dotenv = require('dotenv');

// Load environment variables from common locations
dotenv.config({ path: path.join(__dirname, '../config/.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config(); // fallback to CWD

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Define paths relative to backend directory
const BACKEND_DIR = __dirname;
const DATA_ROOT = process.env.DATA_ROOT
    ? path.resolve(process.env.DATA_ROOT)
    : path.join(BACKEND_DIR, 'datasets');
const UPLOADS_DIR = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(BACKEND_DIR, 'uploads');
const EXPORTS_DIR = process.env.EXPORTS_DIR
    ? path.resolve(process.env.EXPORTS_DIR)
    : path.join(BACKEND_DIR, 'exports');
const SAM3_PYTHON = process.env.SAM3_PYTHON || 'python3';
const SAM3_CUDA_VISIBLE_DEVICES = process.env.SAM3_CUDA_VISIBLE_DEVICES;

async function ensureDir(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/api/downloads', express.static(EXPORTS_DIR));

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed.'));
        }
    }
});

// SAM3 Python process management
let sam3Process = null;
let isReady = false;
const commandQueue = [];

// Session metadata storage (sessionId -> {uploadPath, width, height, originalFilename})
const sessionMetadata = new Map();

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function startSAM3Process() {
    log('Starting SAM3 service...');

    const sam3ServicePath = path.join(BACKEND_DIR, 'sam3_service.py');
    const sam3Env = { ...process.env };
    if (SAM3_CUDA_VISIBLE_DEVICES !== undefined) {
        sam3Env.CUDA_VISIBLE_DEVICES = SAM3_CUDA_VISIBLE_DEVICES;
    } else if (!process.env.CUDA_VISIBLE_DEVICES) {
        sam3Env.CUDA_VISIBLE_DEVICES = '1'; // default GPU pinning if unset
    }

    sam3Process = spawn(SAM3_PYTHON, ['-u', sam3ServicePath], {
        env: sam3Env
    });

    let responseBuffer = '';

    sam3Process.stdout.on('data', (data) => {
        responseBuffer += data.toString();

        // Process complete JSON objects
        const lines = responseBuffer.split('\n');
        responseBuffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const response = JSON.parse(line);

                // Check for ready signal
                if (response.status === 'ready') {
                    isReady = true;
                    log('SAM3 service ready!');
                    processQueue();
                    return;
                }

                // Find pending request and resolve it
                const pendingRequest = commandQueue.find(req => req.pending);
                if (pendingRequest) {
                    pendingRequest.pending = false;
                    pendingRequest.resolve(response);
                    // Remove from queue and process next
                    const index = commandQueue.indexOf(pendingRequest);
                    if (index > -1) {
                        commandQueue.splice(index, 1);
                    }
                    processQueue(); // Process next request if any
                }
            } catch (e) {
                console.error('Error parsing JSON:', e, 'Line:', line);
            }
        }
    });

    sam3Process.stderr.on('data', (data) => {
        // Log stderr (model loading messages, etc.)
        console.error(`SAM3: ${data.toString()}`);
    });

    sam3Process.on('close', (code) => {
        log(`SAM3 process exited with code ${code}`);
        isReady = false;
        sam3Process = null;
    });
}

function sendCommand(command) {
    return new Promise((resolve, reject) => {
        if (!sam3Process || !isReady) {
            reject(new Error('SAM3 service not ready'));
            return;
        }

        const request = {
            command,
            resolve,
            reject,
            pending: false,  // Will be set to true when sent
            timestamp: Date.now()
        };

        commandQueue.push(request);
        processQueue();

        // Timeout after 60 seconds
        setTimeout(() => {
            if (request.pending) {
                request.pending = false;
                reject(new Error('Request timeout'));
            }
        }, 60000);
    });
}

function processQueue() {
    if (!isReady || commandQueue.length === 0) return;

    const pendingCount = commandQueue.filter(r => r.pending).length;
    if (pendingCount > 0) return; // Wait for current request

    const request = commandQueue[0]; // Get first request without removing
    if (request) {
        request.pending = true;  // Mark as pending before sending
        sam3Process.stdin.write(JSON.stringify(request.command) + '\n');
    }
}

// ==================== API ROUTES ====================

// Make sendCommand and sessionMetadata available to routes
app.locals.sendCommand = sendCommand;
app.locals.sessionMetadata = sessionMetadata;

// Import route modules
const projectsRouter = require('./routes/projects');
const cropsRouter = require('./routes/crops');
const trainingRouter = require('./routes/training');
const augmentationRouter = require('./routes/augmentation');

// Mount routes
app.use('/api/projects', projectsRouter);

// Crops routes - Use Express router.param to pass projectId
const cropsRouterWithProject = express.Router({ mergeParams: true });
cropsRouterWithProject.use(cropsRouter);
app.use('/api/projects/:projectId/crops', cropsRouterWithProject);

// Standalone crops routes (for image serving and crop operations by ID)
app.use('/api/crops', cropsRouter);

// Training routes
const trainingRouterWithProject = express.Router({ mergeParams: true });
trainingRouterWithProject.use(trainingRouter);
app.use('/api/projects/:projectId/training', trainingRouterWithProject);

// Augmentation routes
app.use('/api/projects', augmentationRouter);

// ==================== SAM3 ENDPOINTS ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        sam3Ready: isReady,
        databaseReady: true,
        timestamp: new Date().toISOString()
    });
});

// Upload image
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const sessionId = uuidv4();
        const imagePath = req.file.path;

        log(`Upload: session=${sessionId}, file=${req.file.filename}`);

        // Send load_image command to SAM3 service
        const response = await sendCommand({
            command: 'load_image',
            session_id: sessionId,
            image_path: imagePath
        });

        if (response.success) {
            // Store session metadata for later use (crop creation)
            sessionMetadata.set(sessionId, {
                uploadPath: imagePath,
                width: response.width,
                height: response.height,
                originalFilename: req.file.originalname,
                uploadFilename: req.file.filename
            });

            res.json({
                success: true,
                sessionId: sessionId,
                width: response.width,
                height: response.height,
                imageUrl: `/uploads/${req.file.filename}`
            });
        } else {
            res.status(500).json({
                success: false,
                error: response.error
            });
        }

    } catch (error) {
        log(`Error in upload: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Click-based segmentation
app.post('/api/segment/click', async (req, res) => {
    try {
        const { sessionId, points, labels, multimaskOutput = true, usePreviousLogits = false } = req.body;

        if (!sessionId || !points || !labels) {
            return res.status(400).json({
                error: 'Missing required fields: sessionId, points, labels'
            });
        }

        log(`Click segmentation: session=${sessionId}, points=${points.length}`);

        const response = await sendCommand({
            command: 'predict_click',
            session_id: sessionId,
            points: points,
            labels: labels,
            multimask_output: multimaskOutput,
            use_previous_logits: usePreviousLogits
        });

        res.json(response);

    } catch (error) {
        log(`Error in click segmentation: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Text-based segmentation
app.post('/api/segment/text', async (req, res) => {
    try {
        const { sessionId, prompt } = req.body;

        if (!sessionId || !prompt) {
            return res.status(400).json({
                error: 'Missing required fields: sessionId, prompt'
            });
        }

        log(`Text segmentation: session=${sessionId}, prompt="${prompt}"`);

        const response = await sendCommand({
            command: 'predict_text',
            session_id: sessionId,
            prompt: prompt
        });

        res.json(response);

    } catch (error) {
        log(`Error in text segmentation: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Clear session
app.delete('/api/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        log(`Clearing session: ${sessionId}`);

        const response = await sendCommand({
            command: 'clear_session',
            session_id: sessionId
        });

        res.json(response);

    } catch (error) {
        log(`Error clearing session: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== STARTUP & SHUTDOWN ====================

// Initialize database
async function initializeDatabase() {
    try {
        log('Initializing database...');
        await db.initMainDatabase();
        log('✅ Database initialized successfully');

        // Ensure upload/export directories exist
        await ensureDir(UPLOADS_DIR);
        await ensureDir(EXPORTS_DIR);
        log('✅ Data directories ready');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }
}

// Start SAM3 service
startSAM3Process();

// Cleanup on shutdown
process.on('SIGINT', async () => {
    log('Shutting down...');

    // Close database connections
    try {
        await db.closeAll();
        log('Database connections closed');
    } catch (e) {
        console.error('Error closing database:', e);
    }

    if (sam3Process) {
        sam3Process.kill();
    }

    // Clean up old upload files
    try {
        const files = await fs.readdir(UPLOADS_DIR);
        for (const file of files) {
            if (file !== '.gitkeep') {
                await fs.unlink(path.join(UPLOADS_DIR, file));
            }
        }
        log('Cleaned up upload directory');
    } catch (e) {
        console.error('Error cleaning uploads:', e);
    }

    process.exit(0);
});

// Start server
async function startServer() {
    // Initialize database first
    await initializeDatabase();

    // Start Express server
    app.listen(PORT, HOST, () => {
        log(`🚀 SAM3 Backend running on http://${HOST}:${PORT}`);
        log(`Waiting for SAM3 service to be ready...`);
    });
}

startServer();
