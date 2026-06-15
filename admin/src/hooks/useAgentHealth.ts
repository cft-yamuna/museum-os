import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAgentInfo, fetchHealthHistory } from '../lib/agentApi';
import { adminWs } from '../lib/ws';
import type { AgentInfo, HealthHistoryEntry, HealthReport } from '../lib/types';

interface UseAgentHealthResult {
  agentInfo: AgentInfo | null;
  healthHistory: HealthHistoryEntry[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useAgentHealth(deviceId: string | undefined): UseAgentHealthResult {
  const queryClient = useQueryClient();

  const {
    data: agentInfo = null,
    isLoading: infoLoading,
    isError: infoError,
    refetch: refetchInfo,
  } = useQuery({
    queryKey: ['agent-info', deviceId],
    queryFn: () => fetchAgentInfo(deviceId!),
    enabled: !!deviceId,
    refetchInterval: 30_000,
  });

  const {
    data: healthHistory = [],
    isLoading: historyLoading,
    isError: historyError,
  } = useQuery({
    queryKey: ['health-history', deviceId],
    queryFn: () => fetchHealthHistory(deviceId!, 100),
    enabled: !!deviceId,
    refetchInterval: 5 * 60_000,
  });

  // Subscribe to real-time health updates via WebSocket
  useEffect(() => {
    if (!deviceId) return;

    // Subscribe to device updates
    adminWs.send({ type: 'subscribe:device', payload: { deviceId } });

    const unsub = adminWs.on('agent:health', (_event, data) => {
      const update = data as { deviceId: string } & Record<string, unknown>;
      if (update.deviceId !== deviceId) return;

      // Update the agent info cache with fresh health data
      queryClient.setQueryData<AgentInfo>(
        ['agent-info', deviceId],
        (old) => {
          if (!old) return old;
          const { deviceId: _id, ...healthFields } = update;
          return {
            ...old,
            last_health: healthFields as unknown as HealthReport,
          };
        }
      );
    });

    return () => {
      unsub();
      adminWs.send({ type: 'unsubscribe:device', payload: { deviceId } });
    };
  }, [deviceId, queryClient]);

  return {
    agentInfo,
    healthHistory,
    isLoading: infoLoading || historyLoading,
    isError: infoError || historyError,
    refetch: refetchInfo,
  };
}
