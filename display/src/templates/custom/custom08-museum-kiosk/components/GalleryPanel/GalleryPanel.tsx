import { useEffect, useState } from 'react';
import type { GalleryId } from '../../types';
import { galleriesById } from '../../data/galleries';
import { galleryCardPositions } from '../../data/mapViewports';
import './GalleryPanel.css';

const PEOPLE_GARDEN_ANCHOR_POI_ID = 'poi-1774375697109';
const PEOPLE_GARDEN_CARD_OFFSET_X = 28;
const PEOPLE_GARDEN_CARD_OFFSET_Y = 136;

interface GalleryPanelProps {
  readonly galleryId: GalleryId | null;
  readonly visible: boolean;
}

export function GalleryPanel({ galleryId, visible }: GalleryPanelProps) {
  const [anchoredStyle, setAnchoredStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    if (!visible || galleryId !== 'people-garden') {
      setAnchoredStyle(null);
      return;
    }

    let rafId = 0;
    let timeoutId = 0;

    function updateAnchoredStyle() {
      const appEl = document.querySelector('.custom08-museum-kiosk .app');
      const anchorEl = document.querySelector(`[data-poi-card-id="${PEOPLE_GARDEN_ANCHOR_POI_ID}"]`);
      if (!(appEl instanceof HTMLElement) || !(anchorEl instanceof HTMLElement)) return;

      const appRect = appEl.getBoundingClientRect();
      const anchorRect = anchorEl.getBoundingClientRect();

      setAnchoredStyle({
        left: `${anchorRect.right - appRect.left + PEOPLE_GARDEN_CARD_OFFSET_X}px`,
        top: `${anchorRect.top - appRect.top + PEOPLE_GARDEN_CARD_OFFSET_Y}px`,
      });
    }

    updateAnchoredStyle();
    rafId = window.requestAnimationFrame(updateAnchoredStyle);
    timeoutId = window.setTimeout(updateAnchoredStyle, 180);
    window.addEventListener('resize', updateAnchoredStyle);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      window.removeEventListener('resize', updateAnchoredStyle);
    };
  }, [galleryId, visible]);

  if (!visible || !galleryId) return null;

  const gallery = galleriesById[galleryId];
  if (!gallery) return null;

  const position = galleryCardPositions[galleryId] || { top: '50%', left: '48px' };
  const positionStyle = anchoredStyle || {
    top: position.top,
    left: position.left,
  };

  return (
    <div
      className="gallery-card"
      style={{
        '--gallery-color': gallery.cardColor,
        ...positionStyle,
      } as React.CSSProperties}
    >
      <svg className="gallery-card__star" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="var(--gallery-color, #999)" />
        <polygon
          fill="#fffdfd"
          points="10 4.4 11.72 8.74 16.32 9.04 12.8 12.05 13.96 16.59 9.97 14.09 6 16.59 7.14 12.04 3.64 9.04 8.24 8.74 10 4.4"
        />
      </svg>
      <h2 className="gallery-card__title">{gallery.name}</h2>
      <p className="gallery-card__desc">{gallery.description}</p>
    </div>
  );
}
