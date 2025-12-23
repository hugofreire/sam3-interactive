/**
 * Step1Setup - Project name and labels configuration
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import KioskLayout from '../KioskLayout';
import TouchButton from '../components/TouchButton';
import { createProject, createProjectLabel } from '@/api/projects';

export default function Step1Setup() {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState('');
  const [labels, setLabels] = useState<string[]>(['']);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLabel = () => {
    setLabels([...labels, '']);
  };

  const removeLabel = (index: number) => {
    setLabels(labels.filter((_, i) => i !== index));
  };

  const updateLabel = (index: number, value: string) => {
    const newLabels = [...labels];
    newLabels[index] = value;
    setLabels(newLabels);
  };

  const handleNext = async () => {
    if (!projectName.trim()) {
      setError('Please enter a project name');
      return;
    }

    const validLabels = labels.filter(l => l.trim());
    if (validLabels.length === 0) {
      setError('Please add at least one label');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      // Create project
      const project = await createProject({ name: projectName.trim() });

      // Create labels
      for (const labelName of validLabels) {
        await createProjectLabel(project.id, { name: labelName.trim() });
      }

      // Navigate to next step
      navigate(`/kiosk/wizard/${project.id}/images`);
    } catch (err) {
      setError('Failed to create project');
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <KioskLayout
      title="Step 1/4: Project Setup"
      showBack
      onBack={() => navigate('/kiosk')}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Project name */}
        <div>
          <label className="block text-lg font-medium mb-2">Project Name</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Enter project name..."
            className="w-full h-14 px-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none"
          />
        </div>

        {/* Labels */}
        <div>
          <label className="block text-lg font-medium mb-2">Labels (Classes)</label>
          <div className="space-y-3">
            {labels.map((label, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => updateLabel(index, e.target.value)}
                  placeholder={`Label ${index + 1}`}
                  className="flex-1 h-14 px-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none"
                />
                {labels.length > 1 && (
                  <TouchButton
                    variant="danger"
                    onClick={() => removeLabel(index)}
                    className="w-14 h-14 p-0"
                  >
                    ×
                  </TouchButton>
                )}
              </div>
            ))}
          </div>
          <TouchButton
            variant="outline"
            onClick={addLabel}
            className="mt-3"
            icon={<span>+</span>}
          >
            Add Label
          </TouchButton>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-center">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-end pt-4">
          <TouchButton
            size="lg"
            onClick={handleNext}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Next →'}
          </TouchButton>
        </div>
      </div>
    </KioskLayout>
  );
}
