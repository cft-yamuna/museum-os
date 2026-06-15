import React from 'react';
import type { MapHotspot } from '@/lib/types';

interface InteractiveMapProps {
  mapImageUrl: string;
  hotspots: MapHotspot[];
  onInteraction: () => void;
}

interface TouchState {
  scale: number;
  translateX: number;
  translateY: number;
  startDistance: number;
  startScale: number;
  startX: number;
  startY: number;
  lastTapTime: number;
}

export function InteractiveMap({
  mapImageUrl,
  hotspots,
  onInteraction,
}: InteractiveMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [touchState, setTouchState] = React.useState<TouchState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
    startDistance: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    lastTapTime: 0,
  });
  const [selectedHotspot, setSelectedHotspot] = React.useState<MapHotspot | null>(
    null
  );

  const getDistance = React.useCallback((
    touches: React.TouchList
  ): number => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },
  []);

  const handleTouchStart = React.useCallback(
    (e: React.TouchEvent) => {
      onInteraction();

      if (e.touches.length === 2) {
        // Pinch zoom start
        const distance = getDistance(e.touches);
        setTouchState((prev) => {
          return {
            ...prev,
            startDistance: distance,
            startScale: prev.scale,
          };
        });
      } else if (e.touches.length === 1) {
        // Pan or tap start
        const now = Date.now();
        const timeSinceLastTap = now - touchState.lastTapTime;

        if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
          // Double tap detected
          setTouchState((prev) => {
            const newScale = prev.scale === 1 ? 2 : 1;
            return {
              ...prev,
              scale: newScale,
              translateX: newScale === 1 ? 0 : prev.translateX,
              translateY: newScale === 1 ? 0 : prev.translateY,
              lastTapTime: 0,
            };
          });
        } else {
          setTouchState((prev) => {
            return {
              ...prev,
              startX: e.touches[0].clientX - prev.translateX,
              startY: e.touches[0].clientY - prev.translateY,
              lastTapTime: now,
            };
          });
        }
      }
    },
    [onInteraction, getDistance, touchState.lastTapTime]
  );

  const handleTouchMove = React.useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      onInteraction();

      if (e.touches.length === 2) {
        // Pinch zoom
        const distance = getDistance(e.touches);
        let scale = (distance / touchState.startDistance) * touchState.startScale;
        scale = Math.max(1, Math.min(3, scale));

        setTouchState((prev) => {
          return { ...prev, scale: scale };
        });
      } else if (e.touches.length === 1 && touchState.scale > 1) {
        // Pan
        let newX = e.touches[0].clientX - touchState.startX;
        let newY = e.touches[0].clientY - touchState.startY;

        // Constrain panning to prevent over-scroll
        if (containerRef.current) {
          const bounds = containerRef.current.getBoundingClientRect();
          const maxX = (bounds.width * (touchState.scale - 1)) / 2;
          const maxY = (bounds.height * (touchState.scale - 1)) / 2;

          newX = Math.max(-maxX, Math.min(maxX, newX));
          newY = Math.max(-maxY, Math.min(maxY, newY));
        }

        setTouchState((prev) => {
          return { ...prev, translateX: newX, translateY: newY };
        });
      }
    },
    [onInteraction, getDistance, touchState]
  );

  const handleTouchEnd = React.useCallback(
    (e: React.TouchEvent) => {
      onInteraction();

      if (e.touches.length === 0) {
        setTouchState((prev) => {
          return {
            ...prev,
            startDistance: 0,
            startX: 0,
            startY: 0,
          };
        });
      }
    },
    [onInteraction]
  );

  const handleHotspotClick = React.useCallback(
    (hotspot: MapHotspot) => {
      return () => {
        onInteraction();
        setSelectedHotspot(hotspot);
      };
    },
    [onInteraction]
  );

  const handleCloseDetail = React.useCallback(
    () => {
      onInteraction();
      setSelectedHotspot(null);
    },
    [onInteraction]
  );

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    touchAction: 'none',
    backgroundColor: '#000',
  };

  const mapWrapperStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    transform:
      'translate(' +
      touchState.translateX +
      'px, ' +
      touchState.translateY +
      'px) scale(' +
      touchState.scale +
      ') translateZ(0)',
    transition: touchState.startDistance === 0 ? 'transform 0.3s ease-out' : 'none',
  };

  const mapImageStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    pointerEvents: 'none',
  };

  const detailPanelStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: selectedHotspot ? 0 : '-100%',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    color: '#fff',
    padding: '32px',
    transition: 'bottom 0.4s ease-out',
    maxHeight: '40%',
    overflowY: 'auto',
    zIndex: 1000,
    transform: 'translateZ(0)',
  };

  const closeButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '16px',
    right: '16px',
    width: '56px',
    height: '56px',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    borderRadius: '50%',
    color: '#fff',
    fontSize: '28px',
    fontWeight: '300',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: 'translateZ(0)',
    transition: 'background-color 150ms ease',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '16px',
    paddingRight: '50px',
  };

  const descriptionStyle: React.CSSProperties = {
    fontSize: '18px',
    lineHeight: '1.6',
  };

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div style={mapWrapperStyle}>
        <img src={mapImageUrl} alt="Navigation Map" style={mapImageStyle} />

        {hotspots.map((hotspot) => {
          const isYouAreHere = hotspot.id === 'you-are-here';
          const hotspotStyle: React.CSSProperties = {
            position: 'absolute',
            left: hotspot.x + '%',
            top: hotspot.y + '%',
            width: hotspot.width + '%',
            height: hotspot.height + '%',
            backgroundColor: isYouAreHere
              ? 'transparent'
              : 'rgba(255, 200, 50, 0.3)',
            border: isYouAreHere ? 'none' : '2px solid rgba(255, 200, 50, 0.6)',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 'bold',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
            transition: 'background-color 0.2s',
            transform: 'translateZ(0)',
            pointerEvents: 'auto',
          };

          const markerStyle: React.CSSProperties = {
            width: '20px',
            height: '20px',
            backgroundColor: '#ff0000',
            borderRadius: '50%',
            animation: 'pulse 2s infinite',
            boxShadow: '0 0 0 0 rgba(255, 0, 0, 0.7)',
          };

          if (isYouAreHere) {
            return (
              <div key={hotspot.id} style={hotspotStyle}>
                <div style={markerStyle} />
                <style>
                  {
                    '@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7); } 50% { box-shadow: 0 0 0 15px rgba(255, 0, 0, 0); } }'
                  }
                </style>
              </div>
            );
          }

          return (
            <div
              key={hotspot.id}
              style={hotspotStyle}
              onClick={handleHotspotClick(hotspot)}
            >
              {hotspot.label}
            </div>
          );
        })}
      </div>

      <div style={detailPanelStyle}>
        {selectedHotspot && (
          <div>
            <button
              style={closeButtonStyle}
              onClick={handleCloseDetail}
              aria-label="Close"
            >
              ×
            </button>
            <div style={titleStyle}>{selectedHotspot.label}</div>
            {selectedHotspot.description && (
              <div style={descriptionStyle}>{selectedHotspot.description}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
