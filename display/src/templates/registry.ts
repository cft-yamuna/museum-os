import type { ComponentType } from 'react';

// ==========================================
// Template Imports — Catalog Apps
// ==========================================

import { MonophoneAudioTemplate } from './app01-monophone-audio';
import { MonophoneVideoTemplate } from './app02-monophone-video';
import { TouchCarouselTemplate } from './app03-touch-carousel';
import { MediaLoopTemplate } from './app04-media-loop';
import { InteractiveMapTemplate } from './app05-interactive-map';
import { MediaBrowserTemplate } from './app06-media-browser';

// ==========================================
// Template Imports — Shared / Utility
// ==========================================

import { ProximityTemplate } from './shared';
import { MultiScreenTemplate } from './shared';
import { TouchScrollTemplate } from './shared';

// ==========================================
// Template Imports — Custom
// ==========================================

import { HiLightTimelineTemplate } from './custom/custom01-hilight-timeline';
import { ReceptionProgramTemplate } from './custom/custom06-reception-program';
import { OscTriggerTemplate } from './custom/custom07-osc';
import { MuseumKioskTemplate } from './custom/custom08-museum-kiosk';

// ==========================================
// Template Imports — Visual Builder (data-driven)
// ==========================================

import { BuilderTemplate } from './custom-builder';

// ==========================================
// Template Registry
// ==========================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TEMPLATE_REGISTRY: Record<string, ComponentType<any>> = {
  // Catalog apps
  'app01-monophone-audio': MonophoneAudioTemplate,
  'app01-monophone-audio-multi': MonophoneAudioTemplate,
  'app02-monophone-video': MonophoneVideoTemplate,
  'app03-touch-carousel': TouchCarouselTemplate,
  'app04-media-loop': MediaLoopTemplate,
  'app05-interactive-map': InteractiveMapTemplate,
  'app06-media-browser': MediaBrowserTemplate,
  // Shared / utility
  'proximity': ProximityTemplate,
  'touch-scroll': TouchScrollTemplate,
  'multi-screen': MultiScreenTemplate,
  // Custom
  'custom01-hilight-timeline': HiLightTimelineTemplate,
  'custom06-reception-program': ReceptionProgramTemplate,
  'custom07-osc': OscTriggerTemplate,
  'custom08-museum-kiosk': MuseumKioskTemplate,
  // Visual builder (data-driven, config-only)
  'custom-builder': BuilderTemplate,
};

// ==========================================
// Aliases (empty — legacy names removed)
// ==========================================

export const TEMPLATE_ALIASES: Record<string, string> = {
  'custom01-wipro-timeline': 'custom01-hilight-timeline',
};

// ==========================================
// Resolver
// ==========================================

export function resolveTemplateType(type: string): string {
  return TEMPLATE_ALIASES[type] || type;
}
