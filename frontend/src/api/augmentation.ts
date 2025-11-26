/**
 * Augmentation API Client
 *
 * Functions for generating synthetic training data via image augmentation.
 */

import axios from 'axios';

const API_BASE = '/api/projects';

// Types
export interface AugmentationStats {
  sourceImages: number;
  originalBboxes: number;
  enhancedImages: number;
  syntheticBboxes: number;
}

export interface SourceImage {
  imagePath: string;
  bboxCount: number;
  labels: string[];
  bboxes: number[][];
  allLabels: string[];
}

export interface SourcesResponse {
  success: boolean;
  sources: SourceImage[];
  totalImages: number;
  totalBboxes: number;
}

export interface PreviewResult {
  success: boolean;
  width?: number;
  height?: number;
  bboxes?: number[][];
  labels?: string[];
  augmentations_applied?: string[];
  original_bbox_count?: number;
  result_bbox_count?: number;
  preview_base64?: string;
  error?: string;
}

export interface GenerateResult {
  enhancedId: string;
  sourceImage: string;
  outputPath: string;
  augmentations: string[];
  bboxCount: number;
}

export interface GenerateResponse {
  success: boolean;
  imagesGenerated?: number;
  totalBboxes?: number;
  results?: GenerateResult[];
  error?: string;
}

export type AugmentationType =
  | 'flip_h'
  | 'flip_v'
  | 'rotate'
  | 'rotate_15'
  | 'rotate_30'
  | 'rotate_-15'
  | 'rotate_-30'
  | 'brightness'
  | 'contrast'
  | 'brightness_contrast'
  | 'hue_saturation'
  | 'color'
  | 'blur'
  | 'noise'
  | 'scale';

export const AUGMENTATION_OPTIONS: {
  id: AugmentationType;
  label: string;
  description: string;
  category: 'geometric' | 'color' | 'other';
}[] = [
  { id: 'flip_h', label: 'Horizontal Flip', description: 'Mirror image left-right', category: 'geometric' },
  { id: 'rotate', label: 'Rotation', description: '±15° to ±30° rotation', category: 'geometric' },
  { id: 'brightness', label: 'Brightness', description: '±20% brightness adjustment', category: 'color' },
  { id: 'contrast', label: 'Contrast', description: '±20% contrast adjustment', category: 'color' },
  { id: 'hue_saturation', label: 'Hue/Saturation', description: 'Color shift and saturation', category: 'color' },
  { id: 'blur', label: 'Gaussian Blur', description: 'Slight blur effect', category: 'other' },
];

/**
 * Get augmentation stats for a project
 */
export async function getAugmentationStats(
  projectId: string
): Promise<{ success: boolean; stats: AugmentationStats }> {
  try {
    const response = await axios.get(`${API_BASE}/${projectId}/augmentation/stats`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      stats: { sourceImages: 0, originalBboxes: 0, enhancedImages: 0, syntheticBboxes: 0 }
    };
  }
}

/**
 * Get source images available for augmentation
 */
export async function getAugmentationSources(projectId: string): Promise<SourcesResponse> {
  try {
    const response = await axios.get(`${API_BASE}/${projectId}/augmentation/sources`);
    return response.data;
  } catch (error) {
    return { success: false, sources: [], totalImages: 0, totalBboxes: 0 };
  }
}

/**
 * Preview augmentation on a single image
 */
export async function previewAugmentation(
  projectId: string,
  imagePath: string,
  bboxes: number[][],
  labels: string[],
  augmentations: string[],
  intensity: number = 1.0
): Promise<PreviewResult> {
  try {
    const response = await axios.post(`${API_BASE}/${projectId}/augmentation/preview`, {
      imagePath,
      bboxes,
      labels,
      augmentations,
      intensity
    });
    return response.data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: PreviewResult } };
    if (axiosError.response?.data) {
      return axiosError.response.data;
    }
    return { success: false, error: 'Failed to preview augmentation' };
  }
}

/**
 * Generate augmented images and add to dataset
 */
export async function generateAugmentations(
  projectId: string,
  augmentations: string[],
  variationsPerImage: number = 3,
  intensity: number = 1.0
): Promise<GenerateResponse> {
  try {
    const response = await axios.post(`${API_BASE}/${projectId}/augmentation/generate`, {
      augmentations,
      variationsPerImage,
      intensity
    });
    return response.data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: GenerateResponse } };
    if (axiosError.response?.data) {
      return axiosError.response.data;
    }
    return { success: false, error: 'Failed to generate augmentations' };
  }
}

/**
 * Clear all synthetic data for a project
 */
export async function clearAugmentations(
  projectId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await axios.delete(`${API_BASE}/${projectId}/augmentation/clear`);
    return response.data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: { error: string } } };
    return {
      success: false,
      error: axiosError.response?.data?.error || 'Failed to clear augmentations'
    };
  }
}
