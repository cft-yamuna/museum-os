import { useEffect, useRef } from 'react';
import type { CategoryId } from '../../types';
import { categories } from '../../data/categories';
import './CategoryCircles.css';

/** Map each category to its pre-designed navigation circle SVG */
const circleSvgByCategory: Record<string, string> = {
  origin: '/display/templates/custom08/elements/nav-circle-galleries-1-3.svg',
  businesses: '/display/templates/custom08/elements/nav-circle-galleries-4-7.svg',
  community: '/display/templates/custom08/elements/nav-circle-galleries-8-9.svg',
};

interface CategoryCirclesProps {
  readonly visible: boolean;
  readonly onSelect: (categoryId: CategoryId) => void;
}

/**
 * Scope all CSS class names and IDs in the SVG text so multiple
 * inline SVGs don't clash in the DOM. Appends `-{suffix}` to:
 * gradient ID, class names used in style block and elements.
 */
function scopeSvgText(svgText: string, suffix: string): string {
  // Scope gradient ID
  let result = svgText
    .replace(/id="gradient"/g, `id="gradient-${suffix}"`)
    .replace(/url\(#gradient\)/g, `url(#gradient-${suffix})`);

  // Scope all class names used in the SVGs
  const classNames = ['circle-stroke', 'label', 'ls-02', 'ls-0', 'ls-n02', 'ls-01'];
  for (let i = 0; i < classNames.length; i++) {
    const cls = classNames[i];
    const scoped = `${cls}-${suffix}`;
    // In style block: .className {
    result = result.replace(
      new RegExp('\\.' + cls.replace('-', '\\-') + '(\\s*[{,])', 'g'),
      '.' + scoped + '$1'
    );
    // In class attributes: class="className" or class="cls1 cls2"
    result = result.replace(
      new RegExp('(class="[^"]*?)\\b' + cls + '\\b', 'g'),
      '$1' + scoped
    );
  }

  return result;
}

function parseCircleSvg(svgText: string, categoryId: string): SVGElement {
  if (!svgText.trim()) {
    throw new Error(`Category circle SVG response was empty for ${categoryId}`);
  }

  const scopedText = scopeSvgText(svgText, categoryId);
  const parser = new DOMParser();
  const doc = parser.parseFromString(scopedText, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`Category circle SVG parse failed for ${categoryId}: ${parserError.textContent?.trim() || 'Unknown parser error'}`);
  }

  return doc.documentElement as unknown as SVGElement;
}

/**
 * Single circle button that loads its SVG inline with scoped styles,
 * then applies rotation animation only to the <circle> element.
 */
function CircleButton(props: {
  readonly categoryId: CategoryId;
  readonly svgSrc: string;
  readonly label: string;
  readonly visible: boolean;
  readonly onSelect: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !props.svgSrc) return;

    const controller = new AbortController();

    fetch(props.svgSrc, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load category circle SVG: ${res.status} ${res.statusText}`);
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('image/svg+xml')) {
          throw new Error(`Category circle SVG returned unexpected content type: ${contentType || 'unknown'}`);
        }
        return res.text();
      })
      .then((svgText) => {
        if (controller.signal.aborted) return;
        if (!container) return;

        const svgEl = parseCircleSvg(svgText, props.categoryId);

        // Add class for sizing
        svgEl.setAttribute('class', 'category-circles__circle-svg');

        // Find the circle element and make it spin
        const circleEl = svgEl.querySelector('circle');
        if (circleEl) {
          circleEl.classList.add('category-circles__spinning-ring');
          // Set transform-origin to circle's own center
          const cx = circleEl.getAttribute('cx') || '0';
          const cy = circleEl.getAttribute('cy') || '0';
          circleEl.style.transformOrigin = `${cx}px ${cy}px`;
        }

        // Clear and append
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        container.appendChild(svgEl);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Failed to load category circle SVG:', props.categoryId, err);
      });

    return () => {
      controller.abort();
    };
  }, [props.svgSrc, props.categoryId]);

  return (
    <button
      className="category-circles__item touch-press"
      onPointerUp={props.onSelect}
      aria-label={`Explore ${props.label}`}
      tabIndex={props.visible ? 0 : -1}
    >
      <span className="category-circles__ring" ref={containerRef} />
    </button>
  );
}

export function CategoryCircles({ visible, onSelect }: CategoryCirclesProps) {
  return (
    <div className="category-circles" data-visible={visible ? 'true' : 'false'}>
      {categories.map((cat) => {
        const svgSrc = circleSvgByCategory[cat.id];

        return (
          <CircleButton
            key={cat.id}
            categoryId={cat.id}
            svgSrc={svgSrc}
            label={cat.label}
            visible={visible}
            onSelect={() => { onSelect(cat.id); }}
          />
        );
      })}
    </div>
  );
}
