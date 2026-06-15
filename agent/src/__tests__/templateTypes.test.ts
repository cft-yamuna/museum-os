import { describe, expect, it } from 'vitest';
import { isPresenceEnabledTemplate, normalizeTemplateType } from '../lib/templateTypes.js';

describe('template type compatibility', () => {
  it('normalizes the legacy Wipro timeline type to the canonical Museum OS timeline type', () => {
    expect(normalizeTemplateType('custom01-wipro-timeline')).toBe('custom01-hilight-timeline');
  });

  it('treats both Museum OS and legacy timeline types as presence-enabled', () => {
    expect(isPresenceEnabledTemplate('custom01-hilight-timeline')).toBe(true);
    expect(isPresenceEnabledTemplate('custom01-wipro-timeline')).toBe(true);
    expect(isPresenceEnabledTemplate('custom08-museum-kiosk')).toBe(false);
  });
});
