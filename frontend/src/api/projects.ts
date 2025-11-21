import axios from 'axios';
import type {
  Project,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectsResponse,
  ProjectResponse,
  DeleteResponse
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

export default {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
};
