import { useCallback } from 'react';
import { useAppShell } from '@/components/core/AppShell';
import { InteractiveMap } from '@/components/interactive/InteractiveMap';
import { IdleScreen } from '@/components/core/IdleScreen';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { config } from '@/lib/config';
import type { NavMapConfig } from '@/lib/types';

// ==========================================
// Types
// ==========================================

interface InteractiveMapTemplateProps {
  config: NavMapConfig;
  instanceId: string;
}

// ==========================================
// InteractiveMapTemplate
// ==========================================

function InteractiveMapTemplate(props: InteractiveMapTemplateProps) {
  useAppShell();
  const navConfig = props.config;

  const idle = useIdleTimer({
    enabled: true,
    inactivityTimeout: navConfig.inactivityTimeout || 30000,
  });

  useHeartbeat({
    deviceId: config().deviceId,
    templateType: 'nav-map',
    instanceId: props.instanceId,
  });

  const handleInteraction = useCallback(
    () => {
      idle.resetInactivityTimer();
    },
    [idle.resetInactivityTimer]
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <InteractiveMap
        mapImageUrl={navConfig.mapImageUrl}
        hotspots={navConfig.hotspots}
        onInteraction={handleInteraction}
      />
      {navConfig.idle && (
        <IdleScreen isIdle={idle.isIdle} idle={navConfig.idle} />
      )}
    </div>
  );
}

export { InteractiveMapTemplate };
export type { InteractiveMapTemplateProps };
