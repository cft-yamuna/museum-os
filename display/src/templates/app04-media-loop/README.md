# APP 04 — Media Loop / Signage Player

~14 installations across multiple zones.

## What it does
Zero interaction. Content plays on loop — could be video (fade to black, pause, repeat), auto-cycling slideshow deck, or ambient audio on directional speakers. Configurable for video-loop mode, slideshow-deck mode, or audio-only mode.

## Files
- `MediaLoopTemplate.tsx` — Main template component (renamed from VideoLoopTemplate)
- `installations.ts` — Registry of all AV installations using this template
- `types.ts` — Re-exported config types
- `index.ts` — Barrel exports

## Config options
- `mode`: `video-loop`, `slideshow`, or `audio`
- `fadeType`: fade to black, dissolve, matched first/last frame
- `pauseDuration`: gap between loops (default 5s)
- `slideInterval`: for slideshow mode, time per slide
- `audioOutput`: `screen` or `directional-speaker`
