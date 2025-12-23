/**
 * ExportSection - Export dataset and download models
 */

import { useState, useEffect } from 'react';
import KioskLayout from '../KioskLayout';
import TouchButton from '../components/TouchButton';
import { exportProject } from '@/api/projects';
import { listModels } from '@/api/training';
import type { Project, TrainedModel } from '@/types';

interface ExportSectionProps {
  project: Project;
  onBack: () => void;
  onRefresh: () => void;
}

export default function ExportSection({ project, onBack }: ExportSectionProps) {
  const [models, setModels] = useState<TrainedModel[]>([]);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadModels();
  }, [project.id]);

  const loadModels = async () => {
    try {
      setLoading(true);
      const data = await listModels(project.id);
      setModels(data || []);
    } catch (err) {
      console.error('Failed to load models:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportDataset = async () => {
    try {
      setExporting(true);
      const result = await exportProject(project.id);
      // Open download in new tab
      if (result.downloadUrl) {
        window.open(result.downloadUrl, '_blank');
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadModel = (model: TrainedModel, format: string) => {
    const url = `/api/projects/${project.id}/models/${model.runId}/download/${format}`;
    window.open(url, '_blank');
  };

  return (
    <KioskLayout title="Export" showBack onBack={onBack}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Export dataset */}
        <div className="p-6 rounded-xl bg-card border">
          <h3 className="text-lg font-semibold mb-4">Export Dataset</h3>
          <p className="text-muted-foreground mb-4">
            Download your labeled dataset in YOLO format for training elsewhere.
          </p>
          <TouchButton onClick={handleExportDataset} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Download YOLO ZIP'}
          </TouchButton>
        </div>

        {/* Trained models */}
        <div className="p-6 rounded-xl bg-card border">
          <h3 className="text-lg font-semibold mb-4">Trained Models</h3>
          {loading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : models.length === 0 ? (
            <div className="text-muted-foreground">No trained models yet</div>
          ) : (
            <div className="space-y-4">
              {models.map((model) => (
                <div key={model.runId} className="p-4 bg-muted rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">
                      Model {model.runId.slice(0, 8)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      mAP50: {model.mAP50 ? (model.mAP50 * 100).toFixed(1) + '%' : '--'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <TouchButton
                      size="default"
                      variant="outline"
                      onClick={() => handleDownloadModel(model, 'pt')}
                    >
                      PyTorch
                    </TouchButton>
                    <TouchButton
                      size="default"
                      variant="outline"
                      onClick={() => handleDownloadModel(model, 'onnx')}
                    >
                      ONNX
                    </TouchButton>
                    <TouchButton
                      size="default"
                      variant="outline"
                      onClick={() => handleDownloadModel(model, 'ncnn')}
                    >
                      NCNN
                    </TouchButton>
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
