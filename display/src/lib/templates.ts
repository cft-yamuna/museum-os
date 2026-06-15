export interface TemplateDefinition {
  path: string;
  name: string;
  description: string;
  supportsIdle: boolean;
  requiresMqtt: boolean;
  phase: number;
}

export const TEMPLATES: Record<string, TemplateDefinition> = {
  'video-loop': {
    path: '/apps/video-loop',
    name: 'Video Loop',
    description: 'Continuously loops a single video file',
    supportsIdle: false,
    requiresMqtt: false,
    phase: 1,
  },
  'video-loop-idle': {
    path: '/apps/video-loop-idle',
    name: 'Video Loop + Idle',
    description: 'Video loop with idle/screensaver screen',
    supportsIdle: true,
    requiresMqtt: false,
    phase: 1,
  },
  'slideshow': {
    path: '/apps/slideshow',
    name: 'Slideshow',
    description: 'Cycle through photos and videos with transitions',
    supportsIdle: false,
    requiresMqtt: false,
    phase: 2,
  },
  'slideshow-idle': {
    path: '/apps/slideshow-idle',
    name: 'Slideshow + Idle',
    description: 'Slideshow with idle screen fallback',
    supportsIdle: true,
    requiresMqtt: false,
    phase: 2,
  },
  'media-explorer': {
    path: '/apps/media-explorer',
    name: 'Media Explorer',
    description: 'Touch-friendly gallery for PDFs, photos, and videos',
    supportsIdle: true,
    requiresMqtt: false,
    phase: 3,
  },
  'touch-scroll': {
    path: '/apps/touch-scroll',
    name: 'Touch Scroll',
    description: 'Vertically scrollable interactive content',
    supportsIdle: true,
    requiresMqtt: false,
    phase: 3,
  },
  'nav-map': {
    path: '/apps/nav-map',
    name: 'Navigation Map',
    description: 'Interactive floor/site map with wayfinding',
    supportsIdle: true,
    requiresMqtt: false,
    phase: 3,
  },
  'monophone-audio': {
    path: '/apps/monophone-audio',
    name: 'Monophone Pickup Audio',
    description: 'Plays audio when monophone handset is picked up',
    supportsIdle: true,
    requiresMqtt: true,
    phase: 4,
  },
  'button-audio': {
    path: '/apps/button-audio',
    name: 'Button Select Audio',
    description: 'Plays audio based on physical button presses',
    supportsIdle: true,
    requiresMqtt: true,
    phase: 4,
  },
  'video-sync': {
    path: '/apps/video-sync',
    name: 'Video + Monophone Sync',
    description: 'Synchronized video playback triggered by monophone',
    supportsIdle: true,
    requiresMqtt: true,
    phase: 4,
  },
  'proximity': {
    path: '/apps/proximity',
    name: 'Proximity Trigger',
    description: 'Content activates on proximity sensor detection',
    supportsIdle: true,
    requiresMqtt: true,
    phase: 4,
  },
  'multi-screen': {
    path: '/apps/multi-screen',
    name: 'Multi-Screen Exhibit',
    description: 'Coordinated content across multiple displays',
    supportsIdle: false,
    requiresMqtt: false,
    phase: 3,
  },
} as const;

export type TemplateSlug = keyof typeof TEMPLATES;

export function getTemplate(slug: string): TemplateDefinition | undefined {
  return TEMPLATES[slug];
}

export function getTemplateUrl(slug: string, instanceId: string): string {
  const template = TEMPLATES[slug];
  if (!template) {
    throw new Error(`Unknown template: ${slug}`);
  }
  return `${template.path}/${instanceId}`;
}
