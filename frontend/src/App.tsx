import { useState } from 'react';
import ImageUpload from './components/ImageUpload';
import InteractiveCanvas from './components/InteractiveCanvas';
import ProjectManager from './components/ProjectManager';
import CropAndLabel from './components/CropAndLabel';
import type { Session, Project } from './types';
import './App.css';

type WorkflowState = 'upload' | 'segment' | 'label';

function App() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowState>('upload');
  const [selectedMaskIndex, setSelectedMaskIndex] = useState<number>(0);

  const handleImageUploaded = (newSession: Session) => {
    console.log('Session created:', newSession);
    setSession(newSession);
    setWorkflow('segment');
  };

  const handleSegmented = (maskIndex: number) => {
    setSelectedMaskIndex(maskIndex);
    setWorkflow('label');
  };

  const handleCropSaved = () => {
    console.log('Crop saved! Resetting to upload state...');
    // Reset to upload state for next image
    setSession(null);
    setWorkflow('upload');
  };

  const handleCancelLabel = () => {
    // Go back to segmentation
    setWorkflow('segment');
  };

  const handleReset = () => {
    setSession(null);
    setWorkflow('upload');
  };

  const handleProjectSelect = (project: Project | null) => {
    setCurrentProject(project);
    // Reset workflow when switching projects
    setSession(null);
    setWorkflow('upload');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar: Project Manager */}
      <ProjectManager
        currentProjectId={currentProject?.id || null}
        onProjectSelect={handleProjectSelect}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        {/* Header */}
        <header
          style={{
            backgroundColor: '#1976D2',
            color: 'white',
            padding: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold' }}>
              SAM3 Dataset Labeling
            </h1>
            <p style={{ margin: '8px 0 0 0', fontSize: '15px', opacity: 0.9 }}>
              {currentProject
                ? `Project: ${currentProject.name} (${currentProject.num_crops} crops, ${currentProject.num_labels} labels)`
                : 'Select or create a project to start labeling'}
            </p>
          </div>
        </header>

        {/* Main Content */}
        <main
          style={{
            flex: 1,
            maxWidth: '1200px',
            width: '100%',
            margin: '0 auto',
            padding: '20px',
            backgroundColor: '#f5f5f5',
          }}
        >
          {!currentProject ? (
            // No project selected
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '60px 40px',
                textAlign: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>📁</div>
              <h2 style={{ margin: '0 0 12px 0' }}>No Project Selected</h2>
              <p style={{ color: '#666', fontSize: '16px', margin: 0 }}>
                Create a new project or select an existing one from the sidebar to start labeling.
              </p>
            </div>
          ) : workflow === 'upload' ? (
            // Upload state
            <div>
              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: '20px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                <h2 style={{ marginTop: 0 }}>Upload an Image</h2>
                <p style={{ color: '#666' }}>
                  Upload an image to segment objects and create labeled crops for your dataset.
                </p>
              </div>

              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                <ImageUpload onImageUploaded={handleImageUploaded} />
              </div>

              {/* Workflow Instructions */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '20px',
                  marginTop: '20px',
                }}
              >
                <div
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    padding: '20px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  <h3 style={{ marginTop: 0, color: '#3498db' }}>1. Upload</h3>
                  <p style={{ color: '#666', lineHeight: '1.6', margin: 0 }}>
                    Upload an image containing objects you want to label
                  </p>
                </div>

                <div
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    padding: '20px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  <h3 style={{ marginTop: 0, color: '#9b59b6' }}>2. Segment</h3>
                  <p style={{ color: '#666', lineHeight: '1.6', margin: 0 }}>
                    Click on objects to segment them with SAM3 AI
                  </p>
                </div>

                <div
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    padding: '20px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  <h3 style={{ marginTop: 0, color: '#27ae60' }}>3. Label & Save</h3>
                  <p style={{ color: '#666', lineHeight: '1.6', margin: 0 }}>
                    Assign labels and save crops to your dataset
                  </p>
                </div>
              </div>
            </div>
          ) : workflow === 'segment' && session ? (
            // Segmentation state
            <div>
              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: '20px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <h2 style={{ margin: 0 }}>Interactive Segmentation</h2>
                  <p style={{ margin: '8px 0 0 0', color: '#666' }}>
                    Image: {session.width} × {session.height} pixels
                  </p>
                </div>

                <button
                  onClick={handleReset}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#7f8c8d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '15px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  Upload New Image
                </button>
              </div>

              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                <InteractiveCanvas
                  sessionId={session.sessionId}
                  imageUrl={session.imageUrl || ''}
                  imageWidth={session.width}
                  imageHeight={session.height}
                  onSegmented={handleSegmented}
                />
              </div>
            </div>
          ) : workflow === 'label' && session ? (
            // Label state
            <div>
              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: '20px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <h2 style={{ margin: 0 }}>Label Crop</h2>
                  <p style={{ margin: '8px 0 0 0', color: '#666' }}>
                    Assign a label to the segmented object
                  </p>
                </div>

                <button
                  onClick={handleCancelLabel}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#7f8c8d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '15px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  ← Back to Segmentation
                </button>
              </div>

              <CropAndLabel
                projectId={currentProject.id}
                session={session}
                selectedMaskIndex={selectedMaskIndex}
                onCropSaved={handleCropSaved}
                onCancel={handleCancelLabel}
              />
            </div>
          ) : null}
        </main>

        {/* Footer */}
        <footer
          style={{
            textAlign: 'center',
            padding: '16px',
            color: '#999',
            backgroundColor: '#f5f5f5',
            borderTop: '1px solid #ddd',
          }}
        >
          <p style={{ margin: 0, fontSize: '13px' }}>
            Powered by <strong>SAM3</strong> (Segment Anything Model 3) from Meta AI
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
