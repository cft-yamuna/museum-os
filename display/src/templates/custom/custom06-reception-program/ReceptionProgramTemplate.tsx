import { useState, useEffect, useRef } from 'react';
import { useAppShell } from '@/components/core/AppShell';
import { TransitionLayer } from '@/components/core/TransitionLayer';
import { IdleScreen } from '@/components/core/IdleScreen';
import { VideoPlayer } from '@/components/core/VideoPlayer';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useContentUpdates } from '@/hooks/useContentUpdates';
import { config } from '@/lib/config';
import type { ScreenContent, WelcomeSlide, InfoSlide, TimelineItem } from './types';

// ==========================================
// Config interface
// ==========================================

interface ReceptionProgramConfig {
  instanceId: string;
  templateType: string;
  deviceId: string;

  // Which screen this display instance represents (0, 1, or 2)
  screenIndex: number;

  // Per-screen content (all 3 screens' data — this device renders its screenIndex)
  screens: ScreenContent[];

  // Timing
  welcomeSlideDuration: number;   // seconds per welcome slide (default 8)
  infoSlideDuration: number;      // seconds per info slide (default 10)
  stateCycleDuration: number;     // seconds to stay in each state before switching (default 30)
  transition: string;             // 'fade' | 'slide-left' | 'dissolve' | 'none'
  transitionDuration: number;     // ms (default 800)

  // Appearance
  backgroundColor: string;        // default '#0f172a'
  accentColor: string;             // default '#3b82f6'
  textColor: string;               // default '#ffffff'
  logoUrl?: string;                // museum logo (shown on all screens)
  footerText?: string;             // e.g. "Museum OS Heritage Museum"
  hideHeader?: boolean;            // hide top header row (logo + clock)
  hideCenterLine?: boolean;        // hide welcome slide divider line
  disableOpacity?: boolean;        // remove opacity/overlay effects

  // Clock
  showClock: boolean;              // default true
  showDate: boolean;               // default true
  dateFormat: string;              // 'short' | 'long' (default 'long')

  // Idle
  idle?: { type: 'image' | 'video'; url: string; transitionDuration: number };
  schedule?: { activeFrom: string; activeTo: string; timezone: string };
}

interface ReceptionProgramTemplateProps {
  config: ReceptionProgramConfig;
  instanceId: string;
}

const GUEST_NAMES_TEXT_COLOR = '#351A55';
const GUEST_NAMES_BASE_FONT_REM = 3.5;
const GUEST_NAMES_MIN_FONT_REM = 2;
const GUEST_NAMES_MAX_FONT_REM = 12;

// ==========================================
// Clock
// ==========================================

function Clock({
  textColor,
  showDate,
  dateFormat,
  disableOpacity,
}: {
  textColor: string;
  showDate: boolean;
  dateFormat: string;
  disableOpacity: boolean;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => { setNow(new Date()); }, 1000);
    return () => { clearInterval(interval); };
  }, []);

  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = showDate
    ? now.toLocaleDateString('en-IN', dateFormat === 'short'
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <div style={{ textAlign: 'right', color: textColor }}>
      <div style={{ fontSize: '2.5rem', fontWeight: 300, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{timeStr}</div>
      {showDate && <div style={{ fontSize: '0.95rem', marginTop: 4, opacity: disableOpacity ? 1 : 0.6 }}>{dateStr}</div>}
    </div>
  );
}

// ==========================================
// State 1: Branding & Welcome View
// ==========================================

function WelcomeView({ slide, accentColor, textColor, hideCenterLine, disableOpacity }: {
  slide: WelcomeSlide;
  accentColor: string;
  textColor: string;
  hideCenterLine: boolean;
  disableOpacity: boolean;
}) {
  const bg = slide.backgroundColor || 'transparent';
  const fg = slide.textColor || textColor;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      backgroundColor: bg, color: fg,
      backgroundImage: slide.backgroundImageUrl ? `url(${slide.backgroundImageUrl})` : undefined,
      backgroundSize: 'cover', backgroundPosition: 'center',
      position: 'relative',
    }}>
      {/* Optional dark overlay for readability on busy background images */}
      {slide.backgroundImageUrl && !disableOpacity && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      )}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '40px 60px' }}>
        {slide.logoUrl && (
          <img src={slide.logoUrl} alt="" style={{ maxHeight: 80, maxWidth: 280, objectFit: 'contain', marginBottom: 40 }} />
        )}
        <h1 style={{
          fontSize: '4rem', fontWeight: 700, lineHeight: 1.1, margin: 0, letterSpacing: '-0.03em',
        }}>
          {slide.greeting}
        </h1>
        {slide.subtitle && (
          <p style={{ fontSize: '1.5rem', fontWeight: 300, marginTop: 20, opacity: disableOpacity ? 1 : 0.75, lineHeight: 1.4 }}>
            {slide.subtitle}
          </p>
        )}
        {!hideCenterLine && (
          <div style={{ width: 60, height: 3, backgroundColor: accentColor, margin: '36px auto 0', borderRadius: 2 }} />
        )}
      </div>
    </div>
  );
}

// ==========================================
// State 2: Visitor Information View
// ==========================================

function PreInfoView({ slide, textColor, disableOpacity }: { slide: InfoSlide; textColor: string; disableOpacity: boolean }) {
  const fg = slide.textColor || textColor;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: slide.imageUrl ? 'row' : 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: slide.backgroundColor || 'transparent',
      color: fg, padding: '50px 60px',
    }}>
      <div style={{ flex: 1, maxWidth: slide.imageUrl ? '55%' : '80%' }}>
        {slide.title && (
          <h2 style={{ fontSize: '2.2rem', fontWeight: 700, lineHeight: 1.15, margin: 0, letterSpacing: '-0.02em' }}>
            {slide.title}
          </h2>
        )}
        {slide.body && (
          <p style={{ fontSize: '1.1rem', marginTop: 24, opacity: disableOpacity ? 1 : 0.7, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
            {slide.body}
          </p>
        )}
      </div>
      {slide.imageUrl && (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 30px' }}>
          <img src={slide.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 16 }} />
        </div>
      )}
    </div>
  );
}

function TimelineView({ slide, accentColor, textColor, disableOpacity }: { slide: InfoSlide; accentColor: string; textColor: string; disableOpacity: boolean }) {
  const items = slide.timelineItems || [];
  const fg = slide.textColor || textColor;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: slide.backgroundColor || 'transparent',
      color: fg, padding: '50px 60px',
    }}>
      {slide.title && (
        <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 8, letterSpacing: '-0.01em' }}>
          {slide.title}
        </h2>
      )}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', gap: 4,
        overflow: 'hidden', marginTop: 20,
      }}>
        {items.map((item: TimelineItem, idx: number) => {
          const sectionColor = item.color || accentColor;
          return (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center',
              padding: '18px 24px', borderRadius: 14,
              backgroundColor: disableOpacity ? 'transparent' : 'rgba(255,255,255,0.04)',
              borderLeft: `4px solid ${sectionColor}`,
            }}>
              {/* Section color dot */}
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                backgroundColor: disableOpacity ? 'transparent' : `${sectionColor}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: sectionColor }} />
              </div>
              <div style={{ flex: 1, marginLeft: 20 }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 600 }}>{item.section}</div>
                {item.description && (
                  <div style={{ fontSize: '0.85rem', opacity: disableOpacity ? 1 : 0.5, marginTop: 3 }}>{item.description}</div>
                )}
              </div>
              <div style={{
                fontSize: '1.1rem', fontWeight: 600, color: sectionColor,
                backgroundColor: disableOpacity ? 'transparent' : `${sectionColor}15`, padding: '6px 16px', borderRadius: 8,
              }}>
                {item.duration}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoView({ slide, accentColor, textColor, disableOpacity }: { slide: InfoSlide; accentColor: string; textColor: string; disableOpacity: boolean }) {
  if (slide.type === 'timeline') {
    return <TimelineView slide={slide} accentColor={accentColor} textColor={textColor} disableOpacity={disableOpacity} />;
  }
  return <PreInfoView slide={slide} textColor={textColor} disableOpacity={disableOpacity} />;
}

function GuestNamesPanel({
  guestNames,
  textColor,
  fontSizeRem,
}: {
  guestNames: string[];
  textColor: string;
  fontSizeRem: number;
}) {
  if (guestNames.length === 0) return null;

  const rows = Array.from({ length: Math.ceil(guestNames.length / 2) }, (_, rowIndex) => (
    guestNames.slice(rowIndex * 2, rowIndex * 2 + 2)
  ));

  return (
    <div style={{
      width: 'min(96vw, 1280px)',
      height: '100%',
      padding: '64px 16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'center',
        gap: 18,
      }}>
        {rows.map((row, rowIndex) => (
          <div
            key={`guest-name-row-${rowIndex}`}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 56,
            }}
          >
            {row.map((name, columnIndex) => (
              <div
                key={`${rowIndex}-${columnIndex}`}
                style={{
                  width: row.length === 1 ? 'min(100%, 900px)' : 'calc((100% - 56px) / 2)',
                  minHeight: 96,
                  padding: '22px 12px',
                  color: textColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontSize: `${fontSizeRem}rem`,
                  lineHeight: 1.1,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                }}
              >
                {name}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function getGuestNameFontSizeRem(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return GUEST_NAMES_BASE_FONT_REM;
  return Math.min(GUEST_NAMES_MAX_FONT_REM, Math.max(GUEST_NAMES_MIN_FONT_REM, parsed));
}

// ==========================================
// State Indicator
// ==========================================

function StateIndicator({ currentState, accentColor, textColor }: { currentState: 'welcome' | 'info'; accentColor: string; textColor: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{
        width: currentState === 'welcome' ? 20 : 8, height: 8, borderRadius: 4,
        backgroundColor: currentState === 'welcome' ? accentColor : `${textColor}30`,
        transition: 'all 400ms ease',
      }} />
      <div style={{
        width: currentState === 'info' ? 20 : 8, height: 8, borderRadius: 4,
        backgroundColor: currentState === 'info' ? accentColor : `${textColor}30`,
        transition: 'all 400ms ease',
      }} />
    </div>
  );
}

// ==========================================
// Main Template
// ==========================================

function ReceptionProgramTemplate(props: ReceptionProgramTemplateProps) {
  const appShell = useAppShell();
  const cfg = props.config;

  const screenIndex = cfg.screenIndex || 0;
  const screens = cfg.screens || [];
  const myScreen = screens.find((s) => s.screenIndex === screenIndex) || screens[0];
  const screenMode = myScreen?.mode === 'video' ? 'video' : 'slides';
  const screenVideoUrl = myScreen?.videoUrl ? myScreen.videoUrl : '';
  const guestNames = (myScreen?.guestNames || []).map((name) => name.trim()).filter(Boolean);
  const guestNameFontSizeRem = getGuestNameFontSizeRem(myScreen?.guestNameFontSizeRem);
  const showGuestNames = screenIndex === 2 && guestNames.length > 0;

  const welcomeSlides = myScreen ? myScreen.welcomeSlides || [] : [];
  const infoSlides = myScreen ? myScreen.infoSlides || [] : [];
  const hasSlideContent = welcomeSlides.length > 0 || infoSlides.length > 0;
  const hasVideoModeContent = screenMode === 'video' && Boolean(screenVideoUrl);
  const hasPlayableContent = hasSlideContent || hasVideoModeContent || showGuestNames;

  const welcomeSlideDuration = (cfg.welcomeSlideDuration || 8) * 1000;
  const infoSlideDuration = (cfg.infoSlideDuration || 10) * 1000;
  const stateCycleDuration = (cfg.stateCycleDuration || 30) * 1000;
  const backgroundColor = cfg.backgroundColor || '#0f172a';
  const accentColor = cfg.accentColor || '#3b82f6';
  const textColor = cfg.textColor || '#ffffff';
  const showClock = cfg.showClock !== false;
  const showDate = cfg.showDate !== false;
  const dateFormat = cfg.dateFormat || 'long';
  const hideHeader = cfg.hideHeader === true;
  const hideCenterLine = cfg.hideCenterLine === true;
  const disableOpacity = cfg.disableOpacity === true;

  const hasIdle = cfg.idle?.url;

  // State machine: cycle between 'welcome' and 'info'
  const [currentState, setCurrentState] = useState<'welcome' | 'info'>('welcome');
  const [slideIndex, setSlideIndex] = useState(0);
  const stateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const idle = useIdleTimer({
    enabled: Boolean(hasIdle),
    schedule: cfg.schedule,
    inactivityTimeout: config().idleTimeout || 300000,
    hasContent: hasPlayableContent,
    hasContentError: false,
  });

  const { setStatus, setCurrentContent } = useHeartbeat({
    deviceId: config().deviceId,
    templateType: 'custom06-reception-program',
    instanceId: props.instanceId,
  });

  useContentUpdates({});

  // State cycling: welcome -> info -> welcome -> ...
  useEffect(() => {
    if (screenMode === 'video') return;

    const hasWelcome = welcomeSlides.length > 0;
    const hasInfo = infoSlides.length > 0;

    // If only one state has content, stay there
    if (!hasWelcome && !hasInfo) return;
    if (!hasWelcome) { setCurrentState('info'); return; }
    if (!hasInfo) { setCurrentState('welcome'); return; }

    stateTimerRef.current = setTimeout(() => {
      setCurrentState((prev) => prev === 'welcome' ? 'info' : 'welcome');
      setSlideIndex(0);
    }, stateCycleDuration);

    return () => {
      if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
    };
  }, [screenMode, currentState, stateCycleDuration, welcomeSlides.length, infoSlides.length]);

  // Slide cycling within current state
  useEffect(() => {
    if (screenMode === 'video') return;

    const slides = currentState === 'welcome' ? welcomeSlides : infoSlides;
    if (slides.length <= 1) return;

    const duration = currentState === 'welcome' ? welcomeSlideDuration : infoSlideDuration;

    slideTimerRef.current = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % slides.length);
    }, duration);

    return () => {
      if (slideTimerRef.current) clearInterval(slideTimerRef.current);
    };
  }, [screenMode, currentState, welcomeSlides.length, infoSlides.length, welcomeSlideDuration, infoSlideDuration]);

  // Heartbeat
  useEffect(() => {
    if (hasIdle && idle.isIdle) {
      setStatus('idle');
    } else if (hasVideoModeContent) {
      setStatus('playing');
      setCurrentContent('video-only');
    } else if (hasSlideContent) {
      setStatus('playing');
      setCurrentContent(`${currentState}-${slideIndex}`);
    } else if (showGuestNames) {
      setStatus('playing');
      setCurrentContent('guest-names');
    } else {
      setStatus('idle');
    }
  }, [hasIdle, idle.isIdle, hasVideoModeContent, hasSlideContent, showGuestNames, currentState, slideIndex, setStatus, setCurrentContent]);

  // WebSocket idle command
  useEffect(() => {
    if (hasIdle && appShell.isIdle) {
      idle.deactivate('command');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appShell.isIdle]);

  // Empty state
  if (!hasPlayableContent) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor, color: textColor, fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center', opacity: disableOpacity ? 1 : 0.4 }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 300 }}>Screen {screenIndex + 1}</div>
          <div style={{ fontSize: '0.9rem', marginTop: 8 }}>No content configured — update via admin panel</div>
        </div>
      </div>
    );
  }

  // Current slide
  const currentSlides = currentState === 'welcome' ? welcomeSlides : infoSlides;
  const safeIndex = slideIndex < currentSlides.length ? slideIndex : 0;
  const currentSlide = currentSlides[safeIndex];

  if (showGuestNames) {
    return (
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <GuestNamesPanel
          guestNames={guestNames}
          textColor={GUEST_NAMES_TEXT_COLOR}
          fontSizeRem={guestNameFontSizeRem}
        />
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      backgroundColor, fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden',
    }}>
      {screenMode === 'video' && screenVideoUrl ? (
        <VideoPlayer
          src={screenVideoUrl}
          fit="cover"
          backgroundColor={backgroundColor}
          loop
          autoPlay
        />
      ) : (
        <>
          {/* Header hidden for full-screen reception background mode */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
            display: hideHeader ? 'none' : 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '24px 40px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {cfg.logoUrl && <img src={cfg.logoUrl} alt="" style={{ height: 36, objectFit: 'contain' }} />}
            </div>
            {showClock && <Clock textColor={textColor} showDate={showDate} dateFormat={dateFormat} disableOpacity={disableOpacity} />}
          </div>

          {/* Slide content */}
          <TransitionLayer
            contentKey={`${currentState}-${safeIndex}-${currentSlide?.id || ''}`}
            transition={(cfg.transition || 'fade') as 'fade' | 'slide-left' | 'dissolve' | 'none'}
            transitionDuration={cfg.transitionDuration || 800}
          >
            <div style={{ width: '100%', height: '100%', paddingTop: 0 }}>
              {currentState === 'welcome' && currentSlide ? (
                <WelcomeView
                  slide={currentSlide as WelcomeSlide}
                  accentColor={accentColor}
                  textColor={textColor}
                  hideCenterLine={hideCenterLine}
                  disableOpacity={disableOpacity}
                />
              ) : currentSlide ? (
                <InfoView
                  slide={currentSlide as InfoSlide}
                  accentColor={accentColor}
                  textColor={textColor}
                  disableOpacity={disableOpacity}
                />
              ) : null}
            </div>
          </TransitionLayer>

          {/* Footer hidden to avoid center divider/indicator line in image-only mode */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
            padding: '16px 40px',
            display: 'none', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: '0.8rem', color: textColor, opacity: disableOpacity ? 1 : 0.35 }}>
              {cfg.footerText || ''}
            </div>
            <StateIndicator currentState={currentState} accentColor={accentColor} textColor={textColor} />
          </div>
        </>
      )}

      {/* Idle overlay */}
      {hasIdle && cfg.idle && <IdleScreen isIdle={idle.isIdle} idle={cfg.idle} />}
    </div>
  );
}

export { ReceptionProgramTemplate };
export type { ReceptionProgramTemplateProps, ReceptionProgramConfig };
