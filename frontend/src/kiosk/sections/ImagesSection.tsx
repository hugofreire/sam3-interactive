/**
 * ImagesSection - View and add images
 */

import { useState, useEffect, useRef } from 'react';
import KioskLayout from '../KioskLayout';
import TouchButton from '../components/TouchButton';
import WebcamCapture from '../components/WebcamCapture';
import { getProjectImages, batchUploadImages, deleteProjectImage } from '@/api/projects';
import type { Project, ProjectImage } from '@/types';

interface ImagesSectionProps {
  project: Project;
  onBack: () => void;
  onRefresh: () => void;
}

export default function ImagesSection({ project, onBack, onRefresh }: ImagesSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [showWebcam, setShowWebcam] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadImages();
  }, [project.id]);

  const loadImages = async () => {
    try {
      setLoading(true);
      const response = await getProjectImages(project.id);
      setImages(response.images || []);
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    try {
      setUploading(true);
      await batchUploadImages(project.id, files);
      await loadImages();
      onRefresh();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleWebcamCapture = async (blob: Blob) => {
    try {
      setUploading(true);
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      await batchUploadImages(project.id, [file]);
      await loadImages();
      setShowWebcam(false);
      onRefresh();
    } catch (err) {
      console.error('Capture failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageId: string) => {
    try {
      await deleteProjectImage(project.id, imageId);
      await loadImages();
      onRefresh();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  if (showWebcam) {
    return (
      <KioskLayout title="Capture Image" showBack onBack={() => setShowWebcam(false)}>
        <WebcamCapture onCapture={handleWebcamCapture} onCancel={() => setShowWebcam(false)} />
      </KioskLayout>
    );
  }

  return (
    <KioskLayout title="Images" showBack onBack={onBack}>
      <div className="h-full flex flex-col gap-4">
        {/* Action buttons */}
        <div className="flex gap-4 justify-center">
          <TouchButton
            variant="outline"
            onClick={() => setShowWebcam(true)}
            icon={<span className="text-xl">📷</span>}
          >
            Camera
          </TouchButton>
          <TouchButton
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            icon={<span className="text-xl">📁</span>}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </TouchButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading}
          />
        </div>

        {/* Image count */}
        <div className="text-center text-lg">
          <span className="font-semibold">{images.length}</span> images
        </div>

        {/* Image grid */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-center text-muted-foreground">Loading...</div>
          ) : images.length === 0 ? (
            <div className="text-center text-muted-foreground">No images yet</div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="relative group aspect-square rounded-lg bg-muted overflow-hidden"
                >
                  <img
                    src={`/api/projects/${project.id}/images/${img.id}/serve`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => handleDelete(img.id)}
                    className="absolute top-1 right-1 w-8 h-8 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                  <div className={`absolute bottom-1 left-1 px-2 py-0.5 text-xs rounded ${
                    img.status === 'completed' ? 'bg-green-500' :
                    img.status === 'in_progress' ? 'bg-yellow-500' : 'bg-muted'
                  } text-white`}>
                    {img.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </KioskLayout>
  );
}
