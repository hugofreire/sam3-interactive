import { useState, useCallback } from 'react';
import ImageUpload from './components/ImageUpload';
import InteractiveCanvas from './components/InteractiveCanvas';
import ProjectManager from './components/ProjectManager';
import CropAndLabel from './components/CropAndLabel';
import DatasetGallery from './components/DatasetGallery';
import LabelingWorkspace from './components/LabelingWorkspace';
import ProjectSettingsDialog from './components/ProjectSettingsDialog';
import type { Session, Project } from './types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getProject } from './api/projects';
import './App.css';

type WorkflowState = 'upload' | 'segment' | 'label' | 'gallery' | 'labeling';

function App() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowState>('upload');
  const [selectedMaskIndex, setSelectedMaskIndex] = useState<number>(0);
  const [showSettings, setShowSettings] = useState(false);
  const [labelingKey, setLabelingKey] = useState(0); // Used to refresh LabelingWorkspace

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
    refreshProject();
  };

  const handleViewDataset = () => {
    setWorkflow('gallery');
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

  // Refresh current project data
  const refreshProject = useCallback(async () => {
    if (currentProject) {
      try {
        const updated = await getProject(currentProject.id);
        setCurrentProject(updated);
      } catch (err) {
        console.error('Error refreshing project:', err);
      }
    }
  }, [currentProject?.id]);

  const handleProjectUpdated = (project: Project) => {
    setCurrentProject(project);
  };

  // When settings dialog closes, refresh labeling workspace
  const handleSettingsChange = (open: boolean) => {
    setShowSettings(open);
    if (!open) {
      // Settings closed - refresh labeling workspace
      setLabelingKey((k) => k + 1);
    }
  };

  const handleStartLabeling = () => {
    setWorkflow('labeling');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar: Project Manager */}
      <ProjectManager
        currentProjectId={currentProject?.id || null}
        onProjectSelect={handleProjectSelect}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-auto">
        {/* Header */}
        <header className="bg-primary text-primary-foreground shadow-md">
          <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold m-0">
                SAM3 Dataset Labeling
              </h1>
              <p className="text-sm mt-2 opacity-90">
                {currentProject ? (
                  <>
                    Project: {currentProject.name}{' '}
                    <Badge variant="secondary" className="ml-2">
                      {currentProject.num_crops} crops
                    </Badge>
                    <Badge variant="secondary" className="ml-1">
                      {currentProject.num_labels} labels
                    </Badge>
                  </>
                ) : (
                  'Select or create a project to start labeling'
                )}
              </p>
            </div>
            {currentProject && (
              <div className="flex gap-3">
                <Button
                  variant={workflow === 'labeling' ? 'default' : 'secondary'}
                  onClick={handleStartLabeling}
                >
                  🏷️ Start Labeling
                </Button>
                <Button
                  variant={
                    workflow === 'upload' || workflow === 'segment' || workflow === 'label'
                      ? 'default'
                      : 'secondary'
                  }
                  onClick={() => setWorkflow('upload')}
                >
                  📷 Single Image
                </Button>
                <Button
                  variant={workflow === 'gallery' ? 'default' : 'secondary'}
                  onClick={handleViewDataset}
                >
                  📊 View Dataset
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowSettings(true)}
                >
                  ⚙️ Settings
                </Button>
              </div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-5 bg-muted/30">
          {!currentProject ? (
            // No project selected
            <Card className="text-center py-16 px-10">
              <CardContent>
                <div className="text-5xl mb-5">📁</div>
                <h2 className="text-2xl font-bold mb-3">No Project Selected</h2>
                <p className="text-muted-foreground">
                  Create a new project or select an existing one from the sidebar to start labeling.
                </p>
              </CardContent>
            </Card>
          ) : workflow === 'upload' ? (
            // Upload state
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Upload an Image</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Upload an image to segment objects and create labeled crops for your dataset.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <ImageUpload onImageUploaded={handleImageUploaded} />
              </Card>

              {/* Workflow Instructions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-primary">1. Upload</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">
                      Upload an image containing objects you want to label
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>2. Segment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">
                      Click on objects to segment them with SAM3 AI
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>3. Label & Save</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">
                      Assign labels and save crops to your dataset
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : workflow === 'segment' && session ? (
            // Segmentation state
            <div className="space-y-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Interactive Segmentation</CardTitle>
                    <p className="text-sm text-muted-foreground mt-2">
                      Image: {session.width} × {session.height} pixels
                    </p>
                </div>
                <Button variant="secondary" onClick={handleReset}>
                  Upload New Image
                </Button>
                </CardHeader>
              </Card>

              <Card>
                <InteractiveCanvas
                  sessionId={session.sessionId}
                  imageUrl={session.imageUrl || ''}
                  imageWidth={session.width}
                  imageHeight={session.height}
                  onSegmented={handleSegmented}
                />
              </Card>
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
          ) : workflow === 'gallery' ? (
            // Gallery state
            <DatasetGallery projectId={currentProject.id} projectName={currentProject.name} />
          ) : workflow === 'labeling' ? (
            // New labeling workspace
            <LabelingWorkspace
              key={labelingKey}
              project={currentProject}
              onProjectUpdated={refreshProject}
            />
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

      {/* Project Settings Dialog */}
      {currentProject && (
        <ProjectSettingsDialog
          open={showSettings}
          onOpenChange={handleSettingsChange}
          project={currentProject}
          onProjectUpdated={handleProjectUpdated}
          onImagesUpdated={refreshProject}
        />
      )}
    </div>
  );
}

export default App;
