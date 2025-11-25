import axios from 'axios';
import type {
  Project,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectsResponse,
  ProjectResponse,
  DeleteResponse,
  ExportProjectRequest,
  ExportResponse,
  ProjectImage,
  ProjectImagesResponse,
  ProjectImageResponse,
  BatchUploadResponse,
  ImageStatus,
  ProjectLabel,
  ProjectLabelsResponse,
  ProjectLabelResponse,
  CreateProjectLabelRequest,
  UpdateProjectLabelRequest,
  UndoResponse
} from '../types';

// Use environment variable or default to proxy
const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 second timeout
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`[API/Projects] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API/Projects] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging
api.interceptors.response.use(
  (response) => {
    console.log(`[API/Projects] Response from ${response.config.url}:`, response.status);
    return response;
  },
  (error) => {
    console.error('[API/Projects] Response error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

/**
 * Get all projects
 */
export async function getProjects(): Promise<Project[]> {
  const response = await api.get<ProjectsResponse>('/projects');
  return response.data.projects;
}

/**
 * Get a single project by ID
 */
export async function getProject(projectId: string): Promise<Project> {
  const response = await api.get<ProjectResponse>(`/projects/${projectId}`);
  return response.data.project;
}

/**
 * Create a new project
 */
export async function createProject(data: CreateProjectRequest): Promise<Project> {
  const response = await api.post<ProjectResponse>('/projects', data);
  return response.data.project;
}

/**
 * Update an existing project
 */
export async function updateProject(
  projectId: string,
  data: UpdateProjectRequest
): Promise<Project> {
  const response = await api.put<ProjectResponse>(`/projects/${projectId}`, data);
  return response.data.project;
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<void> {
  await api.delete<DeleteResponse>(`/projects/${projectId}`);
}

/**
 * Export a project as ZIP file
 */
export async function exportProject(
  projectId: string,
  options: ExportProjectRequest = {}
): Promise<ExportResponse> {
  const response = await api.post<ExportResponse>(
    `/projects/${projectId}/export/zip`,
    {
      split: options.split || { train: 0.7, val: 0.2, test: 0.1 },
      includeMetadata: options.includeMetadata !== false
    },
    {
      timeout: 120000 // 2 minute timeout for export
    }
  );
  return response.data;
}

// ==================== PROJECT LABELS API ====================

/**
 * Get all predefined labels for a project
 */
export async function getProjectLabels(projectId: string): Promise<ProjectLabel[]> {
  const response = await api.get<ProjectLabelsResponse>(`/projects/${projectId}/labels`);
  return response.data.labels;
}

/**
 * Create a new predefined label
 */
export async function createProjectLabel(
  projectId: string,
  data: CreateProjectLabelRequest
): Promise<ProjectLabel> {
  const response = await api.post<ProjectLabelResponse>(`/projects/${projectId}/labels`, data);
  return response.data.label;
}

/**
 * Update a predefined label
 */
export async function updateProjectLabel(
  projectId: string,
  labelId: number,
  data: UpdateProjectLabelRequest
): Promise<ProjectLabel> {
  const response = await api.put<ProjectLabelResponse>(
    `/projects/${projectId}/labels/${labelId}`,
    data
  );
  return response.data.label;
}

/**
 * Delete a predefined label
 */
export async function deleteProjectLabel(projectId: string, labelId: number): Promise<void> {
  await api.delete(`/projects/${projectId}/labels/${labelId}`);
}

// ==================== PROJECT IMAGES API ====================

/**
 * Get all images for a project with stats
 */
export async function getProjectImages(
  projectId: string,
  options?: { status?: ImageStatus; limit?: number; offset?: number }
): Promise<ProjectImagesResponse> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());

  const queryString = params.toString();
  const url = `/projects/${projectId}/images${queryString ? `?${queryString}` : ''}`;

  const response = await api.get<ProjectImagesResponse>(url);
  return response.data;
}

/**
 * Batch upload images to a project
 */
export async function batchUploadImages(
  projectId: string,
  files: FileList | File[],
  onProgress?: (progress: number) => void
): Promise<BatchUploadResponse> {
  const formData = new FormData();
  const fileArray = Array.from(files);

  fileArray.forEach((file) => {
    formData.append('images', file);
  });

  const response = await api.post<BatchUploadResponse>(
    `/projects/${projectId}/images/batch`,
    formData,
    {
      timeout: 300000, // 5 minute timeout for batch upload
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          onProgress(progress);
        }
      }
    }
  );

  return response.data;
}

/**
 * Update image status
 */
export async function updateImageStatus(
  projectId: string,
  imageId: string,
  status: ImageStatus
): Promise<ProjectImageResponse> {
  const response = await api.put<ProjectImageResponse>(
    `/projects/${projectId}/images/${imageId}/status`,
    { status }
  );
  return response.data;
}

/**
 * Get next pending image (for auto-advance)
 */
export async function getNextPendingImage(projectId: string): Promise<ProjectImage | null> {
  const response = await api.get<{ success: boolean; image: ProjectImage | null }>(
    `/projects/${projectId}/images/next`
  );
  return response.data.image;
}

/**
 * Delete a project image
 */
export async function deleteProjectImage(projectId: string, imageId: string): Promise<void> {
  await api.delete(`/projects/${projectId}/images/${imageId}`);
}

/**
 * Get URL to serve a project image
 */
export function getProjectImageUrl(projectId: string, imageId: string): string {
  return `${API_BASE_URL}/projects/${projectId}/images/${imageId}/serve`;
}

// ==================== UNDO API ====================

/**
 * Undo the last crop action
 */
export async function undoLastAction(projectId: string): Promise<UndoResponse> {
  const response = await api.post<UndoResponse>(`/projects/${projectId}/undo`);
  return response.data;
}

export default {
  // Projects
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  exportProject,
  // Labels
  getProjectLabels,
  createProjectLabel,
  updateProjectLabel,
  deleteProjectLabel,
  // Images
  getProjectImages,
  batchUploadImages,
  updateImageStatus,
  getNextPendingImage,
  deleteProjectImage,
  getProjectImageUrl,
  // Undo
  undoLastAction
};
