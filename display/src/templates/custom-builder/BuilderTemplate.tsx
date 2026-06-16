import { useCallback, useEffect, useState } from 'react';
import { useAppShell } from '@/components/core/AppShell';
import type {
  BuilderConfig,
  BuilderElement,
  BuilderRegion,
  BuilderClockElement,
  BuilderSlideshowElement,
} from '@/lib/types';

type ReportPlay = (info: Record<string, unknown>) => void;

// ==========================================
// Types
// ==========================================

interface BuilderTemplateProps {
  config: BuilderConfig;
  instanceId: string;
}

// Design reference height — element font sizes are authored at this scale and
// rendered in vh so they scale to any resolution.
const DESIGN_HEIGHT = 1080;

function vh(px: number): string {
  return `${(px / DESIGN_HEIGHT) * 100}vh`;
}

// ==========================================
// Element renderers
// ==========================================

function Clock({ element }: { element: BuilderClockElement }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours24 = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const is12 = element.format !== '24h';
  const hours = is12 ? ((hours24 % 12) || 12) : String(hours24).padStart(2, '0');
  const suffix = is12 ? (hours24 < 12 ? ' AM' : ' PM') : '';
  const time = `${hours}:${minutes}${element.showSeconds ? `:${seconds}` : ''}${suffix}`;
  const date = element.showDate
    ? now.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems:
          element.align === 'left' ? 'flex-start' : element.align === 'right' ? 'flex-end' : 'center',
        color: element.color || '#fff',
        fontFamily: element.fontFamily || 'inherit',
        fontSize: vh(element.fontSize || 72),
        lineHeight: 1.1,
      }}
    >
      <div>{time}</div>
      {date && <div style={{ fontSize: '0.4em', opacity: 0.85 }}>{date}</div>}
    </div>
  );
}

function RegionSlideshow({ element, reportPlay }: { element: BuilderSlideshowElement; reportPlay?: ReportPlay }) {
  const items = element.items || [];
  const [index, setIndex] = useState(0);
  const count = items.length;
  const item = count > 0 ? items[index % count] : undefined;
  const isVideo = item?.type === 'video' || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(item?.url || '');
  const fit = element.fit || 'cover';

  useEffect(() => {
    if (!item || isVideo || count <= 1) return;
    const seconds = item.duration && item.duration > 0 ? item.duration : element.defaultDuration || 8;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), seconds * 1000);
    return () => clearTimeout(timer);
  }, [index, item, isVideo, count, element.defaultDuration]);

  // Proof-of-play: report each slide as it becomes visible.
  useEffect(() => {
    if (!item || !reportPlay) return;
    reportPlay({ source: 'slideshow', contentUrl: item.url, title: item.url.split('/').pop() });
  }, [item, reportPlay]);

  const advance = () => setIndex((i) => (count > 0 ? (i + 1) % count : 0));

  if (!item) return null;
  const mediaStyle: React.CSSProperties = { width: '100%', height: '100%', objectFit: fit };

  return isVideo ? (
    <video
      key={item.url}
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
    <img key={item.url} src={item.url} alt="" onError={advance} style={mediaStyle} />
  );
}

function ElementView({ element, reportPlay }: { element: BuilderElement; reportPlay?: ReportPlay }) {
  switch (element.type) {
    case 'text': {
      const justify =
        element.align === 'left' ? 'flex-start' : element.align === 'right' ? 'flex-end' : 'center';
      const alignItems =
        element.valign === 'top' ? 'flex-start' : element.valign === 'bottom' ? 'flex-end' : 'center';
      const textAlign = element.align || 'center';
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: justify,
            alignItems,
            textAlign,
            background: element.background || 'transparent',
            color: element.color || '#fff',
            fontFamily: element.fontFamily || 'inherit',
            fontSize: vh(element.fontSize || 48),
            fontWeight: element.fontWeight || 400,
            lineHeight: element.lineHeight || 1.2,
            padding: element.padding ? vh(element.padding) : undefined,
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
          }}
        >
          {element.text}
        </div>
      );
    }
    case 'image':
      return (
        <img
          src={element.url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: element.fit || 'cover' }}
        />
      );
    case 'video':
      return (
        <video
          src={element.url}
          autoPlay
          muted={element.muted !== false}
          loop={element.loop !== false}
          playsInline
          style={{ width: '100%', height: '100%', objectFit: element.fit || 'cover' }}
        />
      );
    case 'slideshow':
      return <RegionSlideshow element={element} reportPlay={reportPlay} />;
    case 'clock':
      return <Clock element={element} />;
    case 'web':
      return (
        <iframe
          src={element.url}
          title="web"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      );
    case 'shape':
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: element.color || '#ffffff',
            borderRadius: element.radius ? vh(element.radius) : undefined,
          }}
        />
      );
    default:
      return null;
  }
}

function Region({ region, reportPlay }: { region: BuilderRegion; reportPlay?: ReportPlay }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${region.x}%`,
        top: `${region.y}%`,
        width: `${region.width}%`,
        height: `${region.height}%`,
        zIndex: region.zIndex ?? 0,
        overflow: 'hidden',
      }}
    >
      <ElementView element={region.element} reportPlay={reportPlay} />
    </div>
  );
}

// ==========================================
// BuilderTemplate
// ==========================================

function BuilderTemplate({ config }: BuilderTemplateProps) {
  const { send } = useAppShell();
  const reportPlay = useCallback<ReportPlay>(
    (info) => send('display:play', { templateType: 'custom-builder', ...info }),
    [send]
  );

  const bg = config.background || {};
  const background =
    bg.gradient || bg.color || (bg.imageUrl ? undefined : '#000');

  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    background,
  };
  if (bg.imageUrl) {
    style.backgroundImage = `url(${bg.imageUrl})`;
    style.backgroundSize = bg.fit || 'cover';
    style.backgroundPosition = 'center';
    style.backgroundRepeat = 'no-repeat';
  }

  const regions = [...(config.regions || [])].sort(
    (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
  );

  return (
    <div style={style}>
      {regions.map((region) => (
        <Region key={region.id} region={region} reportPlay={reportPlay} />
      ))}
    </div>
  );
}

export { BuilderTemplate };
export type { BuilderTemplateProps };
