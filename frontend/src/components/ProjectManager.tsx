import { useState, useEffect } from 'react';
import { getProjects, createProject, deleteProject, createProjectLabel } from '../api/projects';
import type { Project } from '../types';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface ProjectManagerProps {
  currentProjectId: string | null;
  onProjectSelect: (project: Project | null) => void;
}

export default function ProjectManager({
  currentProjectId,
  onProjectSelect,
}: ProjectManagerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectLabels, setNewProjectLabels] = useState<string[]>([]);
  const [newLabelInput, setNewLabelInput] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const projectList = await getProjects();
      setProjects(projectList);

      // Auto-select first project if none selected
      if (!currentProjectId && projectList.length > 0) {
        onProjectSelect(projectList[0]);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLabel = () => {
    const label = newLabelInput.trim();
    if (label && !newProjectLabels.includes(label)) {
      setNewProjectLabels([...newProjectLabels, label]);
      setNewLabelInput('');
    }
  };

  const handleRemoveLabel = (label: string) => {
    setNewProjectLabels(newProjectLabels.filter((l) => l !== label));
  };

  const resetCreateDialog = () => {
    setNewProjectName('');
    setNewProjectLabels([]);
    setNewLabelInput('');
    setShowNewProjectDialog(false);
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      alert('Please enter a project name');
      return;
    }

    setCreatingProject(true);
    try {
      // Create project
      const project = await createProject({
        name: newProjectName.trim(),
        settings: {
          background_mode: 'transparent',
        },
      });

      // Create predefined labels
      for (let i = 0; i < newProjectLabels.length; i++) {
        try {
          await createProjectLabel(project.id, {
            name: newProjectLabels[i],
            sort_order: i,
          });
        } catch (err) {
          console.error(`Failed to create label "${newProjectLabels[i]}":`, err);
        }
      }

      setProjects([...projects, project]);
      resetCreateDialog();
      onProjectSelect(project);
    } catch (err) {
      console.error('Failed to create project:', err);
      alert('Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the project

    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    if (!confirm(`Delete project "${project.name}"? This will delete all crops and cannot be undone.`)) {
      return;
    }

    try {
      await deleteProject(projectId);
      const updatedProjects = projects.filter((p) => p.id !== projectId);
      setProjects(updatedProjects);

      // If deleted project was selected, select another or null
      if (currentProjectId === projectId) {
        onProjectSelect(updatedProjects[0] || null);
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert('Failed to delete project');
    }
  };

  const handleProjectSelect = (project: Project) => {
    onProjectSelect(project);
  };

  return (
    <div className="w-[280px] h-screen bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
      {/* Header */}
      <div className="p-5 border-b border-sidebar-border">
        <h2 className="text-xl font-bold mb-3">Projects</h2>

        <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
          <DialogTrigger asChild>
            <Button className="w-full">+ New Project</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Project Name */}
              <div>
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                  id="project-name"
                  placeholder="Project name..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newProjectName.trim()) {
                      handleCreateProject();
                    } else if (e.key === 'Escape') {
                      resetCreateDialog();
                    }
                  }}
                  autoFocus
                />
              </div>

              <Separator />

              {/* Labels Section */}
              <div>
                <Label>Labels (optional)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Define labels for your dataset (e.g., car, person, truck)
                </p>
                <div className="flex gap-2 mb-2">
                  <Input
                    placeholder="Add a label..."
                    value={newLabelInput}
                    onChange={(e) => setNewLabelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLabel();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddLabel}
                    disabled={!newLabelInput.trim()}
                  >
                    Add
                  </Button>
                </div>

                {/* Label chips */}
                {newProjectLabels.length > 0 && (
                  <div className="flex flex-wrap gap-1 p-2 bg-muted/50 rounded-md max-h-24 overflow-y-auto">
                    {newProjectLabels.map((label, idx) => (
                      <Badge
                        key={label}
                        variant="secondary"
                        className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => handleRemoveLabel(label)}
                      >
                        <span className="text-muted-foreground mr-1 text-xs">
                          {idx + 1}.
                        </span>
                        {label}
                        <span className="ml-1 opacity-60">×</span>
                      </Badge>
                    ))}
                  </div>
                )}

                {newProjectLabels.length === 0 && (
                  <div className="text-xs text-muted-foreground italic">
                    No labels added. You can add them later in project settings.
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={resetCreateDialog}
                disabled={creatingProject}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || creatingProject}
              >
                {creatingProject ? 'Creating...' : 'Create Project'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Project List */}
      <ScrollArea className="flex-1 px-3">
        {loading ? (
          <div className="text-center py-5 text-muted-foreground">
            Loading projects...
          </div>
        ) : error ? (
          <div className="text-center py-5 text-destructive">
            <p>{error}</p>
            <Button className="mt-3" variant="secondary" onClick={loadProjects}>
              Retry
            </Button>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-10 px-5 text-muted-foreground text-sm">
            No projects yet.
            <br />
            Create one to start labeling!
          </div>
        ) : (
          <div className="space-y-2 py-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className={cn(
                  'cursor-pointer transition-all hover:bg-sidebar-accent relative',
                  currentProjectId === project.id && 'border-primary bg-sidebar-accent'
                )}
                onClick={() => handleProjectSelect(project)}
              >
                <CardHeader className="p-3">
                  <CardTitle className="text-sm pr-8">{project.name}</CardTitle>
                  <CardDescription className="text-xs">
                    <Badge variant="outline" className="mr-1">
                      {project.num_crops} crops
                    </Badge>
                    <Badge variant="outline">
                      {project.num_labels} labels
                    </Badge>
                  </CardDescription>
                </CardHeader>
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6"
                  onClick={(e) => handleDeleteProject(project.id, e)}
                >
                  ×
                </Button>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border text-xs text-muted-foreground text-center">
        SAM3 Dataset Labeling
      </div>
    </div>
  );
}
