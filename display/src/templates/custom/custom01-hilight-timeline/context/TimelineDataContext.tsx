import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { TimelineData } from '../types/timeline-data';
import { loadData, saveData, getDefaultData } from './timeline-data-store';

interface TimelineDataContextValue {
  data: TimelineData;
  updateData: (updater: (prev: TimelineData) => TimelineData) => void;
  resetToDefaults: () => void;
}

const TimelineDataContext = createContext<TimelineDataContextValue | null>(null);

export function TimelineDataProvider({ children, initialData }: { children: ReactNode; initialData?: TimelineData }) {
  const [data, setData] = useState<TimelineData>(() => initialData ?? loadData());

  const updateData = useCallback((updater: (prev: TimelineData) => TimelineData) => {
    setData((prev) => {
      const next = updater(prev);
      saveData(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultData();
    saveData(defaults);
    setData(defaults);
  }, []);

  return (
    <TimelineDataContext.Provider value={{ data, updateData, resetToDefaults }}>
      {children}
    </TimelineDataContext.Provider>
  );
}

export function useTimelineData(): TimelineDataContextValue {
  const ctx = useContext(TimelineDataContext);
  if (!ctx) {
    throw new Error('useTimelineData must be used within TimelineDataProvider');
  }
  return ctx;
}
