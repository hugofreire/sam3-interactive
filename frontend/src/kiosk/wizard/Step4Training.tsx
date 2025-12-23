/**
 * Step4Training - Train YOLO model with progress display
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import KioskLayout from '../KioskLayout';
import TouchButton from '../components/TouchButton';
import { getProject } from '@/api/projects';
import { getCrops } from '@/api/crops';
import { startTraining, getTrainingStatus, stopTraining } from '@/api/training';
import type { Project, TrainingStatus } from '@/types';

export default function Step4Training() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [cropCount, setCropCount] = useState(0);
  const [epochs, setEpochs] = useState(50);
  const [batchSize, setBatchSize] = useState(8);
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (status?.status === 'running') {
      interval = setInterval(checkStatus, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status?.status, projectId]);

  const loadData = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [projectData, cropsData, statusData] = await Promise.all([
        getProject(projectId),
        getCrops(projectId),
        getTrainingStatus(projectId).catch(() => null),
      ]);
      setProject(projectData);
      setCropCount(cropsData.total || 0);
      if (statusData) {
        setStatus(statusData);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = useCallback(async () => {
    if (!projectId) return;
    try {
      const statusData = await getTrainingStatus(projectId);
      setStatus(statusData);
    } catch (err) {
      console.error('Failed to get status:', err);
    }
  }, [projectId]);

  const handleStartTraining = async () => {
    if (!projectId) return;
    try {
      const result = await startTraining(projectId, {
        epochs,
        batch_size: batchSize,
      });
      setStatus(result);
    } catch (err) {
      console.error('Failed to start training:', err);
    }
  };

  const handleStopTraining = async () => {
    if (!projectId) return;
    try {
      await stopTraining(projectId);
      await checkStatus();
    } catch (err) {
      console.error('Failed to stop training:', err);
    }
  };

  const handleFinish = () => {
    navigate(`/kiosk/project/${projectId}`);
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

  const isRunning = status?.status === 'running';
  const isCompleted = status?.status === 'completed';
  const progress = status?.epoch && status?.total_epochs
    ? (status.epoch / status.total_epochs) * 100
    : 0;

  return (
    <KioskLayout
      title={`Step 4/4: Training${project ? ` - ${project.name}` : ''}`}
      showBack
      onBack={() => navigate(`/kiosk/wizard/${projectId}/labeling`)}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Dataset stats */}
        <div className="p-6 rounded-xl bg-card border">
          <h3 className="text-lg font-semibold mb-2">Dataset Summary</h3>
          <div className="text-2xl font-bold text-primary">{cropCount} labeled objects</div>
          <div className="text-muted-foreground">{project?.num_labels || 0} classes</div>
        </div>

        {/* Training config */}
        {!isRunning && !isCompleted && (
          <div className="p-6 rounded-xl bg-card border space-y-4">
            <h3 className="text-lg font-semibold">Training Configuration</h3>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Epochs</label>
                <select
                  value={epochs}
                  onChange={(e) => setEpochs(Number(e.target.value))}
                  className="w-full h-12 px-4 rounded-lg border bg-background text-lg"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Batch Size</label>
                <select
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full h-12 px-4 rounded-lg border bg-background text-lg"
                >
                  <option value={4}>4</option>
                  <option value={8}>8</option>
                  <option value={16}>16</option>
                  <option value={32}>32</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Training progress */}
        {(isRunning || isCompleted) && (
          <div className="p-6 rounded-xl bg-card border space-y-4">
            <h3 className="text-lg font-semibold">Training Progress</h3>

            {/* Progress bar */}
            <div className="relative h-8 bg-muted rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-sm font-medium">
                {progress.toFixed(0)}%
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">
                  {status?.epoch || 0}/{status?.total_epochs || epochs}
                </div>
                <div className="text-sm text-muted-foreground">Epoch</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {status?.metrics?.mAP50 ? (status.metrics.mAP50 * 100).toFixed(1) + '%' : '--'}
                </div>
                <div className="text-sm text-muted-foreground">mAP50</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {status?.metrics?.box_loss?.toFixed(3) || '--'}
                </div>
                <div className="text-sm text-muted-foreground">Loss</div>
              </div>
            </div>

            {isCompleted && (
              <div className="text-center p-4 bg-green-500/10 rounded-lg">
                <div className="text-2xl mb-2">✅</div>
                <div className="text-lg font-semibold text-green-600">Training Complete!</div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-4">
          {!isRunning && !isCompleted && (
            <>
              <TouchButton
                variant="outline"
                onClick={() => navigate(`/kiosk/wizard/${projectId}/labeling`)}
              >
                ← Back
              </TouchButton>
              <TouchButton
                size="lg"
                onClick={handleStartTraining}
                disabled={cropCount === 0}
              >
                Start Training
              </TouchButton>
            </>
          )}

          {isRunning && (
            <TouchButton variant="danger" onClick={handleStopTraining}>
              Stop Training
            </TouchButton>
          )}

          {isCompleted && (
            <TouchButton size="lg" onClick={handleFinish}>
              Finish →
            </TouchButton>
          )}
        </div>
      </div>
    </KioskLayout>
  );
}
