'use client';

import { createContext, useContext, useState, useEffect } from 'react';

interface DebugModeContextType {
  isDebugMode: boolean;
  toggleDebugMode: () => void;
}

const DebugModeContext = createContext<DebugModeContextType | undefined>(undefined);

export function DebugModeProvider({ children }: { children: React.ReactNode }) {
  const [isDebugMode, setIsDebugMode] = useState(false);

  // Load debug mode state from localStorage on mount
  useEffect(() => {
    const storedValue = localStorage.getItem('debug-mode');
    if (storedValue) {
      setIsDebugMode(storedValue === 'true');
    }
  }, []);

  const toggleDebugMode = () => {
    const newValue = !isDebugMode;
    setIsDebugMode(newValue);
    localStorage.setItem('debug-mode', String(newValue));
  };

  return (
    <DebugModeContext.Provider value={{ isDebugMode, toggleDebugMode }}>
      {children}
    </DebugModeContext.Provider>
  );
}

export function useDebugMode() {
  const context = useContext(DebugModeContext);
  if (context === undefined) {
    throw new Error('useDebugMode must be used within a DebugModeProvider');
  }
  return context;
} 