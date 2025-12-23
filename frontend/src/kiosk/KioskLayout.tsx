/**
 * KioskLayout - Touch-optimized layout wrapper for 1024x600 screens
 */

import { ReactNode } from 'react';
import ServerStatus from './components/ServerStatus';

interface KioskLayoutProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightContent?: ReactNode;
}

export default function KioskLayout({
  children,
  title,
  showBack = false,
  onBack,
  rightContent,
}: KioskLayoutProps) {
  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden select-none">
      {/* Header - 60px fixed */}
      <header className="h-[60px] bg-primary text-primary-foreground flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          {showBack && onBack && (
            <button
              onClick={onBack}
              className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 active:bg-primary-foreground/30 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {title && (
            <h1 className="text-xl font-bold">{title}</h1>
          )}
        </div>
        <div className="flex items-center gap-3">
          {rightContent}
          <ServerStatus />
        </div>
      </header>

      {/* Main content - fills remaining space */}
      <main className="flex-1 overflow-auto p-4">
        {children}
      </main>
    </div>
  );
}
