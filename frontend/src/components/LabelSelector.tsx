/**
 * LabelSelector Component
 * Horizontal row of clickable label chips with keyboard shortcuts (1-9)
 */

import { useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { ProjectLabel } from '../types';

interface LabelSelectorProps {
  labels: ProjectLabel[];
  selectedLabel: ProjectLabel | null;
  onSelect: (label: ProjectLabel) => void;
  disabled?: boolean;
}

// Generate a consistent color for a label based on its name
function getLabelColor(name: string, index: number): string {
  const colors = [
    'bg-red-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
  ];
  return colors[index % colors.length];
}

export default function LabelSelector({
  labels,
  selectedLabel,
  onSelect,
  disabled = false,
}: LabelSelectorProps) {
  // Handle keyboard shortcuts (1-9)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Check for number keys 1-9
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && num <= labels.length) {
        e.preventDefault();
        onSelect(labels[num - 1]);
      }
    },
    [labels, onSelect]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (labels.length === 0) {
    return (
      <div className="text-muted-foreground text-sm italic">
        No labels defined. Add labels in project settings.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label, index) => {
        const isSelected = selectedLabel?.id === label.id;
        const shortcut = index < 9 ? `${index + 1}` : null;
        const colorClass = label.color || getLabelColor(label.name, index);

        return (
          <Button
            key={label.id}
            variant={isSelected ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelect(label)}
            disabled={disabled}
            className={`
              relative pr-8
              ${isSelected ? 'ring-2 ring-offset-2 ring-primary' : ''}
            `}
          >
            {/* Color indicator dot */}
            <span
              className={`w-2 h-2 rounded-full mr-2 ${colorClass}`}
              style={
                label.color && !label.color.startsWith('bg-')
                  ? { backgroundColor: label.color }
                  : undefined
              }
            />

            {/* Label name */}
            <span>{label.name}</span>

            {/* Keyboard shortcut badge */}
            {shortcut && (
              <Badge
                variant="secondary"
                className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
              >
                {shortcut}
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}
