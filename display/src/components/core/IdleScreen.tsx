import { useState, useEffect, useRef } from 'react';
import type { IdleConfig } from '@/lib/types';
import { VideoPlayer } from './VideoPlayer';
import { BRAND_NAME } from '@/lib/brand';

// ==========================================
// Types
// ==========================================

interface IdleScreenProps {
  /** Whether the idle screen should be visible */
  isIdle: boolean;
  /** Idle content configuration (if undefined, renders nothing) */
  idle?: IdleConfig;
  /** Additional CSS class */
  className?: string;
}

// ==========================================
// Component
// ==========================================

export function IdleScreen({ isIdle, idle, className }: IdleScreenProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  const rafIdRef = useRef<number | null>(null);
  const transitionDuration = idle?.transitionDuration ?? 1000;

  useEffect(() => {
    if (isIdle) {
      setShouldRender(true);
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          setIsVisible(true);
        });
      });
      return () => {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      };
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, transitionDuration);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [isIdle, transitionDuration]);

  // Don't render if no idle config or not in render state
  if (!idle || !shouldRender) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 50,
    opacity: isVisible ? 1 : 0,
    pointerEvents: isVisible ? 'auto' : 'none',
    transition: `opacity ${transitionDuration}ms ease-in-out`,
    transform: 'translateZ(0)',
  };

  const imageStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundImage: `url(${idle.url})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  const scrimStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.7) 100%)',
    zIndex: 1,
  };

  const contentStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '48px',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.02em',
    marginBottom: '16px',
    textShadow: '0 2px 20px rgba(0,0,0,0.5)',
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
  };

  const pulseKeyframes = '@keyframes idle-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }';

  const hintStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '60px',
    left: 0,
    width: '100%',
    textAlign: 'center',
    fontSize: '16px',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
    animation: 'idle-pulse 2s ease-in-out infinite',
  };

  return (
    <div style={overlayStyle} className={className}>
      <style>{pulseKeyframes}</style>
      {idle.type === 'video' ? (
        <VideoPlayer
          src={idle.url}
          muted={false}
          fit="cover"
          loop={true}
          autoPlay={true}
        />
      ) : (
        <div style={imageStyle} />
      )}
      <div style={scrimStyle} />
      <div style={contentStyle}>
        <div style={titleStyle}>{BRAND_NAME}</div>
        <div style={subtitleStyle}>Museum Experience</div>
      </div>
      <div style={hintStyle}>Touch to explore</div>
    </div>
  );
}
