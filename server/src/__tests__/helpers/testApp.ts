/**
 * Test app helper — creates a real Express app with mocked services.
 * All service modules are mocked at import level so the app uses
 * real middleware chains + routes, but no real DB or WebSocket connections.
 */
import { vi } from 'vitest';

// Mock DB module — MUST be before app imports
vi.mock('../../lib/db.js', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn().mockResolvedValue(undefined),
  checkDbConnection: vi.fn().mockResolvedValue(true),
}));

// Mock service modules
vi.mock('../../services/displayWs.js', () => ({
  initDisplayWs: vi.fn(),
  closeDisplayWs: vi.fn(),
  sendToDevice: vi.fn().mockReturnValue(true),
  broadcastToDevices: vi.fn(),
  broadcastToApp: vi.fn().mockResolvedValue(0),
  broadcastToSite: vi.fn().mockReturnValue(0),
  getConnectedCount: vi.fn().mockReturnValue(0),
  getConnectedDevices: vi.fn().mockReturnValue([]),
}));

vi.mock('../../services/adminWs.js', () => ({
  initAdminWs: vi.fn(),
  closeAdminWs: vi.fn(),
  pushToAdmins: vi.fn(),
  pushToDeviceSubscribers: vi.fn(),
  getAdminCount: vi.fn().mockReturnValue(0),
}));

vi.mock('../../services/mqttClient.js', () => ({
  startMqttClient: vi.fn(),
  stopMqttClient: vi.fn(),
  isMqttConnected: vi.fn().mockReturnValue(false),
  publishCommand: vi.fn(),
}));

vi.mock('../../services/scheduler.js', () => ({
  startScheduler: vi.fn().mockResolvedValue(undefined),
  stopScheduler: vi.fn(),
  registerCronJob: vi.fn(),
  unregisterCronJob: vi.fn(),
  reloadSchedule: vi.fn().mockResolvedValue(undefined),
  executeSchedule: vi.fn().mockResolvedValue(undefined),
  getActiveJobCount: vi.fn().mockReturnValue(0),
}));

vi.mock('../../services/auditLog.js', () => ({
  createAuditLog: vi.fn(),
}));

vi.mock('../../services/pjlink.js', () => ({
  getPJLinkClient: vi.fn().mockReturnValue(null),
}));

vi.mock('../../services/sssp.js', () => ({
  getSSSPClient: vi.fn().mockReturnValue(null),
}));

vi.mock('../../services/agentWs.js', () => ({
  initAgentWs: vi.fn(),
  closeAgentWs: vi.fn(),
  sendCommandToAgent: vi.fn().mockReturnValue(true),
  sendCommandToAgentWithResponse: vi.fn().mockResolvedValue({ status: 'ok' }),
  getAgentConnectedDevices: vi.fn().mockReturnValue([]),
  getAgentClient: vi.fn().mockReturnValue(null),
}));

vi.mock('../../services/storage.js', () => ({
  storeFile: vi.fn().mockResolvedValue({
    filePath: '/storage/test/video/content-id/v1/test.mp4',
    fileSize: 1024,
    hash: 'abc123',
  }),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  getFileStream: vi.fn().mockResolvedValue({ pipe: vi.fn() }),
  getFileStats: vi.fn().mockResolvedValue({ size: 1024, mtime: new Date() }),
  getDiskSpace: vi.fn().mockResolvedValue({ freeGB: 100, totalGB: 500, usedPercent: 80 }),
  getStorageKey: vi.fn().mockReturnValue('test/video/test-id/v1/test.mp4'),
  getStoragePath: vi.fn().mockReturnValue('test/video/test-id/v1/test.mp4'),
  computeHash: vi.fn().mockReturnValue('abc123'),
  storeFileFromStream: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/storageBackend.js', () => {
  const backend = {
    storeFile: vi.fn().mockResolvedValue(undefined),
    getFileStream: vi.fn().mockResolvedValue({ pipe: vi.fn() }),
    getFileStreamRange: vi.fn().mockResolvedValue({ pipe: vi.fn() }),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    getFileStats: vi.fn().mockResolvedValue({ size: 1024, mtime: new Date() }),
    fileExists: vi.fn().mockResolvedValue(true),
    listFiles: vi.fn().mockResolvedValue([]),
    getDiskSpace: vi.fn().mockResolvedValue({ freeGB: 100, totalGB: 500, usedPercent: 80 }),
  };
  return {
    getStorage: vi.fn().mockReturnValue(backend),
    initStorage: vi.fn().mockResolvedValue(undefined),
    _resetStorage: vi.fn(),
  };
});

vi.mock('../../services/offlineDetector.js', () => ({
  startOfflineDetector: vi.fn(),
  stopOfflineDetector: vi.fn(),
}));

vi.mock('../../services/alertMonitor.js', () => ({
  startAlertMonitor: vi.fn(),
  stopAlertMonitor: vi.fn(),
}));

vi.mock('../../services/projectorMonitor.js', () => ({
  startProjectorMonitor: vi.fn(),
  stopProjectorMonitor: vi.fn(),
}));

vi.mock('../../services/ssspMonitor.js', () => ({
  startSSSPMonitor: vi.fn(),
  stopSSSPMonitor: vi.fn(),
}));

vi.mock('../../services/healthAggregator.js', () => ({
  startHealthAggregator: vi.fn(),
  stopHealthAggregator: vi.fn(),
}));

vi.mock('../../services/dali.js', () => ({
  getDALIClient: vi.fn().mockReturnValue(null),
  disconnectAllDALI: vi.fn(),
}));

vi.mock('../../services/tokenRevocation.js', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  revokeToken: vi.fn().mockResolvedValue(undefined),
  cleanupExpiredTokens: vi.fn().mockResolvedValue(0),
  startTokenCleanup: vi.fn(),
  stopTokenCleanup: vi.fn(),
}));

// Now import the real app factory
import { createApp } from '../../app.js';

/**
 * Create a fresh Express app for testing.
 * Uses real middleware chains + routes with mocked dependencies.
 */
export function getTestApp() {
  return createApp();
}
