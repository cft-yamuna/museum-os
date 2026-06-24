import { useEffect, useRef, useState } from 'react';
import type { FallbackContent } from '@/lib/types';

const DEFAULT_IMAGE_DURATION_SEC = 8;

export interface FallbackActiveInfo {
  reason: 'no-app' | 'media-error';
  playlistId: string;
  itemCount: number;
}

interface FallbackPlaylistProps {
  content: FallbackContent;
  reason: 'no-app' | 'media-error';
  /** Called once when the fallback becomes visible (for reporting/alerting). */
  onActive?: (info: FallbackActiveInfo) => void;
}

/**
 * A passive, self-contained playlist loop used as fallback content when a device
 * has no assigned app or its assigned media failed to load. Loops images (timed)
 * and videos (played through); a broken item simply advances so the loop never
 * sticks on a blank frame.
 */
export function FallbackPlaylist({ content, reason, onActive }: FallbackPlaylistProps) {
  const items = content.items;
  const [index, setIndex] = useState(0);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    onActive?.({ reason, playlistId: content.playlistId, itemCount: items.length });
  }, [content.playlistId, items.length, onActive, reason]);

  const count = items.length;
  const item = count > 0 ? items[index % count] : undefined;
  const isVideo = item?.type === 'video';

  // Images advance on a timer; videos advance when they end.
  useEffect(() => {
    if (!item || isVideo || count <= 1) return;
    const seconds =
      item.duration && item.duration > 0 ? item.duration : DEFAULT_IMAGE_DURATION_SEC;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), seconds * 1000);
    return () => clearTimeout(timer);
  }, [index, item, isVideo, count]);

  const advance = () => setIndex((i) => (count > 0 ? (i + 1) % count : 0));

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: '#000',
    overflow: 'hidden',
  };
  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  if (!item) {
    return <div style={containerStyle} />;
  }

  return (
    <div style={containerStyle}>
      {isVideo ? (
        <video
          key={item.id}
          src={item.url}
          autoPlay
          muted
          playsInline
          loop={count === 1}
          onEnded={advance}
          onError={advance}
          style={mediaStyle}
        />
      ) : (
        <img key={item.id} src={item.url} alt="" onError={advance} style={mediaStyle} />
      )}
    </div>
  );
}
