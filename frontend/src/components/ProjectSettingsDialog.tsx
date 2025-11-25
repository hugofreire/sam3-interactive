/**
 * ProjectSettingsDialog Component
 * Settings dialog with tabs for General, Labels, and Images
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import {
  updateProject,
  getProjectLabels,
  createProjectLabel,
  updateProjectLabel,
  deleteProjectLabel,
  getProjectImages,
  batchUploadImages,
  deleteProjectImage,
  exportProject,
} from '../api/projects';
import type {
  Project,
  ProjectLabel,
  ProjectImage,
  ImageStats,
  ExportResponse,
} from '../types';

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onProjectUpdated: (project: Project) => void;
  onImagesUpdated?: () => void;
}

export default function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  onProjectUpdated,
  onImagesUpdated,
}: ProjectSettingsDialogProps) {
  // General tab state
  const [projectName, setProjectName] = useState(project.name);
  const [savingName, setSavingName] = useState(false);

  // Labels tab state
  const [labels, setLabels] = useState<ProjectLabel[]>([]);
  const [newLabelName, setNewLabelName] = useState('');
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
  const [editingLabelName, setEditingLabelName] = useState('');
  const [labelError, setLabelError] = useState('');
  const [loadingLabels, setLoadingLabels] = useState(false);

  // Images tab state
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [imageStats, setImageStats] = useState<ImageStats>({
    pending: 0,
    in_progress: 0,
    completed: 0,
    total: 0,
  });
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [loadingImages, setLoadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResponse | null>(null);

  // Load labels and images when dialog opens
  useEffect(() => {
    if (open) {
      setProjectName(project.name);
      loadLabels();
      loadImages();
    }
  }, [open, project.id]);

  const loadLabels = async () => {
    setLoadingLabels(true);
    try {
      const data = await getProjectLabels(project.id);
      setLabels(data);
    } catch (err) {
      console.error('Error loading labels:', err);
    } finally {
      setLoadingLabels(false);
    }
  };

  const loadImages = async () => {
    setLoadingImages(true);
    try {
      const data = await getProjectImages(project.id);
      setImages(data.images);
      setImageStats(data.stats);
    } catch (err) {
      console.error('Error loading images:', err);
    } finally {
      setLoadingImages(false);
    }
  };

  // General tab handlers
  const handleSaveName = async () => {
    if (!projectName.trim() || projectName === project.name) return;
    setSavingName(true);
    try {
      const updated = await updateProject(project.id, { name: projectName.trim() });
      onProjectUpdated(updated);
    } catch (err) {
      console.error('Error updating project name:', err);
    } finally {
      setSavingName(false);
    }
  };

  // Labels tab handlers
  const handleAddLabel = async () => {
    if (!newLabelName.trim()) return;
    setLabelError('');
    try {
      const label = await createProjectLabel(project.id, {
        name: newLabelName.trim(),
        sort_order: labels.length,
      });
      setLabels([...labels, label]);
      setNewLabelName('');
    } catch (err: any) {
      if (err.response?.status === 409) {
        setLabelError('Label already exists');
      } else {
        setLabelError('Failed to add label');
      }
    }
  };

  const handleUpdateLabel = async (labelId: number) => {
    if (!editingLabelName.trim()) return;
    try {
      await updateProjectLabel(project.id, labelId, { name: editingLabelName.trim() });
      setLabels(
        labels.map((l) =>
          l.id === labelId ? { ...l, name: editingLabelName.trim() } : l
        )
      );
      setEditingLabelId(null);
      setEditingLabelName('');
    } catch (err) {
      console.error('Error updating label:', err);
    }
  };

  const handleDeleteLabel = async (labelId: number) => {
    const label = labels.find((l) => l.id === labelId);
    try {
      await deleteProjectLabel(project.id, labelId);
      setLabels(labels.filter((l) => l.id !== labelId));
      setLabelError('');
    } catch (err: any) {
      if (err.response?.status === 409) {
        const count = err.response?.data?.count || 'some';
        setLabelError(
          `Cannot delete "${label?.name}": used by ${count} crops. Delete crops first.`
        );
      } else {
        setLabelError('Failed to delete label');
      }
    }
  };

  // Images tab handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError('');
    setUploadProgress(0);

    try {
      const result = await batchUploadImages(project.id, files, (progress) => {
        setUploadProgress(progress);
      });

      setUploadProgress(null);
      await loadImages();
      onImagesUpdated?.();

      if (result.failed > 0) {
        setUploadError(
          `${result.uploaded} uploaded, ${result.failed} failed`
        );
      }
    } catch (err) {
      setUploadProgress(null);
      setUploadError('Upload failed');
      console.error('Error uploading images:', err);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm('Delete this image? This cannot be undone.')) return;
    try {
      await deleteProjectImage(project.id, imageId);
      await loadImages();
      onImagesUpdated?.();
    } catch (err) {
      console.error('Error deleting image:', err);
    }
  };

  // Export handler
  const handleExport = async () => {
    setExporting(true);
    setExportResult(null);
    try {
      const result = await exportProject(project.id);
      setExportResult(result);
    } catch (err) {
      console.error('Error exporting:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="labels">
              Labels {labels.length > 0 && <Badge className="ml-1">{labels.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="images">
              Images {imageStats.total > 0 && <Badge className="ml-1">{imageStats.total}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <div className="flex gap-2">
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name"
                />
                <Button
                  onClick={handleSaveName}
                  disabled={savingName || !projectName.trim() || projectName === project.name}
                >
                  {savingName ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Project Statistics</Label>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>Created: {new Date(project.created_at).toLocaleDateString()}</div>
                <div>Crops: {project.num_crops}</div>
                <div>Labels: {project.num_labels}</div>
                <div>Images: {imageStats.total}</div>
              </div>
            </div>
          </TabsContent>

          {/* Labels Tab */}
          <TabsContent value="labels" className="flex-1 flex flex-col min-h-0 space-y-4">
            {/* Add new label */}
            <div className="space-y-2">
              <Label>Add New Label</Label>
              <div className="flex gap-2">
                <Input
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="Label name (e.g., car, person)"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
                />
                <Button onClick={handleAddLabel} disabled={!newLabelName.trim()}>
                  Add
                </Button>
              </div>
              {labelError && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription>{labelError}</AlertDescription>
                </Alert>
              )}
            </div>

            <Separator />

            {/* Label list */}
            <div className="flex-1 min-h-0">
              <Label>Predefined Labels</Label>
              <ScrollArea className="h-48 mt-2 border rounded-md">
                {loadingLabels ? (
                  <div className="p-4 text-center text-muted-foreground">Loading...</div>
                ) : labels.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No labels defined yet
                  </div>
                ) : (
                  <div className="p-2 space-y-2">
                    {labels.map((label, index) => (
                      <div
                        key={label.id}
                        className="flex items-center gap-2 p-2 rounded bg-muted/50"
                      >
                        <Badge variant="secondary" className="w-6 h-6 p-0 flex items-center justify-center">
                          {index + 1}
                        </Badge>

                        {editingLabelId === label.id ? (
                          <>
                            <Input
                              value={editingLabelName}
                              onChange={(e) => setEditingLabelName(e.target.value)}
                              className="flex-1 h-8"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUpdateLabel(label.id);
                                if (e.key === 'Escape') setEditingLabelId(null);
                              }}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleUpdateLabel(label.id)}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingLabelId(null)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1">{label.name}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingLabelId(label.id);
                                setEditingLabelName(label.name);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteLabel(label.id)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Images Tab */}
          <TabsContent value="images" className="flex-1 flex flex-col min-h-0 space-y-4">
            {/* Upload section */}
            <div className="space-y-2">
              <Label>Upload Images</Label>
              <div className="flex gap-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="flex-1"
                />
              </div>
              {uploadProgress !== null && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} />
                  <div className="text-sm text-muted-foreground text-center">
                    Uploading... {uploadProgress}%
                  </div>
                </div>
              )}
              {uploadError && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-4 text-sm">
              <Badge variant="outline">{imageStats.pending} pending</Badge>
              <Badge variant="secondary">{imageStats.in_progress} in progress</Badge>
              <Badge>{imageStats.completed} completed</Badge>
            </div>

            <Separator />

            {/* Image list */}
            <div className="flex-1 min-h-0">
              <Label>Project Images</Label>
              <ScrollArea className="h-36 mt-2 border rounded-md">
                {loadingImages ? (
                  <div className="p-4 text-center text-muted-foreground">Loading...</div>
                ) : images.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No images uploaded yet
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {images.map((image) => (
                      <div
                        key={image.id}
                        className="flex items-center gap-2 p-1 rounded hover:bg-muted/50 text-sm"
                      >
                        <Badge
                          variant={
                            image.status === 'completed'
                              ? 'default'
                              : image.status === 'in_progress'
                              ? 'secondary'
                              : 'outline'
                          }
                          className="w-16 justify-center"
                        >
                          {image.status}
                        </Badge>
                        <span className="flex-1 truncate">{image.original_filename}</span>
                        <span className="text-muted-foreground">
                          {image.width}x{image.height}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteImage(image.id)}
                        >
                          X
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            <Separator />

            {/* Export section */}
            <div className="space-y-2">
              <Label>Export Dataset</Label>
              <div className="flex gap-2 items-center">
                <Button onClick={handleExport} disabled={exporting || imageStats.total === 0}>
                  {exporting ? 'Exporting...' : 'Export YOLO Format'}
                </Button>
                {exportResult && (
                  <a
                    href={exportResult.downloadUrl}
                    download={exportResult.filename}
                    className="text-primary underline text-sm"
                  >
                    Download {exportResult.filename}
                  </a>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
