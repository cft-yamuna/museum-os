# APP 06 — Touch Media Browser

~10 installations across multiple zones.

## What it does
A browsable interface for exploring mixed media content — PDFs, photos, videos, text, infographics. Category-based navigation, possibly search/filter. Works with or without audio. Designed to handle varying depth of content.

## Files
- `MediaBrowserTemplate.tsx` — Main template component (renamed from MediaExplorerTemplate)
- `installations.ts` — Registry of all AV installations using this template
- `types.ts` — Re-exported config types
- `index.ts` — Barrel exports

## Config options
- `categories`: content categories/sections
- `mediaTypes`: which types are present (pdf, photo, video, text)
- `audioEnabled`: whether audio playback is available
- `searchEnabled`: whether search/filter is active
- `layout`: grid, list, or custom
