import { useRef, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Type, Image as ImageIcon, Film, Images, Clock, Globe, Square } from 'lucide-react';
import { useConfigData, type ConfigPanelProps } from './SharedConfigFields';
import { SearchableContentPicker } from '../SearchableContentPicker';
import type { Content } from '../../lib/types';

// ==========================================
// Local mirror of the display BuilderConfig shape
// ==========================================

type ElementType = 'text' | 'image' | 'video' | 'slideshow' | 'clock' | 'web' | 'shape';

interface BuilderElement {
  type: ElementType;
  // text
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  background?: string;
  // media
  url?: string;
  fit?: 'cover' | 'contain';
  muted?: boolean;
  loop?: boolean;
  // slideshow
  items?: Array<{ url: string; type?: 'image' | 'video'; duration?: number }>;
  defaultDuration?: number;
  // clock
  format?: '12h' | '24h';
  showDate?: boolean;
  showSeconds?: boolean;
  // shape
  radius?: number;
}

interface BuilderRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  element: BuilderElement;
}

interface BuilderBackground {
  color?: string;
  gradient?: string;
  imageUrl?: string;
  fit?: 'cover' | 'contain';
}

const INPUT =
  'h-9 w-full rounded-md border border-surface-300 card-bg px-2 text-sm text-surface-800 placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';
const LABEL = 'block text-xs font-semibold text-surface-500 mb-1';

const ELEMENT_TYPES: Array<{ type: ElementType; label: string; icon: typeof Type }> = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'video', label: 'Video', icon: Film },
  { type: 'slideshow', label: 'Slideshow', icon: Images },
  { type: 'clock', label: 'Clock', icon: Clock },
  { type: 'web', label: 'Web', icon: Globe },
  { type: 'shape', label: 'Shape', icon: Square },
];

function newElement(type: ElementType): BuilderElement {
  switch (type) {
    case 'text':
      return { type, text: 'New text', fontSize: 48, color: '#ffffff', align: 'center', valign: 'middle', fontWeight: 600 };
    case 'image':
      return { type, url: '', fit: 'cover' };
    case 'video':
      return { type, url: '', fit: 'cover', muted: true, loop: true };
    case 'slideshow':
      return { type, items: [], defaultDuration: 8, fit: 'cover' };
    case 'clock':
      return { type, format: '24h', showDate: true, showSeconds: false, fontSize: 80, color: '#ffffff', align: 'center' };
    case 'web':
      return { type, url: '' };
    case 'shape':
      return { type, color: '#3b82f6', radius: 0 };
  }
}

function backgroundCss(bg: BuilderBackground): string {
  return bg.gradient || bg.color || '#000000';
}

// ==========================================
// Preview canvas (click-select + drag-to-move)
// ==========================================

function PreviewCanvas({
  regions,
  background,
  selectedId,
  onSelect,
  onMove,
}: {
  regions: BuilderRegion[];
  background: BuilderBackground;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent, region: BuilderRegion) => {
    e.preventDefault();
    onSelect(region.id);
    dragRef.current = {
      id: region.id,
      startX: e.clientX,
      startY: e.clientY,
      originX: region.x,
      originY: region.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;
    const region = regions.find((r) => r.id === drag.id);
    if (!region) return;
    const nx = Math.max(0, Math.min(100 - region.width, drag.originX + dxPct));
    const ny = Math.max(0, Math.min(100 - region.height, drag.originY + dyPct));
    onMove(drag.id, Math.round(nx * 10) / 10, Math.round(ny * 10) / 10);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const bgStyle: React.CSSProperties = { background: backgroundCss(background) };
  if (background.imageUrl) {
    bgStyle.backgroundImage = `url(${background.imageUrl})`;
    bgStyle.backgroundSize = background.fit || 'cover';
    bgStyle.backgroundPosition = 'center';
    bgStyle.backgroundRepeat = 'no-repeat';
  }

  return (
    <div
      ref={canvasRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative w-full overflow-hidden rounded-lg border border-surface-300 select-none"
      style={{ aspectRatio: '16 / 9', ...bgStyle }}
      onClick={(e) => {
        if (e.target === canvasRef.current) onSelect('');
      }}
    >
      {[...regions]
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
        .map((region) => (
          <div
            key={region.id}
            onPointerDown={(e) => handlePointerDown(e, region)}
            className={`absolute flex items-center justify-center overflow-hidden text-center cursor-move ${
              selectedId === region.id ? 'outline outline-2 outline-primary-500' : 'outline-dashed outline-1 outline-white/30'
            }`}
            style={{
              left: `${region.x}%`,
              top: `${region.y}%`,
              width: `${region.width}%`,
              height: `${region.height}%`,
              zIndex: region.zIndex ?? 0,
            }}
          >
            <PreviewElement element={region.element} />
          </div>
        ))}
      {regions.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
          Add a region to start designing
        </div>
      )}
    </div>
  );
}

function PreviewElement({ element }: { element: BuilderElement }) {
  switch (element.type) {
    case 'text':
      return (
        <span
          style={{
            color: element.color || '#fff',
            fontWeight: element.fontWeight || 400,
            fontSize: 'clamp(8px, 1.4vw, 22px)',
            width: '100%',
            padding: 4,
            textAlign: element.align || 'center',
            whiteSpace: 'pre-wrap',
          }}
        >
          {element.text || 'Text'}
        </span>
      );
    case 'image':
      return element.url ? (
        <img src={element.url} alt="" className="h-full w-full" style={{ objectFit: element.fit || 'cover' }} />
      ) : (
        <Placeholder icon={ImageIcon} label="Image" />
      );
    case 'video':
      return <Placeholder icon={Film} label="Video" />;
    case 'slideshow':
      return <Placeholder icon={Images} label={`Slideshow (${element.items?.length || 0})`} />;
    case 'clock':
      return <Placeholder icon={Clock} label="Clock" />;
    case 'web':
      return <Placeholder icon={Globe} label="Web" />;
    case 'shape':
      return (
        <div
          className="h-full w-full"
          style={{ background: element.color || '#3b82f6', borderRadius: element.radius || 0 }}
        />
      );
    default:
      return null;
  }
}

function Placeholder({ icon: Icon, label }: { icon: typeof Type; label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-black/30 text-white/70">
      <Icon className="h-5 w-5" />
      <span className="text-[10px]">{label}</span>
    </div>
  );
}

// ==========================================
// Region property editor
// ==========================================

function RegionProperties({
  region,
  images,
  videos,
  onChange,
}: {
  region: BuilderRegion;
  images: Content[];
  videos: Content[];
  onChange: (partial: Partial<BuilderRegion>) => void;
}) {
  const el = region.element;
  const setEl = (partial: Partial<BuilderElement>) => onChange({ element: { ...el, ...partial } });

  const num = (label: string, value: number, set: (v: number) => void, opts?: { min?: number; max?: number; step?: number }) => (
    <div>
      <label className={LABEL}>{label}</label>
      <input
        type="number"
        className={INPUT}
        value={value}
        min={opts?.min}
        max={opts?.max}
        step={opts?.step}
        onChange={(e) => set(Number(e.target.value))}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Position & size */}
      <div className="grid grid-cols-4 gap-2">
        {num('X %', region.x, (v) => onChange({ x: v }), { min: 0, max: 100 })}
        {num('Y %', region.y, (v) => onChange({ y: v }), { min: 0, max: 100 })}
        {num('W %', region.width, (v) => onChange({ width: v }), { min: 1, max: 100 })}
        {num('H %', region.height, (v) => onChange({ height: v }), { min: 1, max: 100 })}
      </div>

      {/* Text */}
      {el.type === 'text' && (
        <div className="space-y-3">
          <div>
            <label className={LABEL}>Text</label>
            <textarea
              className={`${INPUT} h-20 py-1.5`}
              value={el.text || ''}
              onChange={(e) => setEl({ text: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {num('Font size', el.fontSize || 48, (v) => setEl({ fontSize: v }), { min: 4 })}
            <div>
              <label className={LABEL}>Weight</label>
              <select className={INPUT} value={el.fontWeight || 400} onChange={(e) => setEl({ fontWeight: Number(e.target.value) })}>
                {[300, 400, 500, 600, 700, 800].map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Color</label>
              <input type="color" className="h-9 w-full rounded-md border border-surface-300" value={el.color || '#ffffff'} onChange={(e) => setEl({ color: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Horizontal align</label>
              <select className={INPUT} value={el.align || 'center'} onChange={(e) => setEl({ align: e.target.value as BuilderElement['align'] })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Vertical align</label>
              <select className={INPUT} value={el.valign || 'middle'} onChange={(e) => setEl({ valign: e.target.value as BuilderElement['valign'] })}>
                <option value="top">Top</option>
                <option value="middle">Middle</option>
                <option value="bottom">Bottom</option>
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Font family (optional)</label>
            <input className={INPUT} value={el.fontFamily || ''} placeholder="e.g. GeneralSans, Inter" onChange={(e) => setEl({ fontFamily: e.target.value })} />
          </div>
        </div>
      )}

      {/* Image */}
      {el.type === 'image' && (
        <div className="space-y-3">
          <div>
            <label className={LABEL}>Image</label>
            <SearchableContentPicker label="" value={el.url || ''} items={images} placeholder="Select image..." onChange={(url) => setEl({ url })} />
          </div>
          <FitSelect value={el.fit || 'cover'} onChange={(fit) => setEl({ fit })} />
        </div>
      )}

      {/* Video */}
      {el.type === 'video' && (
        <div className="space-y-3">
          <div>
            <label className={LABEL}>Video</label>
            <SearchableContentPicker label="" value={el.url || ''} items={videos} placeholder="Select video..." onChange={(url) => setEl({ url })} />
          </div>
          <FitSelect value={el.fit || 'cover'} onChange={(fit) => setEl({ fit })} />
          <div className="flex gap-4">
            <Check label="Muted" checked={el.muted !== false} onChange={(v) => setEl({ muted: v })} />
            <Check label="Loop" checked={el.loop !== false} onChange={(v) => setEl({ loop: v })} />
          </div>
        </div>
      )}

      {/* Slideshow */}
      {el.type === 'slideshow' && (
        <div className="space-y-3">
          <SlideshowItems el={el} images={images} videos={videos} onChange={setEl} />
          <div className="grid grid-cols-2 gap-2">
            {num('Image seconds', el.defaultDuration || 8, (v) => setEl({ defaultDuration: v }), { min: 1 })}
            <FitSelect value={el.fit || 'cover'} onChange={(fit) => setEl({ fit })} />
          </div>
        </div>
      )}

      {/* Clock */}
      {el.type === 'clock' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Format</label>
              <select className={INPUT} value={el.format || '24h'} onChange={(e) => setEl({ format: e.target.value as BuilderElement['format'] })}>
                <option value="24h">24-hour</option>
                <option value="12h">12-hour</option>
              </select>
            </div>
            {num('Font size', el.fontSize || 80, (v) => setEl({ fontSize: v }), { min: 8 })}
          </div>
          <div className="flex gap-4">
            <Check label="Show date" checked={!!el.showDate} onChange={(v) => setEl({ showDate: v })} />
            <Check label="Show seconds" checked={!!el.showSeconds} onChange={(v) => setEl({ showSeconds: v })} />
          </div>
          <div>
            <label className={LABEL}>Color</label>
            <input type="color" className="h-9 w-full rounded-md border border-surface-300" value={el.color || '#ffffff'} onChange={(e) => setEl({ color: e.target.value })} />
          </div>
        </div>
      )}

      {/* Web */}
      {el.type === 'web' && (
        <div>
          <label className={LABEL}>Web page URL</label>
          <input className={INPUT} value={el.url || ''} placeholder="https://example.com" onChange={(e) => setEl({ url: e.target.value })} />
        </div>
      )}

      {/* Shape */}
      {el.type === 'shape' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Color</label>
            <input type="color" className="h-9 w-full rounded-md border border-surface-300" value={el.color || '#3b82f6'} onChange={(e) => setEl({ color: e.target.value })} />
          </div>
          {num('Corner radius', el.radius || 0, (v) => setEl({ radius: v }), { min: 0 })}
        </div>
      )}
    </div>
  );
}

function FitSelect({ value, onChange }: { value: 'cover' | 'contain'; onChange: (v: 'cover' | 'contain') => void }) {
  return (
    <div>
      <label className={LABEL}>Fit</label>
      <select className={INPUT} value={value} onChange={(e) => onChange(e.target.value as 'cover' | 'contain')}>
        <option value="cover">Cover (fill)</option>
        <option value="contain">Contain (letterbox)</option>
      </select>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-surface-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function SlideshowItems({
  el,
  images,
  videos,
  onChange,
}: {
  el: BuilderElement;
  images: Content[];
  videos: Content[];
  onChange: (partial: Partial<BuilderElement>) => void;
}) {
  const items = el.items || [];
  const add = (url: string, type: 'image' | 'video') => {
    if (!url) return;
    onChange({ items: [...items, { url, type }] });
  };
  const remove = (idx: number) => onChange({ items: items.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-2">
      <label className={LABEL}>Slides ({items.length})</label>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((it, idx) => (
            <li key={`${it.url}-${idx}`} className="flex items-center justify-between rounded border border-surface-200 px-2 py-1 text-xs">
              <span className="truncate">{it.type === 'video' ? '🎬' : '🖼'} {it.url.split('/').pop()}</span>
              <button type="button" onClick={() => remove(idx)} className="text-red-500 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <SearchableContentPicker label="" value="" items={images} placeholder="+ Add image..." onChange={(url) => add(url, 'image')} />
      <SearchableContentPicker label="" value="" items={videos} placeholder="+ Add video..." onChange={(url) => add(url, 'video')} />
    </div>
  );
}

// ==========================================
// Main panel
// ==========================================

export function CustomBuilderConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { images, videos } = useConfigData(siteId);
  const regions = (config.regions as BuilderRegion[]) || [];
  const background = (config.background as BuilderBackground) || {};
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const setRegions = (next: BuilderRegion[]) => onChange({ ...config, regions: next });
  const setBackground = (next: BuilderBackground) => onChange({ ...config, background: next });

  const addRegion = (type: ElementType) => {
    const maxZ = regions.reduce((m, r) => Math.max(m, r.zIndex ?? 0), 0);
    const region: BuilderRegion = {
      id: crypto.randomUUID(),
      x: 10,
      y: 10,
      width: type === 'text' || type === 'clock' ? 40 : 30,
      height: type === 'text' || type === 'clock' ? 15 : 30,
      zIndex: maxZ + 1,
      element: newElement(type),
    };
    setRegions([...regions, region]);
    setSelectedId(region.id);
  };

  const updateRegion = (id: string, partial: Partial<BuilderRegion>) =>
    setRegions(regions.map((r) => (r.id === id ? { ...r, ...partial } : r)));

  const deleteRegion = (id: string) => {
    setRegions(regions.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const moveZ = (id: string, dir: 1 | -1) => {
    setRegions(regions.map((r) => (r.id === id ? { ...r, zIndex: (r.zIndex ?? 0) + dir } : r)));
  };

  const selected = regions.find((r) => r.id === selectedId) || null;

  return (
    <div className="space-y-5">
      {/* Background */}
      <div className="admin-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-surface-800">Background</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={LABEL}>Color</label>
            <input type="color" className="h-9 w-full rounded-md border border-surface-300" value={background.color || '#000000'} onChange={(e) => setBackground({ ...background, color: e.target.value, gradient: undefined })} />
          </div>
          <div>
            <label className={LABEL}>CSS gradient (optional)</label>
            <input className={INPUT} value={background.gradient || ''} placeholder="linear-gradient(...)" onChange={(e) => setBackground({ ...background, gradient: e.target.value || undefined })} />
          </div>
          <div>
            <label className={LABEL}>Background image (optional)</label>
            <SearchableContentPicker label="" value={background.imageUrl || ''} items={images} placeholder="Select image..." onChange={(url) => setBackground({ ...background, imageUrl: url || undefined })} />
          </div>
        </div>
      </div>

      {/* Add region toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-surface-400">Add element</span>
        {ELEMENT_TYPES.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => addRegion(type)}
            className="flex items-center gap-1.5 rounded-md border border-surface-300 px-2.5 py-1.5 text-sm text-surface-700 hover:border-primary-400 hover:bg-primary-50"
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Canvas */}
        <div>
          <PreviewCanvas
            regions={regions}
            background={background}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id || null)}
            onMove={(id, x, y) => updateRegion(id, { x, y })}
          />
          <p className="mt-1.5 text-xs text-surface-400">Click an element to select it; drag to reposition. Fine-tune size/position on the right.</p>
        </div>

        {/* Inspector */}
        <div className="admin-card p-4">
          {selected ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold capitalize text-surface-800">{selected.element.type} element</h3>
                <div className="flex items-center gap-1">
                  <button type="button" title="Bring forward" onClick={() => moveZ(selected.id, 1)} className="rounded p-1 text-surface-500 hover:bg-surface-100">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" title="Send backward" onClick={() => moveZ(selected.id, -1)} className="rounded p-1 text-surface-500 hover:bg-surface-100">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button type="button" title="Delete" onClick={() => deleteRegion(selected.id)} className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <RegionProperties
                region={selected}
                images={images}
                videos={videos}
                onChange={(partial) => updateRegion(selected.id, partial)}
              />
            </>
          ) : (
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-center text-sm text-surface-400">
              <Plus className="h-5 w-5" />
              Add an element above, then select it here to edit its content and style.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
