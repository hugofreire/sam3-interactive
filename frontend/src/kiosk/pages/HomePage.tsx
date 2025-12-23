/**
 * HomePage - Kiosk entry screen with two main actions
 */

import { useNavigate } from 'react-router-dom';
import KioskLayout from '../KioskLayout';
import TouchButton from '../components/TouchButton';

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <KioskLayout>
      <div className="h-full flex flex-col items-center justify-center gap-8">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">EdgeLabel</h1>
          <p className="text-xl text-muted-foreground">Label - Train - Deploy</p>
        </div>

        {/* Main action buttons */}
        <div className="flex gap-6">
          <TouchButton
            size="xl"
            variant="outline"
            onClick={() => navigate('/kiosk/projects')}
            className="w-64 h-40 flex-col gap-4"
            icon={
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
              </svg>
            }
          >
            Open Project
          </TouchButton>

          <TouchButton
            size="xl"
            variant="primary"
            onClick={() => navigate('/kiosk/wizard/setup')}
            className="w-64 h-40 flex-col gap-4"
            icon={
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            New Project
          </TouchButton>
        </div>

        {/* Version/Info */}
        <p className="text-sm text-muted-foreground mt-8">
          Powered by SAM3 + YOLO11
        </p>
      </div>
    </KioskLayout>
  );
}
