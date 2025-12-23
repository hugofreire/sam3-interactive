/**
 * LabelingSection - Continue labeling images (reuses Step3 logic)
 */

import { useNavigate } from 'react-router-dom';
import KioskLayout from '../KioskLayout';
import TouchButton from '../components/TouchButton';
import type { Project } from '@/types';

interface LabelingSectionProps {
  project: Project;
  onBack: () => void;
  onRefresh: () => void;
}

export default function LabelingSection({ project, onBack }: LabelingSectionProps) {
  const navigate = useNavigate();

  const handleStartLabeling = () => {
    navigate(`/kiosk/wizard/${project.id}/labeling`);
  };

  return (
    <KioskLayout title="Labeling" showBack onBack={onBack}>
      <div className="h-full flex flex-col items-center justify-center gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Continue Labeling</h2>
          <p className="text-muted-foreground">
            Click objects in your images to create labeled crops
          </p>
        </div>

        <div className="p-6 rounded-xl bg-card border text-center">
          <div className="text-4xl font-bold text-primary">{project.num_crops}</div>
          <div className="text-muted-foreground">objects labeled</div>
        </div>

        <TouchButton size="lg" onClick={handleStartLabeling}>
          Start Labeling
        </TouchButton>
      </div>
    </KioskLayout>
  );
}
