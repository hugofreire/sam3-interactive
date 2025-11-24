import { useState, useEffect, useRef } from 'react';
import { createCrop } from '../api/crops';
import type { BackgroundMode, Session } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Label Segmented Object</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Crop Preview Placeholder */}
        <Card className="bg-muted border-dashed">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Selected Mask #{selectedMaskIndex + 1}
            </p>
            <p className="text-xs text-muted-foreground">
              Crop will be generated when you save
            </p>
          </CardContent>
        </Card>

        {/* Background Mode Selector */}
        <div className="space-y-2">
          <Label htmlFor="background-mode">Background Mode</Label>
          <Select value={backgroundMode} onValueChange={(value) => setBackgroundMode(value as BackgroundMode)}>
            <SelectTrigger id="background-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="transparent">Transparent (RGBA)</SelectItem>
              <SelectItem value="white">White Background</SelectItem>
              <SelectItem value="black">Black Background</SelectItem>
              <SelectItem value="original">Original (No Masking)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Label Input */}
        <div className="space-y-2">
          <Label htmlFor="label-input">Label</Label>
          <Input
            ref={inputRef}
            id="label-input"
            placeholder="e.g., car, person, tree..."
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            list="recent-labels-list"
          />
          <datalist id="recent-labels-list">
            {recentLabels.map((l, i) => (
              <option key={i} value={l} />
            ))}
          </datalist>
        </div>

        {/* Recent Labels (Quick Select) */}
        {recentLabels.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Recent labels (press 1-9):
            </Label>
            <div className="flex flex-wrap gap-2">
              {recentLabels.slice(0, 9).map((l, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLabel(l);
                    inputRef.current?.focus();
                  }}
                >
                  <Badge variant="secondary" className="mr-2">{i + 1}</Badge>
                  {l}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={saving || !label.trim()}
          >
            {saving ? 'Saving...' : 'Save Crop (Enter)'}
          </Button>
          <Button
            className="flex-1"
            variant="secondary"
            onClick={handleSkip}
            disabled={saving}
          >
            Skip (Esc)
          </Button>
        </div>

        {/* Keyboard Shortcuts Help */}
        <Card className="bg-muted">
          <CardContent className="p-3">
            <p className="text-sm font-semibold mb-2">Keyboard Shortcuts:</p>
            <div className="flex gap-4 flex-wrap text-xs text-muted-foreground">
              <span>
                <Badge variant="outline">Enter</Badge> Save
              </span>
              <span>
                <Badge variant="outline">Esc</Badge> Skip
              </span>
              <span>
                <Badge variant="outline">1-9</Badge> Quick label
              </span>
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
