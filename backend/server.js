const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const db = require('./database');

const app = express();
const PORT = 3001;

// Define paths relative to backend directory
const BACKEND_DIR = __dirname;
const UPLOADS_DIR = path.join(BACKEND_DIR, 'uploads');
const EXPORTS_DIR = path.join(BACKEND_DIR, 'exports');

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

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function startSAM3Process() {
    log('Starting SAM3 service...');

    const sam3ServicePath = path.join(BACKEND_DIR, 'sam3_service.py');
    sam3Process = spawn('python3', ['-u', sam3ServicePath], {
        env: { ...process.env, CUDA_VISIBLE_DEVICES: '1' }
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

// Make sendCommand available to routes
app.locals.sendCommand = sendCommand;

// Import route modules
const projectsRouter = require('./routes/projects');
const cropsRouter = require('./routes/crops');

// Mount routes
app.use('/api/projects', projectsRouter);

// Crops routes - Use Express router.param to pass projectId
const cropsRouterWithProject = express.Router({ mergeParams: true });
cropsRouterWithProject.use(cropsRouter);
app.use('/api/projects/:projectId/crops', cropsRouterWithProject);

// Standalone crops routes (for image serving and crop operations by ID)
app.use('/api/crops', cropsRouter);

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

        // Create exports directory if it doesn't exist
        const exportsDir = path.join(__dirname, 'exports');
        try {
            await fs.access(exportsDir);
        } catch {
            await fs.mkdir(exportsDir, { recursive: true });
            log('✅ Exports directory created');
        }
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
        const files = await fs.readdir('uploads');
        for (const file of files) {
            if (file !== '.gitkeep') {
                await fs.unlink(path.join('uploads', file));
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
    app.listen(PORT, () => {
        log(`🚀 SAM3 Backend running on http://localhost:${PORT}`);
        log(`Waiting for SAM3 service to be ready...`);
    });
}

startServer();
