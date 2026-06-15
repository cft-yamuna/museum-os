'use client';

/**
 * Media preloading utilities for reducing startup time.
 */

export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to preload image: ${url}`));
    img.src = url;
  });
}

export function preloadVideo(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;

    video.oncanplay = () => {
      video.oncanplay = null;
      video.onerror = null;
      video.src = '';
      video.load();
      resolve();
    };

    video.onerror = () => {
      video.oncanplay = null;
      video.onerror = null;
      reject(new Error(`Failed to preload video: ${url}`));
    };

    video.src = url;
  });
}

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0];
  return lower.endsWith('.mp4')
    || lower.endsWith('.mov')
    || lower.endsWith('.webm')
    || lower.endsWith('.ogv')
    || lower.endsWith('.ogg');
}

/**
 * Preload multiple assets in parallel with a concurrency limit.
 * Errors on individual assets are logged but do not reject the batch.
 */
export function preloadAssets(urls: string[], concurrency = 3): Promise<void> {
  const queue = [...urls];
  let active = 0;
  let finished = 0;
  const total = queue.length;

  if (total === 0) return Promise.resolve();

  return new Promise((resolve) => {
    function next() {
      if (finished >= total) { resolve(); return; }

      while (active < concurrency && queue.length > 0) {
        const url = queue.shift()!;
        active++;

        const loader = isVideoUrl(url) ? preloadVideo(url) : preloadImage(url);
        loader.then(
          () => { active--; finished++; next(); },
          (err) => {
            console.warn(`[preload] ${err instanceof Error ? err.message : String(err)}`);
            active--; finished++; next();
          }
        );
      }
    }
    next();
  });
}
