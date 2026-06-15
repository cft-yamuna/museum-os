# APP 05 — Interactive Map / Wayfinding

3 installations.

## What it does
Always-on facility/world map with touch zones. Touch a section to highlight with animation, shows subsections with time estimates, reveals POI markers. Touch a POI for popup with details (text, images). Touch anywhere else to dismiss. "You Are Here" marker for orientation.

## Files
- `InteractiveMapTemplate.tsx` — Main template component (renamed from NavMapTemplate)
- `installations.ts` — Registry of all AV installations using this template
- `types.ts` — Re-exported config types
- `index.ts` — Barrel exports

## Config options
- `mapAsset`: base map artwork file
- `sections`: list of touchable sections with highlight overlays
- `pois`: list of points of interest with detail content
- `youAreHere`: marker position coordinates
- `timeEstimates`: per-section/POI duration estimates
