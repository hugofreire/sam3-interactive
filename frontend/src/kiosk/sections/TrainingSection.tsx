/**
 * TrainingSection - Training configuration and status
 */

import { useNavigate } from 'react-router-dom';
import KioskLayout from '../KioskLayout';
import TouchButton from '../components/TouchButton';
import type { Project } from '@/types';

interface TrainingSectionProps {
  project: Project;
  onBack: () => void;
  onRefresh: () => void;
}

export default function TrainingSection({ project, onBack }: TrainingSectionProps) {
  const navigate = useNavigate();

  const handleGoToTraining = () => {
    navigate(`/kiosk/wizard/${project.id}/training`);
  };

  return (
    <KioskLayout title="Training" showBack onBack={onBack}>
      <div className="h-full flex flex-col items-center justify-center gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Train Your Model</h2>
          <p className="text-muted-foreground">
            Train a YOLO11 object detection model on your labeled data
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-6 rounded-xl bg-card border text-center">
            <div className="text-3xl font-bold text-primary">{project.num_crops}</div>
            <div className="text-muted-foreground">Labeled Objects</div>
          </div>
          <div className="p-6 rounded-xl bg-card border text-center">
            <div className="text-3xl font-bold text-primary">{project.num_labels}</div>
            <div className="text-muted-foreground">Classes</div>
          </div>
        </div>

        <TouchButton size="lg" onClick={handleGoToTraining}>
          Go to Training
        </TouchButton>
      </div>
    </KioskLayout>
  );
}
