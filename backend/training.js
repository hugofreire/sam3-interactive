/**
 * YOLO11 Training Job Management
 *
 * Handles training job lifecycle:
 * - Start training (spawn Python subprocess)
 * - Monitor progress (parse JSON logs)
 * - Stop training (kill subprocess)
 * - List trained models
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { createYOLOZIP, cleanupOldExports } = require('./export');

// Active training jobs: { projectId: JobInfo }
const activeJobs = new Map();

// Training logs: { jobId: LogEntry[] }
const trainingLogs = new Map();

function log(message) {
    console.log(`[${new Date().toISOString()}] [Training] ${message}`);
}

/**
 * Get project models directory
 */
function getModelsDir(projectId) {
    return path.join(__dirname, 'datasets', projectId, 'models');
}

/**
 * Start a training job for a project
 *
 * @param {string} projectId - Project UUID
 * @param {Object} config - Training configuration
 * @returns {Promise<Object>} - Job info
 */
async function startTraining(projectId, config = {}) {
    // Check if already training
    if (activeJobs.has(projectId)) {
        const existing = activeJobs.get(projectId);
        if (existing.status === 'running') {
            throw new Error('Training already in progress for this project');
        }
    }

    const {
        epochs = 100,
        batch = 8,
        imgsz = 640,
        device = process.env.TRAINING_DEVICE || '1',  // Use GPU 1, or 'cpu' for Pi
        workers = parseInt(process.env.TRAINING_WORKERS || '4', 10),
        model = 'yolo11n'  // nano, small (yolo11s), or medium (yolo11m)
    } = config;

    const jobId = uuidv4();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const runId = `${timestamp}_${Date.now()}`;

    log(`Starting training job ${jobId} for project ${projectId}`);

    // First, export the dataset to YOLO format
    // Use 70/30 split for train/val (no test) to ensure val has images
    // For small datasets, this ensures at least 1 validation image
    log('Exporting dataset to YOLO format...');
    let exportResult;
    try {
        exportResult = await createYOLOZIP(projectId, {
            split: { train: 0.7, val: 0.3, test: 0.0 },
            includeMetadata: true
        });
    } catch (error) {
        throw new Error(`Failed to export dataset: ${error.message}`);
    }

    // Extract the ZIP to a temporary training directory
    const modelsDir = getModelsDir(projectId);
    const trainingDir = path.join(modelsDir, runId);
    const datasetDir = path.join(trainingDir, 'dataset');

    fs.mkdirSync(datasetDir, { recursive: true });

    // Unzip the exported dataset
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(exportResult.zipPath);
    zip.extractAllTo(datasetDir, true);

    log(`Dataset extracted to ${datasetDir}`);

    // Path to data.yaml
    const dataYaml = path.join(datasetDir, 'data.yaml');

    // Update data.yaml with absolute paths
    let yamlContent = fs.readFileSync(dataYaml, 'utf-8');
    yamlContent = yamlContent.replace('path: ../datasets', `path: ${datasetDir}`);
    fs.writeFileSync(dataYaml, yamlContent);

    // Initialize job info
    const jobInfo = {
        jobId,
        projectId,
        runId,
        status: 'running',
        config: { epochs, batch, imgsz, device, workers, model },
        startTime: new Date().toISOString(),
        endTime: null,
        progress: 0,
        currentEpoch: 0,
        totalEpochs: epochs,
        metrics: {},
        trainingDir,
        datasetDir,
        process: null,
        error: null
    };

    // Initialize logs
    trainingLogs.set(jobId, []);

    // Spawn Python training process
    const pythonScript = path.join(__dirname, 'train_yolo.py');
    const args = [
        pythonScript,
        'train',
        '--data', dataYaml,
        '--output', trainingDir,
        '--epochs', epochs.toString(),
        '--batch', batch.toString(),
        '--imgsz', imgsz.toString(),
        '--device', device.toString(),
        '--workers', workers.toString(),
        '--model', model
    ];

    log(`Spawning: python ${args.join(' ')}`);

    const trainingProcess = spawn('python', args, {
        env: { ...process.env, CUDA_VISIBLE_DEVICES: device.toString() },
        cwd: __dirname
    });

    jobInfo.process = trainingProcess;
    jobInfo.pid = trainingProcess.pid;

    // Handle stdout (JSON logs)
    trainingProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());

        for (const line of lines) {
            try {
                const logEntry = JSON.parse(line);
                const logs = trainingLogs.get(jobId) || [];
                logs.push(logEntry);

                // Keep only last 1000 log entries
                if (logs.length > 1000) {
                    logs.shift();
                }
                trainingLogs.set(jobId, logs);

                // Update job info based on log type
                if (logEntry.type === 'progress') {
                    jobInfo.currentEpoch = logEntry.epoch;
                    jobInfo.progress = logEntry.progress;
                    if (logEntry.metrics) {
                        jobInfo.metrics = { ...jobInfo.metrics, ...logEntry.metrics };
                    }
                } else if (logEntry.type === 'validation') {
                    if (logEntry.metrics) {
                        jobInfo.metrics = { ...jobInfo.metrics, ...logEntry.metrics };
                    }
                } else if (logEntry.type === 'complete') {
                    jobInfo.status = 'completed';
                    jobInfo.endTime = new Date().toISOString();
                    jobInfo.results = logEntry;
                    log(`Training completed for job ${jobId}`);
                } else if (logEntry.type === 'error') {
                    log(`Training error: ${logEntry.message}`);
                }
            } catch (e) {
                // Not JSON, log as raw
                log(`[Training stdout] ${line}`);
            }
        }
    });

    // Handle stderr
    trainingProcess.stderr.on('data', (data) => {
        const message = data.toString();
        // Filter out progress bars and verbose output
        if (!message.includes('100%') && !message.includes('━') && message.trim()) {
            log(`[Training stderr] ${message.substring(0, 200)}`);
        }
    });

    // Handle process exit
    trainingProcess.on('close', (code) => {
        log(`Training process exited with code ${code}`);

        if (jobInfo.status === 'running') {
            if (code === 0) {
                jobInfo.status = 'completed';
            } else {
                jobInfo.status = 'failed';
                jobInfo.error = `Process exited with code ${code}`;
            }
            jobInfo.endTime = new Date().toISOString();
        }
    });

    trainingProcess.on('error', (error) => {
        log(`Training process error: ${error.message}`);
        jobInfo.status = 'failed';
        jobInfo.error = error.message;
        jobInfo.endTime = new Date().toISOString();
    });

    activeJobs.set(projectId, jobInfo);

    return {
        jobId,
        projectId,
        runId,
        status: 'running',
        config: jobInfo.config,
        startTime: jobInfo.startTime
    };
}

/**
 * Get training status for a project
 */
function getTrainingStatus(projectId) {
    const job = activeJobs.get(projectId);

    if (!job) {
        return {
            status: 'idle',
            hasModels: fs.existsSync(getModelsDir(projectId))
        };
    }

    return {
        jobId: job.jobId,
        runId: job.runId,
        status: job.status,
        progress: job.progress,
        currentEpoch: job.currentEpoch,
        totalEpochs: job.totalEpochs,
        metrics: job.metrics,
        startTime: job.startTime,
        endTime: job.endTime,
        error: job.error,
        results: job.results
    };
}

/**
 * Stop a training job
 */
function stopTraining(projectId) {
    const job = activeJobs.get(projectId);

    if (!job || job.status !== 'running') {
        throw new Error('No active training job for this project');
    }

    log(`Stopping training job ${job.jobId}`);

    if (job.process) {
        job.process.kill('SIGTERM');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
            if (job.process && !job.process.killed) {
                job.process.kill('SIGKILL');
            }
        }, 5000);
    }

    job.status = 'stopped';
    job.endTime = new Date().toISOString();

    return { success: true, message: 'Training stopped' };
}

/**
 * Get training logs for a job
 */
function getTrainingLogs(projectId, limit = 100) {
    const job = activeJobs.get(projectId);

    if (!job) {
        return { logs: [] };
    }

    const logs = trainingLogs.get(job.jobId) || [];

    return {
        jobId: job.jobId,
        logs: logs.slice(-limit)
    };
}

/**
 * List trained models for a project
 */
function listModels(projectId) {
    const modelsDir = getModelsDir(projectId);

    if (!fs.existsSync(modelsDir)) {
        return { models: [] };
    }

    const models = [];
    const runDirs = fs.readdirSync(modelsDir);

    for (const runId of runDirs) {
        const runDir = path.join(modelsDir, runId);
        const trainDir = path.join(runDir, 'train');
        const weightsDir = path.join(trainDir, 'weights');

        if (!fs.existsSync(weightsDir)) continue;

        const bestPt = path.join(weightsDir, 'best.pt');
        const bestOnnx = path.join(weightsDir, 'best.onnx');
        const bestNcnn = path.join(weightsDir, 'best_ncnn_model');

        if (!fs.existsSync(bestPt)) continue;

        // Get model stats
        const stats = fs.statSync(bestPt);

        // Try to read training results
        let metrics = {};
        const resultsPath = path.join(trainDir, 'results.csv');
        if (fs.existsSync(resultsPath)) {
            try {
                const csv = fs.readFileSync(resultsPath, 'utf-8');
                const lines = csv.trim().split('\n');
                if (lines.length > 1) {
                    const headers = lines[0].split(',').map(h => h.trim());
                    const values = lines[lines.length - 1].split(',').map(v => parseFloat(v.trim()));

                    const map50Idx = headers.findIndex(h => h.includes('mAP50') && !h.includes('mAP50-95'));
                    const map5095Idx = headers.findIndex(h => h.includes('mAP50-95'));

                    if (map50Idx >= 0) metrics.mAP50 = values[map50Idx];
                    if (map5095Idx >= 0) metrics['mAP50-95'] = values[map5095Idx];
                }
            } catch (e) {
                log(`Error reading results.csv: ${e.message}`);
            }
        }

        models.push({
            runId,
            createdAt: stats.mtime.toISOString(),
            sizeMB: Math.round(stats.size / 1024 / 1024 * 10) / 10,
            formats: {
                pt: fs.existsSync(bestPt),
                onnx: fs.existsSync(bestOnnx),
                ncnn: fs.existsSync(bestNcnn)
            },
            metrics,
            paths: {
                pt: bestPt,
                onnx: bestOnnx,
                ncnn: bestNcnn
            }
        });
    }

    // Sort by creation date (newest first)
    models.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return { models };
}

/**
 * Get model file path for download
 */
function getModelPath(projectId, runId, format) {
    const modelsDir = getModelsDir(projectId);
    const weightsDir = path.join(modelsDir, runId, 'train', 'weights');

    let filePath;
    let fileName;

    switch (format) {
        case 'pt':
            filePath = path.join(weightsDir, 'best.pt');
            fileName = `${runId}_best.pt`;
            break;
        case 'onnx':
            filePath = path.join(weightsDir, 'best.onnx');
            fileName = `${runId}_best.onnx`;
            break;
        case 'ncnn':
            // NCNN is a folder, need to zip it
            filePath = path.join(weightsDir, 'best_ncnn_model');
            fileName = `${runId}_best_ncnn.zip`;
            break;
        default:
            throw new Error(`Unknown format: ${format}`);
    }

    if (!fs.existsSync(filePath)) {
        throw new Error(`Model not found: ${format}`);
    }

    return { filePath, fileName, isDirectory: format === 'ncnn' };
}

/**
 * Run inference on an image using a trained model
 */
async function runInference(projectId, runId, imagePath, conf = 0.5) {
    const { models } = listModels(projectId);
    const model = models.find(m => m.runId === runId);

    if (!model) {
        throw new Error(`Model not found: ${runId}`);
    }

    const modelPath = model.paths.pt;

    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, 'train_yolo.py');
        const args = [
            pythonScript,
            'infer',
            '--model', modelPath,
            '--image', imagePath,
            '--conf', conf.toString()
        ];

        const inferProcess = spawn('python', args, {
            env: { ...process.env, CUDA_VISIBLE_DEVICES: '1' }
        });

        let stdout = '';
        let stderr = '';

        inferProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        inferProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        inferProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    // Find the last valid JSON in stdout
                    const lines = stdout.trim().split('\n');
                    for (let i = lines.length - 1; i >= 0; i--) {
                        try {
                            const result = JSON.parse(lines[i]);
                            if (result.success !== undefined) {
                                resolve(result);
                                return;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                    reject(new Error('No valid inference result'));
                } catch (e) {
                    reject(new Error(`Failed to parse inference result: ${e.message}`));
                }
            } else {
                reject(new Error(`Inference failed: ${stderr}`));
            }
        });

        inferProcess.on('error', (error) => {
            reject(error);
        });
    });
}

/**
 * Clear completed/failed job from memory
 */
function clearJob(projectId) {
    const job = activeJobs.get(projectId);
    if (job && job.status !== 'running') {
        if (job.jobId) {
            trainingLogs.delete(job.jobId);
        }
        activeJobs.delete(projectId);
        return true;
    }
    return false;
}

module.exports = {
    startTraining,
    getTrainingStatus,
    stopTraining,
    getTrainingLogs,
    listModels,
    getModelPath,
    runInference,
    clearJob,
    getModelsDir
};
