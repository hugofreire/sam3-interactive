/**
 * LabelsSection - Manage project labels
 */

import { useState, useEffect } from 'react';
import KioskLayout from '../KioskLayout';
import TouchButton from '../components/TouchButton';
import { getProjectLabels, createProjectLabel, deleteProjectLabel } from '@/api/projects';
import type { Project, ProjectLabel } from '@/types';

interface LabelsSectionProps {
  project: Project;
  onBack: () => void;
  onRefresh: () => void;
}

export default function LabelsSection({ project, onBack, onRefresh }: LabelsSectionProps) {
  const [labels, setLabels] = useState<ProjectLabel[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLabels();
  }, [project.id]);

  const loadLabels = async () => {
    try {
      setLoading(true);
      const data = await getProjectLabels(project.id);
      setLabels(data);
    } catch (err) {
      console.error('Failed to load labels:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    try {
      await createProjectLabel(project.id, { name: newLabel.trim() });
      setNewLabel('');
      await loadLabels();
      onRefresh();
    } catch (err) {
      console.error('Failed to add label:', err);
    }
  };

  const handleDelete = async (labelId: string) => {
    try {
      await deleteProjectLabel(project.id, labelId);
      await loadLabels();
      onRefresh();
    } catch (err) {
      console.error('Failed to delete label:', err);
    }
  };

  return (
    <KioskLayout title="Labels" showBack onBack={onBack}>
      <div className="max-w-xl mx-auto space-y-6">
        {/* Add new label */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New label name..."
            className="flex-1 h-14 px-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none"
            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
          />
          <TouchButton onClick={handleAdd} disabled={!newLabel.trim()}>
            Add
          </TouchButton>
        </div>

        {/* Labels list */}
        {loading ? (
          <div className="text-center text-muted-foreground">Loading...</div>
        ) : labels.length === 0 ? (
          <div className="text-center text-muted-foreground">No labels yet</div>
        ) : (
          <div className="space-y-2">
            {labels.map((label) => (
              <div
                key={label.id}
                className="flex items-center justify-between p-4 rounded-xl border bg-card"
              >
                <span className="text-lg font-medium">{label.name}</span>
                <TouchButton
                  variant="danger"
                  size="default"
                  onClick={() => handleDelete(label.id)}
                >
                  Delete
                </TouchButton>
              </div>
            ))}
          </div>
        )}
      </div>
    </KioskLayout>
  );
}
