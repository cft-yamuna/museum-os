import { useEffect, useCallback } from 'react';
import { useAppShell } from '@/components/core/AppShell';
import { VideoPlayer } from '@/components/core/VideoPlayer';
import { IdleScreen } from '@/components/core/IdleScreen';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { config } from '@/lib/config';
import type { VideoLoopConfig } from '@/lib/types';

// ==========================================
// Types
// ==========================================

interface MediaLoopTemplateProps {
  config: VideoLoopConfig;
  instanceId: string;
}

// ==========================================
// MediaLoopTemplate
// ==========================================

function MediaLoopTemplate(props: MediaLoopTemplateProps) {
  const appShell = useAppShell();
  const videoConfig = props.config;

  const hasIdle = videoConfig.idle && videoConfig.idle.url;

  const idleTimeout = config().idleTimeout || 300000;
  const idle = useIdleTimer({
    enabled: Boolean(hasIdle),
    schedule: videoConfig.schedule,
    inactivityTimeout: idleTimeout,
    hasContent: Boolean(videoConfig.videoUrl),
  });

  const { setStatus, setCurrentContent } = useHeartbeat({
    deviceId: config().deviceId,
    templateType: 'video-loop',
    instanceId: props.instanceId,
  });

  // Update heartbeat status based on idle state
  useEffect(() => {
    if (hasIdle && idle.isIdle) {
      setStatus('idle');
    } else {
      setStatus('playing');
      setCurrentContent(videoConfig.videoUrl);
    }
  }, [hasIdle, idle.isIdle, videoConfig.videoUrl, setStatus, setCurrentContent]);

  // Listen for WebSocket idle command via AppShell
  useEffect(() => {
    if (hasIdle && appShell.isIdle) {
      idle.deactivate('command');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appShell.isIdle]);

  // When AppShell says not idle (activate command), activate our timer too
  useEffect(() => {
    if (hasIdle && !appShell.isIdle && idle.isIdle && idle.idleReason === 'command') {
      idle.activate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appShell.isIdle]);

  const handleError = useCallback((error: Error) => {
    setStatus('error');
    appShell.send('error', { type: 'playback', message: error.message });
  }, [setStatus, appShell]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <VideoPlayer
        src={videoConfig.videoUrl}
        muted={false}
        volume={videoConfig.volume !== undefined ? videoConfig.volume : 100}
        fit={videoConfig.fit || 'cover'}
        backgroundColor={videoConfig.backgroundColor || '#000'}
        loop={true}
        autoPlay={true}
        onError={handleError}
      />
      {hasIdle && videoConfig.idle && (
        <IdleScreen
          isIdle={idle.isIdle}
          idle={videoConfig.idle}
        />
      )}
    </div>
  );
}

export { MediaLoopTemplate };
export type { MediaLoopTemplateProps };
