/**
 * DatasetSection - View labeled crops/dataset
 */

import { useState, useEffect } from 'react';
import KioskLayout from '../KioskLayout';
import { getCrops } from '@/api/crops';
import type { Project, Crop } from '@/types';

interface DatasetSectionProps {
  project: Project;
  onBack: () => void;
  onRefresh: () => void;
}

export default function DatasetSection({ project, onBack }: DatasetSectionProps) {
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCrops();
  }, [project.id]);

  const loadCrops = async () => {
    try {
      setLoading(true);
      const response = await getCrops(project.id);
      setCrops(response.crops || []);
    } catch (err) {
      console.error('Failed to load crops:', err);
    } finally {
      setLoading(false);
    }
  };

  // Group crops by label
  const cropsByLabel = crops.reduce((acc, crop) => {
    const label = crop.label || 'unlabeled';
    if (!acc[label]) acc[label] = [];
    acc[label].push(crop);
    return acc;
  }, {} as Record<string, Crop[]>);

  return (
    <KioskLayout title="Dataset" showBack onBack={onBack}>
      <div className="h-full flex flex-col gap-4">
        {/* Summary */}
        <div className="flex gap-4 justify-center">
          <div className="p-4 rounded-xl bg-card border text-center min-w-[120px]">
            <div className="text-2xl font-bold text-primary">{crops.length}</div>
            <div className="text-sm text-muted-foreground">Total Crops</div>
          </div>
          <div className="p-4 rounded-xl bg-card border text-center min-w-[120px]">
            <div className="text-2xl font-bold text-primary">{Object.keys(cropsByLabel).length}</div>
            <div className="text-sm text-muted-foreground">Classes</div>
          </div>
        </div>

        {/* Crops by label */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-center text-muted-foreground">Loading...</div>
          ) : crops.length === 0 ? (
            <div className="text-center text-muted-foreground">No crops yet</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(cropsByLabel).map(([label, labelCrops]) => (
                <div key={label}>
                  <h3 className="text-lg font-semibold mb-2">
                    {label} ({labelCrops.length})
                  </h3>
                  <div className="grid grid-cols-6 gap-2">
                    {labelCrops.slice(0, 12).map((crop) => (
                      <div
                        key={crop.id}
                        className="aspect-square rounded-lg bg-muted overflow-hidden"
                      >
                        <img
                          src={crop.url || `/api/crops/${crop.id}/image?projectId=${project.id}`}
                          alt={crop.label}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                    {labelCrops.length > 12 && (
                      <div className="aspect-square rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                        +{labelCrops.length - 12}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </KioskLayout>
  );
}
