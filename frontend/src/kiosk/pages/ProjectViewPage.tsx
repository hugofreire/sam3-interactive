/**
 * ProjectViewPage - Project management dashboard with 6 sections
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import KioskLayout from '../KioskLayout';
import TouchButton from '../components/TouchButton';
import { getProject } from '@/api/projects';
import type { Project } from '@/types';

// Section imports (to be implemented)
import LabelsSection from '../sections/LabelsSection';
import ImagesSection from '../sections/ImagesSection';
import LabelingSection from '../sections/LabelingSection';
import DatasetSection from '../sections/DatasetSection';
import TrainingSection from '../sections/TrainingSection';
import ExportSection from '../sections/ExportSection';

type SectionType = 'overview' | 'labels' | 'images' | 'labeling' | 'dataset' | 'training' | 'export';

export default function ProjectViewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionType>('overview');

  useEffect(() => {
    if (projectId) {
      loadProject();
    }
  }, [projectId]);

  const loadProject = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const data = await getProject(projectId);
      setProject(data);
    } catch (err) {
      console.error('Failed to load project:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <KioskLayout title="Loading..." showBack onBack={() => navigate('/kiosk')}>
        <div className="h-full flex items-center justify-center">
          <div className="text-xl text-muted-foreground">Loading project...</div>
        </div>
      </KioskLayout>
    );
  }

  if (!project) {
    return (
      <KioskLayout title="Error" showBack onBack={() => navigate('/kiosk')}>
        <div className="h-full flex flex-col items-center justify-center gap-4">
          <div className="text-xl text-destructive">Project not found</div>
          <TouchButton onClick={() => navigate('/kiosk')}>Go Home</TouchButton>
        </div>
      </KioskLayout>
    );
  }

  // Overview grid with section tiles
  if (activeSection === 'overview') {
    return (
      <KioskLayout
        title={project.name}
        showBack
        onBack={() => navigate('/kiosk')}
        rightContent={
          <TouchButton
            size="default"
            variant="ghost"
            onClick={() => navigate(`/kiosk/wizard/${projectId}/images`)}
          >
            Continue Wizard
          </TouchButton>
        }
      >
        <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto">
          {/* Labels */}
          <button
            onClick={() => setActiveSection('labels')}
            className="p-6 rounded-xl border-2 border-border bg-card hover:border-primary active:scale-95 transition-all text-center"
          >
            <div className="text-4xl mb-2">🏷️</div>
            <div className="text-lg font-semibold">Labels</div>
            <div className="text-2xl font-bold text-primary">{project.num_labels}</div>
          </button>

          {/* Images */}
          <button
            onClick={() => setActiveSection('images')}
            className="p-6 rounded-xl border-2 border-border bg-card hover:border-primary active:scale-95 transition-all text-center"
          >
            <div className="text-4xl mb-2">🖼️</div>
            <div className="text-lg font-semibold">Images</div>
            <div className="text-2xl font-bold text-primary">{project.num_images || 0}</div>
          </button>

          {/* Labeling */}
          <button
            onClick={() => setActiveSection('labeling')}
            className="p-6 rounded-xl border-2 border-border bg-card hover:border-primary active:scale-95 transition-all text-center"
          >
            <div className="text-4xl mb-2">✏️</div>
            <div className="text-lg font-semibold">Labeling</div>
            <div className="text-sm text-muted-foreground">Continue</div>
          </button>

          {/* Dataset */}
          <button
            onClick={() => setActiveSection('dataset')}
            className="p-6 rounded-xl border-2 border-border bg-card hover:border-primary active:scale-95 transition-all text-center"
          >
            <div className="text-4xl mb-2">📊</div>
            <div className="text-lg font-semibold">Dataset</div>
            <div className="text-2xl font-bold text-primary">{project.num_crops}</div>
          </button>

          {/* Training */}
          <button
            onClick={() => setActiveSection('training')}
            className="p-6 rounded-xl border-2 border-border bg-card hover:border-primary active:scale-95 transition-all text-center"
          >
            <div className="text-4xl mb-2">🤖</div>
            <div className="text-lg font-semibold">Training</div>
            <div className="text-sm text-muted-foreground">Configure</div>
          </button>

          {/* Export */}
          <button
            onClick={() => setActiveSection('export')}
            className="p-6 rounded-xl border-2 border-border bg-card hover:border-primary active:scale-95 transition-all text-center"
          >
            <div className="text-4xl mb-2">📦</div>
            <div className="text-lg font-semibold">Export</div>
            <div className="text-sm text-muted-foreground">YOLO / HEF</div>
          </button>
        </div>
      </KioskLayout>
    );
  }

  // Render active section
  const sectionProps = {
    project,
    onBack: () => setActiveSection('overview'),
    onRefresh: loadProject,
  };

  return (
    <>
      {activeSection === 'labels' && <LabelsSection {...sectionProps} />}
      {activeSection === 'images' && <ImagesSection {...sectionProps} />}
      {activeSection === 'labeling' && <LabelingSection {...sectionProps} />}
      {activeSection === 'dataset' && <DatasetSection {...sectionProps} />}
      {activeSection === 'training' && <TrainingSection {...sectionProps} />}
      {activeSection === 'export' && <ExportSection {...sectionProps} />}
    </>
  );
}
