import React, { useState, useEffect, useCallback } from 'react';
import { useAppShell } from '@/components/core/AppShell';
import { IdleScreen } from '@/components/core/IdleScreen';
import { MediaGallery } from '@/components/interactive/MediaGallery';
import { MediaViewer } from '@/components/interactive/MediaViewer';
import { usePlaylist } from '@/hooks/usePlaylist';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useContentUpdates } from '@/hooks/useContentUpdates';
import type { MediaExplorerConfig } from '@/lib/types';

// ==========================================
// Types
// ==========================================

interface MediaBrowserTemplateProps {
  config: MediaExplorerConfig;
  instanceId: string;
}

// ==========================================
// MediaBrowserTemplate
// ==========================================

function MediaBrowserTemplate(props: MediaBrowserTemplateProps) {
  useAppShell();
  const explorerConfig = props.config;

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // ─── Hooks ────────────────────────────────────────────────────

  const playlist = usePlaylist({
    playlistId: explorerConfig.playlistId,
    defaultDuration: 5,
    shuffle: false,
    loop: false,
    enabled: true,
  });

  const idle = useIdleTimer({
    enabled: true,
    inactivityTimeout: explorerConfig.inactivityTimeout || 30000,
    hasContent: playlist.items.length > 0,
    hasContentError: playlist.error !== null,
  });

  const heartbeat = useHeartbeat({
    deviceId: explorerConfig.deviceId,
    templateType: explorerConfig.templateType,
    instanceId: explorerConfig.instanceId,
    enabled: true,
  });

  useContentUpdates({
    enabled: true,
    onPlaylistUpdated: (playlistId) => {
      if (playlistId === explorerConfig.playlistId) {
        playlist.refresh();
      }
    },
  });

  // ─── Update heartbeat status ──────────────────────────────────

  useEffect(() => {
    if (idle.isIdle) {
      heartbeat.setStatus('idle');
    } else if (playlist.isLoading) {
      heartbeat.setStatus('loading');
    } else if (playlist.error) {
      heartbeat.setStatus('error');
    } else {
      heartbeat.setStatus('playing');
    }
  }, [idle.isIdle, playlist.isLoading, playlist.error]);

  useEffect(() => {
    if (selectedItemId) {
      heartbeat.setCurrentContent(selectedItemId);
    } else {
      heartbeat.setCurrentContent(undefined);
    }
  }, [selectedItemId]);

  // ─── Category filtering ───────────────────────────────────────

  let filteredItems = playlist.items;
  if (selectedCategory) {
    filteredItems = playlist.items.filter((item) => {
      const itemCategory = item.metadata && item.metadata.category;
      return itemCategory === selectedCategory;
    });
  }

  // ─── Selection handlers ───────────────────────────────────────

  const handleItemSelect = useCallback((itemId: string) => {
    setSelectedItemId(itemId);
    idle.resetInactivityTimer();
  }, [idle]);

  const handleViewerClose = useCallback(() => {
    setSelectedItemId(null);
    idle.resetInactivityTimer();
  }, [idle]);

  const handleCategoryChange = useCallback((category: string | null) => {
    setSelectedCategory(category);
    idle.resetInactivityTimer();
  }, [idle]);

  // ─── Error/loading states ─────────────────────────────────────

  if (playlist.error) {
    const errorStyle: React.CSSProperties = {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '18px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    };

    return React.createElement(
      'div',
      { style: errorStyle },
      'Failed to load media gallery'
    );
  }

  if (playlist.isLoading) {
    const loadingStyle: React.CSSProperties = {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '18px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    };

    return React.createElement(
      'div',
      { style: loadingStyle },
      'Loading media...'
    );
  }

  // ─── Main render ──────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: '#000',
    overflow: 'hidden',
  };

  return React.createElement(
    'div',
    { style: containerStyle },
    React.createElement(MediaGallery, {
      items: filteredItems,
      categories: explorerConfig.categories,
      selectedCategory: selectedCategory,
      onItemSelect: handleItemSelect,
      onCategoryChange: handleCategoryChange,
    }),
    selectedItemId && React.createElement(MediaViewer, {
      items: playlist.items,
      selectedItemId: selectedItemId,
      onClose: handleViewerClose,
    }),
    React.createElement(IdleScreen, {
      isIdle: idle.isIdle,
      idle: explorerConfig.idle,
    })
  );
}

export { MediaBrowserTemplate };
export type { MediaBrowserTemplateProps };
