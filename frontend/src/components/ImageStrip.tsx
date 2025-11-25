/**
 * ImageStrip Component
 * Bottom horizontal thumbnail strip for image queue navigation
 */

import { useRef, useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { getProjectImageUrl, batchUploadImages } from '../api/projects';
import type { ProjectImage, ImageStats } from '../types';

interface ImageStripProps {
  projectId: string;
  images: ProjectImage[];
  stats: ImageStats;
  currentImageId: string | null;
  onSelectImage: (image: ProjectImage) => void;
  onImagesAdded?: () => void;
}

function getStatusColor(status: ProjectImage['status']): string {
  switch (status) {
    case 'completed':
      return 'border-green-500';
    case 'in_progress':
      return 'border-yellow-500';
    case 'pending':
    default:
      return 'border-gray-300';
  }
}

function getStatusBadgeVariant(status: ProjectImage['status']): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'in_progress':
      return 'secondary';
    case 'pending':
    default:
      return 'outline';
  }
}

export default function ImageStrip({
  projectId,
  images,
  stats,
  currentImageId,
  onSelectImage,
  onImagesAdded,
}: ImageStripProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentImageRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add More dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  // Scroll to current image when it changes
  useEffect(() => {
    if (currentImageRef.current && scrollContainerRef.current) {
      currentImageRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [currentImageId]);

  // Handle file selection and upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError('');
    setUploadSuccess('');
    setUploadProgress(0);

    try {
      const result = await batchUploadImages(projectId, files, (progress) => {
        setUploadProgress(progress);
      });

      setUploadProgress(null);

      if (result.failed > 0) {
        setUploadError(`${result.uploaded} uploaded, ${result.failed} failed`);
      } else {
        setUploadSuccess(`${result.uploaded} images added to queue`);
      }

      // Notify parent to refresh images
      onImagesAdded?.();

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Auto-close dialog after success
      if (result.failed === 0) {
        setTimeout(() => {
          setShowAddDialog(false);
          setUploadSuccess('');
        }, 1500);
      }
    } catch (err) {
      setUploadProgress(null);
      setUploadError('Upload failed');
      console.error('Error uploading images:', err);
    }
  };

  if (images.length === 0) {
    return (
      <div className="bg-muted/50 border-t p-4 text-center text-sm text-muted-foreground">
        No images in project. Add images in project settings.
      </div>
    );
  }

  return (
    <div className="bg-muted/50 border-t">
      <div className="flex items-center gap-4 p-2">
        {/* Thumbnail scroll container */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto flex gap-2 py-1 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent"
        >
          {images.map((image) => {
            const isCurrent = image.id === currentImageId;
            const statusColor = getStatusColor(image.status);

            return (
              <button
                key={image.id}
                ref={isCurrent ? currentImageRef : null}
                onClick={() => onSelectImage(image)}
                className={`
                  relative flex-shrink-0 w-16 h-16 rounded overflow-hidden
                  border-2 transition-all
                  ${statusColor}
                  ${isCurrent ? 'ring-2 ring-primary ring-offset-1 scale-110' : 'hover:scale-105'}
                `}
                title={`${image.original_filename} (${image.status})`}
              >
                {/* Thumbnail image */}
                <img
                  src={getProjectImageUrl(projectId, image.id)}
                  alt={image.original_filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />

                {/* Status indicator overlay for completed */}
                {image.status === 'completed' && (
                  <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                    <span className="text-green-700 text-lg">✓</span>
                  </div>
                )}

                {/* Current indicator */}
                {isCurrent && (
                  <div className="absolute bottom-0 left-0 right-0 bg-primary text-primary-foreground text-[10px] text-center py-0.5">
                    Current
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Progress stats - calculate from actual images to stay in sync */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1 px-2 border-l">
          {(() => {
            const completed = images.filter((i) => i.status === 'completed').length;
            const pending = images.filter((i) => i.status === 'pending').length;
            const total = images.length;
            return (
              <>
                <div className="text-sm font-medium">
                  {completed}/{total}
                </div>
                <div className="flex gap-1">
                  <Badge variant={getStatusBadgeVariant('completed')} className="text-[10px] px-1">
                    {completed} done
                  </Badge>
                  <Badge variant={getStatusBadgeVariant('pending')} className="text-[10px] px-1">
                    {pending} left
                  </Badge>
                </div>
              </>
            );
          })()}
        </div>

        {/* Add More button */}
        <div className="flex-shrink-0 px-2 border-l">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddDialog(true)}
            className="whitespace-nowrap"
          >
            + Add More
          </Button>
        </div>
      </div>

      {/* Add More Images Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add More Images</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Select multiple images to add to the labeling queue
              </p>
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

            {uploadSuccess && (
              <Alert className="py-2 border-green-500 text-green-700">
                <AlertDescription>{uploadSuccess}</AlertDescription>
              </Alert>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
