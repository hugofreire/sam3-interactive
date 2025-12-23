/**
 * Step2Images - Add images via upload or webcam capture
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import KioskLayout from '../KioskLayout';
import TouchButton from '../components/TouchButton';
import WebcamCapture from '../components/WebcamCapture';
import { getProject, batchUploadImages, getProjectImages } from '@/api/projects';
import type { Project, ProjectImage } from '@/types';

export default function Step2Images() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [showWebcam, setShowWebcam] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadProject();
      loadImages();
    }
  }, [projectId]);

  const loadProject = async () => {
    if (!projectId) return;
    try {
      const data = await getProject(projectId);
      setProject(data);
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  };

  const loadImages = async () => {
    if (!projectId) return;
    try {
      const response = await getProjectImages(projectId);
      setImages(response.images || []);
    } catch (err) {
      console.error('Failed to load images:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!projectId || !e.target.files?.length) return;

    const files = Array.from(e.target.files);
    try {
      setUploading(true);
      await batchUploadImages(projectId, files);
      await loadImages();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleWebcamCapture = async (blob: Blob) => {
    if (!projectId) return;

    try {
      setUploading(true);
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      await batchUploadImages(projectId, [file]);
      await loadImages();
      setShowWebcam(false);
    } catch (err) {
      console.error('Capture failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleNext = () => {
    navigate(`/kiosk/wizard/${projectId}/labeling`);
  };

  const handleBack = () => {
    navigate('/kiosk');
  };

  if (showWebcam) {
    return (
      <KioskLayout title="Capture Image" showBack onBack={() => setShowWebcam(false)}>
        <WebcamCapture onCapture={handleWebcamCapture} onCancel={() => setShowWebcam(false)} />
      </KioskLayout>
    );
  }

  return (
    <KioskLayout
      title={`Step 2/4: Add Images${project ? ` - ${project.name}` : ''}`}
      showBack
      onBack={handleBack}
    >
      <div className="h-full flex flex-col gap-4">
        {/* Action buttons */}
        <div className="flex gap-4 justify-center">
          <TouchButton
            size="lg"
            variant="outline"
            onClick={() => setShowWebcam(true)}
            icon={<span className="text-2xl">📷</span>}
          >
            Capture from Camera
          </TouchButton>

          <TouchButton
            size="lg"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            icon={<span className="text-2xl">📁</span>}
          >
            {uploading ? 'Uploading...' : 'Upload Files'}
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
          <span className="font-semibold">{images.length}</span> images added
        </div>

        {/* Image thumbnails */}
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-6 gap-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="aspect-square rounded-lg bg-muted overflow-hidden"
              >
                <img
                  src={`/api/projects/${projectId}/images/${img.id}/serve`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <TouchButton variant="outline" onClick={handleBack}>
            ← Back
          </TouchButton>
          <TouchButton
            size="lg"
            onClick={handleNext}
            disabled={images.length === 0}
          >
            Next →
          </TouchButton>
        </div>
      </div>
    </KioskLayout>
  );
}
