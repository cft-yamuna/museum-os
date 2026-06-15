import { useEffect, useRef, useCallback } from 'react';
import './MuseumScene.css';

type SceneScreen = 'screensaver' | 'categories';

interface MuseumSceneProps {
  readonly screen: SceneScreen;
  readonly onTapWelcome: () => void;
}

/** Sanitize SVG: strip scripts and inline event handlers */
function sanitizeSvg(svgText: string): Element {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
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

/** The three bottom nav circles by class + radius */
const CIRCLE_SELECTORS = [
  '.m__cls-26[r="172.98"]',
  '.m__cls-30[r="172.98"]',
  '.m__cls-28[r="172.98"]',
];

/** Wrap each circle and its preceding text sibling in a <g> for group animation */
const NAV_WRAPPER_CLASS = 'nav-circle-group';

function wrapNavCircles(container: HTMLElement): void {
  const svgNS = 'http://www.w3.org/2000/svg';

  CIRCLE_SELECTORS.forEach(function wrapCircle(selector) {
    const circle = container.querySelector(selector);
    if (!circle || circle.parentElement?.classList.contains(NAV_WRAPPER_CLASS)) return;

    const parent = circle.parentNode;
    if (!parent) return;

    const textEl = circle.previousElementSibling;
    const wrapper = document.createElementNS(svgNS, 'g');
    wrapper.setAttribute('class', NAV_WRAPPER_CLASS);

    parent.insertBefore(wrapper, textEl || circle);
    if (textEl) wrapper.appendChild(textEl);
    wrapper.appendChild(circle);
  });
}

/** Easing: cubic-bezier approximation via manual ease-out */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animate an SVG element's translateX from startX to 0 over duration ms.
 */
function animateSlideIn(
  el: SVGElement,
  startX: number,
  duration: number,
  delay: number,
): void {
  const start = performance.now() + delay;

  function tick(now: number) {
    const elapsed = now - start;
    if (elapsed < 0) {
      el.setAttribute('transform', 'translate(' + startX + ', 0)');
      requestAnimationFrame(tick);
      return;
    }
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(progress);
    const x = startX * (1 - eased);
    el.setAttribute('transform', 'translate(' + x + ', 0)');
    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  el.setAttribute('transform', 'translate(' + startX + ', 0)');
  requestAnimationFrame(tick);
}

export function MuseumScene({ screen, onTapWelcome }: MuseumSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgLoadedRef = useRef(false);
  const prevScreenRef = useRef<SceneScreen>(screen);

  const applyTransition = useCallback((container: HTMLDivElement, fromWelcome: boolean) => {
    const welcomeLayer = container.querySelector('#welcome-layer') as SVGGElement | null;
    const mapLayer = container.querySelector('#map-layer') as SVGGElement | null;

    if (fromWelcome) {
      if (welcomeLayer) {
        welcomeLayer.style.opacity = '1';
        welcomeLayer.style.transition = 'opacity 0.8s ease-out';
        welcomeLayer.style.webkitTransition = 'opacity 0.8s ease-out';
        void welcomeLayer.getBoundingClientRect();
        welcomeLayer.style.opacity = '0';
        setTimeout(function hideWelcome() {
          if (welcomeLayer) welcomeLayer.style.display = 'none';
        }, 850);
      }

      if (mapLayer) {
        mapLayer.style.display = '';
        mapLayer.style.opacity = '0';
        mapLayer.style.transition = 'opacity 1s ease-in';
        mapLayer.style.webkitTransition = 'opacity 1s ease-in';
        void mapLayer.getBoundingClientRect();
        mapLayer.style.opacity = '1';
      }

      const slideDistance = 600;
      const slideDuration = 1000;
      const staggerDelay = 250;

      const wrappers = container.querySelectorAll('.' + NAV_WRAPPER_CLASS);
      wrappers.forEach(function slideGroup(wrapper, i) {
        animateSlideIn(wrapper as SVGElement, slideDistance, slideDuration, 400 + i * staggerDelay);
      });
    } else {
      if (mapLayer) {
        mapLayer.style.display = 'none';
        mapLayer.style.opacity = '0';
        mapLayer.style.transition = '';
        mapLayer.style.webkitTransition = '';
      }
      if (welcomeLayer) {
        welcomeLayer.style.display = '';
        welcomeLayer.style.opacity = '1';
        welcomeLayer.style.transition = '';
        welcomeLayer.style.webkitTransition = '';
      }

      const wrappers = container.querySelectorAll('.' + NAV_WRAPPER_CLASS);
      wrappers.forEach(function resetGroup(wrapper) {
        (wrapper as SVGElement).removeAttribute('transform');
      });
    }
  }, []);

  // Load combined SVG inline (once)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || svgLoadedRef.current) return;

    const controller = new AbortController();

    fetch('/museum-combined.svg', { signal: controller.signal })
      .then((res) => res.text())
      .then((svgText) => {
        if (controller.signal.aborted) return;

        const svgEl = sanitizeSvg(svgText);
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        svgEl.setAttribute('class', 'museum-scene__svg');

        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        container.appendChild(svgEl);
        svgLoadedRef.current = true;

        wrapNavCircles(container);

        const welcomeLayer = container.querySelector('#welcome-layer') as SVGGElement | null;
        const mapLayer = container.querySelector('#map-layer') as SVGGElement | null;
        if (screen === 'screensaver') {
          if (welcomeLayer) { welcomeLayer.style.display = ''; welcomeLayer.style.opacity = '1'; }
          if (mapLayer) { mapLayer.style.display = 'none'; }
        } else {
          if (welcomeLayer) { welcomeLayer.style.display = 'none'; }
          if (mapLayer) { mapLayer.style.display = ''; mapLayer.style.opacity = '1'; }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('Failed to load museum SVG:', err);
        }
      });

    return () => { controller.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle screen transitions
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !svgLoadedRef.current) return;

    const prev = prevScreenRef.current;
    prevScreenRef.current = screen;

    if (prev === screen) return;

    const fromWelcome = prev === 'screensaver' && screen === 'categories';
    applyTransition(container, fromWelcome);
  }, [screen, applyTransition]);

  return (
    <div
      className="museum-scene"
      data-screen={screen}
      onPointerUp={screen === 'screensaver' ? onTapWelcome : undefined}
      ref={containerRef}
    />
  );
}
