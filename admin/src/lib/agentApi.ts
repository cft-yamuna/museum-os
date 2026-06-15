import { api } from './api';
import type { AgentInfo, AgentCommandResult, HealthHistoryEntry, Screenshot, AgentStatusResponse, PushUpdateResponse } from './types';

export function fetchAgentInfo(deviceId: string): Promise<AgentInfo> {
  return api.get<AgentInfo>(`/devices/${deviceId}/agent`);
}

export function fetchHealthHistory(
  deviceId: string,
  limit = 100
): Promise<HealthHistoryEntry[]> {
  return api.get<HealthHistoryEntry[]>(
    `/devices/${deviceId}/health?limit=${limit}`
  );
}

export function fetchScreenshots(deviceId: string): Promise<Screenshot[]> {
  return api.get<Screenshot[]>(`/devices/${deviceId}/screenshots`);
}

export function sendAgentCommand(
  deviceId: string,
  command: string,
  args?: Record<string, unknown>,
  awaitResponse = false,
  timeout?: number
): Promise<AgentCommandResult> {
  return api.post<AgentCommandResult>(`/devices/${deviceId}/agent-command`, {
    command,
    args,
    await_response: awaitResponse,
    ...(timeout ? { timeout } : {}),
  });
}

export function fetchAgentStatus(siteId: string): Promise<AgentStatusResponse> {
  return api.get<AgentStatusResponse>(`/agent/status?site_id=${siteId}`);
}

export function pushAgentUpdate(deviceId?: string, all?: boolean): Promise<PushUpdateResponse> {
  return api.post<PushUpdateResponse>('/agent/push-update', {
    ...(deviceId ? { device_id: deviceId } : {}),
    ...(all ? { all: true } : {}),
  });
}
