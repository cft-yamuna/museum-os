import { create } from 'zustand';

export type DeviceSyncPhase = 'idle' | 'syncing' | 'rendering' | 'live' | 'waiting' | 'failed';

export interface DeviceSyncStatus {
  deviceId: string;
  message: string;
  phase: DeviceSyncPhase;
  requestId: string | null;
  updatedAt: number;
}

interface DeviceSyncState {
  statuses: Record<string, DeviceSyncStatus>;
  pruneStale: () => void;
  clearDevices: (deviceIds: string[]) => void;
  handleAgentRefreshResult: (payload: Record<string, unknown>) => void;
  handleDisplayRendered: (payload: Record<string, unknown>) => void;
  markAgentOffline: (deviceIds: string[]) => void;
  markSyncing: (deviceIds: string[], requestId: string) => void;
}

const STALE_SYNC_TTL_MS = 90_000;

const PHASE_RANK: Record<DeviceSyncPhase, number> = {
  idle: 0,
  waiting: 0,
  syncing: 1,
  rendering: 2,
  live: 3,
  failed: 3,
};

function normalizeDeviceIds(deviceIds: string[]): string[] {
  return Array.from(new Set(deviceIds.filter(Boolean)));
}

function shouldIgnoreMismatchedRequest(
  current: DeviceSyncStatus | undefined,
  requestId: string | null
): boolean {
  if (!current?.requestId || !requestId) return false;
  if (current.requestId === requestId) return false;
  return current.phase === 'syncing' || current.phase === 'rendering';
}

function upsertStatus(
  statuses: Record<string, DeviceSyncStatus>,
  deviceId: string,
  next: Omit<DeviceSyncStatus, 'updatedAt'>,
  force = false
): Record<string, DeviceSyncStatus> {
  const current = statuses[deviceId];
  if (!force && current?.requestId && next.requestId && current.requestId === next.requestId) {
    const currentRank = PHASE_RANK[current.phase];
    const nextRank = PHASE_RANK[next.phase];
    if (nextRank < currentRank) {
      return statuses;
    }
  }

  return {
    ...statuses,
    [deviceId]: {
      ...next,
      updatedAt: Date.now(),
    },
  };
}

function sanitizeStatuses(statuses: Record<string, DeviceSyncStatus>): Record<string, DeviceSyncStatus> {
  const now = Date.now();
  let changed = false;
  const next: Record<string, DeviceSyncStatus> = {};

  for (const [deviceId, status] of Object.entries(statuses)) {
    if (
      (status.phase === 'syncing' || status.phase === 'rendering')
      && now - status.updatedAt > STALE_SYNC_TTL_MS
    ) {
      // If we miss the rendered ack event, avoid showing a stuck spinner forever.
      next[deviceId] = {
        ...status,
        phase: 'live',
        message: 'Live on screen',
        requestId: null,
        updatedAt: now,
      };
      changed = true;
      continue;
    }
    next[deviceId] = status;
  }

  return changed ? next : statuses;
}

export const useDeviceSyncStore = create<DeviceSyncState>()((set) => ({
  statuses: {},

  pruneStale: () =>
    set((state) => {
      const statuses = sanitizeStatuses(state.statuses);
      if (statuses === state.statuses) return state;
      return { statuses };
    }),

  clearDevices: (deviceIds) =>
    set((state) => {
      const nextStatuses = { ...sanitizeStatuses(state.statuses) };
      for (const deviceId of normalizeDeviceIds(deviceIds)) {
        delete nextStatuses[deviceId];
      }
      return { statuses: nextStatuses };
    }),

  handleAgentRefreshResult: (payload) =>
    set((state) => {
      const statusesBase = sanitizeStatuses(state.statuses);
      const deviceId = typeof payload.deviceId === 'string' ? payload.deviceId : '';
      const requestId = typeof payload.requestId === 'string' && payload.requestId ? payload.requestId : null;
      const success = payload.success !== false;
      const changed = payload.changed !== false;
      const current = statusesBase[deviceId];

      if (!deviceId || shouldIgnoreMismatchedRequest(current, requestId)) {
        return state;
      }

      let statuses = statusesBase;

      if (!success) {
        const message = typeof payload.error === 'string' && payload.error
          ? payload.error
          : 'Update failed';
        statuses = upsertStatus(statuses, deviceId, {
          deviceId,
          message,
          phase: 'failed',
          requestId,
        }, true);
        return { statuses };
      }

      statuses = upsertStatus(statuses, deviceId, {
        deviceId,
        message: changed ? 'Rendering screen' : 'Live on screen',
        phase: changed ? 'rendering' : 'live',
        requestId,
      });

      return { statuses };
    }),

  handleDisplayRendered: (payload) =>
    set((state) => {
      const statusesBase = sanitizeStatuses(state.statuses);
      const deviceId = typeof payload.deviceId === 'string' ? payload.deviceId : '';
      const requestId = typeof payload.requestId === 'string' && payload.requestId ? payload.requestId : null;
      const current = statusesBase[deviceId];

      if (!deviceId || shouldIgnoreMismatchedRequest(current, requestId)) {
        return state;
      }

      return {
        statuses: upsertStatus(statusesBase, deviceId, {
          deviceId,
          message: 'Live on screen',
          phase: 'live',
          requestId,
        }),
      };
    }),

  markAgentOffline: (deviceIds) =>
    set((state) => {
      let statuses = sanitizeStatuses(state.statuses);
      for (const deviceId of normalizeDeviceIds(deviceIds)) {
        statuses = upsertStatus(statuses, deviceId, {
          deviceId,
          message: 'Agent offline',
          phase: 'waiting',
          requestId: null,
        }, true);
      }
      return { statuses };
    }),

  markSyncing: (deviceIds, requestId) =>
    set((state) => {
      let statuses = sanitizeStatuses(state.statuses);
      for (const deviceId of normalizeDeviceIds(deviceIds)) {
        statuses = upsertStatus(statuses, deviceId, {
          deviceId,
          message: 'Syncing device',
          phase: 'syncing',
            requestId,
        });
      }
      return { statuses };
    }),
}));
