/**
 * LabelingWorkspace Component
 * Main unified labeling interface with:
 * - Label selector at top
 * - Interactive canvas in middle
 * - Image strip at bottom
 *
 * Keyboard shortcuts:
 * - 1-9: Select label
 * - S: Save current mask with selected label
 * - Z: Undo last save
 * - Escape: Clear segmentation without saving
 * - N: Finish image, advance to next
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import LabelSelector from './LabelSelector';
import ImageStrip from './ImageStrip';
import { segmentByClick, uploadImage } from '../api/sam3';
import { createCrop } from '../api/crops';
import {
  getProjectLabels,
  getProjectImages,
  updateImageStatus,
  getNextPendingImage,
  getProjectImageUrl,
  undoLastAction,
} from '../api/projects';
import type {
  Project,
  ProjectLabel,
  ProjectImage,
  ImageStats,
  Point,
  Session,
} from '../types';

interface LabelingWorkspaceProps {
  project: Project;
  onProjectUpdated?: () => void;
}

export default function LabelingWorkspace({
  project,
  onProjectUpdated,
}: LabelingWorkspaceProps) {
  // Labels state
  const [labels, setLabels] = useState<ProjectLabel[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<ProjectLabel | null>(null);

  // Images state
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [imageStats, setImageStats] = useState<ImageStats>({
    pending: 0,
    in_progress: 0,
    completed: 0,
    total: 0,
  });
  const [currentImage, setCurrentImage] = useState<ProjectImage | null>(null);

  // Session state (for SAM3)
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);

  // Canvas state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [masks, setMasks] = useState<string[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [selectedMaskIndex, setSelectedMaskIndex] = useState<number>(0);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [maskImages, setMaskImages] = useState<HTMLImageElement[]>([]);
  const [scale, setScale] = useState(1);
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [canvasHeight, setCanvasHeight] = useState(600);

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cropCount, setCropCount] = useState(0);

  // Track saved crops on current image (for drawing bboxes)
  interface SavedCrop {
    bbox: number[]; // [x, y, width, height]
    label: string;
    color: string;
  }
  const [savedCrops, setSavedCrops] = useState<SavedCrop[]>([]);

  // Load labels and images on mount
  useEffect(() => {
    loadLabelsAndImages();
  }, [project.id]);

  const loadLabelsAndImages = async () => {
    try {
      const [labelsData, imagesData] = await Promise.all([
        getProjectLabels(project.id),
        getProjectImages(project.id),
      ]);
      setLabels(labelsData);
      setImages(imagesData.images);
      setImageStats(imagesData.stats);

      // Auto-select first label if available
      if (labelsData.length > 0 && !selectedLabel) {
        setSelectedLabel(labelsData[0]);
      }

      // Auto-select first pending image
      if (!currentImage && imagesData.images.length > 0) {
        const pending = imagesData.images.find((img) => img.status === 'pending');
        if (pending) {
          selectImage(pending);
        } else {
          selectImage(imagesData.images[0]);
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load project data');
    }
  };

  // Load image into SAM3 session when current image changes
  const selectImage = async (img: ProjectImage) => {
    setCurrentImage(img);
    clearSegmentation();
    setCropCount(0);
    setSavedCrops([]); // Clear saved crop bboxes for new image

    setLoadingSession(true);
    try {
      // Create a blob URL to upload to SAM3
      const imageUrl = getProjectImageUrl(project.id, img.id);

      // Fetch the image and create a file
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], img.original_filename, { type: blob.type });

      // Upload to SAM3
      const sessionData = await uploadImage(file);
      setSession(sessionData);

      // Mark image as in_progress
      if (img.status === 'pending') {
        await updateImageStatus(project.id, img.id, 'in_progress');
        // Update local state
        setImages((prev) =>
          prev.map((i) => (i.id === img.id ? { ...i, status: 'in_progress' as const } : i))
        );
        setImageStats((prev) => ({
          ...prev,
          pending: prev.pending - 1,
          in_progress: prev.in_progress + 1,
        }));
      }
    } catch (err) {
      console.error('Error loading image:', err);
      setError('Failed to load image');
    } finally {
      setLoadingSession(false);
    }
  };

  // Load image for canvas rendering
  useEffect(() => {
    if (!session) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);

      // Calculate canvas size
      const maxWidth = 900;
      const maxHeight = 500;
      const aspectRatio = session.width / session.height;

      let newWidth = maxWidth;
      let newHeight = newWidth / aspectRatio;

      if (newHeight > maxHeight) {
        newHeight = maxHeight;
        newWidth = newHeight * aspectRatio;
      }

      setCanvasWidth(newWidth);
      setCanvasHeight(newHeight);
      setScale(newWidth / session.width);
    };
    img.src = session.imageUrl || '';
  }, [session]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Draw saved crop bounding boxes first (below current mask)
    // bbox format from API is [x1, y1, x2, y2] (two corners)
    savedCrops.forEach((crop) => {
      const [x1, y1, x2, y2] = crop.bbox;
      const scaledX = x1 * scale;
      const scaledY = y1 * scale;
      const scaledW = (x2 - x1) * scale;
      const scaledH = (y2 - y1) * scale;

      // Draw semi-transparent fill
      ctx.fillStyle = crop.color + '20'; // 20 = ~12% opacity
      ctx.fillRect(scaledX, scaledY, scaledW, scaledH);

      // Draw border
      ctx.strokeStyle = crop.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(scaledX, scaledY, scaledW, scaledH);
      ctx.setLineDash([]);

      // Draw label
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = crop.color;
      const labelBg = ctx.measureText(crop.label);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(scaledX, scaledY - 18, labelBg.width + 8, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(crop.label, scaledX + 4, scaledY - 5);
    });

    // Draw mask overlay
    if (maskImages.length > 0 && maskImages[selectedMaskIndex]) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(maskImages[selectedMaskIndex], 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;
    }

    // Draw points
    points.forEach((point) => {
      const scaledX = point.x * scale;
      const scaledY = point.y * scale;

      ctx.beginPath();
      ctx.arc(scaledX, scaledY, 8, 0, 2 * Math.PI);
      ctx.fillStyle = point.label === 1 ? '#4CAF50' : '#f44336';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }, [image, points, maskImages, selectedMaskIndex, scale, savedCrops]);

  // Handle canvas click
  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!session) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    const label = e.button === 2 ? 0 : 1;

    const newPoint: Point = { x, y, label };
    const newPoints = [...points, newPoint];
    setPoints(newPoints);

    await performSegmentation(newPoints);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const performSegmentation = async (currentPoints: Point[]) => {
    if (!session || currentPoints.length === 0) return;

    setIsSegmenting(true);
    setError('');

    try {
      const pointCoords = currentPoints.map((p) => [p.x, p.y]);
      const pointLabels = currentPoints.map((p) => p.label);

      const result = await segmentByClick({
        sessionId: session.sessionId,
        points: pointCoords,
        labels: pointLabels,
        multimaskOutput: true,
        usePreviousLogits: currentPoints.length > 1,
      });

      if (result.success && result.masks && result.scores) {
        setMasks(result.masks);
        setScores(result.scores);

        const maskImgs = await Promise.all(
          result.masks.map((maskB64) => {
            return new Promise<HTMLImageElement>((resolve) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.src = `data:image/png;base64,${maskB64}`;
            });
          })
        );

        setMaskImages(maskImgs);
        const bestMaskIdx = result.scores.indexOf(Math.max(...result.scores));
        setSelectedMaskIndex(bestMaskIdx);
      }
    } catch (err) {
      console.error('Segmentation error:', err);
      setError('Segmentation failed');
    } finally {
      setIsSegmenting(false);
    }
  };

  const clearSegmentation = () => {
    setPoints([]);
    setMasks([]);
    setScores([]);
    setMaskImages([]);
    setSelectedMaskIndex(0);
  };

  // Save crop with selected label
  const saveCrop = async () => {
    if (!session || !selectedLabel || masks.length === 0 || !currentImage) {
      setError('Please segment an object and select a label first');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const cropResult = await createCrop(project.id, {
        sessionId: session.sessionId,
        maskIndex: selectedMaskIndex,
        label: selectedLabel.name,
        backgroundMode: 'original', // Keep full bbox with original background
        sourceImage: currentImage.original_filename,
        maskScore: scores[selectedMaskIndex],
        imageId: currentImage.id,
      });

      // Add to saved crops for visual feedback
      if (cropResult.bbox) {
        const labelColors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        const colorIndex = labels.findIndex((l) => l.name === selectedLabel.name) % labelColors.length;
        setSavedCrops((prev) => [
          ...prev,
          {
            bbox: cropResult.bbox,
            label: selectedLabel.name,
            color: selectedLabel.color || labelColors[colorIndex],
          },
        ]);
      }

      setCropCount((prev) => prev + 1);
      setMessage(`Saved "${selectedLabel.name}" crop`);
      setTimeout(() => setMessage(''), 2000);

      // Clear segmentation for next object (but keep image loaded)
      clearSegmentation();
      onProjectUpdated?.();
    } catch (err) {
      console.error('Error saving crop:', err);
      setError('Failed to save crop');
    } finally {
      setSaving(false);
    }
  };

  // Undo last crop
  const handleUndo = async () => {
    try {
      const result = await undoLastAction(project.id);
      if (result.success) {
        setCropCount((prev) => Math.max(0, prev - 1));
        // Remove last saved crop bbox from display
        setSavedCrops((prev) => prev.slice(0, -1));
        setMessage('Undid last save');
        setTimeout(() => setMessage(''), 2000);
        onProjectUpdated?.();
      } else {
        setError(result.error || 'Nothing to undo');
      }
    } catch (err) {
      console.error('Undo error:', err);
      setError('Undo failed');
    }
  };

  // Finish current image and advance
  const finishImage = async () => {
    if (!currentImage) return;

    try {
      const result = await updateImageStatus(project.id, currentImage.id, 'completed');

      // Update local state
      setImages((prev) =>
        prev.map((i) => (i.id === currentImage.id ? { ...i, status: 'completed' as const } : i))
      );
      setImageStats((prev) => ({
        ...prev,
        in_progress: prev.in_progress - 1,
        completed: prev.completed + 1,
      }));

      // Auto-advance to next pending
      if (result.nextImage) {
        selectImage(result.nextImage);
      } else {
        // No more pending images
        const nextPending = await getNextPendingImage(project.id);
        if (nextPending) {
          selectImage(nextPending);
        } else {
          setMessage('All images completed!');
          setCurrentImage(null);
          setSession(null);
        }
      }

      onProjectUpdated?.();
    } catch (err) {
      console.error('Error finishing image:', err);
      setError('Failed to finish image');
    }
  };

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // S - Save
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        saveCrop();
      }
      // Z - Undo
      else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        handleUndo();
      }
      // Escape - Clear
      else if (e.key === 'Escape') {
        e.preventDefault();
        clearSegmentation();
      }
      // N - Finish image
      else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        finishImage();
      }
    },
    [session, selectedLabel, masks, currentImage]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // If no labels defined
  if (labels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-xl font-semibold mb-2">No Labels Defined</div>
        <div className="text-muted-foreground mb-4">
          Add labels in project settings to start labeling.
        </div>
      </div>
    );
  }

  // If no images
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-xl font-semibold mb-2">No Images</div>
        <div className="text-muted-foreground mb-4">
          Upload images in project settings to start labeling.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: Label selector + controls */}
      <div className="flex items-center gap-4 p-4 border-b bg-background">
        <div className="flex-1">
          <LabelSelector
            labels={labels}
            selectedLabel={selectedLabel}
            onSelect={setSelectedLabel}
            disabled={saving}
          />
        </div>

        <div className="flex items-center gap-2">
          {cropCount > 0 && (
            <Badge variant="secondary">{cropCount} crops</Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={finishImage}
            disabled={!currentImage || loadingSession}
          >
            Finish Image [N]
          </Button>
        </div>
      </div>

      {/* Main canvas area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-muted/30 overflow-hidden">
        {loadingSession ? (
          <div className="text-muted-foreground">Loading image...</div>
        ) : !session ? (
          <div className="text-muted-foreground">Select an image to start labeling</div>
        ) : (
          <>
            {/* Status messages */}
            {(error || message) && (
              <div className="mb-2">
                {error && (
                  <Alert variant="destructive" className="py-2">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {message && (
                  <Alert className="py-2 bg-green-50 text-green-800 border-green-200">
                    <AlertDescription>{message}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Canvas */}
            <div className="border-2 border-border rounded-lg overflow-hidden shadow-lg">
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                onClick={handleCanvasClick}
                onContextMenu={handleContextMenu}
                className="cursor-crosshair block"
              />
            </div>

            {/* Mask selector and save button */}
            {masks.length > 0 && (
              <div className="mt-4 flex items-center gap-4">
                <div className="flex gap-2">
                  {masks.map((_, idx) => (
                    <Button
                      key={idx}
                      variant={selectedMaskIndex === idx ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedMaskIndex(idx)}
                    >
                      Mask {idx + 1} ({(scores[idx] * 100).toFixed(0)}%)
                    </Button>
                  ))}
                </div>

                <Button
                  onClick={saveCrop}
                  disabled={saving || !selectedLabel}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {saving ? 'Saving...' : 'Save [S]'}
                </Button>

                <Button variant="ghost" size="sm" onClick={clearSegmentation}>
                  Clear [Esc]
                </Button>
              </div>
            )}

            {/* Instructions */}
            <div className="mt-4 text-sm text-muted-foreground text-center">
              <span className="text-green-600">Left-click</span> foreground |{' '}
              <span className="text-red-600">Right-click</span> background |{' '}
              <kbd className="px-1 bg-muted rounded">S</kbd> save |{' '}
              <kbd className="px-1 bg-muted rounded">Z</kbd> undo |{' '}
              <kbd className="px-1 bg-muted rounded">1-9</kbd> select label
              {isSegmenting && <span className="ml-2">Segmenting...</span>}
            </div>
          </>
        )}
      </div>

      {/* Bottom: Image strip */}
      <ImageStrip
        projectId={project.id}
        images={images}
        stats={imageStats}
        currentImageId={currentImage?.id || null}
        onSelectImage={selectImage}
      />
    </div>
  );
}
