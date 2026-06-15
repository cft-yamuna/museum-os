import { useEffect, useRef, useState } from 'react';
import type { ViewState, CategoryId, GalleryId, EditorConfig } from '../../types';
import { galleries, galleriesById } from '../../data/galleries';
import { categoriesById } from '../../data/categories';
import editorConfigRaw from '../../data/editorConfig.json';
import {
  screensaverViewport,
  categoriesViewport,
  categoryViewports,
  youAreHerePosition,
} from '../../data/mapViewports';
import mapSvgUrl from '../../svg/museum-map.svg';
import './MuseumMap.css';

const editorConfig = editorConfigRaw as unknown as EditorConfig;
const POI_LABEL_GAP_PX = 8;
const POI_MARKER_SPACING_GAP_PX = 8;
const POI_CLAMP_PADDING_PX = 8;
const POI_CARD_MAX_WIDTH_PX = 120;
const POI_CARD_MAX_HEIGHT_PX = 110;
const DEFAULT_POI_CARD_ASPECT_RATIO = 84 / 64;
const POI_CARD_GAP_PX = 12;
const POI_CARD_COLLISION_GAP_PX = 6;
const POI_CARD_SEARCH_RADII = [0, 8, 16, 24, 32, 40, 48, 56, 68];
const POI_CARD_SEARCH_ANGLE_STEP = 24;
const INACTIVE_LABEL_FILTER_ID = 'museum-map-inactive-label-thin';
const INACTIVE_LABEL_FILTER_ERODE_RADIUS = '0.45';
const LOCKED_POI_MARKER_IDS = new Set([
  'poi-1772718082274', // Gallery 2 middle star: Dr. GUBANOO PREMJI
  'poi-1774375697109', // Gallery 3 upper star: People Garden striped-wall image
]);
const LOCKED_POI_MARKER_OFFSETS: Record<string, { x: number; y: number }> = {
  'poi-1772718082274': { x: 14, y: 0 },
  'poi-1774375697109': { x: 0, y: 0 },
};
const LOCKED_POI_CARD_LAYOUTS: Record<string, { position: PoiCardPosition; dx: number; dy: number }> = {
  // Gallery 3 upper image card should sit left of the text card, slightly above the star.
  'poi-1774375697109': { position: 'left', dx: -8, dy: -76 },
  'poi-1772430171886': { position: 'left', dx: -28, dy: -20 },
  'poi-1772430333021': { position: 'right', dx: 12, dy: 4 },
  'poi-1772430370010': { position: 'bottom', dx: -64, dy: -24 },
  'poi-1772430398314': { position: 'left', dx: -10, dy: -6 },
  'poi-1772430401054': { position: 'left', dx: -14, dy: 6 },
  'poi-1774375871086': { position: 'top', dx: -42, dy: -6 },
  'poi-1774375878010': { position: 'top', dx: 40, dy: -8 },
  'poi-1774376005681': { position: 'top', dx: -46, dy: -6 },
  'poi-1774376010227': { position: 'top', dx: 16, dy: -4 },
};
const APP_OVERLAY_BLOCKER_SELECTORS = [
  '.custom08-museum-kiosk .back-button',
  '.custom08-museum-kiosk .category-info-panel',
  '.custom08-museum-kiosk .mini-map',
  '.custom08-museum-kiosk .gallery-card',
  '.custom08-museum-kiosk .categories-panel',
  '.custom08-museum-kiosk .error-boundary',
] as const;
const POI_OFFSET_CANDIDATES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 0, y: -22 },
  { x: 0, y: 22 },
  { x: -22, y: 0 },
  { x: 22, y: 0 },
  { x: -18, y: -18 },
  { x: 18, y: -18 },
  { x: -18, y: 18 },
  { x: 18, y: 18 },
  { x: 0, y: -34 },
  { x: 0, y: 34 },
  { x: -34, y: 0 },
  { x: 34, y: 0 },
];

interface PoiCollisionRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface PoiPoint {
  readonly x: number;
  readonly y: number;
}

type PoiCardPosition = 'top' | 'bottom' | 'left' | 'right';

interface PoiLayout {
  readonly marker: PoiPoint;
  readonly card: PoiCollisionRect | null;
}

interface PoiMarkerFootprint {
  readonly w: number;
  readonly h: number;
  readonly radius: number;
}

interface PoiCardSize {
  readonly w: number;
  readonly h: number;
}

interface PlacedPoiPoint extends PoiPoint {
  readonly radius: number;
}

interface LayerProjection {
  readonly left: number;
  readonly top: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly viewportW: number;
  readonly viewportH: number;
}

/** Non-gallery structural SVG groups that should be hidden when a category is selected */
const structuralGroupIds = [
  'entry_room', 'Lifts', 'men_s_restroom', 'restroom',
  'staircase', 'recording_room', 'gallery_people_garden', 'programing_area',
];

/** Auxiliary SVG groups to hide when a category is selected */
const auxiliaryGroupIds = [
  'gallery_Proluge', 'entry',
];

/** CSS classes for "GALLERY N" vector-text labels in the SVG (path-based, not <text>) */
const galleryNumberLabelClasses: Record<string, string> = {
  'hilight-experience': 'st86',   // Gallery 1
  'prologue': 'st51',           // Gallery 2
  'people-garden': 'st58',      // Gallery 3
  'factory-experience': 'st62', // Gallery 4
  'consumer-care': 'st91',      // Gallery 5
  'wintrol': 'st93',            // Gallery 6
  'it-story': 'st17',           // Gallery 7
  'spirit-of-hilight': 'st98',    // Gallery 8
  'foundation': 'st54',         // Gallery 9
};

interface MuseumMapProps {
  readonly viewState: ViewState;
  readonly onSelectCategory?: (categoryId: CategoryId) => void;
  readonly onSelectGallery?: (galleryId: GalleryId) => void;
  readonly onDeselectGallery?: () => void;
  readonly poiImageOverrides?: Record<string, string>;
}

function getTransformForState(viewState: ViewState): string {
  if (viewState.screen === 'gallery-view' && viewState.activeCategoryId) {
    return categoryViewports[viewState.activeCategoryId].transform;
  }
  if (viewState.screen === 'category-view' && viewState.activeCategoryId) {
    return categoryViewports[viewState.activeCategoryId].transform;
  }
  if (viewState.screen === 'categories') {
    return categoriesViewport.transform;
  }
  return screensaverViewport.transform;
}

/**
 * Determine the color state name for a gallery given the current view state.
 */
function getStateName(
  galleryId: string,
  galleryCategoryId: string,
  viewState: ViewState,
  showPaths?: boolean,
): string {
  if (viewState.screen === 'screensaver' || viewState.screen === 'categories') {
    return 'default';
  }
  if (showPaths && galleryCategoryId === 'businesses') {
    return 'gallery_inactive';
  }
  if (viewState.screen === 'category-view') {
    return galleryCategoryId === viewState.activeCategoryId
      ? 'category_active'
      : 'category_inactive';
  }
  if (viewState.screen === 'gallery-view') {
    if (galleryId === viewState.activeGalleryId) return 'gallery_active';
    if (galleryCategoryId === viewState.activeCategoryId) return 'gallery_inactive';
    return 'category_inactive';
  }
  return 'default';
}

/**
 * Stamp data-editor-id attributes on fillable elements inside gallery groups.
 */
function stampEditorIds(svgEl: Element) {
  for (let gi = 0; gi < galleries.length; gi++) {
    const groupEl = svgEl.querySelector('#' + galleries[gi].svgGroupId);
    if (!groupEl) continue;

    const shapes = groupEl.querySelectorAll('path, polygon, rect, line, polyline, circle');
    const usedIds: Record<string, boolean> = {};
    let counter = 0;

    for (let si = 0; si < shapes.length; si++) {
      const shape = shapes[si];
      const nativeId = shape.id || '';
      if (nativeId && !usedIds[nativeId]) {
        usedIds[nativeId] = true;
        continue;
      }
      const editorId = galleries[gi].svgGroupId + '__el_' + counter;
      counter++;
      shape.setAttribute('data-editor-id', editorId);
      usedIds[editorId] = true;
    }
  }
}

/**
 * Find an element inside a container by its editor ID.
 */
function findElementByEditorId(container: Element, id: string): Element | null {
  const doc = container.ownerDocument;
  if (doc) {
    const found = doc.getElementById(id);
    if (found && container.contains(found)) return found;
  }
  const safeId = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return container.querySelector('[data-editor-id="' + safeId + '"]');
}

/**
 * Check if an SVG element's fill references a pattern url(#...).
 */
function getPatternFillId(element: Element): string | null {
  const fillAttr = element.getAttribute('fill') || '';
  if (fillAttr.indexOf('url(') !== -1) {
    const match = fillAttr.match(/url\(\s*#([^)]+)\s*\)/);
    return match ? match[1] : null;
  }
  try {
    const computed = window.getComputedStyle(element);
    const computedFill = computed.getPropertyValue('fill') || '';
    if (computedFill.indexOf('url(') !== -1) {
      const match2 = computedFill.match(/#([^"')]+)/);
      return match2 ? match2[1] : null;
    }
  } catch (_e) {
    // Ignore
  }
  return null;
}

function normalizeColorValue(color: string | null | undefined): string | null {
  return typeof color === 'string' && color.trim().length > 0
    ? color.trim().toLowerCase()
    : null;
}

function isInactiveLabelColor(color: string | null | undefined): boolean {
  const normalized = normalizeColorValue(color);
  return normalized === '#969696' || normalized === '#c0c0c0';
}

function getInactiveSiblingOpacity(categoryId: string | null | undefined): number {
  return categoryId === 'origin' ? 0.47 : 0.45;
}

function getInactiveCategoryOpacity(): number {
  return 0.68;
}

function ensureInactiveLabelFilter(svgRoot: Element): void {
  if (svgRoot.querySelector('#' + INACTIVE_LABEL_FILTER_ID)) return;

  const doc = svgRoot.ownerDocument;
  if (!doc) return;

  const defs = svgRoot.querySelector('defs')
    || (() => {
      const nextDefs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svgRoot.insertBefore(nextDefs, svgRoot.firstChild);
      return nextDefs;
    })();

  const filter = doc.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', INACTIVE_LABEL_FILTER_ID);
  filter.setAttribute('x', '-8%');
  filter.setAttribute('y', '-8%');
  filter.setAttribute('width', '116%');
  filter.setAttribute('height', '116%');
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const erode = doc.createElementNS('http://www.w3.org/2000/svg', 'feMorphology');
  erode.setAttribute('in', 'SourceGraphic');
  erode.setAttribute('operator', 'erode');
  erode.setAttribute('radius', INACTIVE_LABEL_FILTER_ERODE_RADIUS);

  filter.appendChild(erode);
  defs.appendChild(filter);
}

function applySvgFilter(element: SVGElement, filterId?: string): void {
  if (filterId) {
    element.setAttribute('filter', 'url(#' + filterId + ')');
    return;
  }

  element.removeAttribute('filter');
}

function applyTextGroupAppearance(
  textGroup: SVGElement,
  textFill: string | null | undefined,
  opacity?: number,
) {
  const inactive = isInactiveLabelColor(textFill);
  const pathEls = textGroup.querySelectorAll('path');
  textGroup.style.opacity = opacity == null ? '' : String(opacity);
  applySvgFilter(textGroup, inactive ? INACTIVE_LABEL_FILTER_ID : undefined);

  for (let i = 0; i < pathEls.length; i++) {
    const pathEl = pathEls[i] as unknown as SVGElement;
    const isOutlineLayer = pathEls[i].classList.contains('st24') || pathEls[i].classList.contains('st12');

    if (!textFill) {
      pathEl.style.fill = '';
      pathEl.style.stroke = '';
      pathEl.style.strokeWidth = '';
      pathEl.style.opacity = '';
      continue;
    }

    if (isOutlineLayer) {
      pathEl.style.fill = 'none';
      pathEl.style.stroke = inactive ? 'none' : '';
      pathEl.style.strokeWidth = inactive ? '0' : '';
      pathEl.style.opacity = inactive ? '0' : '';
      continue;
    }

    pathEl.style.fill = textFill;
    pathEl.style.stroke = inactive ? 'none' : '';
    pathEl.style.strokeWidth = '';
    pathEl.style.strokeLinejoin = '';
    pathEl.style.paintOrder = '';
    pathEl.style.opacity = '';
  }

  const textEls = textGroup.querySelectorAll('text, tspan');
  for (let i = 0; i < textEls.length; i++) {
    (textEls[i] as HTMLElement).style.fill = textFill || '';
    (textEls[i] as HTMLElement).style.stroke = inactive ? 'none' : '';
    (textEls[i] as HTMLElement).style.strokeWidth = '';
    (textEls[i] as HTMLElement).style.strokeLinejoin = '';
    (textEls[i] as HTMLElement).style.paintOrder = '';
    (textEls[i] as HTMLElement).style.opacity = '';
  }
}

/** Lighten a hex color by adding a fixed amount to each channel */
function lightenColor(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/**
 * For elements with SVG pattern fills, clone the pattern and tint it.
 */
function applyTintedPatternFill(
  svgContainer: Element,
  element: Element,
  targetColor: string,
  stateKey: string,
): boolean {
  const patternId = getPatternFillId(element);
  if (!patternId) return false;

  const originalPattern = svgContainer.querySelector('#' + patternId);
  if (!originalPattern) return false;

  const cloneId = patternId + '__tint_' + stateKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  let existingClone = svgContainer.querySelector('#' + cloneId);

  if (!existingClone) {
    const clone = originalPattern.cloneNode(true) as Element;
    clone.setAttribute('id', cloneId);
    if (originalPattern.parentNode) {
      originalPattern.parentNode.insertBefore(clone, originalPattern.nextSibling);
    }
    existingClone = clone;
  }

  const lighterShade = lightenColor(targetColor, 40);
  const cloneRects = existingClone.querySelectorAll('rect');
  for (let cr = 0; cr < cloneRects.length; cr++) {
    (cloneRects[cr] as unknown as HTMLElement).style.fill = targetColor;
  }
  const clonePaths = existingClone.querySelectorAll('path');
  for (let cp = 0; cp < clonePaths.length; cp++) {
    (clonePaths[cp] as unknown as HTMLElement).style.fill = lighterShade;
  }

  (element as HTMLElement).style.fill = 'url(#' + cloneId + ')';
  (element as HTMLElement).style.opacity = '1';

  return true;
}

/**
 * Apply a full color state to a gallery SVG group.
 */
function applyColorStateToGallery(
  svgContainer: Element,
  galleryId: string,
  stateName: string,
) {
  const gallery = galleriesById[galleryId];
  if (!gallery) return;

  const el = svgContainer.querySelector('#' + gallery.svgGroupId) as HTMLElement | null;
  if (!el) return;

  const colorConfig = editorConfig.colorStates[galleryId as keyof typeof editorConfig.colorStates];
  const stateConfig = colorConfig ? colorConfig[stateName as keyof typeof colorConfig] : null;
  if (!stateConfig) return;

  // Visibility
  if (stateConfig.visibility === 'hidden') {
    el.style.visibility = 'hidden';
    el.style.pointerEvents = 'none';
    el.style.filter = 'none';
    const textGroupEl = gallery.textGroupId ? svgContainer.querySelector('#' + gallery.textGroupId) as HTMLElement | null : null;
    if (textGroupEl) {
      textGroupEl.style.visibility = 'visible';
    }
  } else {
    el.style.visibility = '';
    el.style.opacity = String(stateConfig.opacity);
    el.style.pointerEvents = '';
    el.style.filter = 'none';
  }

  // Child group visibility + opacity
  if (stateConfig.visibility === 'visible') {
    const childGroups = el.querySelectorAll('g');
    for (let cg = 0; cg < childGroups.length; cg++) {
      (childGroups[cg] as unknown as HTMLElement).style.visibility = '';
      if (stateConfig.fillOverride || stateConfig.elementFills) {
        (childGroups[cg] as unknown as HTMLElement).style.opacity = '1';
      } else {
        (childGroups[cg] as unknown as HTMLElement).style.opacity = '';
      }
    }
  }

  // Fill override
  if (stateConfig.fillOverride) {
    const fills = el.querySelectorAll('path, polygon, rect, line, polyline, circle');
    if (stateConfig.fillOverride === 'transparent') {
      for (let ft = 0; ft < fills.length; ft++) {
        (fills[ft] as HTMLElement).style.display = 'none';
        (fills[ft] as HTMLElement).style.fill = '';
        (fills[ft] as HTMLElement).style.opacity = '';
      }
    } else {
      for (let ff = 0; ff < fills.length; ff++) {
        if (getPatternFillId(fills[ff])) continue;
        (fills[ff] as HTMLElement).style.display = '';
        (fills[ff] as HTMLElement).style.fill = stateConfig.fillOverride;
        (fills[ff] as HTMLElement).style.opacity = '1';
      }
    }
  } else {
    const clears = el.querySelectorAll('path, polygon, rect, line, polyline, circle');
    for (let c = 0; c < clears.length; c++) {
      (clears[c] as HTMLElement).style.fill = '';
      (clears[c] as HTMLElement).style.display = '';
      (clears[c] as HTMLElement).style.opacity = '';
    }
  }

  // Per-element fills
  if (stateConfig.elementFills) {
    const efKeys = Object.keys(stateConfig.elementFills);
    for (let ef = 0; ef < efKeys.length; ef++) {
      let efEl = findElementByEditorId(el, efKeys[ef]);
      if (!efEl) efEl = findElementByEditorId(svgContainer, efKeys[ef]);
      if (efEl) {
        if (stateConfig.elementFills[efKeys[ef]] === 'transparent') {
          (efEl as HTMLElement).style.display = 'none';
          (efEl as HTMLElement).style.fill = '';
          (efEl as HTMLElement).style.opacity = '';
        } else {
          const tinted = applyTintedPatternFill(
            svgContainer, efEl, stateConfig.elementFills[efKeys[ef]],
            galleryId + '_' + stateName
          );
          if (!tinted) {
            (efEl as HTMLElement).style.display = '';
            (efEl as HTMLElement).style.fill = stateConfig.elementFills[efKeys[ef]];
            (efEl as HTMLElement).style.opacity = '1';
          }
        }
      }
    }
  }

  // Text state
  const textGroup = gallery.textGroupId ? svgContainer.querySelector('#' + gallery.textGroupId) as SVGElement | null : null;
  if (textGroup && stateConfig.textVisibility) {
    textGroup.style.visibility = stateConfig.textVisibility === 'hidden' ? 'hidden' : 'visible';
  }
  if (textGroup && stateConfig.textFill) {
    applyTextGroupAppearance(textGroup, stateConfig.textFill);
  }
}

/**
 * Re-apply shared element fills for a set of galleries.
 */
function applySharedElementFills(
  svgContainer: Element,
  catGalleryIds: string[],
  activeGalleryId: string | null,
) {
  for (let gi = 0; gi < catGalleryIds.length; gi++) {
    const galId = catGalleryIds[gi];
    const colorCfg = editorConfig.colorStates[galId as keyof typeof editorConfig.colorStates];
    if (!colorCfg) continue;
    const stName = activeGalleryId == null
      ? 'category_active'
      : (galId === activeGalleryId ? 'gallery_active' : 'gallery_inactive');
    const stCfg = colorCfg[stName as keyof typeof colorCfg];
    if (stCfg && stCfg.elementFills) {
      const keys = Object.keys(stCfg.elementFills);
      for (let k = 0; k < keys.length; k++) {
        const el = findElementByEditorId(svgContainer, keys[k]);
        if (!el) continue;
        if (stCfg.elementFills[keys[k]] === 'transparent') {
          (el as HTMLElement).style.display = 'none';
          (el as HTMLElement).style.visibility = 'hidden';
        } else {
          const tinted = applyTintedPatternFill(
            svgContainer, el, stCfg.elementFills[keys[k]],
            galId + '_' + stName
          );
          if (!tinted) {
            (el as HTMLElement).style.display = '';
            (el as HTMLElement).style.visibility = 'visible';
            (el as HTMLElement).style.fill = stCfg.elementFills[keys[k]];
            (el as HTMLElement).style.opacity = '1';
          } else {
            (el as HTMLElement).style.display = '';
            (el as HTMLElement).style.visibility = 'visible';
          }
        }
      }
    }
  }
}

/** Sanitize SVG: strip scripts and inline event handlers */
function sanitizeSvg(svgText: string): Element {
  if (!svgText.trim()) {
    throw new Error('Museum map SVG response was empty');
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`Museum map SVG parse failed: ${parserError.textContent?.trim() || 'Unknown parser error'}`);
  }
  const svgEl = doc.documentElement;

  svgEl.querySelectorAll('script, foreignObject').forEach((s) => s.remove());

  const allElements = svgEl.querySelectorAll('*');
  allElements.forEach((el) => {
    for (let a = el.attributes.length - 1; a >= 0; a--) {
      const attr = el.attributes[a];
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (attr.name === 'href' || attr.name === 'xlink:href') {
        const val = attr.value.trim();
        if (!val.startsWith('#') && !/^data:image\//i.test(val)) {
          el.removeAttribute(attr.name);
        }
      }
    }
  });

  return svgEl;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildRect(left: number, top: number, width: number, height: number): PoiCollisionRect {
  return {
    left: left,
    top: top,
    right: left + width,
    bottom: top + height,
  };
}

function offsetRect(rect: PoiCollisionRect, dx: number, dy: number): PoiCollisionRect {
  return {
    left: rect.left + dx,
    top: rect.top + dy,
    right: rect.right + dx,
    bottom: rect.bottom + dy,
  };
}

function clampRectToLayer(rect: PoiCollisionRect, layerSize: { w: number; h: number }): PoiCollisionRect {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const minX = POI_CLAMP_PADDING_PX;
  const minY = POI_CLAMP_PADDING_PX;
  const maxX = Math.max(minX, layerSize.w - width - POI_CLAMP_PADDING_PX);
  const maxY = Math.max(minY, layerSize.h - height - POI_CLAMP_PADDING_PX);
  const clampedLeft = clamp(rect.left, minX, maxX);
  const clampedTop = clamp(rect.top, minY, maxY);
  return {
    left: clampedLeft,
    top: clampedTop,
    right: clampedLeft + width,
    bottom: clampedTop + height,
  };
}

function getLayerProjection(
  layerSize: { w: number; h: number; l: number; t: number },
  poiLayerEl: HTMLDivElement | null,
): LayerProjection {
  if (poiLayerEl) {
    const bounds = poiLayerEl.getBoundingClientRect();
    return {
      left: bounds.left,
      top: bounds.top,
      scaleX: layerSize.w > 0 ? bounds.width / layerSize.w : 1,
      scaleY: layerSize.h > 0 ? bounds.height / layerSize.h : 1,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    };
  }
  return {
    left: layerSize.l,
    top: layerSize.t,
    scaleX: 1,
    scaleY: 1,
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
  };
}

function toScreenRect(rect: PoiCollisionRect, projection: LayerProjection): PoiCollisionRect {
  return {
    left: projection.left + (rect.left * projection.scaleX),
    top: projection.top + (rect.top * projection.scaleY),
    right: projection.left + (rect.right * projection.scaleX),
    bottom: projection.top + (rect.bottom * projection.scaleY),
  };
}

function viewportOverflowScore(
  rect: PoiCollisionRect,
  projection: LayerProjection,
  padding = 4,
): number {
  const screenRect = toScreenRect(rect, projection);
  const overflowLeft = Math.max(0, (padding - screenRect.left));
  const overflowTop = Math.max(0, (padding - screenRect.top));
  const overflowRight = Math.max(0, (screenRect.right - (projection.viewportW - padding)));
  const overflowBottom = Math.max(0, (screenRect.bottom - (projection.viewportH - padding)));
  return overflowLeft + overflowTop + overflowRight + overflowBottom;
}

function rectsOverlap(a: PoiCollisionRect, b: PoiCollisionRect, padding = 0): boolean {
  return (a.left - padding) < (b.right + padding)
    && (a.right + padding) > (b.left - padding)
    && (a.top - padding) < (b.bottom + padding)
    && (a.bottom + padding) > (b.top - padding);
}

function rectOverlapArea(a: PoiCollisionRect, b: PoiCollisionRect, padding = 0): number {
  const left = Math.max(a.left - padding, b.left - padding);
  const top = Math.max(a.top - padding, b.top - padding);
  const right = Math.min(a.right + padding, b.right + padding);
  const bottom = Math.min(a.bottom + padding, b.bottom + padding);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

function getMarkerFootprint(isGalleryView: boolean): PoiMarkerFootprint {
  // Marker wrapper is scaled to 0.6 in CSS.
  if (isGalleryView) {
    const width = 19 * 0.6;
    const height = 23 * 0.6;
    return { w: width, h: height, radius: Math.max(width, height) / 2 };
  }
  const size = 24 * 0.6;
  return { w: size, h: size, radius: size / 2 };
}

function getPoiCardSize(aspectRatio: number | undefined): PoiCardSize {
  const safeAspectRatio = aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0
    ? aspectRatio
    : DEFAULT_POI_CARD_ASPECT_RATIO;

  let width = POI_CARD_MAX_WIDTH_PX;
  let height = width / safeAspectRatio;

  if (height > POI_CARD_MAX_HEIGHT_PX) {
    height = POI_CARD_MAX_HEIGHT_PX;
    width = height * safeAspectRatio;
  }

  return {
    w: width,
    h: height,
  };
}

function collidesWithLabel(point: PoiPoint, markerRadius: number, rect: PoiCollisionRect): boolean {
  const expandedLeft = rect.left - (markerRadius + POI_LABEL_GAP_PX);
  const expandedTop = rect.top - (markerRadius + POI_LABEL_GAP_PX);
  const expandedRight = rect.right + (markerRadius + POI_LABEL_GAP_PX);
  const expandedBottom = rect.bottom + (markerRadius + POI_LABEL_GAP_PX);
  return point.x >= expandedLeft
    && point.x <= expandedRight
    && point.y >= expandedTop
    && point.y <= expandedBottom;
}

function collidesWithPlacedPoi(
  point: PoiPoint,
  markerRadius: number,
  placed: PlacedPoiPoint,
): boolean {
  const dx = point.x - placed.x;
  const dy = point.y - placed.y;
  const minDistance = markerRadius + placed.radius + POI_MARKER_SPACING_GAP_PX;
  return (dx * dx) + (dy * dy) < minDistance * minDistance;
}

function hasCollision(
  point: PoiPoint,
  markerRadius: number,
  textRects: readonly PoiCollisionRect[],
  placedPois: readonly PlacedPoiPoint[],
): boolean {
  for (let i = 0; i < textRects.length; i++) {
    if (collidesWithLabel(point, markerRadius, textRects[i])) return true;
  }
  for (let j = 0; j < placedPois.length; j++) {
    if (collidesWithPlacedPoi(point, markerRadius, placedPois[j])) return true;
  }
  return false;
}

function placePoiWithoutOverlap(
  basePoint: PoiPoint,
  markerRadius: number,
  layerSize: { w: number; h: number },
  textRects: readonly PoiCollisionRect[],
  placedPois: readonly PlacedPoiPoint[],
): PoiPoint {
  const minX = POI_CLAMP_PADDING_PX;
  const minY = POI_CLAMP_PADDING_PX;
  const maxX = Math.max(POI_CLAMP_PADDING_PX, layerSize.w - POI_CLAMP_PADDING_PX);
  const maxY = Math.max(POI_CLAMP_PADDING_PX, layerSize.h - POI_CLAMP_PADDING_PX);

  for (let i = 0; i < POI_OFFSET_CANDIDATES.length; i++) {
    const candidate = {
      x: clamp(basePoint.x + POI_OFFSET_CANDIDATES[i].x, minX, maxX),
      y: clamp(basePoint.y + POI_OFFSET_CANDIDATES[i].y, minY, maxY),
    };
    if (!hasCollision(candidate, markerRadius, textRects, placedPois)) {
      return candidate;
    }
  }

  // Fallback: sweep around in a ring to find the first non-colliding spot.
  const sweepStep = 18;
  for (let angle = 0; angle < 360; angle += sweepStep) {
    const radians = (angle * Math.PI) / 180;
    const candidate = {
      x: clamp(basePoint.x + Math.cos(radians) * 42, minX, maxX),
      y: clamp(basePoint.y + Math.sin(radians) * 42, minY, maxY),
    };
    if (!hasCollision(candidate, markerRadius, textRects, placedPois)) {
      return candidate;
    }
  }

  return {
    x: clamp(basePoint.x, minX, maxX),
    y: clamp(basePoint.y, minY, maxY),
  };
}

function clampPoiPoint(
  point: PoiPoint,
  layerSize: { w: number; h: number },
): PoiPoint {
  const minX = POI_CLAMP_PADDING_PX;
  const minY = POI_CLAMP_PADDING_PX;
  const maxX = Math.max(POI_CLAMP_PADDING_PX, layerSize.w - POI_CLAMP_PADDING_PX);
  const maxY = Math.max(POI_CLAMP_PADDING_PX, layerSize.h - POI_CLAMP_PADDING_PX);
  return {
    x: clamp(point.x, minX, maxX),
    y: clamp(point.y, minY, maxY),
  };
}

function getLockedPoiPoint(
  poiId: string,
  basePoint: PoiPoint,
  layerSize: { w: number; h: number },
): PoiPoint {
  const offset = LOCKED_POI_MARKER_OFFSETS[poiId];
  return clampPoiPoint({
    x: basePoint.x + (offset?.x || 0),
    y: basePoint.y + (offset?.y || 0),
  }, layerSize);
}

function getLockedPoiCardRect(
  poiId: string,
  markerPoint: PoiPoint,
  markerFootprint: PoiMarkerFootprint,
  cardSize: PoiCardSize,
  layerSize: { w: number; h: number },
): PoiCollisionRect | null {
  const locked = LOCKED_POI_CARD_LAYOUTS[poiId];
  if (!locked) return null;
  return clampRectToLayer(
    offsetRect(
      getCardBaseRect(markerPoint, locked.position, markerFootprint, cardSize),
      locked.dx,
      locked.dy,
    ),
    layerSize,
  );
}

function prependUnique(
  value: PoiCardPosition,
  list: readonly PoiCardPosition[],
): readonly PoiCardPosition[] {
  const without = list.filter((item) => item !== value);
  return [value, ...without];
}

function getCardPositionsByPreference(
  preferred: string | undefined,
  markerPoint: PoiPoint,
  markerFootprint: PoiMarkerFootprint,
  projection: LayerProjection,
  cardSize: PoiCardSize,
): readonly PoiCardPosition[] {
  const normalized = preferred === 'bottom' || preferred === 'left' || preferred === 'right'
    ? preferred
    : 'top';
  let order: readonly PoiCardPosition[] = ['top', 'bottom', 'right', 'left'];
  if (normalized === 'bottom') order = ['bottom', 'top', 'right', 'left'];
  if (normalized === 'left') order = ['left', 'right', 'top', 'bottom'];
  if (normalized === 'right') order = ['right', 'left', 'top', 'bottom'];

  const markerScreenX = projection.left + (markerPoint.x * projection.scaleX);
  const markerScreenY = projection.top + (markerPoint.y * projection.scaleY);
  const cardHalfW = (cardSize.w * projection.scaleX) / 2;
  const cardH = cardSize.h * projection.scaleY;
  const markerHalfW = (markerFootprint.w * projection.scaleX) / 2;
  const markerHalfH = (markerFootprint.h * projection.scaleY) / 2;
  const verticalGap = (POI_CARD_GAP_PX * projection.scaleY) + markerHalfH;
  const horizontalGap = (POI_CARD_GAP_PX * projection.scaleX) + markerHalfW;

  const nearTop = markerScreenY - (cardH + verticalGap) < 6;
  const nearBottom = markerScreenY + (cardH + verticalGap) > (projection.viewportH - 6);
  const nearLeft = markerScreenX - (cardHalfW + horizontalGap) < 6;
  const nearRight = markerScreenX + (cardHalfW + horizontalGap) > (projection.viewportW - 6);

  if (nearTop) order = prependUnique('bottom', order);
  if (nearBottom) order = prependUnique('top', order);
  if (nearLeft) order = prependUnique('right', order);
  if (nearRight) order = prependUnique('left', order);

  return order;
}

function getCardBaseRect(
  markerPoint: PoiPoint,
  position: PoiCardPosition,
  markerFootprint: PoiMarkerFootprint,
  cardSize: PoiCardSize,
): PoiCollisionRect {
  const markerHalfW = markerFootprint.w / 2;
  const markerHalfH = markerFootprint.h / 2;
  if (position === 'bottom') {
    return buildRect(
      markerPoint.x - cardSize.w / 2,
      markerPoint.y + markerHalfH + POI_CARD_GAP_PX,
      cardSize.w,
      cardSize.h,
    );
  }
  if (position === 'left') {
    return buildRect(
      markerPoint.x - markerHalfW - POI_CARD_GAP_PX - cardSize.w,
      markerPoint.y - cardSize.h / 2,
      cardSize.w,
      cardSize.h,
    );
  }
  if (position === 'right') {
    return buildRect(
      markerPoint.x + markerHalfW + POI_CARD_GAP_PX,
      markerPoint.y - cardSize.h / 2,
      cardSize.w,
      cardSize.h,
    );
  }
  return buildRect(
    markerPoint.x - cardSize.w / 2,
    markerPoint.y - markerHalfH - POI_CARD_GAP_PX - cardSize.h,
    cardSize.w,
    cardSize.h,
  );
}

function hasCardCollision(
  candidate: PoiCollisionRect,
  textRects: readonly PoiCollisionRect[],
  markerRects: readonly PoiCollisionRect[],
  cardRects: readonly PoiCollisionRect[],
  projection: LayerProjection,
): boolean {
  if (viewportOverflowScore(candidate, projection) > 0) return true;
  for (let i = 0; i < textRects.length; i++) {
    if (rectsOverlap(candidate, textRects[i], POI_CARD_COLLISION_GAP_PX)) return true;
  }
  for (let j = 0; j < markerRects.length; j++) {
    if (rectsOverlap(candidate, markerRects[j], POI_CARD_COLLISION_GAP_PX)) return true;
  }
  for (let k = 0; k < cardRects.length; k++) {
    if (rectsOverlap(candidate, cardRects[k], POI_CARD_COLLISION_GAP_PX)) return true;
  }
  return false;
}

function scoreCardRect(
  candidate: PoiCollisionRect,
  textRects: readonly PoiCollisionRect[],
  markerRects: readonly PoiCollisionRect[],
  cardRects: readonly PoiCollisionRect[],
  projection: LayerProjection,
): number {
  let score = viewportOverflowScore(candidate, projection) * 4000;
  for (let i = 0; i < textRects.length; i++) {
    score += rectOverlapArea(candidate, textRects[i], POI_CARD_COLLISION_GAP_PX) * 10;
  }
  for (let j = 0; j < markerRects.length; j++) {
    score += rectOverlapArea(candidate, markerRects[j], POI_CARD_COLLISION_GAP_PX) * 12;
  }
  for (let k = 0; k < cardRects.length; k++) {
    score += rectOverlapArea(candidate, cardRects[k], POI_CARD_COLLISION_GAP_PX) * 14;
  }
  return score;
}

function placeCardWithoutOverlap(
  markerPoint: PoiPoint,
  markerFootprint: PoiMarkerFootprint,
  preferredPosition: string | undefined,
  cardSize: PoiCardSize,
  layerSize: { w: number; h: number },
  textRects: readonly PoiCollisionRect[],
  markerRects: readonly PoiCollisionRect[],
  cardRects: readonly PoiCollisionRect[],
  projection: LayerProjection,
): PoiCollisionRect {
  const positionOrder = getCardPositionsByPreference(
    preferredPosition,
    markerPoint,
    markerFootprint,
    projection,
    cardSize,
  );
  let bestCandidate: PoiCollisionRect | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let p = 0; p < positionOrder.length; p++) {
    const base = clampRectToLayer(getCardBaseRect(markerPoint, positionOrder[p], markerFootprint, cardSize), layerSize);

    for (let r = 0; r < POI_CARD_SEARCH_RADII.length; r++) {
      const radius = POI_CARD_SEARCH_RADII[r];
      const angleStep = radius === 0 ? 360 : POI_CARD_SEARCH_ANGLE_STEP;
      for (let angle = 0; angle < 360; angle += angleStep) {
        const radians = (angle * Math.PI) / 180;
        const candidate = clampRectToLayer(
          offsetRect(base, Math.cos(radians) * radius, Math.sin(radians) * radius),
          layerSize,
        );
        if (!hasCardCollision(candidate, textRects, markerRects, cardRects, projection)) {
          return candidate;
        }
        const candidateScore = scoreCardRect(candidate, textRects, markerRects, cardRects, projection);
        if (candidateScore < bestScore) {
          bestScore = candidateScore;
          bestCandidate = candidate;
        }
      }
    }
  }

  return bestCandidate
    || clampRectToLayer(getCardBaseRect(markerPoint, 'top', markerFootprint, cardSize), layerSize);
}

export function MuseumMap({
  viewState,
  onSelectCategory,
  onSelectGallery,
  onDeselectGallery,
  poiImageOverrides,
}: MuseumMapProps) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const poiLayerRef = useRef<HTMLDivElement>(null);
  const [svgViewBox, setSvgViewBox] = useState<{ w: number; h: number } | null>(null);
  const [poiLayerRect, setPoiLayerRect] = useState<{
    w: number; h: number; l: number; t: number;
  } | null>(null);
  const [showPaths, setShowPaths] = useState(false);
  const [tappedPoiId, setTappedPoiId] = useState<string | null>(null);
  const [textCollisionRects, setTextCollisionRects] = useState<PoiCollisionRect[]>([]);
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<string, number>>({});
  const tappedPoiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear tapped POI when leaving category view
  useEffect(() => {
    if (viewState.screen !== 'category-view') {
      setTappedPoiId(null);
      if (tappedPoiTimerRef.current) clearTimeout(tappedPoiTimerRef.current);
    }
  }, [viewState.screen]);

  // Hand hint disabled — was causing gallery flash animations even without the hand visible
  const handHint = { active: false, flashGalleryId: null as string | null, positionX: 0, positionY: 0, isTapping: false };

  const transform = getTransformForState(viewState);

  // Load SVG inline with sanitization and abort handling
  useEffect(() => {
    const svgContainer = svgContainerRef.current;
    if (!svgContainer) return;

    const controller = new AbortController();

    fetch(mapSvgUrl, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load museum map SVG: ${res.status} ${res.statusText}`);
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('image/svg+xml')) {
          throw new Error(`Museum map SVG returned unexpected content type: ${contentType || 'unknown'}`);
        }
        return res.text();
      })
      .then((svgText) => {
        if (controller.signal.aborted) return;

        const sanitizedSvg = sanitizeSvg(svgText);
        sanitizedSvg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        ensureInactiveLabelFilter(sanitizedSvg);

        while (svgContainer.firstChild) {
          svgContainer.removeChild(svgContainer.firstChild);
        }
        svgContainer.appendChild(sanitizedSvg);

        const viewBox = sanitizedSvg.getAttribute('viewBox');
        if (viewBox) {
          const parts = viewBox.split(/[\s,]+/).map(Number);
          if (parts.length >= 4) {
            setSvgViewBox({ w: parts[2], h: parts[3] });
          }
        }

        // Remove white text labels from Layer 1
        const layer1 = sanitizedSvg.querySelector('#Layer_1-2');
        if (layer1) {
          const textEls = Array.from(layer1.querySelectorAll('text'));
          for (let i = 0; i < textEls.length; i++) {
            textEls[i].remove();
          }
          // Remove path-based gallery name labels (e.g. "Foundation", "IT Story")
          const nameLabels = Array.from(layer1.querySelectorAll('[id^="Layer_1-2-g-1-text-"]'));
          for (let nl = 0; nl < nameLabels.length; nl++) {
            nameLabels[nl].remove();
          }
        }

        // Show the outline layer
        const outlineGroup = sanitizedSvg.querySelector('#outline');
        if (outlineGroup) {
          (outlineGroup as HTMLElement).style.display = 'block';
          (outlineGroup as HTMLElement).style.opacity = '1';
          const firstGalleryGroup = sanitizedSvg.querySelector('#Proluge');
          if (firstGalleryGroup && outlineGroup.parentNode
              && firstGalleryGroup.parentNode === outlineGroup.parentNode) {
            outlineGroup.parentNode.insertBefore(outlineGroup, firstGalleryGroup);
          }
        }

        // Hide route paths layer
        const routeLayer = sanitizedSvg.querySelector('#Layer_21');
        if (routeLayer) {
          (routeLayer as HTMLElement).style.display = 'none';
          const st27Path = routeLayer.querySelector('.st27');
          if (st27Path) {
            (st27Path as HTMLElement).style.display = 'none';
          }
          const firstSibling = routeLayer.nextElementSibling;
          if (firstSibling && firstSibling.tagName.toLowerCase() === 'g' && !firstSibling.id) {
            firstSibling.setAttribute('data-route-extra', 'true');
            (firstSibling as HTMLElement).style.display = 'none';
            const secondSibling = firstSibling.nextElementSibling;
            if (secondSibling && secondSibling.tagName.toLowerCase() === 'g' && !secondSibling.id) {
              (secondSibling as HTMLElement).style.display = 'none';
            }
          }
        }

        // Remove broken linked images
        const linkedImages = Array.from(sanitizedSvg.querySelectorAll('image'));
        for (let j = 0; j < linkedImages.length; j++) {
          const href = linkedImages[j].getAttribute('href')
            || linkedImages[j].getAttributeNS('http://www.w3.org/1999/xlink', 'href')
            || '';
          if (href && !href.startsWith('data:') && !href.startsWith('http')) {
            linkedImages[j].remove();
          }
        }

        // Extract "GALLERY N" number labels into a separate top-level group
        // so they render independently of gallery group visibility/opacity
        const labelLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        labelLayer.setAttribute('id', 'gallery-number-labels');
        const labelGalIds = Object.keys(galleryNumberLabelClasses);
        for (let li = 0; li < labelGalIds.length; li++) {
          const cls = galleryNumberLabelClasses[labelGalIds[li]];
          const firstPath = sanitizedSvg.querySelector('.' + cls);
          if (!firstPath || !firstPath.parentElement) continue;
          const parentG = firstPath.parentElement;
          if (parentG.tagName.toLowerCase() !== 'g' || parentG.id) continue;
          const sameClassCount = parentG.querySelectorAll('.' + cls).length;
          if (sameClassCount >= 7) {
            parentG.setAttribute('data-gallery-label', labelGalIds[li]);
            labelLayer.appendChild(parentG);
          }
        }
        sanitizedSvg.appendChild(labelLayer);

        stampEditorIds(sanitizedSvg);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Failed to load museum map SVG:', err);
      });

    return function cleanup() {
      controller.abort();
    };
  }, []);

  // Reset showPaths when leaving businesses category
  useEffect(function resetPaths() {
    if (viewState.activeCategoryId !== 'businesses') {
      setShowPaths(false);
    }
  }, [viewState.activeCategoryId]);

  // Toggle route paths layer visibility
  useEffect(function toggleRoutePaths() {
    const container = svgContainerRef.current;
    if (!container) return;
    const showDisplay = showPaths ? 'block' : 'none';
    const routeLayer = container.querySelector('#Layer_21') as HTMLElement | null;
    if (routeLayer) {
      routeLayer.style.display = showDisplay;
    }
    const extraLayers = container.querySelectorAll('[data-route-extra]');
    for (let ei = 0; ei < extraLayers.length; ei++) {
      (extraLayers[ei] as HTMLElement).style.display = showDisplay;
    }
  }, [showPaths]);

  // Compute POI layer rectangle to match SVG xMidYMid slice rendering
  useEffect(function computePoiRect() {
    if (!svgViewBox) return;
    const vbW = svgViewBox.w;
    const vbH = svgViewBox.h;

    function updateRect() {
      const cW = window.innerWidth;
      const cH = window.innerHeight;
      const scale = Math.max(cW / vbW, cH / vbH);
      const w = vbW * scale;
      const h = vbH * scale;
      setPoiLayerRect({
        w: w,
        h: h,
        l: (cW - w) / 2,
        t: (cH - h) / 2,
      });
    }

    updateRect();
    window.addEventListener('resize', updateRect);
    return function cleanup() {
      window.removeEventListener('resize', updateRect);
    };
  }, [svgViewBox]);

  // Track on-screen gallery labels/text so POIs and cards can avoid overlapping them.
  useEffect(function computeLabelRects() {
    const svgContainer = svgContainerRef.current;
    if (!svgContainer || !poiLayerRect) {
      setTextCollisionRects([]);
      return;
    }
    const currentPoiLayerRect = poiLayerRect;
    const currentSvgContainer = svgContainer;

    let rafId = 0;
    function updateLabelRects() {
      const nextRects: PoiCollisionRect[] = [];

      function pushBoundsFromElement(el: Element | null) {
        if (!el) return;
        const style = window.getComputedStyle(el as HTMLElement);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') < 0.05) {
          return;
        }
        const poiLayerEl = poiLayerRef.current;
        const layerBounds = poiLayerEl ? poiLayerEl.getBoundingClientRect() : null;
        const scaleX = layerBounds && currentPoiLayerRect.w > 0 ? layerBounds.width / currentPoiLayerRect.w : 1;
        const scaleY = layerBounds && currentPoiLayerRect.h > 0 ? layerBounds.height / currentPoiLayerRect.h : 1;
        const bounds = el.getBoundingClientRect();
        if (bounds.width < 1 || bounds.height < 1) return;
        const left = layerBounds ? (bounds.left - layerBounds.left) / (scaleX || 1) : bounds.left - currentPoiLayerRect.l;
        const top = layerBounds ? (bounds.top - layerBounds.top) / (scaleY || 1) : bounds.top - currentPoiLayerRect.t;
        const right = layerBounds ? (bounds.right - layerBounds.left) / (scaleX || 1) : bounds.right - currentPoiLayerRect.l;
        const bottom = layerBounds ? (bounds.bottom - layerBounds.top) / (scaleY || 1) : bounds.bottom - currentPoiLayerRect.t;
        nextRects.push({
          left: left,
          top: top,
          right: right,
          bottom: bottom,
        });
      }

      const numberLabels = currentSvgContainer.querySelectorAll('#gallery-number-labels [data-gallery-label]');
      for (let i = 0; i < numberLabels.length; i++) {
        pushBoundsFromElement(numberLabels[i] as Element);
      }

      const ownerDoc = currentSvgContainer.ownerDocument;
      for (let gi = 0; gi < galleries.length; gi++) {
        const textGroupId = galleries[gi].textGroupId;
        if (!textGroupId) continue;
        const textGroup = ownerDoc ? ownerDoc.getElementById(textGroupId) : null;
        if (textGroup && currentSvgContainer.contains(textGroup)) {
          pushBoundsFromElement(textGroup);
        }
      }

      // Also block major non-map UI overlays so cards never overlap app chrome/panels.
      for (let si = 0; si < APP_OVERLAY_BLOCKER_SELECTORS.length; si++) {
        const blockers = document.querySelectorAll(APP_OVERLAY_BLOCKER_SELECTORS[si]);
        for (let bi = 0; bi < blockers.length; bi++) {
          const blocker = blockers[bi] as Element;
          if (!blocker || currentSvgContainer.contains(blocker)) continue;
          pushBoundsFromElement(blocker);
        }
      }

      setTextCollisionRects(nextRects);
    }

    updateLabelRects();
    const rafOne = window.requestAnimationFrame(updateLabelRects);
    rafId = window.requestAnimationFrame(() => window.requestAnimationFrame(updateLabelRects));
    const timeoutId = window.setTimeout(updateLabelRects, 180);

    return function cleanup() {
      window.cancelAnimationFrame(rafOne);
      if (rafId) window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [
    poiLayerRect,
    viewState.screen,
    viewState.activeCategoryId,
    viewState.activeGalleryId,
    showPaths,
    tappedPoiId,
  ]);

  // Data-driven gallery color states from editorConfig.json
  useEffect(() => {
    const svgContainer = svgContainerRef.current;
    if (!svgContainer) return;

    const layer1 = svgContainer.querySelector('#Layer_1-2') as HTMLElement | null;
    const outlineGroup = svgContainer.querySelector('#outline') as HTMLElement | null;

    const isZoomed = viewState.screen === 'category-view' || viewState.screen === 'gallery-view';

    if (isZoomed) {
      if (layer1) {
        layer1.style.opacity = '0';
        layer1.style.pointerEvents = 'none';
        layer1.style.filter = '';
      }

      if (outlineGroup) {
        outlineGroup.style.opacity = '1';
      }

      for (let i = 0; i < galleries.length; i++) {
        const gallery = galleries[i];
        const stateName = getStateName(gallery.id, gallery.categoryId, viewState, showPaths);
        const colorConfig = editorConfig.colorStates[gallery.id as keyof typeof editorConfig.colorStates];
        const stateConfig = colorConfig ? colorConfig[stateName as keyof typeof colorConfig] : null;

        const el = svgContainer.querySelector('#' + gallery.svgGroupId) as HTMLElement | null;
        if (!el) continue;

        if (stateConfig) {
          if (stateConfig.visibility === 'hidden') {
            el.style.visibility = 'hidden';
            el.style.pointerEvents = 'none';
            el.style.filter = 'none';
            const textGroupEl = gallery.textGroupId ? svgContainer.querySelector('#' + gallery.textGroupId) as HTMLElement | null : null;
            if (textGroupEl) {
              textGroupEl.style.visibility = 'visible';
            }
          } else {
            el.style.visibility = '';
            el.style.opacity = String(stateConfig.opacity);
            el.style.pointerEvents = '';
            el.style.filter = 'none';
          }

          if (stateConfig.visibility === 'visible') {
            const childGroups = el.querySelectorAll('g');
            for (let cg = 0; cg < childGroups.length; cg++) {
              (childGroups[cg] as unknown as HTMLElement).style.visibility = '';
              if (stateConfig.fillOverride || stateConfig.elementFills) {
                (childGroups[cg] as unknown as HTMLElement).style.opacity = '1';
              } else {
                (childGroups[cg] as unknown as HTMLElement).style.opacity = '';
              }
            }
          }

          if (stateConfig.fillOverride) {
            const fills = el.querySelectorAll('path, polygon, rect, line, polyline, circle');
            if (stateConfig.fillOverride === 'transparent') {
              for (let f = 0; f < fills.length; f++) {
                (fills[f] as HTMLElement).style.display = 'none';
                (fills[f] as HTMLElement).style.fill = '';
                (fills[f] as HTMLElement).style.opacity = '';
              }
            } else {
              for (let f = 0; f < fills.length; f++) {
                if (getPatternFillId(fills[f])) continue;
                // Dot textures (st96): keep original fill, dim with opacity
                // Grid lines (st39): keep fill:none, don't make visible
                if (fills[f].classList.contains('st96') && stateName === 'gallery_inactive') {
                  (fills[f] as HTMLElement).style.display = '';
                  (fills[f] as HTMLElement).style.fill = '';
                  (fills[f] as HTMLElement).style.opacity = '0.47';
                  continue;
                }
                if (fills[f].classList.contains('st39')) continue;
                (fills[f] as HTMLElement).style.display = '';
                (fills[f] as HTMLElement).style.fill = stateConfig.fillOverride;
                (fills[f] as HTMLElement).style.opacity = '1';
              }
            }
          } else {
            const clears = el.querySelectorAll('path, polygon, rect, line, polyline, circle');
            for (let c = 0; c < clears.length; c++) {
              (clears[c] as HTMLElement).style.fill = '';
              (clears[c] as HTMLElement).style.display = '';
              (clears[c] as HTMLElement).style.opacity = '';
            }
          }

          if (stateConfig.elementFills) {
            const efKeys = Object.keys(stateConfig.elementFills);
            for (let ef = 0; ef < efKeys.length; ef++) {
              let efEl = findElementByEditorId(el, efKeys[ef]);
              if (!efEl) efEl = findElementByEditorId(svgContainer, efKeys[ef]);
              if (efEl) {
                if (stateConfig.elementFills[efKeys[ef]] === 'transparent') {
                  (efEl as HTMLElement).style.display = 'none';
                  (efEl as HTMLElement).style.fill = '';
                  (efEl as HTMLElement).style.opacity = '';
                } else {
                  const tinted = applyTintedPatternFill(
                    svgContainer, efEl, stateConfig.elementFills[efKeys[ef]],
                    gallery.id + '_' + stateName
                  );
                  if (!tinted) {
                    (efEl as HTMLElement).style.display = '';
                    (efEl as HTMLElement).style.fill = stateConfig.elementFills[efKeys[ef]];
                    (efEl as HTMLElement).style.opacity = '1';
                  }
                }
              }
            }
          }

          const textGroup = gallery.textGroupId ? svgContainer.querySelector('#' + gallery.textGroupId) as HTMLElement | null : null;
          if (textGroup) {
            textGroup.style.visibility = stateConfig.textVisibility === 'hidden' ? 'hidden' : 'visible';
            textGroup.style.pointerEvents = stateConfig.textVisibility === 'hidden' ? 'none' : '';
            const textChildren = textGroup.querySelectorAll('path, text');
          if (stateConfig.textFill) {
              const inactiveLabelOpacity = stateName === 'gallery_inactive'
                ? getInactiveSiblingOpacity(gallery.categoryId)
                : (stateName === 'category_inactive' ? getInactiveCategoryOpacity() : undefined);
              applyTextGroupAppearance(textGroup as unknown as SVGElement, stateConfig.textFill, inactiveLabelOpacity);
            } else {
              for (let rtp = 0; rtp < textChildren.length; rtp++) {
                (textChildren[rtp] as unknown as HTMLElement).style.fill = '';
                (textChildren[rtp] as unknown as HTMLElement).style.stroke = '';
                (textChildren[rtp] as unknown as HTMLElement).style.strokeWidth = '';
                (textChildren[rtp] as unknown as HTMLElement).style.opacity = '';
              }
              textGroup.style.opacity = '';
              applySvgFilter(textGroup as unknown as SVGElement);
            }
          }
        }
      }

      // Re-apply elementFills LAST for active galleries
      if (viewState.screen === 'category-view' && viewState.activeCategoryId && !showPaths) {
        const activeCat = categoriesById[viewState.activeCategoryId];
        if (activeCat) {
          const catGalleryIds = activeCat.galleryIds.map((id) => { return id as string; });
          applySharedElementFills(svgContainer, catGalleryIds, null);
        }
      }

      if (viewState.screen === 'gallery-view' && viewState.activeGalleryId && viewState.activeCategoryId && !showPaths) {
        const galActiveCat = categoriesById[viewState.activeCategoryId];
        if (galActiveCat) {
          const galCatIds = galActiveCat.galleryIds.map((id) => { return id as string; });
          applySharedElementFills(svgContainer, galCatIds, viewState.activeGalleryId);
        }
      }

      // Fade out structural groups
      for (let s = 0; s < structuralGroupIds.length; s++) {
        if (structuralGroupIds[s] === 'gallery_people_garden'
          && viewState.activeCategoryId === 'origin') {
          const pgEl = svgContainer.querySelector('#gallery_people_garden') as HTMLElement | null;
          if (pgEl) {
            pgEl.style.opacity = '1';
            pgEl.style.pointerEvents = '';
            pgEl.style.filter = 'none';
          }
          continue;
        }
        const sEl = svgContainer.querySelector('#' + structuralGroupIds[s]) as HTMLElement | null;
        if (!sEl) continue;
        sEl.style.opacity = '0';
        sEl.style.pointerEvents = 'none';
      }

      for (let a = 0; a < auxiliaryGroupIds.length; a++) {
        const auxEl = svgContainer.querySelector('#' + auxiliaryGroupIds[a]) as HTMLElement | null;
        if (!auxEl) continue;
        auxEl.style.opacity = '0';
        auxEl.style.pointerEvents = 'none';
      }
    } else {
      // Reset everything to normal (screensaver / categories)
      if (layer1) {
        layer1.style.opacity = '';
        layer1.style.pointerEvents = '';
        layer1.style.filter = '';
      }

      if (outlineGroup) {
        outlineGroup.style.opacity = '0';
      }

      for (let gi = 0; gi < galleries.length; gi++) {
        const gEl = svgContainer.querySelector('#' + galleries[gi].svgGroupId) as HTMLElement | null;
        if (!gEl) continue;
        gEl.style.visibility = '';
        gEl.style.opacity = '';
        gEl.style.pointerEvents = '';
        gEl.style.filter = '';

        const tEl = galleries[gi].textGroupId ? svgContainer.querySelector('#' + galleries[gi].textGroupId) as HTMLElement | null : null;
        if (tEl) {
          tEl.style.visibility = '';
          tEl.style.opacity = '';
          tEl.style.pointerEvents = '';
          applyTextGroupAppearance(tEl as unknown as SVGElement, null);
        }

        const resetChildGroups = gEl.querySelectorAll('g');
        for (let rcg = 0; rcg < resetChildGroups.length; rcg++) {
          (resetChildGroups[rcg] as unknown as HTMLElement).style.visibility = '';
          (resetChildGroups[rcg] as unknown as HTMLElement).style.opacity = '';
          (resetChildGroups[rcg] as unknown as HTMLElement).style.pointerEvents = '';
        }

        const resetFills = gEl.querySelectorAll('path, polygon, rect, line, polyline, circle');
        for (let rf = 0; rf < resetFills.length; rf++) {
          (resetFills[rf] as HTMLElement).style.fill = '';
          (resetFills[rf] as HTMLElement).style.display = '';
          (resetFills[rf] as HTMLElement).style.visibility = '';
        }
      }

      const outlineResetGroup = svgContainer.querySelector('#outline');
      if (outlineResetGroup) {
        const outlineShapes = outlineResetGroup.querySelectorAll('path, polygon, rect, line, polyline, circle');
        for (let oi = 0; oi < outlineShapes.length; oi++) {
          (outlineShapes[oi] as HTMLElement).style.fill = '';
          (outlineShapes[oi] as HTMLElement).style.display = '';
          (outlineShapes[oi] as HTMLElement).style.stroke = '';
        }
      }

      for (let si = 0; si < structuralGroupIds.length; si++) {
        const rsEl = svgContainer.querySelector('#' + structuralGroupIds[si]) as HTMLElement | null;
        if (!rsEl) continue;
        rsEl.style.opacity = '';
        rsEl.style.pointerEvents = '';
        rsEl.style.filter = '';
      }

      for (let ai = 0; ai < auxiliaryGroupIds.length; ai++) {
        const raEl = svgContainer.querySelector('#' + auxiliaryGroupIds[ai]) as HTMLElement | null;
        if (!raEl) continue;
        raEl.style.opacity = '';
        raEl.style.pointerEvents = '';
      }
    }

    // Style "GALLERY N" number labels independently of gallery groups.
    // Keep inactive labels grey + thinner across every section so the
    // extracted number labels match the document and the gallery-name labels.
    const numberLabels = svgContainer.querySelector('#gallery-number-labels');
    if (numberLabels) {
      const labelGroups = numberLabels.querySelectorAll('[data-gallery-label]');
      for (let lg = 0; lg < labelGroups.length; lg++) {
        const labelEl = labelGroups[lg] as HTMLElement;
        const galId = labelEl.getAttribute('data-gallery-label') || '';
        const gal = galleriesById[galId];
        if (!gal) continue;
        const paths = labelEl.querySelectorAll('path');
        if (isZoomed) {
          labelEl.style.visibility = 'visible';
          let fill = '';
          let opacity = '1';
          let thinInactiveLabel = false;
          if (viewState.activeGalleryId) {
            // Gallery view
            if (galId === viewState.activeGalleryId) {
              fill = '#ffffff';
            } else if (gal.categoryId === viewState.activeCategoryId) {
              fill = '#969696';
              opacity = String(getInactiveSiblingOpacity(gal.categoryId));
              thinInactiveLabel = true;
            } else {
              fill = '#c0c0c0';
              opacity = String(getInactiveCategoryOpacity());
              thinInactiveLabel = true;
            }
          } else if (viewState.activeCategoryId) {
            // Category view
            if (gal.categoryId !== viewState.activeCategoryId) {
              fill = '#c0c0c0';
              opacity = String(getInactiveCategoryOpacity());
              thinInactiveLabel = true;
            }
          }
          labelEl.style.opacity = opacity;
          applySvgFilter(labelEl as unknown as SVGElement, thinInactiveLabel ? INACTIVE_LABEL_FILTER_ID : undefined);
          for (let p = 0; p < paths.length; p++) {
            (paths[p] as unknown as HTMLElement).style.fill = fill;
            (paths[p] as unknown as HTMLElement).style.stroke = '';
            (paths[p] as unknown as HTMLElement).style.strokeWidth = '';
            (paths[p] as unknown as HTMLElement).style.strokeLinejoin = '';
            (paths[p] as unknown as HTMLElement).style.paintOrder = '';
          }
        } else {
          labelEl.style.visibility = '';
          labelEl.style.opacity = '';
          applySvgFilter(labelEl as unknown as SVGElement);
          for (let p = 0; p < paths.length; p++) {
            (paths[p] as unknown as HTMLElement).style.fill = '';
            (paths[p] as unknown as HTMLElement).style.stroke = '';
            (paths[p] as unknown as HTMLElement).style.strokeWidth = '';
            (paths[p] as unknown as HTMLElement).style.strokeLinejoin = '';
            (paths[p] as unknown as HTMLElement).style.paintOrder = '';
          }
        }
      }
    }
  }, [viewState.screen, viewState.activeCategoryId, viewState.activeGalleryId, showPaths]);

  // Hand hint: flash gallery to gallery_active color during simulated tap
  const flashCatRef = useRef<{ catGalleryIds: string[] } | null>(null);
  useEffect(function handleGalleryFlash() {
    const flashId = handHint.flashGalleryId;

    if (!flashId) {
      const prev = flashCatRef.current;
      if (prev) {
        flashCatRef.current = null;
        const sc = svgContainerRef.current;
        if (sc) {
          for (let ri = 0; ri < prev.catGalleryIds.length; ri++) {
            applyColorStateToGallery(sc, prev.catGalleryIds[ri], 'category_active');
          }
          applySharedElementFills(sc, prev.catGalleryIds, null);
        }
      }
      return;
    }

    const svgContainer = svgContainerRef.current;
    if (!svgContainer) return;

    const flashGallery = galleriesById[flashId];
    if (!flashGallery) return;
    const cat = categoriesById[flashGallery.categoryId];
    if (!cat) return;

    const catGalleryIds = cat.galleryIds.map((id) => { return id as string; });
    flashCatRef.current = { catGalleryIds: catGalleryIds };

    for (let si = 0; si < catGalleryIds.length; si++) {
      const sibState = catGalleryIds[si] === flashId ? 'gallery_active' : 'gallery_inactive';
      applyColorStateToGallery(svgContainer, catGalleryIds[si], sibState);
    }

    applySharedElementFills(svgContainer, catGalleryIds, flashId);
  }, [handHint.flashGalleryId]);

  // Handle gallery press in category-view
  function handleGalleryDown(e: React.PointerEvent) {
    if (viewState.screen !== 'category-view' && viewState.screen !== 'categories') return;

    const target = e.target as Element;
    let current: Element | null = target;
    const container = svgContainerRef.current;

    while (current && current !== container) {
      if (current.id) {
        const matchedGallery = galleries.find((g) => { return g.svgGroupId === current!.id; });
        if (matchedGallery) {
          if (viewState.screen === 'categories' && onSelectCategory) {
            onSelectCategory(matchedGallery.categoryId as CategoryId);
          } else if (viewState.screen === 'category-view' && matchedGallery.categoryId === viewState.activeCategoryId && onSelectGallery) {
            onSelectGallery(matchedGallery.id);
          }
          return;
        }
      }
      current = current.parentElement;
    }
  }

  // Handle pointer up anywhere on map
  function handleMapPointerUp() {
    if (viewState.screen === 'gallery-view' && onDeselectGallery) {
      onDeselectGallery();
    }
  }

  // Render POI markers from editorConfig.
  // Special case: hide People Garden POIs in category view until Gallery 3 is actually opened.
  const poisForCurrentView = showPaths ? [] : editorConfig.pois.filter((poi) => {
    if (viewState.screen === 'gallery-view' && viewState.activeGalleryId) {
      return poi.galleryId === viewState.activeGalleryId;
    }
    if (viewState.screen === 'category-view' && viewState.activeCategoryId) {
      if (poi.galleryId === 'people-garden') return false;
      const category = categoriesById[viewState.activeCategoryId];
      return category ? category.galleryIds.indexOf(poi.galleryId as GalleryId) !== -1 : false;
    }
    return false;
  });

  const poiRenderItems = poisForCurrentView.map((poi) => {
    const isGalleryView = viewState.screen === 'gallery-view'
      || (handHint.flashGalleryId != null && poi.galleryId === handHint.flashGalleryId);
    const showPhoto = isGalleryView || tappedPoiId === poi.id;
    const configuredOverride = poiImageOverrides?.[poi.id];
    const resolvedImageUrl = typeof configuredOverride === 'string' && configuredOverride.trim().length > 0
      ? configuredOverride.trim()
      : poi.imageUrl;
    return {
      poi: poi,
      isGalleryView: isGalleryView,
      showPhoto: showPhoto,
      resolvedImageUrl: resolvedImageUrl,
    };
  });

  const poiImageUrls = Array.from(new Set(
    poiRenderItems
      .map((item) => item.resolvedImageUrl)
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
  ));

  useEffect(() => {
    const urlsToLoad = poiImageUrls.filter((url) => imageAspectRatios[url] == null);
    if (urlsToLoad.length === 0) return;

    let cancelled = false;

    for (let i = 0; i < urlsToLoad.length; i++) {
      const url = urlsToLoad[i];
      const image = new Image();

      image.onload = () => {
        if (cancelled) return;
        const nextAspectRatio = image.naturalHeight > 0
          ? image.naturalWidth / image.naturalHeight
          : DEFAULT_POI_CARD_ASPECT_RATIO;
        setImageAspectRatios((prev) => {
          if (prev[url] != null) return prev;
          return {
            ...prev,
            [url]: nextAspectRatio,
          };
        });
      };

      image.onerror = () => {
        if (cancelled) return;
        setImageAspectRatios((prev) => {
          if (prev[url] != null) return prev;
          return {
            ...prev,
            [url]: DEFAULT_POI_CARD_ASPECT_RATIO,
          };
        });
      };

      image.src = url;
    }

    return () => {
      cancelled = true;
    };
  }, [imageAspectRatios, poiImageUrls]);

  const poiLayouts: Record<string, PoiLayout> = {};
  if (poiLayerRect) {
    const layerProjection = getLayerProjection(poiLayerRect, poiLayerRef.current);
    const placedMarkers: PlacedPoiPoint[] = [];
    const markerRects: PoiCollisionRect[] = [];
    const markerFootprints: Record<string, PoiMarkerFootprint> = {};

    for (let i = 0; i < poiRenderItems.length; i++) {
      const poi = poiRenderItems[i].poi;
      const markerFootprint = getMarkerFootprint(poiRenderItems[i].isGalleryView);
      const basePoint = {
        x: (poi.positionX / 100) * poiLayerRect.w,
        y: (poi.positionY / 100) * poiLayerRect.h,
      };
      const marker = LOCKED_POI_MARKER_IDS.has(poi.id)
        ? getLockedPoiPoint(poi.id, basePoint, poiLayerRect)
        : placePoiWithoutOverlap(
          basePoint,
          markerFootprint.radius,
          poiLayerRect,
          textCollisionRects,
          placedMarkers,
        );
      placedMarkers.push({
        x: marker.x,
        y: marker.y,
        radius: markerFootprint.radius,
      });
      markerRects.push(buildRect(
        marker.x - (markerFootprint.w / 2),
        marker.y - (markerFootprint.h / 2),
        markerFootprint.w,
        markerFootprint.h,
      ));
      markerFootprints[poi.id] = markerFootprint;
      poiLayouts[poi.id] = { marker: marker, card: null };
    }

    const placedCards: PoiCollisionRect[] = [];
    for (let i = 0; i < poiRenderItems.length; i++) {
      const item = poiRenderItems[i];
      if (!item.showPhoto || !item.resolvedImageUrl) continue;
      const layout = poiLayouts[item.poi.id];
      if (!layout) continue;
      const markerFootprint = markerFootprints[item.poi.id] || getMarkerFootprint(item.isGalleryView);
      const cardSize = getPoiCardSize(imageAspectRatios[item.resolvedImageUrl]);

      const markerRectsWithoutSelf = markerRects.filter((_mr, idx) => idx !== i);
      const card = getLockedPoiCardRect(
        item.poi.id,
        layout.marker,
        markerFootprint,
        cardSize,
        poiLayerRect,
      ) || placeCardWithoutOverlap(
        layout.marker,
        markerFootprint,
        item.poi.photoPosition,
        cardSize,
        poiLayerRect,
        textCollisionRects,
        markerRectsWithoutSelf,
        placedCards,
        layerProjection,
      );
      placedCards.push(card);
      poiLayouts[item.poi.id] = {
        marker: layout.marker,
        card: card,
      };
    }
  }

  return (
    <div className="museum-map" data-screen={viewState.screen} onPointerUp={handleMapPointerUp}>
      <img className="museum-map__bg-layer" src="/display/templates/custom08/elements/base-map-background.svg" alt="" />
      <div
        className="museum-map__transform-layer"
        style={{ transform }}
      >
        <div
          className="museum-map__svg-container"
          ref={svgContainerRef}
          onPointerDown={handleGalleryDown}
        />
        {/* POI markers rendered inside transform layer */}
        {poisForCurrentView.length > 0 && poiLayerRect && (
          <div
            className="museum-map__poi-layer"
            ref={poiLayerRef}
            style={{
              width: poiLayerRect.w + 'px',
              height: poiLayerRect.h + 'px',
              left: poiLayerRect.l + 'px',
              top: poiLayerRect.t + 'px',
            }}
          >
            {poiRenderItems.map((item) => {
              const poi = item.poi;
              const marker = poiLayouts[poi.id]?.marker;
              return (
                <div
                  key={poi.id}
                  className={'museum-map__poi' + (item.isGalleryView ? ' museum-map__poi--gallery-view' : '')}
                  style={{
                    left: (marker?.x ?? (poi.positionX / 100) * (poiLayerRect?.w || 0)) + 'px',
                    top: (marker?.y ?? (poi.positionY / 100) * (poiLayerRect?.h || 0)) + 'px',
                  }}
                  title={poi.title}
                  onPointerUp={!item.isGalleryView ? () => {
                    if (tappedPoiTimerRef.current) clearTimeout(tappedPoiTimerRef.current);
                    setTappedPoiId(poi.id);
                    tappedPoiTimerRef.current = setTimeout(() => setTappedPoiId(null), 10000);
                  } : undefined}
                >
                  {item.isGalleryView ? (
                    <svg className="museum-map__poi-pin" viewBox="0 0 52 62" width="19" height="23">
                      <path
                        d="M49.96,25.97c0,13.25-23.98,34.13-23.98,34.13,2.17.24-23.98-20.89-23.98-34.13,0-13.25,10.74-23.98,23.98-23.98,13.25,0,23.98,10.74,23.98,23.98Z"
                        fill={poi.iconColor}
                      />
                      <polygon fill="#fffdfd" points="26.04 8.77 30.52 20.1 42.5 20.89 33.33 28.72 36.34 40.58 25.94 34.06 15.61 40.58 18.58 28.71 9.45 20.89 21.43 20.1 26.04 8.77" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 80 80" width="24" height="24">
                      <circle cx="40" cy="40" r="38" fill={poi.iconColor} />
                      <polygon fill="#fffdfd" points="40 12.75 47.1 30.7 66.08 31.95 51.56 44.37 56.33 63.16 39.85 52.83 23.47 63.16 28.18 44.34 13.72 31.95 32.7 30.7 40 12.75" />
                    </svg>
                  )}
                </div>
              );
            })}
            {poiRenderItems.map((item) => {
              if (!item.showPhoto || !item.resolvedImageUrl) return null;
              const cardRect = poiLayouts[item.poi.id]?.card;
              if (!cardRect) return null;
              return (
                <div
                  key={item.poi.id + '-photo'}
                  className="museum-map__poi-photo-card museum-map__poi-photo-card--floating"
                  data-poi-card-id={item.poi.id}
                  style={{
                    left: cardRect.left + 'px',
                    top: cardRect.top + 'px',
                    width: (cardRect.right - cardRect.left) + 'px',
                    height: (cardRect.bottom - cardRect.top) + 'px',
                  }}
                >
                  <img
                    className="museum-map__poi-photo"
                    src={item.resolvedImageUrl}
                    alt={item.poi.title}
                    draggable={false}
                    onLoad={(e) => {
                      const target = e.currentTarget;
                      const nextAspectRatio = target.naturalHeight > 0
                        ? target.naturalWidth / target.naturalHeight
                        : DEFAULT_POI_CARD_ASPECT_RATIO;
                      setImageAspectRatios((prev) => {
                        if (prev[item.resolvedImageUrl] === nextAspectRatio) return prev;
                        return {
                          ...prev,
                          [item.resolvedImageUrl]: nextAspectRatio,
                        };
                      });
                    }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* "You Are Here" pin marker -- visible only for businesses category */}
        {poiLayerRect && viewState.activeCategoryId === 'businesses' && (
          <div
            className="museum-map__poi-layer"
            style={{
              width: poiLayerRect.w + 'px',
              height: poiLayerRect.h + 'px',
              left: poiLayerRect.l + 'px',
              top: poiLayerRect.t + 'px',
              pointerEvents: 'none',
            }}
          >
            <img
              className="museum-map__you-are-here"
              src="/display/templates/custom08/elements/map-pin-marker.svg"
              alt="You are here"
              draggable={false}
              onPointerDown={() => { setShowPaths(true); }}
              onPointerUp={() => { setShowPaths(false); }}
              onPointerLeave={() => { setShowPaths(false); }}
              onPointerCancel={() => { setShowPaths(false); }}
              style={{
                position: 'absolute',
                left: youAreHerePosition.x + '%',
                top: youAreHerePosition.y + '%',
                width: '40px',
                height: '32px',
                transform: 'translate(-50%, -100%)',
                pointerEvents: 'auto',
                cursor: 'pointer',
                zIndex: -1,
              }}
            />
          </div>
        )}

        {/* Hand hint animation — disabled */}
      </div>
    </div>
  );
}
