import { useState, useEffect } from 'react';
import { getCrops, getCropImageUrl, deleteCrop, updateCropLabel } from '../api/crops';
import type { Crop } from '../types';

interface DatasetGalleryProps {
  projectId: string;
  projectName: string;
}

export default function DatasetGallery({ projectId, projectName }: DatasetGalleryProps) {
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<Crop | null>(null);
  const [editingCropId, setEditingCropId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [groupedCrops, setGroupedCrops] = useState<{ [label: string]: Crop[] }>({});
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCrops();
  }, [projectId]);

  useEffect(() => {
    // Group crops by label
    const grouped: { [label: string]: Crop[] } = {};
    crops.forEach((crop) => {
      if (!grouped[crop.label]) {
        grouped[crop.label] = [];
      }
      grouped[crop.label].push(crop);
    });
    setGroupedCrops(grouped);

    // Expand all labels by default
    setExpandedLabels(new Set(Object.keys(grouped)));
  }, [crops]);

  const loadCrops = async () => {
    setLoading(true);
    setError(null);
    try {
      const { crops: fetchedCrops } = await getCrops(projectId, { limit: 1000 });
      setCrops(fetchedCrops);
    } catch (err) {
      console.error('Failed to load crops:', err);
      setError('Failed to load crops');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (cropId: string) => {
    if (!confirm('Delete this crop? This cannot be undone.')) {
      return;
    }

    try {
      await deleteCrop(cropId, projectId);
      setCrops(crops.filter((c) => c.id !== cropId));
    } catch (err) {
      console.error('Failed to delete crop:', err);
      alert('Failed to delete crop');
    }
  };

  const handleEditLabel = (crop: Crop) => {
    setEditingCropId(crop.id);
    setEditLabel(crop.label);
  };

  const handleSaveLabel = async (cropId: string) => {
    if (!editLabel.trim()) {
      alert('Label cannot be empty');
      return;
    }

    try {
      await updateCropLabel(cropId, projectId, { label: editLabel.trim() });
      setCrops(
        crops.map((c) =>
          c.id === cropId ? { ...c, label: editLabel.trim() } : c
        )
      );
      setEditingCropId(null);
    } catch (err) {
      console.error('Failed to update label:', err);
      alert('Failed to update label');
    }
  };

  const handleCancelEdit = () => {
    setEditingCropId(null);
    setEditLabel('');
  };

  const toggleLabel = (label: string) => {
    const newExpanded = new Set(expandedLabels);
    if (newExpanded.has(label)) {
      newExpanded.delete(label);
    } else {
      newExpanded.add(label);
    }
    setExpandedLabels(newExpanded);
  };

  const totalCrops = crops.length;
  const totalLabels = Object.keys(groupedCrops).length;

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
        <div style={{ fontSize: '18px', color: '#666' }}>Loading crops...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '60px' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>❌</div>
        <div style={{ fontSize: '18px', color: '#e74c3c', marginBottom: '20px' }}>
          {error}
        </div>
        <button
          onClick={loadCrops}
          style={{
            padding: '12px 24px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (crops.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>📦</div>
        <h2 style={{ margin: '0 0 12px 0' }}>No Crops Yet</h2>
        <p style={{ color: '#666', fontSize: '16px', margin: 0 }}>
          Upload an image and create some crops to see them here!
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header Stats */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <h2 style={{ margin: '0 0 12px 0' }}>Dataset: {projectName}</h2>
        <div style={{ display: 'flex', gap: '24px', fontSize: '15px', color: '#666' }}>
          <div>
            <strong style={{ color: '#333' }}>{totalCrops}</strong> crops
          </div>
          <div>
            <strong style={{ color: '#333' }}>{totalLabels}</strong> labels
          </div>
        </div>
      </div>

      {/* Grouped Crops */}
      {Object.entries(groupedCrops)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, labelCrops]) => (
          <div
            key={label}
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              marginBottom: '16px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              overflow: 'hidden',
            }}
          >
            {/* Label Header */}
            <div
              onClick={() => toggleLabel(label)}
              style={{
                padding: '16px 20px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #e0e0e0',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>
                  {expandedLabels.has(label) ? '▼' : '▶'}
                </span>
                <h3 style={{ margin: 0, fontSize: '18px' }}>{label}</h3>
                <span
                  style={{
                    backgroundColor: '#3498db',
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                  }}
                >
                  {labelCrops.length}
                </span>
              </div>
            </div>

            {/* Crops Grid */}
            {expandedLabels.has(label) && (
              <div
                style={{
                  padding: '20px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '16px',
                }}
              >
                {labelCrops.map((crop) => (
                  <div
                    key={crop.id}
                    style={{
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {/* Crop Image */}
                    <div
                      onClick={() => setSelectedCrop(crop)}
                      style={{
                        width: '100%',
                        height: '180px',
                        backgroundColor: '#f5f5f5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={getCropImageUrl(crop.id, projectId)}
                        alt={crop.label}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain',
                        }}
                      />
                    </div>

                    {/* Crop Info */}
                    <div style={{ padding: '12px' }}>
                      {editingCropId === crop.id ? (
                        <div>
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveLabel(crop.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                            autoFocus
                            style={{
                              width: '100%',
                              padding: '6px',
                              fontSize: '13px',
                              borderRadius: '4px',
                              border: '1px solid #3498db',
                              marginBottom: '8px',
                              boxSizing: 'border-box',
                            }}
                          />
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={() => handleSaveLabel(crop.id)}
                              style={{
                                flex: 1,
                                padding: '6px',
                                backgroundColor: '#27ae60',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                            >
                              ✓
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              style={{
                                flex: 1,
                                padding: '6px',
                                backgroundColor: '#95a5a6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#999',
                              marginBottom: '4px',
                            }}
                          >
                            {new Date(crop.created_at).toLocaleDateString()}
                          </div>
                          <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                            <button
                              onClick={() => handleEditLabel(crop)}
                              style={{
                                flex: 1,
                                padding: '6px',
                                backgroundColor: '#3498db',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(crop.id)}
                              style={{
                                flex: 1,
                                padding: '6px',
                                backgroundColor: '#e74c3c',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

      {/* Full Size Modal */}
      {selectedCrop && (
        <div
          onClick={() => setSelectedCrop(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '40px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              backgroundColor: 'white',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
          >
            <div
              style={{
                padding: '16px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 4px 0' }}>{selectedCrop.label}</h3>
                <div style={{ fontSize: '13px', color: '#666' }}>
                  {selectedCrop.bbox[2]} × {selectedCrop.bbox[3]} pixels
                </div>
              </div>
              <button
                onClick={() => setSelectedCrop(null)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Close
              </button>
            </div>
            <div
              style={{
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                maxHeight: 'calc(90vh - 120px)',
              }}
            >
              <img
                src={getCropImageUrl(selectedCrop.id, projectId)}
                alt={selectedCrop.label}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
