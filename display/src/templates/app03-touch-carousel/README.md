# APP 03 — Touch Carousel Gallery

~18 installations across multiple zones.

## What it does
Auto-playing slideshow of images/videos with dissolve transitions. Configurable per-slide timing. On touch, pause and reveal bottom carousel strip (iOS Photos-style). User swipes through thumbnails to jump to any item. After 5 seconds of no selection, carousel hides. After 30 seconds of no touch, resumes auto-play from last viewed item.

## Files
- `TouchCarouselTemplate.tsx` — Main template component (renamed from SlideshowTemplate)
- `installations.ts` — Registry of all AV installations using this template
- `types.ts` — Re-exported config types
- `index.ts` — Barrel exports

## Config options
- `slideDuration`: per-slide display time in seconds (default 10-15s)
- `transition`: dissolve type and duration
- `mediaItems`: ordered list of images and/or videos
- `carouselTimeout`: seconds before carousel auto-hides (default 5s)
- `inactivityTimeout`: seconds before auto-resume (default 30s)
