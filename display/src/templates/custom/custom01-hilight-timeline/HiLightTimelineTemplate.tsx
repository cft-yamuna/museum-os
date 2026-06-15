import { useState, useCallback, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { TimelineDataProvider } from './context/TimelineDataContext';
import FullscreenContainer from './components/shared/FullscreenContainer';
import BackgroundGradient from './components/shared/BackgroundGradient';
import AmbientScene from './components/ambient/AmbientScene';
import SectorDetailView from './components/sector/SectorDetailView';
import BackButton from './components/sector/BackButton';
import { CENTERED_DANDELION_SIZE } from './constants/animation';
import type { AppState, SectorConfig } from './types';
import { usePresenceSensor } from '@/hooks/usePresenceSensor';
import './styles/global.css';

gsap.registerPlugin(useGSAP);

interface HiLightTimelineConfig {
  inactivityTimeoutSec?: number;
  timelineData?: { dandelions: Array<{ sector: { id: string; label: string; color: string; glowColor: string }; placement: { x: number; y: number; size: number; delay: number } }>; milestones: Array<{ id: string; year: number; description: string; sectorId: string; decade: string }> } | null;
  [key: string]: unknown;
}

interface HiLightTimelineTemplateProps {
  config: HiLightTimelineConfig;
  instanceId: string;
}

interface TimelineAppProps {
  inactivityTimeoutSec: number;
}

function TimelineApp({ inactivityTimeoutSec }: TimelineAppProps) {
  const [appState, setAppState] = useState<AppState>('idle');
  const [selectedSector, setSelectedSector] = useState<SectorConfig | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentDecade, setCurrentDecade] = useState<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTouchTime = useRef(0);
  const sensorClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sensorClearDebounced = useRef(false);

  // ── Presence sensor ──
  const { isPresent, sensorConnected } = usePresenceSensor({ enabled: true });

  const resetToIdle = useCallback(() => {
    const needsDelay = selectedSector !== null;
    setSelectedSector(null);
    setSelectedIndex(null);
    setCurrentDecade(null);
    if (needsDelay) {
      setTimeout(() => { setAppState('idle'); }, 600);
    } else {
      setAppState('idle');
    }
  }, [selectedSector]);

  const handleBack = useCallback(() => {
    setSelectedSector(null);
    setSelectedIndex(null);
    setCurrentDecade(null);
    setAppState('active');
  }, []);

  // Check if idle conditions are met: no recent touch AND (sensor clear OR sensor offline)
  const checkIdle = useCallback(() => {
    const touchAge = Date.now() - lastTouchTime.current;
    const touchExpired = touchAge >= inactivityTimeoutSec * 1000;
    const sensorSaysClear = !sensorConnected || sensorClearDebounced.current;

    if (touchExpired && sensorSaysClear) {
      resetToIdle();
    }
  }, [inactivityTimeoutSec, sensorConnected, resetToIdle]);

  // Start or restart the idle countdown
  const scheduleIdleCheck = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(checkIdle, inactivityTimeoutSec * 1000);
  }, [inactivityTimeoutSec, checkIdle]);

  // ── Sensor: wake on present, debounce clear ──
  useEffect(() => {
    if (!sensorConnected) return;

    if (isPresent) {
      // Sensor sees someone — cancel any clear debounce, wake from idle
      sensorClearDebounced.current = false;
      if (sensorClearTimer.current) {
        clearTimeout(sensorClearTimer.current);
        sensorClearTimer.current = null;
      }
      setAppState((prev) => prev === 'idle' ? 'active' : prev);
      // Clear idle timer — someone is here
      if (idleTimer.current) clearTimeout(idleTimer.current);
    } else {
      // Sensor says clear — debounce for 3s before believing it
      if (sensorClearTimer.current) clearTimeout(sensorClearTimer.current);
      sensorClearTimer.current = setTimeout(() => {
        sensorClearDebounced.current = true;
        scheduleIdleCheck();
      }, 3000);
    }
  }, [isPresent, sensorConnected, scheduleIdleCheck]);

  // ── Touch/mouse/keyboard activity — strongest keep-alive signal ──
  useEffect(() => {
    const handleActivity = () => {
      lastTouchTime.current = Date.now();
      setAppState((prev) => prev === 'idle' ? 'active' : prev);
      scheduleIdleCheck();
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('touchmove', handleActivity);
    window.addEventListener('scroll', handleActivity, true);
    window.addEventListener('wheel', handleActivity, { passive: true });
    window.addEventListener('mousedown', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('touchmove', handleActivity);
      window.removeEventListener('scroll', handleActivity, true);
      window.removeEventListener('wheel', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (sensorClearTimer.current) clearTimeout(sensorClearTimer.current);
    };
  }, [scheduleIdleCheck]);

  // ── Lock native browser zoom gestures for this app ──
  useEffect(() => {
    const onWheelCapture = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };

    const onGesture = (event: Event) => {
      event.preventDefault();
    };

    const onTouchCapture = (event: TouchEvent) => {
      if (event.touches.length >= 2) event.preventDefault();
    };

    document.addEventListener('wheel', onWheelCapture, { capture: true, passive: false });
    document.addEventListener('gesturestart', onGesture, { capture: true, passive: false });
    document.addEventListener('gesturechange', onGesture, { capture: true, passive: false });
    document.addEventListener('gestureend', onGesture, { capture: true, passive: false });
    document.addEventListener('touchstart', onTouchCapture, { capture: true, passive: false });
    document.addEventListener('touchmove', onTouchCapture, { capture: true, passive: false });

    return () => {
      document.removeEventListener('wheel', onWheelCapture, true);
      document.removeEventListener('gesturestart', onGesture, true);
      document.removeEventListener('gesturechange', onGesture, true);
      document.removeEventListener('gestureend', onGesture, true);
      document.removeEventListener('touchstart', onTouchCapture, true);
      document.removeEventListener('touchmove', onTouchCapture, true);
    };
  }, []);

  const handleSelectSector = useCallback((sector: SectorConfig, index: number) => {
    setCurrentDecade(null);
    setSelectedSector(sector);
    setSelectedIndex(index);
    setAppState('sector');
  }, []);

  return (
    <FullscreenContainer>
      <BackgroundGradient sectorColor={selectedSector?.color ?? null} />
      <AmbientScene
        appState={appState}
        selectedSector={selectedSector}
        selectedIndex={selectedIndex}
        onSelectSector={handleSelectSector}
      />
      {appState === 'sector' && selectedSector && (
        <SectorDetailView
          sector={selectedSector}
          dandelionSize={CENTERED_DANDELION_SIZE}
          initialDecade={currentDecade}
          onDecadeChange={setCurrentDecade}
        />
      )}
      {appState === 'sector' && <BackButton onBack={handleBack} />}
    </FullscreenContainer>
  );
}

export function HiLightTimelineTemplate({ config }: HiLightTimelineTemplateProps) {
  return (
    <div className="custom01-hilight-timeline" style={{ width: '100%', height: '100%' }}>
      <TimelineDataProvider initialData={config.timelineData ?? undefined}>
        <TimelineApp inactivityTimeoutSec={config.inactivityTimeoutSec ?? 15} />
      </TimelineDataProvider>
    </div>
  );
}
