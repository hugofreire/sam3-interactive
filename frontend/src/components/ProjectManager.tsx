import { useState, useEffect } from 'react';
import { getProjects, createProject, deleteProject } from '../api/projects';
import type { Project } from '../types';

interface ProjectManagerProps {
  currentProjectId: string | null;
  onProjectSelect: (project: Project | null) => void;
}

export default function ProjectManager({
  currentProjectId,
  onProjectSelect,
}: ProjectManagerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const projectList = await getProjects();
      setProjects(projectList);

      // Auto-select first project if none selected
      if (!currentProjectId && projectList.length > 0) {
        onProjectSelect(projectList[0]);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      alert('Please enter a project name');
      return;
    }

    try {
      const project = await createProject({
        name: newProjectName.trim(),
        settings: {
          background_mode: 'transparent',
        },
      });

      setProjects([...projects, project]);
      setNewProjectName('');
      setShowNewProjectDialog(false);
      onProjectSelect(project);
    } catch (err) {
      console.error('Failed to create project:', err);
      alert('Failed to create project');
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the project

    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    if (!confirm(`Delete project "${project.name}"? This will delete all crops and cannot be undone.`)) {
      return;
    }

    try {
      await deleteProject(projectId);
      const updatedProjects = projects.filter((p) => p.id !== projectId);
      setProjects(updatedProjects);

      // If deleted project was selected, select another or null
      if (currentProjectId === projectId) {
        onProjectSelect(updatedProjects[0] || null);
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert('Failed to delete project');
    }
  };

  const handleProjectSelect = (project: Project) => {
    onProjectSelect(project);
  };

  return (
    <div
      style={{
        width: '280px',
        height: '100vh',
        backgroundColor: '#2c3e50',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #34495e',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px',
          borderBottom: '1px solid #34495e',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '20px', marginBottom: '12px' }}>
          Projects
        </h2>
        <button
          onClick={() => setShowNewProjectDialog(true)}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          + New Project
        </button>
      </div>

      {/* New Project Dialog */}
      {showNewProjectDialog && (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#34495e',
            borderBottom: '1px solid #2c3e50',
          }}
        >
          <input
            type="text"
            placeholder="Project name..."
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleCreateProject();
              } else if (e.key === 'Escape') {
                setShowNewProjectDialog(false);
                setNewProjectName('');
              }
            }}
            autoFocus
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '8px',
              borderRadius: '4px',
              border: '1px solid #2c3e50',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCreateProject}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowNewProjectDialog(false);
                setNewProjectName('');
              }}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: '#7f8c8d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Project List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#95a5a6' }}>
            Loading projects...
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#e74c3c' }}>
            {error}
            <br />
            <button
              onClick={loadProjects}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#95a5a6',
              fontSize: '14px',
            }}
          >
            No projects yet.
            <br />
            Create one to start labeling!
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              onClick={() => handleProjectSelect(project)}
              style={{
                padding: '12px',
                marginBottom: '8px',
                backgroundColor:
                  currentProjectId === project.id ? '#34495e' : '#2c3e50',
                borderRadius: '6px',
                cursor: 'pointer',
                border: `2px solid ${
                  currentProjectId === project.id ? '#3498db' : 'transparent'
                }`,
                transition: 'all 0.2s',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (currentProjectId !== project.id) {
                  e.currentTarget.style.backgroundColor = '#34495e';
                }
              }}
              onMouseLeave={(e) => {
                if (currentProjectId !== project.id) {
                  e.currentTarget.style.backgroundColor = '#2c3e50';
                }
              }}
            >
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 'bold',
                  marginBottom: '6px',
                  paddingRight: '24px',
                }}
              >
                {project.name}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#95a5a6',
                }}
              >
                {project.num_crops} crops · {project.num_labels} labels
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => handleDeleteProject(project.id, e)}
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '24px',
                  height: '24px',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#c0392b';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#e74c3c';
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '12px',
          borderTop: '1px solid #34495e',
          fontSize: '11px',
          color: '#95a5a6',
          textAlign: 'center',
        }}
      >
        SAM3 Dataset Labeling
      </div>
    </div>
  );
}
