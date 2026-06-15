'use client';

import { useState, useRef, useCallback } from 'react';

interface UseCarouselInteractionOptions {
  carouselTimeout?: number;    // ms before carousel strip auto-hides (default 5000)
  inactivityTimeout?: number;  // ms before auto-play resumes (default 30000)
}

interface UseCarouselInteractionReturn {
  isCarouselVisible: boolean;
  isAutoPlaying: boolean;
  showCarousel: () => void;
  resetCarouselTimer: () => void;
  hideCarousel: () => void;
  setTouchActive: (active: boolean) => void;
}

export function useCarouselInteraction(options?: UseCarouselInteractionOptions): UseCarouselInteractionReturn {
  const carouselTimeout = options?.carouselTimeout || 5000;
  const inactivityTimeout = options?.inactivityTimeout || 30000;

  const [isCarouselVisible, setIsCarouselVisible] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const carouselTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchActiveRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (carouselTimerRef.current) {
      clearTimeout(carouselTimerRef.current);
      carouselTimerRef.current = null;
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const startInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      setIsAutoPlaying(true);
      inactivityTimerRef.current = null;
    }, inactivityTimeout);
  }, [inactivityTimeout]);

  const startCarouselTimer = useCallback(() => {
    if (carouselTimerRef.current) {
      clearTimeout(carouselTimerRef.current);
    }
    carouselTimerRef.current = setTimeout(() => {
      // Don't hide while user is still touching the carousel
      if (touchActiveRef.current) {
        // Retry after another full timeout period
        startCarouselTimer();
        return;
      }
      setIsCarouselVisible(false);
      carouselTimerRef.current = null;
      // Carousel hidden — start inactivity timer for auto-play resume
      startInactivityTimer();
    }, carouselTimeout);
  }, [carouselTimeout, startInactivityTimer]);

  const showCarousel = useCallback(() => {
    clearTimers();
    setIsCarouselVisible(true);
    setIsAutoPlaying(false);
    startCarouselTimer();
  }, [clearTimers, startCarouselTimer]);

  const resetCarouselTimer = useCallback(() => {
    startCarouselTimer();
  }, [startCarouselTimer]);

  const hideCarousel = useCallback(() => {
    clearTimers();
    setIsCarouselVisible(false);
    startInactivityTimer();
  }, [clearTimers, startInactivityTimer]);

  const setTouchActive = useCallback((active: boolean) => {
    touchActiveRef.current = active;
    if (!active) {
      // Finger lifted — restart the hide timer from now
      startCarouselTimer();
    }
  }, [startCarouselTimer]);

  return {
    isCarouselVisible,
    isAutoPlaying,
    showCarousel,
    resetCarouselTimer,
    hideCarousel,
    setTouchActive,
  };
}
