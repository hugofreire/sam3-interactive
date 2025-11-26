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

  // Augmentation/synthetic data
  is_synthetic?: number; // 1 if generated via augmentation
  enhanced_image_id?: string; // Reference to enhanced_images table

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
  imageId?: string;  // Link to project image for undo tracking
}

export interface UpdateCropRequest {
  label: string;
}

export interface GetCropsRequest {
  label?: string;
  limit?: number;
  offset?: number;
}

export interface ExportProjectRequest {
  split?: {
    train: number;
    val: number;
    test: number;
  };
  includeMetadata?: boolean;
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

export interface ExportResponse {
  success: boolean;
  downloadUrl: string;
  filename: string;
  stats: {
    total: number;
    train: number;
    val: number;
    test: number;
    classes: string[];
    size_bytes: number;
  };
}

export interface ErrorResponse {
  success: false;
  error: string;
}

// ==================== IMAGE MANAGEMENT TYPES ====================

// Image status for labeling workflow
export type ImageStatus = 'pending' | 'in_progress' | 'completed';

// Project image information
export interface ProjectImage {
  id: string;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  width: number;
  height: number;
  file_size?: number;
  status: ImageStatus;
  sort_order: number;
  created_at: string;
  completed_at?: string;
}

// Image statistics
export interface ImageStats {
  pending: number;
  in_progress: number;
  completed: number;
  total: number;
}

// Predefined project label (for labeling workflow)
export interface ProjectLabel {
  id: number;
  name: string;
  color?: string;
  keyboard_shortcut?: string;
  sort_order: number;
  created_at?: string;
}

// Undo entry for undo history
export interface UndoEntry {
  id: number;
  action_type: 'crop_create' | 'crop_delete';
  crop_id: string;
  crop_data: Crop;
  image_id?: string;
  created_at: string;
}

// ==================== IMAGE API TYPES ====================

export interface ProjectImagesResponse {
  success: boolean;
  images: ProjectImage[];
  stats: ImageStats;
}

export interface ProjectImageResponse {
  success: boolean;
  image: ProjectImage;
  nextImage?: ProjectImage; // For auto-advance after completing
}

export interface BatchUploadResponse {
  success: boolean;
  uploaded: number;
  failed: number;
  images: ProjectImage[];
  errors?: Array<{ filename: string; error: string }>;
}

// ==================== LABEL API TYPES ====================

export interface ProjectLabelsResponse {
  success: boolean;
  labels: ProjectLabel[];
  total: number;
}

export interface ProjectLabelResponse {
  success: boolean;
  label: ProjectLabel;
}

export interface CreateProjectLabelRequest {
  name: string;
  color?: string;
  keyboard_shortcut?: string;
  sort_order?: number;
}

export interface UpdateProjectLabelRequest {
  name?: string;
  color?: string;
  keyboard_shortcut?: string;
  sort_order?: number;
}

// ==================== UNDO API TYPES ====================

export interface UndoResponse {
  success: boolean;
  undone?: UndoEntry;
  message?: string;
  error?: string;
}

// ==================== ENHANCED CREATE PROJECT ====================

export interface CreateProjectWithLabelsRequest {
  name: string;
  description?: string;
  labels?: Array<{
    name: string;
    color?: string;
  }>;
  settings?: {
    background_mode?: BackgroundMode;
  };
}
