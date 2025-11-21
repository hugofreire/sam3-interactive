import { useState, useEffect, useRef } from 'react';
import { createCrop } from '../api/crops';
import type { BackgroundMode, Session } from '../types';

interface CropAndLabelProps {
  projectId: string;
  session: Session;
  selectedMaskIndex: number;
  onCropSaved: () => void;
  onCancel: () => void;
}

export default function CropAndLabel({
  projectId,
  session,
  selectedMaskIndex,
  onCropSaved,
  onCancel,
}: CropAndLabelProps) {
  const [label, setLabel] = useState('');
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('transparent');
  const [saving, setSaving] = useState(false);
  const [recentLabels, setRecentLabels] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent labels from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`recent_labels_${projectId}`);
    if (stored) {
      try {
        setRecentLabels(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse recent labels:', e);
      }
    }
  }, [projectId]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSave = async () => {
    if (!label.trim()) {
      alert('Please enter a label');
      inputRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      await createCrop(projectId, {
        sessionId: session.sessionId,
        maskIndex: selectedMaskIndex,
        label: label.trim(),
        backgroundMode: backgroundMode,
        sourceImage: session.imageUrl || '',
      });

      // Update recent labels
      const trimmedLabel = label.trim();
      const updated = [
        trimmedLabel,
        ...recentLabels.filter((l) => l !== trimmedLabel),
      ].slice(0, 9); // Keep only top 9
      setRecentLabels(updated);
      localStorage.setItem(`recent_labels_${projectId}`, JSON.stringify(updated));

      console.log('Crop saved successfully');
      onCropSaved();
    } catch (error) {
      console.error('Failed to save crop:', error);
      alert('Failed to save crop. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    setLabel('');
    onCancel();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if input is focused
      const isInputFocused = document.activeElement === inputRef.current;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
      } else if (e.key >= '1' && e.key <= '9' && !isInputFocused) {
        // Quick select recent label
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < recentLabels.length) {
          setLabel(recentLabels[index]);
          inputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [label, recentLabels]);

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        maxWidth: '600px',
        margin: '0 auto',
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: '20px' }}>
        Label Segmented Object
      </h2>

      {/* Crop Preview Placeholder */}
      <div
        style={{
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
          textAlign: 'center',
          border: '2px dashed #ddd',
        }}
      >
        <div style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>
          Selected Mask #{selectedMaskIndex + 1}
        </div>
        <div style={{ color: '#999', fontSize: '12px' }}>
          Crop will be generated when you save
        </div>
      </div>

      {/* Background Mode Selector */}
      <div style={{ marginBottom: '20px' }}>
        <label
          htmlFor="background-mode"
          style={{
            display: 'block',
            fontWeight: 'bold',
            marginBottom: '8px',
            fontSize: '14px',
          }}
        >
          Background Mode:
        </label>
        <select
          id="background-mode"
          value={backgroundMode}
          onChange={(e) => setBackgroundMode(e.target.value as BackgroundMode)}
          style={{
            width: '100%',
            padding: '10px',
            fontSize: '14px',
            borderRadius: '4px',
            border: '1px solid #ddd',
          }}
        >
          <option value="transparent">Transparent (RGBA)</option>
          <option value="white">White Background</option>
          <option value="black">Black Background</option>
          <option value="original">Original (No Masking)</option>
        </select>
      </div>

      {/* Label Input */}
      <div style={{ marginBottom: '20px' }}>
        <label
          htmlFor="label-input"
          style={{
            display: 'block',
            fontWeight: 'bold',
            marginBottom: '8px',
            fontSize: '14px',
          }}
        >
          Label:
        </label>
        <input
          ref={inputRef}
          id="label-input"
          type="text"
          placeholder="e.g., car, person, tree..."
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          list="recent-labels-list"
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '15px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            boxSizing: 'border-box',
          }}
        />
        <datalist id="recent-labels-list">
          {recentLabels.map((l, i) => (
            <option key={i} value={l} />
          ))}
        </datalist>
      </div>

      {/* Recent Labels (Quick Select) */}
      {recentLabels.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontSize: '13px',
              color: '#666',
              marginBottom: '8px',
            }}
          >
            Recent labels (press 1-9):
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            {recentLabels.slice(0, 9).map((l, i) => (
              <button
                key={i}
                onClick={() => {
                  setLabel(l);
                  inputRef.current?.focus();
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#333',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#e0e0e0';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f0f0f0';
                }}
              >
                <strong>{i + 1}.</strong> {l}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={handleSave}
          disabled={saving || !label.trim()}
          style={{
            flex: 1,
            padding: '14px',
            backgroundColor: saving || !label.trim() ? '#ccc' : '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: saving || !label.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save Crop (Enter)'}
        </button>
        <button
          onClick={handleSkip}
          disabled={saving}
          style={{
            flex: 1,
            padding: '14px',
            backgroundColor: saving ? '#ccc' : '#7f8c8d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          Skip (Esc)
        </button>
      </div>

      {/* Keyboard Shortcuts Help */}
      <div
        style={{
          marginTop: '20px',
          padding: '12px',
          backgroundColor: '#f9f9f9',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#666',
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
          Keyboard Shortcuts:
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <span>
            <kbd
              style={{
                padding: '2px 6px',
                backgroundColor: '#e0e0e0',
                borderRadius: '3px',
                fontFamily: 'monospace',
              }}
            >
              Enter
            </kbd>{' '}
            Save
          </span>
          <span>
            <kbd
              style={{
                padding: '2px 6px',
                backgroundColor: '#e0e0e0',
                borderRadius: '3px',
                fontFamily: 'monospace',
              }}
            >
              Esc
            </kbd>{' '}
            Skip
          </span>
          <span>
            <kbd
              style={{
                padding: '2px 6px',
                backgroundColor: '#e0e0e0',
                borderRadius: '3px',
                fontFamily: 'monospace',
              }}
            >
              1-9
            </kbd>{' '}
            Quick label
          </span>
        </div>
      </div>
    </div>
  );
}
