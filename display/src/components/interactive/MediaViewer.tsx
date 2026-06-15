import React, { useState, useRef, useEffect, useCallback } from 'react';
import { VideoPlayer } from '@/components/core/VideoPlayer';
import type { PlaylistItem } from '@/lib/types';

// ==========================================
// Types
// ==========================================

interface MediaViewerProps {
  items: PlaylistItem[];
  selectedItemId: string;
  onClose: () => void;
}

interface TouchState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
}

interface ZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

// ==========================================
// Component
// ==========================================

export function MediaViewer(props: MediaViewerProps) {
  const items = props.items;
  const selectedItemId = props.selectedItemId;
  const onClose = props.onClose;

  const [isVisible, setIsVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoomState, setZoomState] = useState<ZoomState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  const touchStateRef = useRef<TouchState>({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    isDragging: false,
  });

  const pinchStartDistanceRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Find current item ────────────────────────────────────────

  useEffect(() => {
    const idx = items.findIndex((item) => {
      return item.id === selectedItemId;
    });
    if (idx >= 0) {
      setCurrentIndex(idx);
    }
    // Fade in on mount
    requestAnimationFrame(() => {
      setIsVisible(true);
    });
  }, [items, selectedItemId]);

  const currentItem = items[currentIndex];

  // ─── Detect media type ────────────────────────────────────────

  function getMediaType(item: PlaylistItem): 'image' | 'video' | 'pdf' {
    if (item.type === 'video') return 'video';
    if (item.type === 'image') {
      const url = item.url.toLowerCase();
      if (url.endsWith('.pdf')) return 'pdf';
      if (item.metadata && item.metadata.type === 'pdf') return 'pdf';
      return 'image';
    }
    return 'image';
  }

  // ─── Navigation ───────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setZoomState({ scale: 1, translateX: 0, translateY: 0 });
    }
  }, [currentIndex, items.length]);

  const goPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setZoomState({ scale: 1, translateX: 0, translateY: 0 });
    }
  }, [currentIndex]);

  // ─── Touch handling ───────────────────────────────────────────

  const handleTouchStart = useCallback((e: any) => {
    const touches = e.touches;
    if (touches.length === 1) {
      // Single touch - start drag
      touchStateRef.current = {
        startX: touches[0].clientX,
        startY: touches[0].clientY,
        currentX: touches[0].clientX,
        currentY: touches[0].clientY,
        isDragging: true,
      };
    } else if (touches.length === 2) {
      // Two fingers - start pinch
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      pinchStartDistanceRef.current = distance;
    }
  }, []);

  const handleTouchMove = useCallback((e: any) => {
    const touches = e.touches;
    if (touches.length === 1 && touchStateRef.current.isDragging) {
      touchStateRef.current.currentX = touches[0].clientX;
      touchStateRef.current.currentY = touches[0].clientY;
    } else if (touches.length === 2) {
      e.preventDefault();
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const delta = distance - pinchStartDistanceRef.current;
      const scaleDelta = delta / 200;
      const newScale = Math.max(1, Math.min(4, zoomState.scale + scaleDelta));
      setZoomState((prev) => {
        return {
          ...prev,
          scale: newScale,
        };
      });
      pinchStartDistanceRef.current = distance;
    }
  }, [zoomState.scale]);

  const handleTouchEnd = useCallback((e: any) => {
    const state = touchStateRef.current;
    if (state.isDragging && e.touches.length === 0) {
      const deltaX = state.currentX - state.startX;
      const deltaY = state.currentY - state.startY;

      // Horizontal swipe detection (threshold 50px)
      if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 2) {
        if (deltaX > 0) {
          goPrevious();
        } else {
          goNext();
        }
      }

      touchStateRef.current.isDragging = false;
    }
  }, [goNext, goPrevious]);

  // ─── Close handler ────────────────────────────────────────────

  const handleClose = useCallback((e: any) => {
    e.stopPropagation();
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 300);
  }, [onClose]);

  // ─── Render media content ─────────────────────────────────────

  const renderMediaContent = useCallback(() => {
    if (!currentItem) return null;

    const mediaType = getMediaType(currentItem);
    const contentStyle: React.CSSProperties = {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    };

    if (mediaType === 'video') {
      return React.createElement(
        'div',
        { style: contentStyle },
        React.createElement(VideoPlayer, {
          src: currentItem.url,
          muted: false,
          volume: 100,
          fit: 'contain',
          backgroundColor: '#000',
          loop: false,
          autoPlay: true,
        })
      );
    }

    if (mediaType === 'image') {
      const imageWrapperStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
      };

      const imageStyle: React.CSSProperties = {
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        transform: 'scale(' + zoomState.scale + ') translate(' + zoomState.translateX + 'px, ' + zoomState.translateY + 'px)',
        transition: 'transform 150ms ease-out',
        transformOrigin: 'center center',
        userSelect: 'none',
      };

      return React.createElement(
        'div',
        { style: imageWrapperStyle },
        React.createElement('img', {
          src: currentItem.url,
          alt: '',
          style: imageStyle,
          draggable: false,
        })
      );
    }

    if (mediaType === 'pdf') {
      // Simple PDF viewer - show message for now
      const pdfStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      };

      const pdfLinkStyle: React.CSSProperties = {
        color: '#fff',
        textDecoration: 'underline',
        fontSize: '16px',
        cursor: 'pointer',
      };

      return React.createElement(
        'div',
        { style: pdfStyle },
        React.createElement('div', null, 'PDF Document'),
        React.createElement(
          'a',
          {
            href: currentItem.url,
            target: '_blank',
            rel: 'noopener noreferrer',
            style: pdfLinkStyle,
          },
          'Open PDF'
        )
      );
    }

    return null;
  }, [currentItem, zoomState]);

  // ─── Render close button ──────────────────────────────────────

  const renderCloseButton = useCallback(() => {
    const buttonStyle: React.CSSProperties = {
      position: 'absolute',
      top: '32px',
      right: '32px',
      width: '56px',
      height: '56px',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      border: 'none',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      zIndex: 100,
      fontSize: '28px',
      color: '#fff',
      fontWeight: '300',
      userSelect: 'none',
      WebkitTapHighlightColor: 'transparent',
      transform: 'translateZ(0)',
      transition: 'background-color 150ms ease',
    };

    return React.createElement(
      'button',
      {
        style: buttonStyle,
        onTouchStart: handleClose,
        onClick: handleClose,
      },
      '\u00D7'
    );
  }, [handleClose]);

  // ─── Main render ──────────────────────────────────────────────

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: '#000',
    zIndex: 100,
    opacity: isVisible ? 1 : 0,
    transition: 'opacity 300ms ease-in-out',
    transform: 'translateZ(0)',
  };

  const contentContainerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  };

  return React.createElement(
    'div',
    {
      ref: containerRef,
      style: overlayStyle,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    React.createElement(
      'div',
      { style: contentContainerStyle },
      renderMediaContent()
    ),
    renderCloseButton()
  );
}
