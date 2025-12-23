/**
 * KioskApp - Main router for kiosk mode
 */

import { Routes, Route, Navigate } from 'react-router-dom';

// Pages
import HomePage from './pages/HomePage';
import ProjectListPage from './pages/ProjectListPage';
import ProjectViewPage from './pages/ProjectViewPage';

// Wizard steps
import Step1Setup from './wizard/Step1Setup';
import Step2Images from './wizard/Step2Images';
import Step3Labeling from './wizard/Step3Labeling';
import Step4Training from './wizard/Step4Training';

export default function KioskApp() {
  return (
    <Routes>
      {/* Home */}
      <Route path="/" element={<HomePage />} />

      {/* Project list */}
      <Route path="/projects" element={<ProjectListPage />} />

      {/* Project view (management mode) */}
      <Route path="/project/:projectId/*" element={<ProjectViewPage />} />

      {/* Wizard flow */}
      <Route path="/wizard/setup" element={<Step1Setup />} />
      <Route path="/wizard/:projectId/images" element={<Step2Images />} />
      <Route path="/wizard/:projectId/labeling" element={<Step3Labeling />} />
      <Route path="/wizard/:projectId/training" element={<Step4Training />} />

      {/* Catch-all redirect to home */}
      <Route path="*" element={<Navigate to="/kiosk" replace />} />
    </Routes>
  );
}
