import { useMemo } from 'react';
import type { PlaylistItem } from '@/lib/types';

interface CarouselStripProps {
  items: PlaylistItem[];
  currentIndex: number;
  isVisible: boolean;
  thumbSize?: number; // px, default 80
  onThumbnailTap: (index: number) => void;
  onInteraction: () => void;
  onTouchActiveChange?: (active: boolean) => void;
}

function CarouselStrip(props: CarouselStripProps) {
  const items = props.items;
  const currentIndex = props.currentIndex;
  const isVisible = props.isVisible;
  const thumbSize = props.thumbSize || 80;
  const onThumbnailTap = props.onThumbnailTap;
  const onInteraction = props.onInteraction;
  void props.onTouchActiveChange;

  const railInsetX = 18;
  const thumbGap = 2;
  const thumbOuterWidth = thumbSize + 44;
  const thumbOuterHeight = Math.max(40, thumbSize - 12);
  const visibleThumbWidth = Math.max(24, thumbOuterWidth - 6);
  const visibleThumbHeight = Math.max(22, thumbOuterHeight - 4);
  const listHeight = useMemo(() => {
    if (items.length === 0) return 0;
    return items.length * thumbOuterHeight + (items.length - 1) * thumbGap;
  }, [items.length, thumbOuterHeight]);

  const railWidth = thumbOuterWidth + railInsetX * 2 + 30;
  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: railWidth,
    zIndex: 100,
    transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 300ms ease-in-out',
    willChange: 'transform',
    backgroundColor: '#fff',
    touchAction: 'none',
  };

  const contentWrapStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: railInsetX,
    paddingRight: railInsetX,
    gap: 18,
  };

  const progressBarContainerStyle: React.CSSProperties = {
    width: 4,
    backgroundColor: '#000',
    height: listHeight,
    clipPath: 'polygon(50% 0%, 84% 10%, 84% 90%, 50% 100%, 16% 90%, 16% 10%)',
  };

  const scrollContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: thumbGap,
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={containerStyle}>
      <div style={contentWrapStyle}>
        <div style={progressBarContainerStyle} />
        <div style={scrollContainerStyle}>
        {items.map((item, i) => {
          const isActive = i === currentIndex;

          const thumbStyle: React.CSSProperties = {
            flexShrink: 0,
            width: thumbOuterWidth,
            height: thumbOuterHeight,
            borderRadius: 6,
            overflow: 'hidden',
            border: isActive ? '2px solid #000' : '2px solid transparent',
            cursor: 'pointer',
            opacity: isActive ? 1 : 0.92,
            transition: 'border-color 200ms, opacity 200ms',
            position: 'relative',
            transform: 'translateZ(0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          };

          const mediaFrameStyle: React.CSSProperties = {
            width: visibleThumbWidth,
            height: visibleThumbHeight,
            borderRadius: 6,
            overflow: 'hidden',
            backgroundColor: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          };

          return (
            <div
              key={item.id + '-' + i}
              style={thumbStyle}
              onPointerDown={() => {
                onThumbnailTap(i);
                onInteraction();
              }}
            >
              <div style={mediaFrameStyle}>
                {item.type === 'video' ? (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      style={{ opacity: 0.8 }}
                    >
                      <path d="M8 5v14l11-7z" fill="#000" />
                    </svg>
                  </div>
                ) : (
                  <img
                    src={item.url}
                    loading="lazy"
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      pointerEvents: 'none',
                    }}
                    alt=""
                  />
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

export { CarouselStrip };
export type { CarouselStripProps };
