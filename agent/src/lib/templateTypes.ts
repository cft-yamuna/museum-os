export const HILIGHT_TIMELINE_TEMPLATE = 'custom01-hilight-timeline';
export const LEGACY_WIPRO_TIMELINE_TEMPLATE = 'custom01-wipro-timeline';

const TEMPLATE_ALIASES: Record<string, string> = {
  [LEGACY_WIPRO_TIMELINE_TEMPLATE]: HILIGHT_TIMELINE_TEMPLATE,
};

const PRESENCE_ENABLED_TEMPLATES = new Set([
  HILIGHT_TIMELINE_TEMPLATE,
]);

export function normalizeTemplateType(templateType: string | undefined | null): string {
  const type = (templateType || '').trim();
  return TEMPLATE_ALIASES[type] || type;
}

export function isPresenceEnabledTemplate(templateType: string | undefined | null): boolean {
  return PRESENCE_ENABLED_TEMPLATES.has(normalizeTemplateType(templateType));
}
