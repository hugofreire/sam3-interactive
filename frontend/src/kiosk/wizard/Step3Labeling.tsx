/**
 * Step3Labeling - Label objects in images using SAM3
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import KioskLayout from '../KioskLayout';
import TouchButton from '../components/TouchButton';
import SegmentCanvas from '../components/SegmentCanvas';
import { getProject, getProjectLabels, getProjectImages, getNextPendingImage, updateImageStatus } from '@/api/projects';
import { uploadImage, segmentByClick, clearSession } from '@/api/sam3';
import { createCrop } from '@/api/crops';
import type { Project, ProjectLabel, ProjectImage, Session } from '@/types';

export default function Step3Labeling() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [labels, setLabels] = useState<ProjectLabel[]>([]);
  const [currentImage, setCurrentImage] = useState<ProjectImage | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<ProjectLabel | null>(null);
  const [masks, setMasks] = useState<string[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [selectedMask, setSelectedMask] = useState<number>(0);
  const [savedCount, setSavedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending: 0, in_progress: 0, completed: 0, total: 0 });

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const loadData = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [projectData, labelsData, imagesData] = await Promise.all([
        getProject(projectId),
        getProjectLabels(projectId),
        getProjectImages(projectId),
      ]);
      setProject(projectData);
      setLabels(labelsData);
      setStats(imagesData.stats || { pending: 0, in_progress: 0, completed: 0, total: 0 });

      if (labelsData.length > 0) {
        setSelectedLabel(labelsData[0]);
      }

      // Load first pending image
      await loadNextImage();
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadNextImage = async () => {
    if (!projectId) return;
    try {
      const nextImage = await getNextPendingImage(projectId);
      if (nextImage) {
        setCurrentImage(nextImage);
        await loadImageSession(nextImage);
      } else {
        setCurrentImage(null);
        setSession(null);
      }
      setMasks([]);
      setScores([]);
      setSavedCount(0);
    } catch (err) {
      console.error('Failed to load next image:', err);
    }
  };

  const loadImageSession = async (image: ProjectImage) => {
    if (!projectId) return;
    try {
      // Fetch image and create SAM3 session
      const imageUrl = `/api/projects/${projectId}/images/${image.id}/serve`;
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], image.filename, { type: blob.type });

      const sessionData = await uploadImage(file);
      setSession(sessionData);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const handleCanvasClick = async (x: number, y: number) => {
    if (!session) return;

    try {
      const result = await segmentByClick({
        sessionId: session.sessionId,
        points: [[x, y]],
        labels: [1], // foreground
        multimaskOutput: true,
      });

      if (result.success && result.masks) {
        setMasks(result.masks);
        setScores(result.scores || []);
        // Auto-select best mask
        const bestIndex = result.scores?.indexOf(Math.max(...(result.scores || []))) || 0;
        setSelectedMask(bestIndex);
      }
    } catch (err) {
      console.error('Segmentation failed:', err);
    }
  };

  const handleSave = async () => {
    if (!projectId || !session || !selectedLabel || !currentImage || masks.length === 0) return;

    try {
      await createCrop(projectId, {
        sessionId: session.sessionId,
        maskIndex: selectedMask,
        label: selectedLabel.name,
        backgroundMode: 'transparent',
        sourceImage: currentImage.original_filename,
        imageId: currentImage.id,
      });
      setSavedCount(prev => prev + 1);
      setMasks([]);
      setScores([]);
    } catch (err) {
      console.error('Failed to save crop:', err);
    }
  };

  const handleClear = () => {
    setMasks([]);
    setScores([]);
  };

  const handleNextImage = async () => {
    if (!projectId || !currentImage) return;

    try {
      // Mark current as completed
      await updateImageStatus(projectId, currentImage.id, 'completed');

      // Clear session
      if (session) {
        await clearSession(session.sessionId);
      }

      // Load next
      await loadNextImage();

      // Update stats
      const imagesData = await getProjectImages(projectId);
      setStats(imagesData.stats || { pending: 0, in_progress: 0, completed: 0, total: 0 });
    } catch (err) {
      console.error('Failed to advance:', err);
    }
  };

  const handleNext = () => {
    navigate(`/kiosk/wizard/${projectId}/training`);
  };

  if (loading) {
    return (
      <KioskLayout title="Loading...">
        <div className="h-full flex items-center justify-center">
          <div className="text-xl text-muted-foreground">Loading...</div>
        </div>
      </KioskLayout>
    );
  }

  if (!currentImage) {
    return (
      <KioskLayout
        title={`Step 3/4: Labeling${project ? ` - ${project.name}` : ''}`}
        showBack
        onBack={() => navigate(`/kiosk/wizard/${projectId}/images`)}
      >
        <div className="h-full flex flex-col items-center justify-center gap-4">
          <div className="text-4xl">✅</div>
          <div className="text-xl">All images labeled!</div>
          <div className="text-muted-foreground">
            {stats.completed} images completed
          </div>
          <TouchButton size="lg" onClick={handleNext}>
            Continue to Training →
          </TouchButton>
        </div>
      </KioskLayout>
    );
  }

  return (
    <KioskLayout
      title={`Step 3/4: Labeling [${stats.completed + 1}/${stats.total}]`}
      showBack
      onBack={() => navigate(`/kiosk/wizard/${projectId}/images`)}
    >
      <div className="h-full flex flex-col gap-2">
        {/* Canvas */}
        <div className="flex-1 min-h-0">
          {session && (
            <SegmentCanvas
              imageUrl={session.imageUrl || ''}
              masks={masks}
              selectedMask={selectedMask}
              onSelectMask={setSelectedMask}
              onClick={handleCanvasClick}
            />
          )}
        </div>

        {/* Label selector */}
        <div className="flex gap-2 justify-center flex-wrap">
          {labels.map((label) => (
            <TouchButton
              key={label.id}
              variant={selectedLabel?.id === label.id ? 'primary' : 'outline'}
              onClick={() => setSelectedLabel(label)}
            >
              {label.name}
            </TouchButton>
          ))}
        </div>

        {/* Mask scores */}
        {masks.length > 0 && (
          <div className="flex gap-2 justify-center">
            {scores.map((score, i) => (
              <button
                key={i}
                onClick={() => setSelectedMask(i)}
                className={`px-4 py-2 rounded-lg ${
                  selectedMask === i
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                Mask {i + 1}: {(score * 100).toFixed(1)}%
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center">
          <div className="text-muted-foreground">
            Saved: <span className="font-bold">{savedCount}</span> objects
          </div>

          <div className="flex gap-2">
            <TouchButton variant="outline" onClick={handleClear} disabled={masks.length === 0}>
              Clear
            </TouchButton>
            <TouchButton
              variant="primary"
              onClick={handleSave}
              disabled={!selectedLabel || masks.length === 0}
            >
              Save
            </TouchButton>
            <TouchButton variant="secondary" onClick={handleNextImage}>
              Next Image →
            </TouchButton>
          </div>
        </div>
      </div>
    </KioskLayout>
  );
}
