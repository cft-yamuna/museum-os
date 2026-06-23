import { createApp } from './app.js';
import { env } from './lib/env.js';
import { closeDb, checkDbConnection } from './lib/db.js';
import { startOfflineDetector, stopOfflineDetector } from './services/offlineDetector.js';
import { initDisplayWs, closeDisplayWs } from './services/displayWs.js';
import { initAdminWs, closeAdminWs } from './services/adminWs.js';
import { startMqttClient, stopMqttClient } from './services/mqttClient.js';
import { startAlertMonitor, stopAlertMonitor } from './services/alertMonitor.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { startProjectorMonitor, stopProjectorMonitor } from './services/projectorMonitor.js';
import { startSSSPMonitor, stopSSSPMonitor } from './services/ssspMonitor.js';
import { disconnectAllDALI } from './services/dali.js';
import { initAgentWs, closeAgentWs } from './services/agentWs.js';
import { startHealthAggregator, stopHealthAggregator } from './services/healthAggregator.js';
import { startEngagementAggregator, stopEngagementAggregator } from './services/engagementAggregator.js';
import { startTokenCleanup, stopTokenCleanup } from './services/tokenRevocation.js';
import { startBackupService, stopBackupService } from './services/backupService.js';
import { initStorage } from './services/storageBackend.js';
import fs from 'fs';

const app = createApp();
const port = parseInt(env.PORT, 10);

// Ensure storage directory exists (only for local FS mode)
if (!env.S3_ENDPOINT && !fs.existsSync(env.STORAGE_PATH)) {
  fs.mkdirSync(env.STORAGE_PATH, { recursive: true });
  console.log(`Created storage directory: ${env.STORAGE_PATH}`);
}

const server = app.listen(port, async () => {
  console.log('');
  console.log('  Museum OS Server');
  console.log('  ================');
  console.log(`  Environment: ${env.NODE_ENV}`);
  console.log(`  API:         http://localhost:${port}/api`);
  console.log(`  Health:      http://localhost:${port}/api/health`);

  // Initialize storage backend (logs backend type)
  await initStorage();

  // Initialize WebSocket servers
  initDisplayWs(server);
  initAdminWs(server);
  initAgentWs(server);
  console.log('');

  // Check DB connection (non-blocking)
  checkDbConnection().then(async (connected) => {
    if (connected) {
      console.log('  Database:    connected');
      startOfflineDetector();
      startAlertMonitor();
      console.log('  Monitors:    offline (60s) + alerts (5m)');
      await startScheduler();
      startMqttClient();
      startProjectorMonitor();
      startSSSPMonitor();
      startHealthAggregator();
      startEngagementAggregator();
      startTokenCleanup();
      startBackupService();
    } else {
      console.warn('  Database:    NOT connected (check DATABASE_URL)');
    }
  });
});

// --- Graceful Shutdown ---
function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    console.log('HTTP server closed.');
    stopOfflineDetector();
    stopAlertMonitor();
    stopScheduler();
    stopMqttClient();
    stopProjectorMonitor();
    stopSSSPMonitor();
    stopHealthAggregator();
    stopEngagementAggregator();
    stopTokenCleanup();
    stopBackupService();
    disconnectAllDALI();
    closeDisplayWs();
    closeAdminWs();
    closeAgentWs();

    try {
      await closeDb();
      console.log('Database pool closed.');
    } catch (err) {
      console.error('Error closing database:', err);
    }

    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});
