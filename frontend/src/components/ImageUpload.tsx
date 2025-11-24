import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadImage } from '../api/sam3';
import type { Session } from '../types';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface ImageUploadProps {
  onImageUploaded: (session: Session) => void;
}

export default function ImageUpload({ onImageUploaded }: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);

    try {
      const session = await uploadImage(file);

      if (session.success) {
        console.log('Image uploaded successfully:', session);
        onImageUploaded(session);
      } else {
        setError(session.error || 'Upload failed');
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
  });

  return (
    <div className="p-5">
      <Card className="border-dashed">
        <CardContent className="p-0">
          <div
            {...getRootProps()}
            className={cn(
              'cursor-pointer transition-colors py-16 px-10 text-center',
              isDragActive && 'bg-accent',
              !isDragActive && 'hover:bg-muted/50'
            )}
          >
            <input {...getInputProps()} />

            {isUploading ? (
              <div>
                <div className="text-5xl mb-4">⏳</div>
                <div className="text-lg text-muted-foreground">Uploading...</div>
              </div>
            ) : (
              <>
                <div className="text-5xl mb-4">📁</div>
                <div className="text-xl mb-2 font-semibold">
                  {isDragActive ? 'Drop image here' : 'Drag & Drop Image Here'}
                </div>
                <div className="text-sm text-muted-foreground mb-4">
                  or click to browse
                </div>
                <div className="text-xs text-muted-foreground">
                  Supports: JPEG, PNG, WebP • Max size: 10MB
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>⚠️ {error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
