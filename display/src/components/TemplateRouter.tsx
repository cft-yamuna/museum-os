import React, { useEffect, useState } from 'react';
import type { AnyAppConfig } from '@/lib/types';
import { TEMPLATE_REGISTRY, resolveTemplateType } from '@/templates/registry';
import { ErrorScreen } from '@/components/core/ErrorScreen';

// ==========================================
// Types
// ==========================================

interface TemplateRouterProps {
  config: AnyAppConfig;
  templateType: string;
  instanceId: string;
  revision: string;
}

const TOUCH_HOME_TIMEOUT_MS = 30000;

const TOUCH_HOME_TEMPLATE_TYPES = new Set([
  'app03-touch-carousel',
  'app05-interactive-map',
  'app06-media-browser',
  'touch-scroll',
]);

// ==========================================
// TemplateRouter
// ==========================================

function TemplateRouter(props: TemplateRouterProps) {
  const resolved = resolveTemplateType(props.templateType);
  const Component = TEMPLATE_REGISTRY[resolved];
  const [homeResetKey, setHomeResetKey] = useState(0);
  const isTouchHomeTemplate = TOUCH_HOME_TEMPLATE_TYPES.has(resolved);
  const screenIndex = typeof (props.config as { screenIndex?: unknown }).screenIndex === 'number'
    ? String((props.config as { screenIndex?: number }).screenIndex)
    : 'na';

  useEffect(() => {
    setHomeResetKey(0);
  }, [props.instanceId, resolved]);

  useEffect(() => {
    if (!isTouchHomeTemplate) return;

    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    const startInactivityTimer = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
      }
      inactivityTimer = setTimeout(() => {
        inactivityTimer = null;
        setHomeResetKey((prev) => prev + 1);
      }, TOUCH_HOME_TIMEOUT_MS);
    };

    const interactionEvents = [
      'touchstart',
      'touchend',
      'pointerdown',
      'mousedown',
      'wheel',
      'keydown',
    ] as const;

    interactionEvents.forEach((eventName) => {
      window.addEventListener(eventName, startInactivityTimer);
    });

    startInactivityTimer();

    return () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
      }
      interactionEvents.forEach((eventName) => {
        window.removeEventListener(eventName, startInactivityTimer);
      });
    };
  }, [isTouchHomeTemplate, props.instanceId, resolved]);

  if (!Component) {
    return React.createElement(ErrorScreen, {
      message: `Unknown template type: ${props.templateType}`,
    });
  }

  return React.createElement(Component, {
    key: `${props.instanceId}:${props.revision}:${screenIndex}:${homeResetKey}`,
    config: props.config,
    instanceId: props.instanceId,
  });
}

export { TemplateRouter };
export type { TemplateRouterProps };
