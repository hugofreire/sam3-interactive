import axios from 'axios';
import type {
  Session,
  SegmentationResult,
  ClickSegmentRequest,
  TextSegmentRequest
} from '../types';

// Use environment variable or default to proxy
// For VPN access, set VITE_API_URL=http://10.9.0.14:3001
const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60 second timeout for large models
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging
api.interceptors.response.use(
  (response) => {
    console.log(`[API] Response from ${response.config.url}:`, response.status);
    return response;
  },
  (error) => {
    console.error('[API] Response error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

/**
 * Upload an image and create a session
 */
export async function uploadImage(file: File): Promise<Session> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await api.post<Session>('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
}

/**
 * Perform click-based segmentation
 */
export async function segmentByClick(request: ClickSegmentRequest): Promise<SegmentationResult> {
  const response = await api.post<SegmentationResult>('/segment/click', request);
  return response.data;
}

/**
 * Perform text-based segmentation
 */
export async function segmentByText(request: TextSegmentRequest): Promise<SegmentationResult> {
  const response = await api.post<SegmentationResult>('/segment/text', request);
  return response.data;
}

/**
 * Clear a session
 */
export async function clearSession(sessionId: string): Promise<void> {
  await api.delete(`/session/${sessionId}`);
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<{ status: string; sam3Ready: boolean }> {
  const response = await api.get('/health');
  return response.data;
}

export default {
  uploadImage,
  segmentByClick,
  segmentByText,
  clearSession,
  checkHealth,
};
