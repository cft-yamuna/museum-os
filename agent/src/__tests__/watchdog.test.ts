import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ size: 1024, mtimeMs: Date.now() - 8 * 24 * 60 * 60 * 1000 })),
    unlinkSync: vi.fn(),
  };
});

function createMockKioskManager() {
  return {
    launch: vi.fn().mockResolvedValue({
      running: true, pid: 1234, url: 'http://localhost:3401/display',
      crashCount: 0, crashLoopDetected: false, uptimeMs: 0,
    }),
    kill: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue({
      running: true, pid: 1234, url: 'http://localhost:3401/display',
      crashCount: 0, crashLoopDetected: false, uptimeMs: 60000,
    }),
    destroy: vi.fn(),
    navigate: vi.fn(),
    restart: vi.fn(),
  };
}

function createMockWsClient() {
  return {
    send: vi.fn(),
    isConnected: vi.fn(() => true),
  };
}

function createMockHealthMonitor() {
  return {
    collect: vi.fn().mockResolvedValue({
      cpuUsage: 20,
      memTotal: 8192,
      memUsed: 4096,
      memPercent: 50,
      diskTotal: 500000,
      diskUsed: 250000,
      diskPercent: 50,
      cpuTemp: 55,
      uptime: 86400,
      agentVersion: '1.0.0',
    }),
  };
}

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Watchdog
// ═════════════════════════════════════════════════════════════════════════════

describe('Watchdog', () => {
  let kioskManager: ReturnType<typeof createMockKioskManager>;
  let wsClient: ReturnType<typeof createMockWsClient>;
  let healthMonitor: ReturnType<typeof createMockHealthMonitor>;
  let logger: ReturnType<typeof createMockLogger>;
  let Watchdog: typeof import('../services/watchdog.js').Watchdog;

  beforeEach(async () => {
    vi.useFakeTimers();
    kioskManager = createMockKioskManager();
    wsClient = createMockWsClient();
    healthMonitor = createMockHealthMonitor();
    logger = createMockLogger();

    const mod = await import('../services/watchdog.js');
    Watchdog = mod.Watchdog;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('start() sets an interval and logs', () => {
    const watchdog = new Watchdog(
      kioskManager as never, wsClient as never, healthMonitor as never,
      logger as never, 'http://localhost:3001',
      { deviceId: 'dev-1', apiKey: 'key-1' },
      { checkIntervalMs: 5000 },
    );

    watchdog.start();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Watchdog started'));
  });

  it('stop() clears the interval and logs', () => {
    const watchdog = new Watchdog(
      kioskManager as never, wsClient as never, healthMonitor as never,
      logger as never, 'http://localhost:3001',
      { deviceId: 'dev-1', apiKey: 'key-1' },
      { checkIntervalMs: 5000 },
    );

    watchdog.start();
    watchdog.stop();
    expect(logger.info).toHaveBeenCalledWith('Watchdog stopped');
  });

  it('getStats() returns recovery stats with spread (immutability)', () => {
    const watchdog = new Watchdog(
      kioskManager as never, wsClient as never, healthMonitor as never,
      logger as never, 'http://localhost:3001',
      { deviceId: 'dev-1', apiKey: 'key-1' },
    );

    const stats1 = watchdog.getStats();
    const stats2 = watchdog.getStats();

    expect(stats1).toEqual({
      kioskRestarts: 0,
      memoryRestarts: 0,
      diskCleanups: 0,
      wsRestarts: 0,
    });
    // Ensure immutability: different references
    expect(stats1).not.toBe(stats2);
  });

  it('getCooldowns() returns empty when no cooldowns active', () => {
    const watchdog = new Watchdog(
      kioskManager as never, wsClient as never, healthMonitor as never,
      logger as never, 'http://localhost:3001',
      { deviceId: 'dev-1', apiKey: 'key-1' },
    );

    const cooldowns = watchdog.getCooldowns();
    expect(cooldowns).toEqual({});
  });

  it('runDiskCleanup() removes old museumos- prefixed files from /tmp', async () => {
    const fsMod = await import('fs');
    const mockReaddirSync = fsMod.readdirSync as ReturnType<typeof vi.fn>;
    const mockStatSync = fsMod.statSync as ReturnType<typeof vi.fn>;
    const mockUnlinkSync = fsMod.unlinkSync as ReturnType<typeof vi.fn>;

    mockReaddirSync.mockReturnValue(['museumos-old.log', 'museumos-recent.log', 'other-file.txt']);
    // Old file (8 days ago)
    const oldMtime = Date.now() - 8 * 24 * 60 * 60 * 1000;
    // Recent file (1 day ago)
    const recentMtime = Date.now() - 1 * 24 * 60 * 60 * 1000;

    mockStatSync.mockImplementation((filePath: string) => {
      if (String(filePath).includes('museumos-old')) {
        return { size: 2048, mtimeMs: oldMtime };
      }
      return { size: 512, mtimeMs: recentMtime };
    });

    const watchdog = new Watchdog(
      kioskManager as never, wsClient as never, healthMonitor as never,
      logger as never, 'http://localhost:3001',
      { deviceId: 'dev-1', apiKey: 'key-1' },
    );

    const result = await watchdog.runDiskCleanup();

    // Only 'museumos-old.log' is older than 7 days AND starts with 'museumos-'
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
    expect(result.deletedFiles).toBe(1);
    expect(result.freedBytes).toBe(2048);
  });

  it('runDiskCleanup() skips files not starting with museumos-', async () => {
    const fsMod = await import('fs');
    const mockReaddirSync = fsMod.readdirSync as ReturnType<typeof vi.fn>;
    const mockUnlinkSync = fsMod.unlinkSync as ReturnType<typeof vi.fn>;

    mockReaddirSync.mockReturnValue(['other-old.log', 'random.tmp']);

    const watchdog = new Watchdog(
      kioskManager as never, wsClient as never, healthMonitor as never,
      logger as never, 'http://localhost:3001',
      { deviceId: 'dev-1', apiKey: 'key-1' },
    );

    const result = await watchdog.runDiskCleanup();

    expect(mockUnlinkSync).not.toHaveBeenCalled();
    expect(result.deletedFiles).toBe(0);
    expect(result.freedBytes).toBe(0);
  });

  it('recovery cooldown prevents same action within cooldown window', async () => {
    // We test the cooldown mechanism indirectly through getStats/getCooldowns
    const watchdog = new Watchdog(
      kioskManager as never, wsClient as never, healthMonitor as never,
      logger as never, 'http://localhost:3001',
      { deviceId: 'dev-1', apiKey: 'key-1' },
      {
        checkIntervalMs: 1000,
        highDiskThresholdPercent: 90,
        highDiskCooldownMs: 60000,
      },
    );

    // Simulate high disk usage
    healthMonitor.collect.mockResolvedValue({
      cpuUsage: 20, memTotal: 8192, memUsed: 4096, memPercent: 50,
      diskTotal: 500000, diskUsed: 480000, diskPercent: 96,
      cpuTemp: 55, uptime: 86400, agentVersion: '1.0.0',
    });

    watchdog.start();

    // Advance to trigger first check
    await vi.advanceTimersByTimeAsync(1000);

    const stats1 = watchdog.getStats();
    expect(stats1.diskCleanups).toBe(1);

    // Advance again — should NOT increment because of cooldown
    await vi.advanceTimersByTimeAsync(1000);

    const stats2 = watchdog.getStats();
    expect(stats2.diskCleanups).toBe(1);

    // Cooldowns should have an entry
    const cooldowns = watchdog.getCooldowns();
    expect(cooldowns).toHaveProperty('high_disk');

    watchdog.stop();
  });

  it('escalates with agent:disk-critical when cleanup does not free enough space', async () => {
    const watchdog = new Watchdog(
      kioskManager as never, wsClient as never, healthMonitor as never,
      logger as never, 'http://localhost:3001',
      { deviceId: 'dev-1', apiKey: 'key-1' },
      { checkIntervalMs: 1000, highDiskThresholdPercent: 90, highDiskCooldownMs: 60000 },
    );

    // Disk stays full before and after cleanup.
    healthMonitor.collect.mockResolvedValue({
      cpuUsage: 20, memTotal: 8192, memUsed: 4096, memPercent: 50,
      diskTotal: 500000, diskUsed: 480000, diskPercent: 96,
      cpuTemp: 55, uptime: 86400, agentVersion: '1.0.0',
    });

    watchdog.start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(wsClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent:disk-critical',
        payload: expect.objectContaining({ diskPercent: 96 }),
      })
    );

    watchdog.stop();
  });

  it('does not escalate when cleanup brings disk below the threshold', async () => {
    const watchdog = new Watchdog(
      kioskManager as never, wsClient as never, healthMonitor as never,
      logger as never, 'http://localhost:3001',
      { deviceId: 'dev-1', apiKey: 'key-1' },
      { checkIntervalMs: 1000, highDiskThresholdPercent: 90, highDiskCooldownMs: 60000 },
    );

    const high = {
      cpuUsage: 20, memTotal: 8192, memUsed: 4096, memPercent: 50,
      diskTotal: 500000, diskUsed: 480000, diskPercent: 96,
      cpuTemp: 55, uptime: 86400, agentVersion: '1.0.0',
    };
    const low = { ...high, diskUsed: 200000, diskPercent: 40 };
    // First collect (check entry) sees a full disk; the post-cleanup collect sees
    // it freed.
    healthMonitor.collect.mockResolvedValueOnce(high).mockResolvedValueOnce(low);

    watchdog.start();
    await vi.advanceTimersByTimeAsync(1000);

    const diskCriticalCalls = wsClient.send.mock.calls.filter(
      (c) => (c[0] as { type?: string } | undefined)?.type === 'agent:disk-critical'
    );
    expect(diskCriticalCalls).toHaveLength(0);

    watchdog.stop();
  });
});
