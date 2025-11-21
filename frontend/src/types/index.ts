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
