# APP 02 — Monophone Video+Audio Player

~24 installations across multiple zones.

## What it does
Screen shows a poster/artwork frame as idle state. User picks up handset, 1-second delay, fade-through transition, video plays on screen with audio routed to handset speaker. Put handset down, video stops, dissolves to black, returns to poster frame. Some variants have physical buttons for multi-video selection. Some have background video walls that loop independently.

## Files
- `MonophoneVideoTemplate.tsx` — Main template component (renamed from VideoSyncTemplate)
- `installations.ts` — Registry of all AV installations using this template
- `types.ts` — Re-exported config types
- `index.ts` — Barrel exports

## Config options
- `idleFrame`: poster image or first frame of video
- `transition`: fade type (color change, exposure change, dissolve)
- `delay`: startup delay (default 1s)
- `selectionMode`: `single` or `button`
- `backgroundLoop`: optional always-playing background video
