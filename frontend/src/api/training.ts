/**
 * Training API Client
 *
 * Functions for interacting with the YOLOv8 training backend
 */

import axios from 'axios';

const API_BASE = '/api/projects';

// Types
export interface TrainingConfig {
  epochs?: number;
  batch?: number;
  imgsz?: number;
  device?: number;
  workers?: number;
}

export interface TrainingStartResponse {
  success: boolean;
  jobId?: string;
  projectId?: string;
  runId?: string;
  status?: string;
  config?: TrainingConfig;
  startTime?: string;
  error?: string;
}

export interface TrainingMetrics {
  box_loss?: number;
  cls_loss?: number;
  dfl_loss?: number;
  mAP50?: number;
  'mAP50-95'?: number;
  precision?: number;
  recall?: number;
}

export interface TrainingStatus {
  success: boolean;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped';
  jobId?: string;
  runId?: string;
  progress?: number;
  currentEpoch?: number;
  totalEpochs?: number;
  metrics?: TrainingMetrics;
  startTime?: string;
  endTime?: string;
  error?: string;
  results?: {
    success: boolean;
    training_time_seconds: number;
    epochs_completed: number;
    best_model: string;
    onnx_model: string | null;
    ncnn_model: string | null;
    metrics: TrainingMetrics;
  };
  hasModels?: boolean;
}

export interface LogEntry {
  type: 'info' | 'progress' | 'validation' | 'error' | 'complete';
  timestamp: number;
  message?: string;
  epoch?: number;
  total_epochs?: number;
  progress?: number;
  metrics?: TrainingMetrics;
}

export interface TrainingLogsResponse {
  success: boolean;
  jobId?: string;
  logs: LogEntry[];
}

export interface ModelInfo {
  runId: string;
  createdAt: string;
  sizeMB: number;
  formats: {
    pt: boolean;
    onnx: boolean;
    ncnn: boolean;
  };
  metrics: TrainingMetrics;
  paths: {
    pt: string;
    onnx: string;
    ncnn: string;
  };
}

export interface ModelsResponse {
  success: boolean;
  models: ModelInfo[];
}

export interface Detection {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  confidence: number;
  class_id: number;
  class_name: string;
}

export interface InferenceResponse {
  success: boolean;
  image?: string;
  detections?: Detection[];
  count?: number;
  error?: string;
}

/**
 * Start a training job
 */
export async function startTraining(
  projectId: string,
  config: TrainingConfig = {}
): Promise<TrainingStartResponse> {
  try {
    const response = await axios.post<TrainingStartResponse>(
      `${API_BASE}/${projectId}/training/start`,
      config
    );
    return response.data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: TrainingStartResponse } };
    if (axiosError.response?.data) {
      return axiosError.response.data;
    }
    return { success: false, error: 'Failed to start training' };
  }
}

/**
 * Get training status
 */
export async function getTrainingStatus(
  projectId: string
): Promise<TrainingStatus> {
  try {
    const response = await axios.get<TrainingStatus>(
      `${API_BASE}/${projectId}/training/status`
    );
    return response.data;
  } catch (error) {
    return { success: false, status: 'idle' };
  }
}

/**
 * Stop a running training job
 */
export async function stopTraining(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await axios.post(
      `${API_BASE}/${projectId}/training/stop`
    );
    return response.data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: { error: string } } };
    return {
      success: false,
      error: axiosError.response?.data?.error || 'Failed to stop training'
    };
  }
}

/**
 * Get training logs
 */
export async function getTrainingLogs(
  projectId: string,
  limit: number = 100
): Promise<TrainingLogsResponse> {
  try {
    const response = await axios.get<TrainingLogsResponse>(
      `${API_BASE}/${projectId}/training/logs`,
      { params: { limit } }
    );
    return response.data;
  } catch (error) {
    return { success: false, logs: [] };
  }
}

/**
 * Clear a completed job from memory
 */
export async function clearTrainingJob(
  projectId: string
): Promise<{ success: boolean; cleared: boolean }> {
  try {
    const response = await axios.post(
      `${API_BASE}/${projectId}/training/clear`
    );
    return response.data;
  } catch (error) {
    return { success: false, cleared: false };
  }
}

/**
 * List trained models
 */
export async function listModels(projectId: string): Promise<ModelsResponse> {
  try {
    const response = await axios.get<ModelsResponse>(
      `${API_BASE}/${projectId}/training/models`
    );
    return response.data;
  } catch (error) {
    return { success: false, models: [] };
  }
}

/**
 * Get model download URL
 */
export function getModelDownloadUrl(
  projectId: string,
  runId: string,
  format: 'pt' | 'onnx' | 'ncnn'
): string {
  return `${API_BASE}/${projectId}/training/models/${runId}/download/${format}`;
}

/**
 * Run inference on an image
 */
export async function runInference(
  projectId: string,
  runId: string,
  imageFile: File,
  conf: number = 0.5
): Promise<InferenceResponse> {
  try {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('runId', runId);
    formData.append('conf', conf.toString());

    const response = await axios.post<InferenceResponse>(
      `${API_BASE}/${projectId}/training/inference`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    return response.data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: InferenceResponse } };
    if (axiosError.response?.data) {
      return axiosError.response.data;
    }
    return { success: false, error: 'Failed to run inference' };
  }
}
