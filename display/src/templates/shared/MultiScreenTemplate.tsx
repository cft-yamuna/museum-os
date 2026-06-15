import { useEffect, useState } from 'react';
import { useAppShell } from '@/components/core/AppShell';
import { VideoPlayer } from '@/components/core/VideoPlayer';
import { ImageSlide } from '@/components/core/ImageSlide';
import { TransitionLayer } from '@/components/core/TransitionLayer';
import { usePlaylist } from '@/hooks/usePlaylist';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useContentUpdates } from '@/hooks/useContentUpdates';
import { useExhibitSync } from '@/hooks/useExhibitSync';
import type { MultiScreenConfig } from '@/lib/types';

// ==========================================
// Types
// ==========================================

interface MultiScreenTemplateProps {
  config: MultiScreenConfig;
  instanceId: string;
}

// ==========================================
// MultiScreenTemplate
// ==========================================

export function MultiScreenTemplate(props: MultiScreenTemplateProps) {
  useAppShell();
  const cfg = props.config;
  const exhibitId = cfg.exhibitId;
  const screenIndex = cfg.screenIndex;
  const totalScreens = cfg.totalScreens;
  const contentType = cfg.contentType;
  const videoUrl = cfg.videoUrl || '';
  const imageUrl = cfg.imageUrl || '';
  const playlistId = cfg.playlistId || '';
  const fit = cfg.fit || 'cover';
  const backgroundColor = cfg.backgroundColor || '#000';

  const sync = useExhibitSync({ exhibitId, screenIndex, totalScreens, enabled: true });
  const isLeader = sync.isLeader;
  const sendSync = sync.sendSync;
  const lastSync = sync.lastSync;

  const debugTuple = useState(false);
  const debugMode = debugTuple[0];
  const setDebugMode = debugTuple[1];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') setDebugMode(true);
  }, []);

  const lastSyncTimeTuple = useState(0);
  const lastSyncTime = lastSyncTimeTuple[0];
  const setLastSyncTime = lastSyncTimeTuple[1];

  const playlist = usePlaylist({
    playlistId,
    defaultDuration: 5,
    shuffle: false,
    loop: true,
    enabled: contentType === 'slideshow',
  });
  const currentIndex = playlist.currentIndex;
  const currentItem = playlist.currentItem;
  const goTo = playlist.goTo;
  const onItemComplete = playlist.onItemComplete;

  useContentUpdates({
    onPlaylistUpdated: (updatedPlaylistId) => {
      if (contentType === 'slideshow' && updatedPlaylistId === playlistId) {
        playlist.refresh();
      }
    },
  });

  const heartbeat = useHeartbeat({
    deviceId: cfg.deviceId,
    templateType: 'multi-screen',
    instanceId: props.instanceId,
  });

  // ---- Update heartbeat status ----
  useEffect(() => {
    heartbeat.setStatus('playing');
    heartbeat.setCurrentContent(
      contentType === 'video'
        ? videoUrl
        : contentType === 'image'
          ? imageUrl
          : playlistId
    );
  }, [contentType, videoUrl, imageUrl, playlistId, heartbeat]);

  // ---- Leader: periodic state sync ----
  useEffect(() => {
    if (!isLeader) return;
    const interval = setInterval(() => {
      if (contentType === 'video') {
        const videoEl = document.querySelector('video');
        if (videoEl) {
          sendSync('state-update', {
            isPlaying: !videoEl.paused,
            currentTime: videoEl.currentTime,
          });
        }
      } else if (contentType === 'slideshow') {
        sendSync('state-update', { currentIndex });
      }
    }, 5000);
    return () => { clearInterval(interval); };
  }, [isLeader, contentType, sendSync, currentIndex]);

  // ---- Leader: broadcast slide transitions ----
  useEffect(() => {
    if (!isLeader || contentType !== 'slideshow') return;
    sendSync('transition', { currentIndex });
  }, [isLeader, contentType, sendSync, currentIndex]);

  // ---- Follower: apply sync commands ----
  useEffect(() => {
    if (isLeader || !lastSync) return;
    const action = lastSync.action;
    const data = lastSync.data;

    if (contentType === 'video') {
      const videoEl = document.querySelector('video');
      if (!videoEl) return;

      if (action === 'play') {
        try { videoEl.play(); } catch (e) { /* ignore */ }
      } else if (action === 'pause') {
        videoEl.pause();
      } else if (action === 'seek' && typeof data.currentTime === 'number') {
        videoEl.currentTime = data.currentTime;
      } else if (action === 'state-update') {
        if (
          typeof data.currentTime === 'number' &&
          Math.abs(videoEl.currentTime - data.currentTime) > 0.5
        ) {
          videoEl.currentTime = data.currentTime;
        }
        if (typeof data.isPlaying === 'boolean') {
          if (data.isPlaying && videoEl.paused) {
            try { videoEl.play(); } catch (e) { /* ignore */ }
          } else if (!data.isPlaying && !videoEl.paused) {
            videoEl.pause();
          }
        }
      }
      setLastSyncTime(Date.now());
    } else if (contentType === 'slideshow') {
      if (
        (action === 'transition' || action === 'state-update') &&
        typeof data.currentIndex === 'number' &&
        data.currentIndex !== currentIndex
      ) {
        goTo(data.currentIndex);
      }
      setLastSyncTime(Date.now());
    }
  }, [isLeader, lastSync, contentType, currentIndex, goTo]);

  // ---- Styles ----

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor,
    overflow: 'hidden',
  };

  const debugOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    padding: '12px 16px',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    color: '#fff',
    fontSize: '14px',
    fontFamily: 'monospace',
    borderRadius: '4px',
    zIndex: 9999,
    pointerEvents: 'none',
  };

  let syncStatus = 'Not synced';
  if (lastSyncTime > 0) {
    const elapsed = Math.floor((Date.now() - lastSyncTime) / 1000);
    syncStatus = 'Synced ' + elapsed + 's ago';
  }

  // ---- Render ----

  return (
    <div style={containerStyle}>
      {contentType === 'video' && videoUrl && (
        <VideoPlayer
          src={videoUrl}
          muted={false}
          fit={fit}
          backgroundColor={backgroundColor}
          loop
          autoPlay
        />
      )}

      {contentType === 'image' && imageUrl && (
        <ImageSlide
          src={imageUrl}
          fit={fit}
          backgroundColor={backgroundColor}
        />
      )}

      {contentType === 'slideshow' && currentItem && (
        currentItem.type === 'image' ? (
          <TransitionLayer
            contentKey={currentItem.id}
            transition="fade"
            transitionDuration={500}
          >
            <ImageSlide
              src={currentItem.url}
              fit={fit}
              backgroundColor={backgroundColor}
            />
          </TransitionLayer>
        ) : (
          <VideoPlayer
            key={currentItem.id}
            src={currentItem.url}
            muted={false}
            fit={fit}
            backgroundColor={backgroundColor}
            loop={false}
            autoPlay
            onEnded={onItemComplete}
          />
        )
      )}

      {!contentType && (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666',
        }}>
          No content configured
        </div>
      )}

      {debugMode && (
        <div style={debugOverlayStyle}>
          <div>Screen: {screenIndex + 1} / {totalScreens}</div>
          <div>Role: {isLeader ? 'Leader' : 'Follower'}</div>
          <div>Exhibit: {exhibitId}</div>
          <div>Content: {contentType}</div>
          {!isLeader && <div>Sync: {syncStatus}</div>}
        </div>
      )}
    </div>
  );
}
