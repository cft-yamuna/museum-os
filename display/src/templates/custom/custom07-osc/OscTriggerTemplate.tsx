import { useEffect, useRef, useState, useCallback } from 'react';
import { IdleScreen } from '@/components/core/IdleScreen';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useOscTrigger } from '@/hooks/useOscTrigger';
import { config } from '@/lib/config';
import type { IdleConfig } from '@/lib/types';
import type { OscTriggerConfig } from './types';

interface OscTriggerTemplateProps {
  config: OscTriggerConfig;
  instanceId: string;
}

export function OscTriggerTemplate(props: OscTriggerTemplateProps) {
  const cfg = props.config;

  const videoRef = useRef<HTMLVideoElement>(null);
  const blockedRef = useRef(false);
  const mountedRef = useRef(true);

  const [isPlaying, setIsPlaying] = useState(false);

  const { setStatus } = useHeartbeat({
    deviceId: config().deviceId,
    templateType: 'custom07-osc',
    instanceId: props.instanceId,
  });

  // ---- Trigger handler ----
  const triggerVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || blockedRef.current) return;

    blockedRef.current = true;
    setIsPlaying(true);
    setStatus('playing');
    video.currentTime = 0;
    video.play().catch(() => {
      blockedRef.current = false;
      setIsPlaying(false);
      setStatus('idle');
    });
  }, [setStatus]);

  // ---- Listen for OSC triggers from agent (via local WS on port 3402) ----
  useOscTrigger({
    enabled: cfg.inputSource === 'osc',
    onTrigger: triggerVideo,
  });

  // ---- Video ended → back to idle ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onEnded = () => {
      if (!mountedRef.current) return;
      setIsPlaying(false);
      setStatus('idle');
      video.currentTime = 0;
      blockedRef.current = false;
    };

    video.addEventListener('ended', onEnded);
    return () => video.removeEventListener('ended', onEnded);
  }, [setStatus]);

  // ---- Preload video ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cfg.videoUrl) return;
    video.preload = 'auto';
    video.src = cfg.videoUrl;
    video.load();
  }, [cfg.videoUrl]);

  // ---- Cleanup ----
  useEffect(() => {
    mountedRef.current = true;
    setStatus('idle');
    return () => {
      mountedRef.current = false;
    };
  }, [setStatus]);

  // ---- Render ----
  const idleImage = cfg.idleImageUrl || cfg.idle?.imageUrl;
  const idleFallback: IdleConfig | undefined = cfg.idle?.enabled
    ? (cfg.idle.videoUrl
      ? { type: 'video', url: cfg.idle.videoUrl, transitionDuration: 800 }
      : cfg.idle.imageUrl
        ? { type: 'image', url: cfg.idle.imageUrl, transitionDuration: 800 }
        : undefined)
    : undefined;

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#000',
      overflow: 'hidden',
      cursor: 'none',
      position: 'relative',
    }}>
      {/* Idle image — shown when not playing */}
      {idleImage && !isPlaying && (
        <img
          src={idleImage}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        />
      )}

      {/* Idle screen fallback */}
      {!idleImage && !isPlaying && idleFallback && (
        <IdleScreen isIdle={true} idle={idleFallback} />
      )}

      {/* Video — shown when triggered */}
      <video
        ref={videoRef}
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          position: 'absolute',
          top: 0,
          left: 0,
          display: isPlaying ? 'block' : 'none',
        }}
      />
    </div>
  );
}
