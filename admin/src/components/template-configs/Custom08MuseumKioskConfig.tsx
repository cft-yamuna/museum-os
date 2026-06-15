import { useEffect, useMemo, useState } from 'react';
import {
  useFieldHelpers, IdleScreenToggle, useConfigData, ContentPicker,
  ConfigSection, ConfigPageLayout, type ConfigPanelProps, type SectionDef,
  LABEL_CLS, INPUT_CLS,
} from './SharedConfigFields';

interface PoiImageOption {
  id: string;
  galleryId: string;
  title: string;
  defaultImageUrl: string;
}

function buildPreviewCandidates(url: string): string[] {
  const base = (url || '').trim();
  if (!base) return [];
  const candidates = [
    base,
    base.replace(/^\/display\//, '/'),
    base.replace(/^\/display\/templates\//, '/templates/'),
  ].filter((candidate) => candidate.length > 0);
  return Array.from(new Set(candidates));
}

function PoiImagePreview({ src, alt }: { src: string; alt: string }) {
  const candidates = useMemo(() => {
    return buildPreviewCandidates(src);
  }, [src]);
  const previewSrcTuple = useState(candidates[0] || '');
  const previewSrc = previewSrcTuple[0];
  const setPreviewSrc = previewSrcTuple[1];
  const failedTuple = useState(false);
  const failed = failedTuple[0];
  const setFailed = failedTuple[1];

  useEffect(() => {
    setPreviewSrc(candidates[0] || '');
    setFailed(false);
  }, [candidates, setPreviewSrc, setFailed]);

  const handleError = () => {
    const currentIndex = candidates.indexOf(previewSrc);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= 0 && nextIndex < candidates.length) {
      setPreviewSrc(candidates[nextIndex]);
      return;
    }
    setFailed(true);
  };

  if (!previewSrc || failed) {
    return (
      <div className="w-full h-[118px] rounded-md border border-surface-200 card-bg flex items-center justify-center text-[11px] text-surface-500 px-2 text-center">
        Preview unavailable
      </div>
    );
  }

  return (
    <img
      src={previewSrc}
      alt={alt}
      className="w-full h-[118px] rounded-md object-cover card-bg border border-surface-200"
      loading="lazy"
      onError={handleError}
    />
  );
}

const POI_IMAGE_OPTIONS: PoiImageOption[] = [
  { id: 'poi-1772036034252', galleryId: 'prologue', title: 'The Right Fit', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.32.11_PM.jpg' },
  { id: 'poi-1772181330319', galleryId: 'prologue', title: 'NATION BUILDING: KHADI WALL', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-05_at_7.23.12_PM.png' },
  { id: 'poi-1772181400936', galleryId: 'hilight-experience', title: 'SPIRIT OF MUSEUM OS PILLARS', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.32.36_PM.jpg' },
  { id: 'poi-1772430171886', galleryId: 'factory-experience', title: 'FLIP WALL', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.33.15_PM.jpg' },
  { id: 'poi-1772430200870', galleryId: 'consumer-care', title: 'SANTOOR STORY', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.33.27_PM.jpg' },
  { id: 'poi-1772430204779', galleryId: 'consumer-care', title: 'YARDLEY', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.33.34_PM.jpg' },
  { id: 'poi-1772430251324', galleryId: 'wintrol', title: 'HYDRAULIC RM', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.33.42_PM.jpg' },
  { id: 'poi-1772430280146', galleryId: 'wintrol', title: 'INDUSTRIAL AUTOMATION', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.33.50_PM.jpg' },
  { id: 'poi-1772430333021', galleryId: 'it-story', title: 'CHRONICLES OF INNOVATION', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.33.58_PM.jpg' },
  { id: 'poi-1772430370010', galleryId: 'it-story', title: 'WIPOD CAR', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.34.04_PM.jpg' },
  { id: 'poi-1772430398314', galleryId: 'it-story', title: 'WEDA ROBOT DISPLAY', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.34.11_PM.jpg' },
  { id: 'poi-1772430401054', galleryId: 'it-story', title: 'MUSEUM OS BRAND REFRESH', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.34.20_PM.jpg' },
  { id: 'poi-1772718082274', galleryId: 'prologue', title: 'Dr. GUBANOO PREMJI', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.31.58_PM.jpg' },
  { id: 'poi-1774375663657', galleryId: 'people-garden', title: 'New POI', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.32.59_PM.jpg' },
  { id: 'poi-1774375697109', galleryId: 'people-garden', title: 'New POI', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.32.48_PM.jpg' },
  { id: 'poi-1774375871086', galleryId: 'spirit-of-hilight', title: 'New POI', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.34.57_PM.jpg' },
  { id: 'poi-1774375878010', galleryId: 'spirit-of-hilight', title: 'New POI', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.35.03_PM.jpg' },
  { id: 'poi-1774376005681', galleryId: 'foundation', title: 'New POI', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.35.16_PM.jpg' },
  { id: 'poi-1774376010227', galleryId: 'foundation', title: 'New POI', defaultImageUrl: '/display/templates/custom08/images/highlights/Screenshot_2026-03-24_at_11.35.23_PM.jpg' },
];

const SECTIONS: SectionDef[] = [
  { id: 'settings', title: 'Settings', color: '#059669' },
  { id: 'poi-images', title: 'POI Images', color: '#0d9488' },
  { id: 'idle', title: 'Idle Screen', color: '#0891b2' },
];

export function Custom08MuseumKioskConfig({ config, onChange, siteId }: ConfigPanelProps) {
  const { set } = useFieldHelpers(config, onChange);
  const { images, videos } = useConfigData(siteId);
  const poiImageOverrides = useMemo(() => {
    const raw = config.poiImageOverrides;
    if (!raw || typeof raw !== 'object') return {} as Record<string, string>;
    const result: Record<string, string> = {};
    for (const [poiId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      result[poiId] = trimmed;
    }
    return result;
  }, [config.poiImageOverrides]);

  const setPoiImageOverride = (poiId: string, value: string, defaultImageUrl: string) => {
    const nextUrl = value.trim();
    const nextOverrides = { ...poiImageOverrides };
    if (!nextUrl || nextUrl === defaultImageUrl) {
      delete nextOverrides[poiId];
    } else {
      nextOverrides[poiId] = nextUrl;
    }
    set('poiImageOverrides', nextOverrides);
  };

  return (
    <ConfigPageLayout sections={SECTIONS}>

      <ConfigSection id="settings" title="Settings" accentColor="#059669"
        description="Idle timeout before returning to screensaver">
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLS}>Idle Timeout (milliseconds)</label>
            <input
              type="number"
              min={5000}
              max={600000}
              step={1000}
              className={INPUT_CLS}
              value={(config.idleTimeoutMs as number) ?? 60000}
              onChange={(e) => set('idleTimeoutMs', Number(e.target.value))}
            />
          </div>
        </div>
      </ConfigSection>

      <ConfigSection id="poi-images" title="POI Images" accentColor="#0d9488"
        description="Override gallery POI photos for this specific app instance">
        <div className="space-y-3">
          <p className="text-xs text-surface-500 bg-surface-50 border border-surface-100 rounded-lg px-3 py-2 leading-relaxed">
            Changes here affect only this app (for example A-AV01) and do not modify the base template assets.
          </p>
          {POI_IMAGE_OPTIONS.map((poi) => {
            const effectiveUrl = poiImageOverrides[poi.id] || poi.defaultImageUrl;
            const customOverride = poiImageOverrides[poi.id] || '';
            return (
              <div key={poi.id} className="rounded-xl border border-surface-200 card-bg p-3 space-y-3">
                <div>
                  <div className="text-sm font-semibold text-surface-700">{poi.title}</div>
                  <div className="text-xs text-surface-500">{poi.galleryId} • {poi.id}</div>
                </div>
                <div className="rounded-lg border border-surface-200 bg-surface-50 p-2 w-[220px]">
                  <div className="text-[11px] font-medium text-surface-500 mb-1">Current Image Preview</div>
                  <PoiImagePreview src={effectiveUrl} alt={poi.title} />
                </div>
                <ContentPicker
                  configKey="_poi_image_url"
                  label="Select or Upload Image"
                  items={images}
                  emptyLabel="Choose image from media library..."
                  config={{ ...config, _poi_image_url: effectiveUrl }}
                  onChange={(nextConfig) => {
                    const nextUrl = (nextConfig._poi_image_url as string) || '';
                    setPoiImageOverride(poi.id, nextUrl, poi.defaultImageUrl);
                  }}
                  siteId={siteId}
                  accept="image/*"
                />
                <div>
                  <label className={LABEL_CLS}>Or Paste Image URL</label>
                  <input
                    type="text"
                    className={INPUT_CLS}
                    value={customOverride}
                    onChange={(e) => setPoiImageOverride(poi.id, e.target.value, poi.defaultImageUrl)}
                    placeholder={poi.defaultImageUrl}
                  />
                </div>
                {customOverride && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setPoiImageOverride(poi.id, '', poi.defaultImageUrl)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-50"
                    >
                      Use Default Image
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ConfigSection>

      <ConfigSection id="idle" title="Idle Screen" accentColor="#0891b2"
        description="Fallback idle screen (overrides built-in screensaver)">
        <IdleScreenToggle config={config} onChange={onChange} images={images} videos={videos} siteId={siteId} />
      </ConfigSection>

    </ConfigPageLayout>
  );
}
