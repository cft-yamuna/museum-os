import type { ComponentType } from 'react';
import type { ConfigPanelProps } from './SharedConfigFields';

import { App01AudioConfig } from './App01AudioConfig';
import { App02VideoConfig } from './App02VideoConfig';
import { App03CarouselConfig } from './App03CarouselConfig';
import { App04MediaLoopConfig } from './App04MediaLoopConfig';
import { App05MapConfig } from './App05MapConfig';
import { App06BrowserConfig } from './App06BrowserConfig';
import { ProximityConfig, TouchScrollConfig, MultiScreenConfig, DiagnosticsConfig } from './SharedTemplateConfigs';
import { Custom01TimelineConfig } from './Custom01TimelineConfig';
import { Custom06ReceptionConfig } from './Custom06ReceptionConfig';
import { Custom07OscConfig } from './Custom07OscConfig';
import { Custom08MuseumKioskConfig } from './Custom08MuseumKioskConfig';

// ==========================================
// Config Panel Registry
// Maps template type strings to their config panel components.
// Both catalog names and legacy names point to the same panel.
// ==========================================

export const CONFIG_PANELS: Record<string, ComponentType<ConfigPanelProps>> = {
  // APP 01 — Monophone Audio
  'app01-monophone-audio': App01AudioConfig,
  'app01-monophone-audio-multi': App01AudioConfig,

  // APP 02 — Monophone Video
  'app02-monophone-video': App02VideoConfig,

  // APP 03 — Touch Carousel
  'app03-touch-carousel': App03CarouselConfig,

  // APP 04 — Media Loop
  'app04-media-loop': App04MediaLoopConfig,

  // APP 05 — Interactive Map
  'app05-interactive-map': App05MapConfig,

  // APP 06 — Media Browser
  'app06-media-browser': App06BrowserConfig,

  // Shared / Utility
  'proximity': ProximityConfig,
  'touch-scroll': TouchScrollConfig,
  'multi-screen': MultiScreenConfig,
  'diagnostics': DiagnosticsConfig as unknown as ComponentType<ConfigPanelProps>,

  // Custom
  'custom01-hilight-timeline': Custom01TimelineConfig,
  'custom01-wipro-timeline': Custom01TimelineConfig,
  'custom06-reception-program': Custom06ReceptionConfig,
  'custom07-osc': Custom07OscConfig,
  'custom08-museum-kiosk': Custom08MuseumKioskConfig,
};

// Re-export shared types
export type { ConfigPanelProps } from './SharedConfigFields';
