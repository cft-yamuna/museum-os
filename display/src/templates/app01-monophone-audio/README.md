# APP 01 — Monophone Audio Player

**~26 installations** across 7 museum zones.

## Overview

Audio playback template triggered by physical monophone handset hardware. Uses a single unified component (`MonophoneAudioTemplate`) with two modes:

- **Single mode**: One handset = one audio story. Pick up handset, audio plays after configurable delay. Hang up = fade out and reset.
- **Multi mode**: Physical button panel selects between multiple audio stories. Optional welcome message plays on first interaction.

## Hardware

- **ESP32 controller** per installation — communicates via MQTT
- **Monophone handset** — magnetic reed switch detects pickup/hangup
- **Button panel** (multi mode only) — up to 8 physical buttons mapped to stories

## Config

```typescript
interface MonophoneAudioConfig {
  mode: 'single' | 'multi';
  controllerId: string;      // ESP32 controller ID
  delay: number;             // startup delay in seconds (default 1)
  loop: boolean;             // auto-replay when story ends
  fadeOutDuration: number;   // fade out duration in ms (single mode)

  // Single mode
  audioUrl?: string;         // audio file URL
  idleImageUrl?: string;     // background image when idle
  idleVideoUrl?: string;     // background video when idle (overrides image)

  // Multi mode
  buttons?: ButtonItem[];    // button-to-audio mappings
  welcomeMessage?: string;   // optional intro audio URL

  idle: IdleConfig;          // idle/attract screen config
}
```

## Zones

| Zone | Count | AV Codes |
|------|:-----:|----------|
| Ambition | 1 | D-AV03 (multi) |
| Consumer Care | 6+ | F-AV01, F-AV04, F-AV09, F-AV16, F-AV18, F-AV24*, F-AV25* |
| WIN | 4 | G-AV03, G-AV04, G-AV06, G-AV10 |
| IT Pre 2000 | 9 | H-AV01, H-AV03, H-AV06, H-AV07a/c, H-AV08b, H-AV09a/b/c |
| IT Post 2000 | 6 | H-AV10b/d, H-AV12a (multi)/b/c, H-AV13a/c |
| Azim Premji Foundation | 1 | J-AV01 |

\* Unconfirmed installations

## Files

| File | Purpose |
|------|---------|
| `MonophoneAudioTemplate.tsx` | Unified template component (single + multi modes) |
| `installations.ts` | AV code registry with zone/mode/content metadata |
| `types.ts` | Re-exports `MonophoneAudioConfig`, `ButtonAudioConfig`, `ButtonItem` |
| `index.ts` | Barrel export |

## MQTT Events

- `monophone:pickup` — handset lifted (single mode)
- `monophone:hangup` — handset replaced (single mode)
- `button:press` — physical button pressed with `buttonId` (multi mode)

## Template Types

Both resolve to the same component via the registry:
- `app01-monophone-audio` (single mode default)
- `app01-monophone-audio-multi` (multi mode default)
- Legacy: `monophone-audio`, `button-audio`
