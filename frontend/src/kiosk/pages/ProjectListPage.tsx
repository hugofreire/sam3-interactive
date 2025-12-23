/**
 * ProjectListPage - List and select existing projects
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import KioskLayout from '../KioskLayout';
import TouchButton from '../components/TouchButton';
import { getProjects } from '@/api/projects';
import type { Project } from '@/types';

export default function ProjectListPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      setError('Failed to load projects');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProject = (project: Project) => {
    navigate(`/kiosk/project/${project.id}`);
  };

  return (
    <KioskLayout
      title="Select Project"
      showBack
      onBack={() => navigate('/kiosk')}
    >
      <div className="h-full flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-xl text-muted-foreground">Loading projects...</div>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="text-xl text-destructive">{error}</div>
            <TouchButton onClick={loadProjects}>Retry</TouchButton>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="text-xl text-muted-foreground">No projects found</div>
            <TouchButton onClick={() => navigate('/kiosk/wizard/setup')}>
              Create New Project
            </TouchButton>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => handleSelectProject(project)}
                className="p-6 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-accent active:scale-95 transition-all text-left"
              >
                <h3 className="text-xl font-semibold mb-2 truncate">{project.name}</h3>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{project.num_crops} crops</span>
                  <span>{project.num_labels} labels</span>
                </div>
                {project.description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {project.description}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </KioskLayout>
  );
}
