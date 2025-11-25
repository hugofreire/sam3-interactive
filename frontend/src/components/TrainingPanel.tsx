import { useState, useEffect, useRef } from 'react';
import {
  startTraining,
  getTrainingStatus,
  stopTraining,
  getTrainingLogs,
  listModels,
  getModelDownloadUrl,
  runInference,
  clearTrainingJob,
  type TrainingConfig,
  type TrainingStatus,
  type LogEntry,
  type ModelInfo,
  type Detection
} from '../api/training';

interface TrainingPanelProps {
  projectId: string;
  projectName: string;
  cropCount: number;
  labelCount: number;
}

export default function TrainingPanel({
  projectId,
  projectName,
  cropCount,
  labelCount
}: TrainingPanelProps) {
  // Config state
  const [epochs, setEpochs] = useState(100);
  const [batchSize, setBatchSize] = useState(8);
  const [imgSize, setImgSize] = useState(640);

  // Training state
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);

  // Inference state
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [inferenceImage, setInferenceImage] = useState<File | null>(null);
  const [inferencePreview, setInferencePreview] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [inferenceConf, setInferenceConf] = useState(0.5);
  const [isInferring, setIsInferring] = useState(false);
  const [inferenceRan, setInferenceRan] = useState(false); // Track if inference was run

  // Refs
  const logsEndRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Polling interval
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial status and models
  useEffect(() => {
    fetchStatus();
    fetchModels();
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [projectId]);

  // Start polling when training is running
  useEffect(() => {
    if (status?.status === 'running') {
      pollingRef.current = setInterval(() => {
        fetchStatus();
        fetchLogs();
      }, 2000);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [status?.status]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Draw detections on canvas
  useEffect(() => {
    if (inferencePreview && detections.length > 0 && canvasRef.current && imageRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = imageRef.current;

      // Wait for image to load
      if (img.complete) {
        drawDetections(ctx, img);
      } else {
        img.onload = () => drawDetections(ctx, img);
      }
    }
  }, [detections, inferencePreview]);

  const drawDetections = (ctx: CanvasRenderingContext2D, img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw image
    ctx.drawImage(img, 0, 0);

    // Draw bounding boxes
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];

    detections.forEach((det, idx) => {
      const [x1, y1, x2, y2] = det.bbox;
      const color = colors[det.class_id % colors.length];

      // Draw box
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      // Draw label background
      const label = `${det.class_name} ${(det.confidence * 100).toFixed(0)}%`;
      ctx.font = 'bold 16px sans-serif';
      const textWidth = ctx.measureText(label).width;

      ctx.fillStyle = color;
      ctx.fillRect(x1, y1 - 24, textWidth + 10, 24);

      // Draw label text
      ctx.fillStyle = 'white';
      ctx.fillText(label, x1 + 5, y1 - 7);
    });
  };

  const fetchStatus = async () => {
    const result = await getTrainingStatus(projectId);
    setStatus(result);
  };

  const fetchLogs = async () => {
    const result = await getTrainingLogs(projectId, 200);
    if (result.success) {
      setLogs(result.logs);
    }
  };

  const fetchModels = async () => {
    const result = await listModels(projectId);
    if (result.success) {
      setModels(result.models);
      if (result.models.length > 0 && !selectedModel) {
        setSelectedModel(result.models[0].runId);
      }
    }
  };

  const handleStartTraining = async () => {
    const config: TrainingConfig = {
      epochs,
      batch: batchSize,
      imgsz: imgSize,
      device: 1,
      workers: 4
    };

    const result = await startTraining(projectId, config);
    if (result.success) {
      setLogs([]);
      fetchStatus();
    } else {
      alert(`Failed to start training: ${result.error}`);
    }
  };

  const handleStopTraining = async () => {
    if (!confirm('Stop training? Progress will be lost.')) return;

    const result = await stopTraining(projectId);
    if (result.success) {
      fetchStatus();
      fetchModels();
    } else {
      alert(`Failed to stop: ${result.error}`);
    }
  };

  const handleClearJob = async () => {
    await clearTrainingJob(projectId);
    fetchStatus();
    fetchModels();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setInferenceImage(file);
      setInferencePreview(URL.createObjectURL(file));
      setDetections([]);
      setInferenceRan(false); // Reset inference state for new image
    }
  };

  const handleRunInference = async () => {
    if (!selectedModel || !inferenceImage) return;

    setIsInferring(true);
    setDetections([]);
    setInferenceRan(false);

    const result = await runInference(
      projectId,
      selectedModel,
      inferenceImage,
      inferenceConf
    );

    setIsInferring(false);
    setInferenceRan(true);

    if (result.success && result.detections) {
      setDetections(result.detections);
    } else if (!result.success) {
      alert(`Inference failed: ${result.error}`);
    }
  };

  const isRunning = status?.status === 'running';
  const isCompleted = status?.status === 'completed';
  const isFailed = status?.status === 'failed';

  // Get score emoji and message based on mAP50 percentage
  const getScoreInfo = (mAP50: number | undefined) => {
    if (mAP50 === undefined) return { emoji: '❓', message: 'No score yet', color: '#666' };
    const percent = mAP50 * 100;
    if (percent < 25) {
      return {
        emoji: '😢',
        message: 'Needs more training data',
        color: '#e74c3c',
        tip: 'Add more labeled samples to improve accuracy'
      };
    } else if (percent < 50) {
      return {
        emoji: '😐',
        message: 'Getting there',
        color: '#f39c12',
        tip: 'More samples or epochs may help'
      };
    } else if (percent < 70) {
      return {
        emoji: '🙂',
        message: 'Decent model',
        color: '#3498db',
        tip: 'Good for basic detection'
      };
    } else {
      return {
        emoji: '😄',
        message: 'Great model!',
        color: '#27ae60',
        tip: 'Ready for production use'
      };
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ margin: '0 0 12px 0' }}>YOLO11-Nano Training</h2>
        <div style={{ display: 'flex', gap: '24px', fontSize: '15px', color: '#666' }}>
          <div>Project: <strong style={{ color: '#333' }}>{projectName}</strong></div>
          <div><strong style={{ color: '#333' }}>{cropCount}</strong> crops</div>
          <div><strong style={{ color: '#333' }}>{labelCount}</strong> labels</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Left Column - Training */}
        <div>
          {/* Training Configuration */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Training Configuration</h3>

            {/* Epochs */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label style={{ fontSize: '14px', fontWeight: '500' }}>Epochs</label>
                <span style={{ fontSize: '14px', color: '#666' }}>{epochs}</span>
              </div>
              <input
                type="range"
                min="10"
                max="200"
                step="10"
                value={epochs}
                onChange={(e) => setEpochs(parseInt(e.target.value))}
                disabled={isRunning}
                style={{ width: '100%' }}
              />
            </div>

            {/* Batch Size */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label style={{ fontSize: '14px', fontWeight: '500' }}>Batch Size</label>
                <span style={{ fontSize: '14px', color: '#666' }}>{batchSize}</span>
              </div>
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value))}
                disabled={isRunning}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc'
                }}
              >
                <option value={4}>4 (low memory)</option>
                <option value={8}>8 (recommended)</option>
                <option value={16}>16 (fast)</option>
                <option value={32}>32 (very fast)</option>
              </select>
            </div>

            {/* Image Size */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label style={{ fontSize: '14px', fontWeight: '500' }}>Image Size</label>
                <span style={{ fontSize: '14px', color: '#666' }}>{imgSize}px</span>
              </div>
              <select
                value={imgSize}
                onChange={(e) => setImgSize(parseInt(e.target.value))}
                disabled={isRunning}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc'
                }}
              >
                <option value={320}>320 (fast, lower accuracy)</option>
                <option value={416}>416 (balanced)</option>
                <option value={640}>640 (recommended)</option>
              </select>
            </div>

            {/* Export Info */}
            <div style={{
              padding: '12px',
              backgroundColor: '#f8f9fa',
              borderRadius: '4px',
              fontSize: '13px',
              color: '#666',
              marginBottom: '16px'
            }}>
              <strong>Export formats:</strong> NCNN (Raspberry Pi) + ONNX (universal)
            </div>

            {/* Action Button */}
            {isRunning ? (
              <button
                onClick={handleStopTraining}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Stop Training
              </button>
            ) : (
              <button
                onClick={handleStartTraining}
                disabled={cropCount < 10}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: cropCount < 10 ? '#ccc' : '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  cursor: cropCount < 10 ? 'not-allowed' : 'pointer'
                }}
              >
                {cropCount < 10 ? 'Need at least 10 crops' : 'Start Training'}
              </button>
            )}
          </div>

          {/* Training Progress */}
          {(isRunning || isCompleted || isFailed) && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '20px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>Training Progress</h3>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  backgroundColor: isRunning ? '#3498db' : isCompleted ? '#27ae60' : '#e74c3c',
                  color: 'white'
                }}>
                  {status?.status?.toUpperCase()}
                </span>
              </div>

              {/* Progress Bar */}
              {isRunning && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px' }}>
                      Epoch {status?.currentEpoch || 0} / {status?.totalEpochs || epochs}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
                      {(status?.progress || 0).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#e0e0e0',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${status?.progress || 0}%`,
                      height: '100%',
                      backgroundColor: '#3498db',
                      transition: 'width 0.3s'
                    }} />
                  </div>
                </div>
              )}

              {/* Metrics */}
              {status?.metrics && Object.keys(status.metrics).length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>Metrics</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {status.metrics.mAP50 !== undefined && (
                      <div style={{ padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                        <div style={{ fontSize: '12px', color: '#666' }}>mAP50</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                          {(status.metrics.mAP50 * 100).toFixed(1)}%
                        </div>
                      </div>
                    )}
                    {status.metrics['mAP50-95'] !== undefined && (
                      <div style={{ padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                        <div style={{ fontSize: '12px', color: '#666' }}>mAP50-95</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                          {(status.metrics['mAP50-95'] * 100).toFixed(1)}%
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Completed Results */}
              {isCompleted && status?.results && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#d4edda',
                  borderRadius: '4px',
                  marginBottom: '16px'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#155724' }}>
                    Training Complete!
                  </div>
                  <div style={{ fontSize: '13px', color: '#155724' }}>
                    <div>Time: {Math.round(status.results.training_time_seconds / 60)} minutes</div>
                    <div>Epochs: {status.results.epochs_completed}</div>
                  </div>
                </div>
              )}

              {/* Clear button for completed/failed jobs */}
              {(isCompleted || isFailed) && (
                <button
                  onClick={handleClearJob}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#95a5a6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Clear & Train Again
                </button>
              )}
            </div>
          )}

          {/* Training Logs */}
          {logs.length > 0 && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Training Logs</h3>
              <div style={{
                backgroundColor: '#1e1e1e',
                borderRadius: '4px',
                padding: '12px',
                maxHeight: '200px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}>
                {logs.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      color: log.type === 'error' ? '#ff6b6b' :
                             log.type === 'complete' ? '#4ecdc4' :
                             log.type === 'progress' ? '#ffeaa7' : '#ddd',
                      marginBottom: '4px'
                    }}
                  >
                    {log.type === 'progress' ? (
                      `[Epoch ${log.epoch}/${log.total_epochs}] ${log.progress?.toFixed(1)}%`
                    ) : log.type === 'validation' ? (
                      `[Validation] mAP50: ${((log.metrics?.mAP50 || 0) * 100).toFixed(1)}%`
                    ) : (
                      log.message || JSON.stringify(log)
                    )}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Models & Inference */}
        <div>
          {/* Trained Models */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Trained Models</h3>

            {models.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>No trained models yet</div>
                <div style={{ fontSize: '14px' }}>Train a model to see it here</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {models.map((model) => {
                  const scoreInfo = getScoreInfo(model.metrics?.mAP50);
                  return (
                  <div
                    key={model.runId}
                    style={{
                      border: selectedModel === model.runId ? '2px solid #3498db' : '1px solid #e0e0e0',
                      borderRadius: '8px',
                      padding: '12px',
                      cursor: 'pointer',
                      backgroundColor: selectedModel === model.runId ? '#f8f9ff' : 'white'
                    }}
                    onClick={() => setSelectedModel(model.runId)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                        {model.runId.substring(0, 16)}...
                      </div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        {new Date(model.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    {/* Score indicator with emoji */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '6px',
                      marginBottom: '8px'
                    }}>
                      <span style={{ fontSize: '24px' }}>{scoreInfo.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: scoreInfo.color }}>
                          {scoreInfo.message}
                        </div>
                        {model.metrics?.mAP50 !== undefined && (
                          <div style={{ fontSize: '11px', color: '#666' }}>
                            mAP50: {(model.metrics.mAP50 * 100).toFixed(1)}% • {scoreInfo.tip}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                      <span>{model.sizeMB} MB</span>
                    </div>

                    {/* Download buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {model.formats.pt && (
                        <a
                          href={getModelDownloadUrl(projectId, model.runId, 'pt')}
                          download
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#3498db',
                            color: 'white',
                            borderRadius: '4px',
                            fontSize: '11px',
                            textDecoration: 'none'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          .pt
                        </a>
                      )}
                      {model.formats.onnx && (
                        <a
                          href={getModelDownloadUrl(projectId, model.runId, 'onnx')}
                          download
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#9b59b6',
                            color: 'white',
                            borderRadius: '4px',
                            fontSize: '11px',
                            textDecoration: 'none'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          ONNX
                        </a>
                      )}
                      {model.formats.ncnn && (
                        <a
                          href={getModelDownloadUrl(projectId, model.runId, 'ncnn')}
                          download
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#27ae60',
                            color: 'white',
                            borderRadius: '4px',
                            fontSize: '11px',
                            textDecoration: 'none'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          NCNN
                        </a>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inference Test */}
          {models.length > 0 && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Test Inference</h3>

              {/* Image Upload */}
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    padding: '20px',
                    border: '2px dashed #ccc',
                    borderRadius: '8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: '#f8f9fa'
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                  {inferencePreview ? (
                    <span style={{ color: '#27ae60' }}>Image selected - click to change</span>
                  ) : (
                    <span style={{ color: '#666' }}>Click to upload test image</span>
                  )}
                </label>
              </div>

              {/* Confidence Threshold */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: '500' }}>Confidence Threshold</label>
                  <span style={{ fontSize: '14px', color: '#666' }}>{(inferenceConf * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={inferenceConf}
                  onChange={(e) => setInferenceConf(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Run Inference Button */}
              <button
                onClick={handleRunInference}
                disabled={!selectedModel || !inferenceImage || isInferring}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: (!selectedModel || !inferenceImage) ? '#ccc' : '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  cursor: (!selectedModel || !inferenceImage) ? 'not-allowed' : 'pointer',
                  marginBottom: '16px'
                }}
              >
                {isInferring ? 'Running...' : 'Run Detection'}
              </button>

              {/* Results Display */}
              {inferencePreview && (
                <div>
                  <div style={{ position: 'relative' }}>
                    <img
                      ref={(el) => { imageRef.current = el; }}
                      src={inferencePreview}
                      alt="Test"
                      style={{
                        width: '100%',
                        borderRadius: '8px',
                        display: detections.length > 0 ? 'none' : 'block'
                      }}
                    />
                    <canvas
                      ref={canvasRef}
                      style={{
                        width: '100%',
                        borderRadius: '8px',
                        display: detections.length > 0 ? 'block' : 'none'
                      }}
                    />
                  </div>

                  {detections.length > 0 && (
                    <div style={{
                      marginTop: '12px',
                      padding: '12px',
                      backgroundColor: '#d4edda',
                      borderRadius: '4px',
                      border: '1px solid #c3e6cb'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#155724' }}>
                        Detected: {detections.length} objects
                      </div>
                      <div style={{ fontSize: '13px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {detections.map((det, idx) => (
                          <span
                            key={idx}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#fff',
                              borderRadius: '4px',
                              border: '1px solid #c3e6cb'
                            }}
                          >
                            {det.class_name}: {(det.confidence * 100).toFixed(0)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No detections feedback */}
                  {inferenceRan && detections.length === 0 && (() => {
                    const selectedModelData = models.find(m => m.runId === selectedModel);
                    const scoreInfo = getScoreInfo(selectedModelData?.metrics?.mAP50);
                    return (
                      <div style={{
                        marginTop: '12px',
                        padding: '16px',
                        backgroundColor: '#fff3cd',
                        borderRadius: '8px',
                        border: '1px solid #ffc107',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>{scoreInfo.emoji}</div>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#856404' }}>
                          No objects detected
                        </div>
                        <div style={{ fontSize: '13px', color: '#856404', marginBottom: '8px' }}>
                          {scoreInfo.message}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#666',
                          backgroundColor: 'rgba(255,255,255,0.5)',
                          padding: '8px',
                          borderRadius: '4px'
                        }}>
                          {selectedModelData?.metrics?.mAP50 !== undefined ? (
                            <>
                              Model accuracy: {(selectedModelData.metrics.mAP50 * 100).toFixed(1)}% mAP50
                              <br />
                              <strong>Tip:</strong> {scoreInfo.tip}
                            </>
                          ) : (
                            'Try lowering the confidence threshold or add more training data'
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
