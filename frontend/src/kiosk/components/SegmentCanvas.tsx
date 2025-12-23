/**
 * SegmentCanvas - Simplified canvas for SAM3 segmentation
 */

import { useRef, useEffect, useState } from 'react';

interface SegmentCanvasProps {
  imageUrl: string;
  masks: string[]; // Base64 encoded masks
  selectedMask: number;
  onSelectMask: (index: number) => void;
  onClick: (x: number, y: number) => void;
}

export default function SegmentCanvas({
  imageUrl,
  masks,
  selectedMask,
  onClick,
}: SegmentCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [maskImages, setMaskImages] = useState<HTMLImageElement[]>([]);
  const [scale, setScale] = useState(1);

  // Load main image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = imageUrl;
  }, [imageUrl]);

  // Load mask images
  useEffect(() => {
    const loadMasks = async () => {
      const loaded = await Promise.all(
        masks.map((mask) => {
          return new Promise<HTMLImageElement>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = `data:image/png;base64,${mask}`;
          });
        })
      );
      setMaskImages(loaded);
    };

    if (masks.length > 0) {
      loadMasks();
    } else {
      setMaskImages([]);
    }
  }, [masks]);

  // Calculate scale and draw
  useEffect(() => {
    if (!image || !canvasRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate scale to fit container
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const scaleX = containerWidth / image.width;
    const scaleY = containerHeight / image.height;
    const newScale = Math.min(scaleX, scaleY, 1); // Don't upscale

    setScale(newScale);

    // Set canvas size
    canvas.width = image.width * newScale;
    canvas.height = image.height * newScale;

    // Draw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Draw mask overlay
    if (maskImages.length > 0 && maskImages[selectedMask]) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(maskImages[selectedMask], 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;
    }
  }, [image, maskImages, selectedMask]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !image) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // Convert to image coordinates
    const imageX = canvasX / scale;
    const imageY = canvasY / scale;

    onClick(imageX, imageY);
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center bg-muted rounded-xl overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="cursor-crosshair"
        style={{ maxWidth: '100%', maxHeight: '100%' }}
      />
    </div>
  );
}
