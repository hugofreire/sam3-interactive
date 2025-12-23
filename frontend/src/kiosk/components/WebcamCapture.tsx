/**
 * WebcamCapture - Camera preview with capture button
 */

import { useState, useRef, useEffect } from 'react';
import TouchButton from './TouchButton';

interface WebcamCaptureProps {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

export default function WebcamCapture({ onCapture, onCancel }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer back camera
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Failed to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    setCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Set canvas to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame
    ctx.drawImage(video, 0, 0);

    // Convert to blob
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCapture(blob);
        }
        setCapturing(false);
      },
      'image/jpeg',
      0.9
    );
  };

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="text-xl text-destructive">{error}</div>
        <div className="flex gap-4">
          <TouchButton onClick={startCamera}>Retry</TouchButton>
          <TouchButton variant="outline" onClick={onCancel}>Cancel</TouchButton>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Video preview */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-black rounded-xl overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="max-w-full max-h-full object-contain"
        />
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Controls */}
      <div className="flex justify-center gap-4">
        <TouchButton variant="outline" onClick={onCancel}>
          Cancel
        </TouchButton>
        <TouchButton
          size="lg"
          onClick={handleCapture}
          disabled={!stream || capturing}
          className="w-40"
        >
          {capturing ? 'Capturing...' : '📷 Capture'}
        </TouchButton>
      </div>
    </div>
  );
}
