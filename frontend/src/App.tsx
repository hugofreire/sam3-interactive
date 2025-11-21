import { useState } from 'react';
import ImageUpload from './components/ImageUpload';
import InteractiveCanvas from './components/InteractiveCanvas';
import type { Session } from './types';
import './App.css';

function App() {
  const [session, setSession] = useState<Session | null>(null);

  const handleImageUploaded = (newSession: Session) => {
    console.log('Session created:', newSession);
    setSession(newSession);
  };

  const handleReset = () => {
    setSession(null);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <header
        style={{
          backgroundColor: '#1976D2',
          color: 'white',
          padding: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 'bold' }}>
            🎯 SAM3 Interactive Segmentation
          </h1>
          <p style={{ margin: '8px 0 0 0', fontSize: '16px', opacity: 0.9 }}>
            Click-to-Segment powered by Meta's SAM3 AI Model
          </p>
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        {!session ? (
          <div>
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <h2 style={{ marginTop: 0 }}>Upload an Image</h2>
              <p style={{ color: '#666' }}>
                Upload an image to start segmenting objects with interactive clicks.
              </p>
            </div>

            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <ImageUpload onImageUploaded={handleImageUploaded} />
            </div>

            {/* Info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '20px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                <h3 style={{ marginTop: 0, color: '#4CAF50' }}>✨ Features</h3>
                <ul style={{ color: '#666', lineHeight: '1.8' }}>
                  <li>Interactive click-to-segment</li>
                  <li>Multiple candidate masks</li>
                  <li>Iterative refinement</li>
                  <li>Real-time segmentation</li>
                </ul>
              </div>

              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '20px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                <h3 style={{ marginTop: 0, color: '#2196F3' }}>🚀 How it Works</h3>
                <ol style={{ color: '#666', lineHeight: '1.8' }}>
                  <li>Upload an image</li>
                  <li>Click on objects to segment</li>
                  <li>Add more points to refine</li>
                  <li>Select the best mask</li>
                </ol>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Interactive Segmentation</h2>
                <p style={{ margin: '8px 0 0 0', color: '#666' }}>
                  Image: {session.width} × {session.height} pixels
                </p>
              </div>

              <button
                onClick={handleReset}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                📁 Upload New Image
              </button>
            </div>

            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <InteractiveCanvas
                sessionId={session.sessionId}
                imageUrl={session.imageUrl || ''}
                imageWidth={session.width}
                imageHeight={session.height}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          textAlign: 'center',
          padding: '20px',
          color: '#999',
          marginTop: '40px',
        }}
      >
        <p>
          Powered by <strong>SAM3</strong> (Segment Anything Model 3) from Meta AI
        </p>
      </footer>
    </div>
  );
}

export default App;
