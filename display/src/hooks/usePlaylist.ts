'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Playlist, PlaylistItem } from '@/lib/types';
import { getPlaylist } from '@/lib/api';

interface UsePlaylistOptions {
  playlistId: string;
  defaultDuration: number; // seconds, for images
  shuffle: boolean;
  loop: boolean;
  enabled?: boolean;
  autoAdvance?: boolean; // default true — set false to pause auto-advance timer
}

interface UsePlaylistReturn {
  items: PlaylistItem[];
  currentItem: PlaylistItem | null;
  currentIndex: number;
  nextItem: PlaylistItem | null;
  isLoading: boolean;
  error: Error | null;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
  refresh: () => Promise<void>;
  /** Call this when the current item finishes (video ended or image duration elapsed) */
  onItemComplete: () => void;
}

export function usePlaylist(options: UsePlaylistOptions): UsePlaylistReturn {
  const { playlistId, defaultDuration, shuffle, loop, autoAdvance: autoAdvanceOpt } = options;
  const enabled = options.enabled ?? true;

  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const fetchSeqRef = useRef(0);

  // Fisher-Yates shuffle for proper randomization
  const shuffleArray = (arr: PlaylistItem[]): PlaylistItem[] => {
    const shuffled = arr.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }
    return shuffled;
  };

  // Fetch playlist from API
  const fetchPlaylist = useCallback(async () => {
    if (!playlistId || !enabled) return;

    fetchSeqRef.current = fetchSeqRef.current + 1;
    const seq = fetchSeqRef.current;

    setIsLoading(true);
    setError(null);

    try {
      const playlist: Playlist = await getPlaylist(playlistId);
      if (!mountedRef.current) return;
      // Discard stale response if playlist ID changed during fetch
      if (seq !== fetchSeqRef.current) return;

      let playlistItems = playlist.items || [];
      if (shuffle) {
        playlistItems = shuffleArray(playlistItems);
      }
      setItems(playlistItems);
      setIsLoading(false);
    } catch (err) {
      if (!mountedRef.current) return;
      // Discard stale error if playlist ID changed during fetch
      if (seq !== fetchSeqRef.current) return;
      setError(err instanceof Error ? err : new Error('Failed to fetch playlist'));
      setIsLoading(false);
    }
  }, [playlistId, shuffle, enabled]);

  // Initial fetch and cleanup
  useEffect(() => {
    mountedRef.current = true;
    fetchPlaylist();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchPlaylist]);

  // Navigate to next item
  const next = useCallback(() => {
    setCurrentIndex((prev) => {
      if (items.length === 0) return 0;
      const nextIdx = prev + 1;
      if (nextIdx >= items.length) {
        if (loop) return 0;
        return prev; // Stay on last item
      }
      return nextIdx;
    });
  }, [items.length, loop]);

  // Navigate to previous item
  const previous = useCallback(() => {
    setCurrentIndex((prev) => {
      if (items.length === 0) return 0;
      const prevIdx = prev - 1;
      if (prevIdx < 0) {
        if (loop) return items.length - 1;
        return 0;
      }
      return prevIdx;
    });
  }, [items.length, loop]);

  // Go to specific index
  const goTo = useCallback((index: number) => {
    if (index >= 0 && index < items.length) {
      setCurrentIndex(index);
    }
  }, [items.length]);

  // Called when current item finishes (video ended or image timer)
  const onItemComplete = useCallback(() => {
    next();
  }, [next]);

  // Derive current item
  const currentItem: PlaylistItem | null = items.length > 0
    ? (items[currentIndex] || null)
    : null;

  // Auto-advance timer for images
  const autoAdvance = autoAdvanceOpt ?? true;
  useEffect(() => {
    if (autoAdvance === false) return;
    if (!currentItem) return;
    if (currentItem.type !== 'image') return;

    // Clear any existing timer
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
    }

    const duration = (currentItem.duration || defaultDuration) * 1000;
    autoAdvanceTimerRef.current = setTimeout(() => {
      onItemComplete();
    }, duration);

    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [autoAdvance, currentItem, currentIndex, defaultDuration, onItemComplete]);

  // Preload next 2 items
  useEffect(() => {
    if (items.length === 0) return;

    const indicesToPreload: number[] = [];
    for (let i = 1; i <= 2; i++) {
      const idx = currentIndex + i;
      if (idx < items.length) {
        indicesToPreload.push(idx);
      } else if (loop) {
        indicesToPreload.push(idx % items.length);
      }
    }

    indicesToPreload.forEach((idx) => {
      const item = items[idx];
      if (!item) return;

      if (item.type === 'image') {
        const img = new Image();
        img.src = item.url;
      }
      // For videos, we rely on the browser's preload when the element is created
    });
  }, [currentIndex, items, loop]);

  // Refresh playlist (for WebSocket playlist:updated events)
  // Preserves current position by matching item ID in the new list
  const refresh = useCallback(async () => {
    const currentId = currentItem?.id ?? null;
    await fetchPlaylist();
    // Try to find the same item in the new playlist
    if (currentId) {
      setItems((latestItems) => {
        const newIndex = latestItems.findIndex((item) => item.id === currentId);
        if (newIndex >= 0) {
          setCurrentIndex(newIndex);
        }
        return latestItems;
      });
    }
  }, [fetchPlaylist, currentItem]);

  // Derive next item
  const nextItem: PlaylistItem | null = items.length > 0
    ? (items[currentIndex + 1] || (loop ? items[0] : null))
    : null;

  return {
    items,
    currentItem,
    currentIndex,
    nextItem,
    isLoading,
    error,
    next,
    previous,
    goTo,
    refresh,
    onItemComplete,
  };
}
