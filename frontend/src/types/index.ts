// Point with label for segmentation
export interface Point {
  x: number;
  y: number;
  label: 1 | 0; // 1 = foreground, 0 = background
}

// Mask data returned from API
export interface Mask {
  data: string; // base64 encoded PNG
  score: number;
}

// Segmentation result from API
export interface SegmentationResult {
  success: boolean;
  masks?: string[]; // base64 encoded PNGs
  scores?: number[];
  num_masks?: number;
  error?: string;
}

// Session information
export interface Session {
  success: boolean;
  sessionId: string;
  width: number;
  height: number;
  imageUrl?: string;
  error?: string;
}

// API request/response types
export interface ClickSegmentRequest {
  sessionId: string;
  points: number[][]; // [[x, y], [x, y], ...]
  labels: number[]; // [1, 0, 1, ...]
  multimaskOutput?: boolean;
  usePreviousLogits?: boolean;
}

export interface TextSegmentRequest {
  sessionId: string;
  prompt: string;
}

// ==================== DATASET LABELING TYPES ====================

// Background mode for crop extraction
export type BackgroundMode = 'transparent' | 'white' | 'black' | 'original';

// Project information
export interface Project {
  id: string;
  name: string;
  description?: string;
  num_crops: number;
  num_labels: number;
  created_at: string;
  updated_at: string;
  settings?: {
    background_mode?: BackgroundMode;
    default_labels?: string[];
  };
}

// Crop information
export interface Crop {
  id: string;
  project_id: string;
  label: string;
  filename: string;
  file_path: string;
  url?: string;

  // Source information
  source_image: string;
  source_session_id?: string;

  // Segmentation metadata
  bbox: number[]; // [x, y, width, height]
  mask_score?: number;
  mask_area?: number;
  background_mode: BackgroundMode;

  created_at: string;
}

// Label statistics
export interface Label {
  id: number;
  project_id: string;
  label: string;
  count: number;
  color?: string;
  created_at: string;
}

// API request types
export interface CreateProjectRequest {
  name: string;
  description?: string;
  settings?: {
    background_mode?: BackgroundMode;
    default_labels?: string[];
  };
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  settings?: {
    background_mode?: BackgroundMode;
    default_labels?: string[];
  };
}

export interface CreateCropRequest {
  sessionId: string;
  maskIndex: number;
  label: string;
  backgroundMode?: BackgroundMode;
  sourceImage: string;
  bbox?: number[];
  maskScore?: number;
  maskArea?: number;
}

export interface UpdateCropRequest {
  label: string;
}

export interface GetCropsRequest {
  label?: string;
  limit?: number;
  offset?: number;
}

// API response types
export interface ProjectsResponse {
  success: boolean;
  projects: Project[];
}

export interface ProjectResponse {
  success: boolean;
  project: Project;
}

export interface CropsResponse {
  success: boolean;
  crops: Crop[];
  total: number;
  limit?: number;
  offset?: number;
}

export interface CropResponse {
  success: boolean;
  crop: Crop;
}

export interface DeleteResponse {
  success: boolean;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
}
