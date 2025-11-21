import React, { useState, useRef } from 'react';
import { uploadImage } from '../api/sam3';
import type { Session } from '../types';

interface ImageUploadProps {
  onImageUploaded: (session: Session) => void;
}

export default function ImageUpload({ onImageUploaded }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return 'Invalid file type. Please upload a JPEG, PNG, or WebP image.';
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return 'File too large. Maximum size is 10MB.';
    }

    return null;
  };

  const handleFile = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div style={{ padding: '20px' }}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        style={{
          border: `2px dashed ${isDragging ? '#4CAF50' : '#ccc'}`,
          borderRadius: '8px',
          padding: '60px 40px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragging ? '#f0f8f0' : '#fafafa',
          transition: 'all 0.3s ease',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {isUploading ? (
          <div>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <div style={{ fontSize: '18px', color: '#666' }}>Uploading...</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
            <div style={{ fontSize: '20px', marginBottom: '8px', fontWeight: 'bold' }}>
              {isDragging ? 'Drop image here' : 'Drag & Drop Image Here'}
            </div>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
              or click to browse
            </div>
            <div style={{ fontSize: '12px', color: '#999' }}>
              Supports: JPEG, PNG, WebP • Max size: 10MB
            </div>
          </>
        )}
      </div>

      {error && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '4px',
            color: '#c62828',
          }}
        >
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
