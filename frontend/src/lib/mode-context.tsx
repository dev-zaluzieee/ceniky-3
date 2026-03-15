"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type AppMode = "TEST" | "PRODUCTION";

interface ModeContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

const ModeContext = createContext<ModeContextValue>({
  mode: "TEST",
  setMode: () => {},
});

const STORAGE_KEY = "app-mode";

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>("TEST");

  // Load persisted mode on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "PRODUCTION" || stored === "TEST") {
        setModeState(stored);
      }
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  const setMode = (newMode: AppMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {
      // ignore
    }
  };

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useAppMode() {
  return useContext(ModeContext);
}
