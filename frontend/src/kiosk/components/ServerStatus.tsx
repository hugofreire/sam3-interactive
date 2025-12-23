/**
 * ServerStatus - Shows connection status to backend
 */

import { useState, useEffect } from 'react';
import { checkHealth } from '@/api/sam3';

type Status = 'connecting' | 'connected' | 'disconnected';

export default function ServerStatus() {
  const [status, setStatus] = useState<Status>('connecting');

  useEffect(() => {
    let mounted = true;
    let interval: NodeJS.Timeout;

    const checkConnection = async () => {
      try {
        const health = await checkHealth();
        if (mounted) {
          setStatus(health.sam3Ready ? 'connected' : 'connecting');
        }
      } catch {
        if (mounted) {
          setStatus('disconnected');
        }
      }
    };

    // Initial check
    checkConnection();

    // Check every 10 seconds
    interval = setInterval(checkConnection, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const statusConfig = {
    connecting: {
      color: 'bg-yellow-500',
      text: 'Connecting...',
      pulse: true,
    },
    connected: {
      color: 'bg-green-500',
      text: 'Connected',
      pulse: false,
    },
    disconnected: {
      color: 'bg-red-500',
      text: 'Offline',
      pulse: true,
    },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-foreground/10">
      <span className="relative flex h-3 w-3">
        {config.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.color} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-3 w-3 ${config.color}`} />
      </span>
      <span className="text-sm font-medium">{config.text}</span>
    </div>
  );
}
