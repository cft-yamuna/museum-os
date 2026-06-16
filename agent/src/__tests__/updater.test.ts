import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { join } from 'path';
import os from 'os';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockExistsSync = vi.fn(() => false);
const mockMkdirSync = vi.fn();
const mockRenameSync = vi.fn();
const mockRmSync = vi.fn();
const mockReaddirSync = vi.fn<() => string[]>(() => []);
const mockStatSync = vi.fn(() => ({ mtimeMs: Date.now() }));

// Stash real fs functions before vi.mock rewires them
let realWriteFileSync: typeof import('fs').writeFileSync;
let realMkdirSync: typeof import('fs').mkdirSync;
let realRmSync: typeof import('fs').rmSync;
let realExistsSync: typeof import('fs').existsSync;

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  // Stash real functions for test setup/teardown
  realWriteFileSync = actual.writeFileSync;
  realMkdirSync = actual.mkdirSync;
  realRmSync = actual.rmSync;
  realExistsSync = actual.existsSync;
  return {
    ...actual,
    existsSync: (...args: unknown[]) => mockExistsSync(...args as [string]),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args as [string, object]),
    renameSync: (...args: unknown[]) => mockRenameSync(...args as [string, string]),
    rmSync: (...args: unknown[]) => mockRmSync(...args as [string, object]),
    readdirSync: (...args: unknown[]) => mockReaddirSync(...args as [string]),
    statSync: (...args: unknown[]) => mockStatSync(...args as [string]),
    // Keep real stream functions for verify()
    createReadStream: actual.createReadStream,
    createWriteStream: actual.createWriteStream,
  };
});

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Updater
// ═════════════════════════════════════════════════════════════════════════════

describe('Updater', () => {
  let logger: ReturnType<typeof createMockLogger>;
  let Updater: typeof import('../services/updater.js').Updater;
  let tmpDir: string;

  beforeEach(async () => {
    logger = createMockLogger();
    const mod = await import('../services/updater.js');
    Updater = mod.Updater;

    // Ensure real fs functions are loaded (vi.mock factory runs lazily on first import)
    if (!realMkdirSync) {
      await vi.importActual<typeof import('fs')>('fs').then((actual) => {
        realWriteFileSync = actual.writeFileSync;
        realMkdirSync = actual.mkdirSync;
        realRmSync = actual.rmSync;
      });
    }

    // Use REAL fs for temp dir creation
    tmpDir = join(os.tmpdir(), `updater-test-${Date.now()}`);
    realMkdirSync(tmpDir, { recursive: true });

    // Reset mocks
    mockExistsSync.mockReset().mockReturnValue(false);
    mockMkdirSync.mockReset();
    mockRenameSync.mockReset();
    mockRmSync.mockReset();
    mockReaddirSync.mockReset().mockReturnValue([]);
    mockStatSync.mockReset().mockReturnValue({ mtimeMs: Date.now() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Use REAL fs for temp dir cleanup
    try {
      realRmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('getStatus() returns current status with spread (immutability)', () => {
    const updater = new Updater(logger as never, '/opt/museumos');
    const status1 = updater.getStatus();
    const status2 = updater.getStatus();

    expect(status1).toEqual({ phase: 'idle' });
    // Different references — immutable
    expect(status1).not.toBe(status2);
  });

  it('verify() accepts correct SHA256 checksum', async () => {
    const updater = new Updater(logger as never, '/opt/museumos');

    // Create a real temp file
    const content = 'test update content for checksum verification';
    const filePath = join(tmpDir, 'test-update.tar.gz');
    realWriteFileSync(filePath, content);

    // Compute expected checksum
    const expectedChecksum = createHash('sha256').update(content).digest('hex');

    const result = await updater.verify(filePath, expectedChecksum);
    expect(result).toBe(true);
    expect(logger.info).toHaveBeenCalledWith('Checksum verified OK');
  });

  it('verify() rejects incorrect checksum', async () => {
    const updater = new Updater(logger as never, '/opt/museumos');

    // Create a real temp file
    const content = 'test update content';
    const filePath = join(tmpDir, 'bad-update.tar.gz');
    realWriteFileSync(filePath, content);

    const wrongChecksum = 'a'.repeat(64);

    const result = await updater.verify(filePath, wrongChecksum);
    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Checksum mismatch'));
  });

  it('install() throws on extraction failure', async () => {
    const { execFileSync } = await import('child_process');
    const mockExecFileSync = execFileSync as unknown as ReturnType<typeof vi.fn>;
    mockExecFileSync.mockImplementation(() => {
      throw new Error('tar: Error opening archive');
    });

    mockExistsSync.mockReturnValue(false);

    const updater = new Updater(logger as never, '/opt/museumos');

    await expect(updater.install('/tmp/bad.tar.gz', '2.0.0')).rejects.toThrow('Failed to extract tarball');
    expect(updater.getStatus()).toMatchObject({ phase: 'error', error: 'Extraction failed' });
  });

  it('rollback() throws when no backup exists', async () => {
    mockExistsSync.mockReturnValue(false);

    const updater = new Updater(logger as never, '/opt/museumos');

    await expect(updater.rollback()).rejects.toThrow('No backup version available for rollback');
  });

  it('cleanDownloads() keeps only 3 most recent files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      'update-1000.tar.gz',
      'update-2000.tar.gz',
      'update-3000.tar.gz',
      'update-4000.tar.gz',
      'update-5000.tar.gz',
    ]);

    mockStatSync.mockImplementation((filePath: string) => {
      const match = String(filePath).match(/update-(\d+)\.tar\.gz/);
      const mtime = match ? parseInt(match[1], 10) : Date.now();
      return { mtimeMs: mtime };
    });

    const updater = new Updater(logger as never, '/opt/museumos');
    updater.cleanDownloads();

    // Should remove the 2 oldest (1000 and 2000), keep 3000, 4000, 5000
    expect(mockRmSync).toHaveBeenCalledTimes(2);
  });

  it('cleanDownloads() does nothing when downloads dir does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const updater = new Updater(logger as never, '/opt/museumos');
    updater.cleanDownloads();

    expect(mockRmSync).not.toHaveBeenCalled();
  });

  it('cleanDownloads() does nothing with 3 or fewer files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      'update-1000.tar.gz',
      'update-2000.tar.gz',
    ]);
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() });

    const updater = new Updater(logger as never, '/opt/museumos');
    updater.cleanDownloads();

    expect(mockRmSync).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Updater crash-loop guard (auto-rollback of a bad update)
// ═════════════════════════════════════════════════════════════════════════════

describe('Updater crash-loop guard', () => {
  let logger: ReturnType<typeof createMockLogger>;
  let Updater: typeof import('../services/updater.js').Updater;
  let baseDir: string;

  beforeEach(async () => {
    logger = createMockLogger();
    Updater = (await import('../services/updater.js')).Updater;

    if (!realExistsSync) {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      realExistsSync = actual.existsSync;
      realMkdirSync = actual.mkdirSync;
      realRmSync = actual.rmSync;
    }

    baseDir = join(os.tmpdir(), `updater-guard-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    realMkdirSync(baseDir, { recursive: true });

    // The guard round-trips a real state file, so delegate the mocked fs
    // primitives it relies on to the real implementations.
    mockExistsSync.mockReset().mockImplementation((p: string) => realExistsSync(String(p)));
    mockRmSync
      .mockReset()
      .mockImplementation((p: string, opts?: object) => realRmSync(String(p), opts as object));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      realRmSync(baseDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('registerBootAttempt() reports not-pending when there is no marker', () => {
    const updater = new Updater(logger as never, baseDir);
    expect(updater.registerBootAttempt()).toEqual({
      pending: false,
      shouldRollback: false,
      attempts: 0,
    });
  });

  it('counts boot attempts and triggers rollback once the budget is exceeded', () => {
    const updater = new Updater(logger as never, baseDir);
    updater.markPendingUpdate('2.0.0');

    expect(updater.registerBootAttempt()).toMatchObject({
      pending: true,
      shouldRollback: false,
      version: '2.0.0',
      attempts: 1,
    });
    expect(updater.registerBootAttempt().attempts).toBe(2);
    expect(updater.registerBootAttempt().attempts).toBe(3);
    // 4th boot exceeds MAX_BOOT_ATTEMPTS (3) → rollback is due.
    expect(updater.registerBootAttempt()).toMatchObject({ shouldRollback: true, attempts: 4 });
  });

  it('confirmUpdate() stops future boots from rolling back', () => {
    const updater = new Updater(logger as never, baseDir);
    updater.markPendingUpdate('2.0.0');
    updater.registerBootAttempt();
    updater.confirmUpdate();

    expect(updater.registerBootAttempt()).toEqual({
      pending: false,
      shouldRollback: false,
      attempts: 0,
    });
  });

  it('clearPendingUpdate() removes the marker', () => {
    const updater = new Updater(logger as never, baseDir);
    updater.markPendingUpdate('2.0.0');
    updater.clearPendingUpdate();
    expect(updater.registerBootAttempt().pending).toBe(false);
  });
});
