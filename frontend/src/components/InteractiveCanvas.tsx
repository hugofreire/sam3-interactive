import React, { useRef, useEffect, useState } from 'react';
import { segmentByClick } from '../api/sam3';
import type { Point } from '../types';

interface InteractiveCanvasProps {
  sessionId: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
}

export default function InteractiveCanvas({
  sessionId,
  imageUrl,
  imageWidth,
  imageHeight,
}: InteractiveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [masks, setMasks] = useState<string[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [selectedMask, setSelectedMask] = useState<number>(0);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [maskImages, setMaskImages] = useState<HTMLImageElement[]>([]);
  const [scale, setScale] = useState(1);
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [canvasHeight, setCanvasHeight] = useState(600);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);

      // Calculate canvas size to fit viewport while maintaining aspect ratio
      const maxWidth = 800;
      const maxHeight = 600;
      const aspectRatio = imageWidth / imageHeight;

      let newWidth = maxWidth;
      let newHeight = newWidth / aspectRatio;

      if (newHeight > maxHeight) {
        newHeight = maxHeight;
        newWidth = newHeight * aspectRatio;
      }

      setCanvasWidth(newWidth);
      setCanvasHeight(newHeight);
      setScale(newWidth / imageWidth);
    };
    img.src = imageUrl; // Use relative URL, proxied by Vite
  }, [imageUrl, imageWidth, imageHeight]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Draw mask overlay
    if (maskImages.length > 0 && maskImages[selectedMask]) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(maskImages[selectedMask], 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;
    }

    // Draw points
    points.forEach((point) => {
      const scaledX = point.x * scale;
      const scaledY = point.y * scale;

      // Draw circle
      ctx.beginPath();
      ctx.arc(scaledX, scaledY, 8, 0, 2 * Math.PI);
      ctx.fillStyle = point.label === 1 ? '#4CAF50' : '#f44336';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw crosshair
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(scaledX - 12, scaledY);
      ctx.lineTo(scaledX + 12, scaledY);
      ctx.moveTo(scaledX, scaledY - 12);
      ctx.lineTo(scaledX, scaledY + 12);
      ctx.stroke();
    });
  }, [image, points, maskImages, selectedMask, scale]);

  // Handle mouse clicks
  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    const label = e.button === 2 ? 0 : 1; // Right click = background (0), left = foreground (1)

    const newPoint: Point = { x, y, label };
    const newPoints = [...points, newPoint];
    setPoints(newPoints);

    // Perform segmentation
    await performSegmentation(newPoints);
  };

  // Prevent context menu on right click
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Perform segmentation
  const performSegmentation = async (currentPoints: Point[]) => {
    if (currentPoints.length === 0) return;

    setIsSegmenting(true);

    try {
      const pointCoords = currentPoints.map((p) => [p.x, p.y]);
      const labels = currentPoints.map((p) => p.label);

      const result = await segmentByClick({
        sessionId,
        points: pointCoords,
        labels,
        multimaskOutput: true,
        usePreviousLogits: currentPoints.length > 1,
      });

      if (result.success && result.masks && result.scores) {
        console.log('Segmentation successful:', result.scores);
        setMasks(result.masks);
        setScores(result.scores);

        // Load mask images
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

        // Select best mask (highest score)
        const bestMaskIdx = result.scores.indexOf(Math.max(...result.scores));
        setSelectedMask(bestMaskIdx);
      }
    } catch (error) {
      console.error('Segmentation error:', error);
    } finally {
      setIsSegmenting(false);
    }
  };

  // Clear all points
  const handleClear = () => {
    setPoints([]);
    setMasks([]);
    setScores([]);
    setMaskImages([]);
    setSelectedMask(0);
  };

  // Undo last point
  const handleUndo = () => {
    if (points.length === 0) return;
    const newPoints = points.slice(0, -1);
    setPoints(newPoints);
    if (newPoints.length > 0) {
      performSegmentation(newPoints);
    } else {
      setMasks([]);
      setScores([]);
      setMaskImages([]);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: '#2196F3',
            color: 'white',
            borderRadius: '4px',
            fontWeight: 'bold',
          }}
        >
          🖱️ Click Mode
        </div>

        <button
          onClick={handleClear}
          disabled={points.length === 0}
          style={{
            padding: '8px 16px',
            backgroundColor: points.length === 0 ? '#ccc' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: points.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Clear All
        </button>

        <button
          onClick={handleUndo}
          disabled={points.length === 0}
          style={{
            padding: '8px 16px',
            backgroundColor: points.length === 0 ? '#ccc' : '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: points.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Undo
        </button>

        <div style={{ marginLeft: 'auto', fontSize: '14px', color: '#666' }}>
          Points: {points.length} |
          {isSegmenting && ' ⏳ Segmenting...'}
          {!isSegmenting && masks.length > 0 && ` ✓ ${masks.length} masks found`}
        </div>
      </div>

      <div
        style={{
          backgroundColor: '#f0f0f0',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '16px',
          fontSize: '14px',
        }}
      >
        <div><strong>Instructions:</strong></div>
        <div>• <span style={{ color: '#4CAF50' }}>●</span> Left-click: Add foreground point</div>
        <div>• <span style={{ color: '#f44336' }}>●</span> Right-click: Add background point</div>
        <div>• Add multiple points to refine the mask</div>
      </div>

      <div
        style={{
          border: '2px solid #ddd',
          borderRadius: '8px',
          display: 'inline-block',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onClick={handleCanvasClick}
          onContextMenu={handleContextMenu}
          style={{
            display: 'block',
            cursor: 'crosshair',
          }}
        />
      </div>

      {/* Mask selector */}
      {masks.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>
            Select Mask:
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {masks.map((_, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedMask(idx)}
                style={{
                  padding: '12px 20px',
                  border: `2px solid ${selectedMask === idx ? '#2196F3' : '#ddd'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  backgroundColor: selectedMask === idx ? '#e3f2fd' : 'white',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Mask {idx + 1}</div>
                <div style={{ fontSize: '18px', marginTop: '4px' }}>
                  {(scores[idx] * 100).toFixed(1)}%
                </div>
                {selectedMask === idx && (
                  <div style={{ color: '#2196F3', marginTop: '4px', fontSize: '12px' }}>
                    ✓ Selected
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
