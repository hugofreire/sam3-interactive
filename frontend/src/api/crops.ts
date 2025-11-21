import axios from 'axios';
import type {
  Crop,
  CreateCropRequest,
  UpdateCropRequest,
  GetCropsRequest,
  CropsResponse,
  CropResponse,
  DeleteResponse
} from '../types';

// Use environment variable or default to proxy
const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60 second timeout (crop extraction can take time)
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`[API/Crops] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API/Crops] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging
api.interceptors.response.use(
  (response) => {
    console.log(`[API/Crops] Response from ${response.config.url}:`, response.status);
    return response;
  },
  (error) => {
    console.error('[API/Crops] Response error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

/**
 * Get all crops for a project
 */
export async function getCrops(
  projectId: string,
  filters?: GetCropsRequest
): Promise<{ crops: Crop[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.label) params.append('label', filters.label);
  if (filters?.limit !== undefined) params.append('limit', filters.limit.toString());
  if (filters?.offset !== undefined) params.append('offset', filters.offset.toString());

  const response = await api.get<CropsResponse>(
    `/projects/${projectId}/crops?${params.toString()}`
  );
  return {
    crops: response.data.crops,
    total: response.data.total,
  };
}

/**
 * Get a single crop by ID
 */
export async function getCrop(cropId: string, projectId: string): Promise<Crop> {
  const response = await api.get<CropResponse>(`/crops/${cropId}?projectId=${projectId}`);
  return response.data.crop;
}

/**
 * Create a new crop from segmentation mask
 */
export async function createCrop(
  projectId: string,
  data: CreateCropRequest
): Promise<Crop> {
  const response = await api.post<CropResponse>(`/projects/${projectId}/crops`, data);
  return response.data.crop;
}

/**
 * Update a crop's label
 */
export async function updateCropLabel(
  cropId: string,
  projectId: string,
  data: UpdateCropRequest
): Promise<Crop> {
  const response = await api.put<CropResponse>(
    `/crops/${cropId}?projectId=${projectId}`,
    data
  );
  return response.data.crop;
}

/**
 * Delete a crop
 */
export async function deleteCrop(cropId: string, projectId: string): Promise<void> {
  await api.delete<DeleteResponse>(`/crops/${cropId}?projectId=${projectId}`);
}

/**
 * Get crop image URL
 */
export function getCropImageUrl(cropId: string, projectId: string): string {
  return `${API_BASE_URL}/crops/${cropId}/image?projectId=${projectId}`;
}

export default {
  getCrops,
  getCrop,
  createCrop,
  updateCropLabel,
  deleteCrop,
  getCropImageUrl,
};
