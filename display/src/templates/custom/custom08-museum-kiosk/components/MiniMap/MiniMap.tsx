import { useEffect, useRef, useMemo } from 'react';
import type { CategoryId, GalleryId } from '../../types';
import { galleries } from '../../data/galleries';
import { categoriesById } from '../../data/categories';
import { categoryViewports } from '../../data/mapViewports';
import mapSvgUrl from '../../svg/museum-map.svg';
import './MiniMap.css';

interface MiniMapProps {
  readonly visible: boolean;
  readonly activeCategoryId: CategoryId | null;
  readonly activeGalleryId: GalleryId | null;
}

/**
 * Parse CSS transform string: "translate(X%, Y%) scale(S)"
 */
function parseTransform(transform: string): {
  tx: number;
  ty: number;
  scale: number;
} {
  const translateMatch = transform.match(
    /translate\(\s*([^,]+),\s*([^)]+)\)/
  );
  const scaleMatch = transform.match(/scale\(\s*([^)]+)\)/);

  const tx = translateMatch ? parseFloat(translateMatch[1]) : 0;
  const ty = translateMatch ? parseFloat(translateMatch[2]) : 0;
  const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

  return { tx, ty, scale };
}

/**
 * Compute the visible viewport rectangle in percentage coordinates.
 */
function computeViewportRect(transform: string) {
  const { tx, ty, scale } = parseTransform(transform);

  const left = 50 + (-50 - tx) / scale;
  const top = 50 + (-50 - ty) / scale;
  const width = 100 / scale;
  const height = 100 / scale;

  return { left, top, width, height };
}

/** Sanitize SVG for minimap: strip scripts, event handlers, text elements */
function sanitizeMiniSvg(svgText: string): Element {
  if (!svgText.trim()) {
    throw new Error('Mini map SVG response was empty');
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`Mini map SVG parse failed: ${parserError.textContent?.trim() || 'Unknown parser error'}`);
  }
  const svgEl = doc.documentElement;

  // Remove dangerous elements
  const dangerous = svgEl.querySelectorAll('script, foreignObject');
  for (let d = 0; d < dangerous.length; d++) {
    dangerous[d].parentNode?.removeChild(dangerous[d]);
  }

  // Remove inline event handlers
  const allEls = svgEl.querySelectorAll('*');
  for (let i = 0; i < allEls.length; i++) {
    const el = allEls[i];
    for (let a = el.attributes.length - 1; a >= 0; a--) {
      if (el.attributes[a].name.startsWith('on')) {
        el.removeAttribute(el.attributes[a].name);
      }
    }
  }

  // Remove all text elements (too small to read in minimap)
  const textEls = svgEl.querySelectorAll('text');
  for (let t = 0; t < textEls.length; t++) {
    textEls[t].parentNode?.removeChild(textEls[t]);
  }

  // Remove broken linked images
  const images = svgEl.querySelectorAll('image');
  for (let im = 0; im < images.length; im++) {
    const href = images[im].getAttribute('href')
      || images[im].getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      || '';
    if (href && !href.startsWith('data:') && !href.startsWith('http')) {
      images[im].parentNode?.removeChild(images[im]);
    }
  }

  return svgEl;
}

export function MiniMap({
  visible,
  activeCategoryId,
  activeGalleryId,
}: MiniMapProps) {
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // Load SVG inline
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;

    const controller = new AbortController();

    fetch(mapSvgUrl, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load mini map SVG: ${res.status} ${res.statusText}`);
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('image/svg+xml')) {
          throw new Error(`Mini map SVG returned unexpected content type: ${contentType || 'unknown'}`);
        }
        return res.text();
      })
      .then((svgText) => {
        if (controller.signal.aborted) return;

        const svgEl = sanitizeMiniSvg(svgText);
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        // Clear container and append
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        container.appendChild(svgEl);

        // Tag gallery groups for visual state styling (non-interactive)
        for (let g = 0; g < galleries.length; g++) {
          const groupEl = svgEl.querySelector(`#${galleries[g].svgGroupId}`) as HTMLElement | null;
          if (groupEl) {
            groupEl.setAttribute('data-gallery-id', galleries[g].id);
          }
        }

        // Hide route layers by default (shown per-category in visual states effect)
        const layer21 = svgEl.querySelector('#Layer_21') as HTMLElement | null;
        if (layer21) layer21.style.display = 'none';
        const st31Path = svgEl.querySelector('.st31') as HTMLElement | null;
        if (st31Path?.parentElement) {
          (st31Path.parentElement as HTMLElement).style.display = 'none';
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('MiniMap: Failed to load SVG:', err);
      });

    return () => {
      controller.abort();
    };
  }, []);

  // Apply visual states: keep active category galleries in color, gray out the rest
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;

    for (let g = 0; g < galleries.length; g++) {
      const gallery = galleries[g];
      const groupEl = container.querySelector(`#${gallery.svgGroupId}`) as HTMLElement | null;
      if (!groupEl) continue;

      // Reset
      groupEl.style.opacity = '';
      groupEl.style.filter = '';

      if (activeGalleryId) {
        if (gallery.id === activeGalleryId) {
          groupEl.style.opacity = '1';
          groupEl.style.filter = 'none';
        } else if (gallery.categoryId === activeCategoryId) {
          groupEl.style.opacity = '0.7';
          groupEl.style.filter = 'none';
        } else {
          groupEl.style.opacity = '0.5';
          groupEl.style.filter = 'grayscale(1)';
        }
      } else if (activeCategoryId) {
        if (gallery.categoryId === activeCategoryId) {
          groupEl.style.opacity = '1';
          groupEl.style.filter = 'none';
        } else {
          groupEl.style.opacity = '0.5';
          groupEl.style.filter = 'grayscale(1)';
        }
      }
    }

    // Route paths: show category-specific paths in the minimap
    const layer21 = container.querySelector('#Layer_21') as HTMLElement | null;
    const st31Path = container.querySelector('.st31') as HTMLElement | null;
    const st31Group = st31Path?.parentElement as HTMLElement | null;

    // Hide all route layers by default
    if (layer21) layer21.style.display = 'none';
    if (st31Group && st31Group !== container) st31Group.style.display = 'none';

    if (activeCategoryId === 'origin' && layer21) {
      // Show only .st27 path from Layer_21
      layer21.style.display = '';
      const children = layer21.children;
      for (let lc = 0; lc < children.length; lc++) {
        (children[lc] as HTMLElement).style.display = 'none';
      }
      const st27Path = layer21.querySelector('.st27') as HTMLElement | null;
      if (st27Path) {
        st27Path.style.display = '';
        const parent = st27Path.parentElement;
        if (parent && parent !== layer21) parent.style.display = '';
      }
    } else if (activeCategoryId === 'businesses' && layer21) {
      // Show all route paths in Layer_21 except .st27 (origin-only)
      layer21.style.display = '';
      const children = layer21.children;
      for (let lc = 0; lc < children.length; lc++) {
        (children[lc] as HTMLElement).style.display = '';
      }
      const st27Path = layer21.querySelector('.st27') as HTMLElement | null;
      if (st27Path) st27Path.style.display = 'none';
    } else if (activeCategoryId === 'community' && st31Group) {
      // Show .st31 path group
      st31Group.style.display = '';
    }

    // Gray out non-gallery structural groups when a category is selected
    const nonGalleryIds = [
      'entry_room', 'Lifts', 'men_s_restroom', 'restroom',
      'staircase', 'recording_room', 'programing_area',
      'gallery_Proluge', 'entry',
      'Layer_1-2',
    ];
    for (let ng = 0; ng < nonGalleryIds.length; ng++) {
      const ngEl = container.querySelector(`#${nonGalleryIds[ng]}`) as HTMLElement | null;
      if (!ngEl) continue;
      if (activeCategoryId) {
        ngEl.style.opacity = '0.5';
        ngEl.style.filter = 'grayscale(1)';
      } else {
        ngEl.style.opacity = '';
        ngEl.style.filter = '';
      }
    }
  }, [activeCategoryId, activeGalleryId]);

  // Compute viewport rect (must be before any conditional return)
  const transform = activeCategoryId
    ? categoryViewports[activeCategoryId].transform
    : 'translate(0px, 0px) scale(1)';

  const viewportRect = useMemo(
    () => computeViewportRect(transform),
    [transform]
  );

  const categoryColor = activeCategoryId
    ? categoriesById[activeCategoryId].color
    : undefined;

  return (
    <div className="mini-map" style={{ display: visible ? '' : 'none' }}>
      <div className="mini-map__frame">
        {/* Inline SVG (non-interactive key map) */}
        <div className="mini-map__svg-layer" ref={svgContainerRef} style={{ pointerEvents: 'none' }} />

        {/* Viewport rectangle -- shows current visible area */}
        <div
          className="mini-map__viewport-rect"
          style={{
            left: `${viewportRect.left}%`,
            top: `${viewportRect.top}%`,
            width: `${viewportRect.width}%`,
            height: `${viewportRect.height}%`,
            ...(categoryColor
              ? ({ '--viewport-color': categoryColor } as React.CSSProperties)
              : {}),
          }}
        />
      </div>
    </div>
  );
}
