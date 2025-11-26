/**
 * AugmentationPanel Component
 *
 * Dialog for configuring and generating synthetic training data
 * via image augmentation.
 */

import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import {
  getAugmentationStats,
  getAugmentationSources,
  generateAugmentations,
  clearAugmentations,
  AUGMENTATION_OPTIONS,
  type AugmentationStats,
  type SourceImage,
  type AugmentationType,
} from '../api/augmentation';

interface AugmentationPanelProps {
  projectId: string;
  onClose: () => void;
  onGenerated: () => void;
}

export default function AugmentationPanel({
  projectId,
  onClose,
  onGenerated,
}: AugmentationPanelProps) {
  // State
  const [stats, setStats] = useState<AugmentationStats | null>(null);
  const [sources, setSources] = useState<SourceImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Configuration
  const [selectedAugmentations, setSelectedAugmentations] = useState<Set<AugmentationType>>(
    new Set(['flip_h', 'rotate', 'brightness', 'hue_saturation'])
  );
  const [variationsPerImage, setVariationsPerImage] = useState(3);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [statsRes, sourcesRes] = await Promise.all([
        getAugmentationStats(projectId),
        getAugmentationSources(projectId),
      ]);

      if (statsRes.success) {
        setStats(statsRes.stats);
      }

      if (sourcesRes.success) {
        setSources(sourcesRes.sources);
      }
    } catch (err) {
      setError('Failed to load augmentation data');
    } finally {
      setLoading(false);
    }
  };

  const toggleAugmentation = (aug: AugmentationType) => {
    const newSet = new Set(selectedAugmentations);
    if (newSet.has(aug)) {
      newSet.delete(aug);
    } else {
      newSet.add(aug);
    }
    setSelectedAugmentations(newSet);
  };

  const handleGenerate = async () => {
    if (selectedAugmentations.size === 0) {
      setError('Please select at least one augmentation type');
      return;
    }

    setGenerating(true);
    setError('');
    setSuccess('');

    try {
      const result = await generateAugmentations(
        projectId,
        Array.from(selectedAugmentations),
        variationsPerImage
      );

      if (result.success) {
        setSuccess(
          `Generated ${result.imagesGenerated} augmented images with ${result.totalBboxes} bounding boxes!`
        );
        await loadData(); // Refresh stats
        onGenerated();
      } else {
        setError(result.error || 'Failed to generate augmentations');
      }
    } catch (err) {
      setError('Failed to generate augmentations');
    } finally {
      setGenerating(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Are you sure you want to delete all synthetic/augmented data?')) {
      return;
    }

    setClearing(true);
    setError('');

    try {
      const result = await clearAugmentations(projectId);
      if (result.success) {
        setSuccess('All synthetic data cleared');
        await loadData();
        onGenerated();
      } else {
        setError(result.error || 'Failed to clear augmentations');
      }
    } catch (err) {
      setError('Failed to clear augmentations');
    } finally {
      setClearing(false);
    }
  };

  const estimatedOutput = sources.length * variationsPerImage;
  const estimatedBboxes =
    sources.reduce((sum, s) => sum + s.bboxCount, 0) * variationsPerImage;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-background rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4">
          <div className="text-center py-8">Loading augmentation data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Enhance Dataset</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Messages */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="mb-4 border-green-500 bg-green-50 dark:bg-green-950">
            <AlertDescription className="text-green-700 dark:text-green-300">
              {success}
            </AlertDescription>
          </Alert>
        )}

        {/* Source Stats */}
        <div className="bg-muted/50 rounded-lg p-4 mb-6">
          <h3 className="font-medium mb-2">Source Data</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Original Images:</span>{' '}
              <span className="font-medium">{stats?.sourceImages || sources.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Original Bboxes:</span>{' '}
              <span className="font-medium">{stats?.originalBboxes || 0}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Enhanced Images:</span>{' '}
              <span className="font-medium text-blue-600">{stats?.enhancedImages || 0}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Synthetic Bboxes:</span>{' '}
              <span className="font-medium text-blue-600">{stats?.syntheticBboxes || 0}</span>
            </div>
          </div>
        </div>

        {/* Augmentation Options */}
        <div className="mb-6">
          <h3 className="font-medium mb-3">Augmentation Types</h3>
          <div className="grid grid-cols-2 gap-2">
            {AUGMENTATION_OPTIONS.map((aug) => (
              <label
                key={aug.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedAugmentations.has(aug.id)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedAugmentations.has(aug.id)}
                  onChange={() => toggleAugmentation(aug.id)}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-sm">{aug.label}</div>
                  <div className="text-xs text-muted-foreground">{aug.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Variations Slider */}
        <div className="mb-6">
          <h3 className="font-medium mb-2">
            Variations per Image: <span className="text-blue-600">{variationsPerImage}</span>
          </h3>
          <input
            type="range"
            min="1"
            max="5"
            value={variationsPerImage}
            onChange={(e) => setVariationsPerImage(parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1x</span>
            <span>2x</span>
            <span>3x</span>
            <span>4x</span>
            <span>5x</span>
          </div>
        </div>

        {/* Estimated Output */}
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-blue-700 dark:text-blue-300 mb-2">
            Estimated Output
          </h3>
          <div className="text-sm text-blue-600 dark:text-blue-400">
            <p>
              {sources.length} source images × {variationsPerImage} variations ={' '}
              <strong>{estimatedOutput} new images</strong>
            </p>
            <p>
              Approximately <strong>{estimatedBboxes} new bounding boxes</strong>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div>
            {(stats?.enhancedImages || 0) > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={clearing || generating}
                className="text-red-600 hover:text-red-700"
              >
                {clearing ? 'Clearing...' : 'Clear All Synthetic Data'}
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating || selectedAugmentations.size === 0 || sources.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {generating ? 'Generating...' : `Generate ${estimatedOutput} Images`}
            </Button>
          </div>
        </div>

        {/* Source Images List (collapsed by default) */}
        {sources.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              View source images ({sources.length})
            </summary>
            <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
              {sources.map((source, idx) => (
                <div
                  key={idx}
                  className="text-xs flex justify-between items-center p-2 bg-muted/30 rounded"
                >
                  <span className="truncate flex-1">{source.imagePath}</span>
                  <Badge variant="secondary" className="ml-2">
                    {source.bboxCount} bboxes
                  </Badge>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
