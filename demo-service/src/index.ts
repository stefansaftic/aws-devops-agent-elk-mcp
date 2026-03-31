import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';
import Docker from 'dockerode';
import { EC2Client, StopInstancesCommand } from '@aws-sdk/client-ec2';
import { config } from './config.js';
import { waitForElasticsearch, setupIndexTemplates } from './elasticsearch.js';
import { startBaseline } from './generators/baseline.js';
import {
  registerScenario,
  startScenario,
  stopScenario,
  stopAllScenarios,
  getStatus,
} from './scenarios/manager.js';
import { dbTimeoutScenario } from './scenarios/db-timeout.js';
import { memoryPressureScenario } from './scenarios/memory-pressure.js';
import { errorSpikeScenario } from './scenarios/error-spike.js';
import { highLatencyScenario } from './scenarios/high-latency.js';
import { diskCriticalScenario } from './scenarios/disk-critical.js';
import { deploymentFailureScenario } from './scenarios/deployment-failure.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════════════════
// Shutdown Timer — works in both local and EC2 modes
// ═══════════════════════════════════════════════════════════════════════════

const isEC2 = process.env.DEPLOY_ENV === 'ec2';
const AUTO_SHUTDOWN_MINUTES = parseInt(process.env.AUTO_SHUTDOWN_MINUTES || '120', 10);

// In-memory shutdown target (epoch seconds)
let shutdownAtEpoch = Math.floor(Date.now() / 1000) + AUTO_SHUTDOWN_MINUTES * 60;
let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

function getShutdownInfo() {
  // EC2 mode: read from file (set by UserData / at scheduler)
  if (isEC2) {
    try {
      const shutdownFile = '/tmp/shutdown-at';
      if (fs.existsSync(shutdownFile)) {
        const fileEpoch = parseInt(fs.readFileSync(shutdownFile, 'utf-8').trim(), 10);
        if (!isNaN(fileEpoch)) {
          shutdownAtEpoch = fileEpoch;
        }
      }
    } catch (_e) {
      // Fall back to in-memory value
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const remainingSeconds = Math.max(0, shutdownAtEpoch - now);
  return {
    shutdownAt: shutdownAtEpoch,
    remainingSeconds,
    shutdownAtISO: new Date(shutdownAtEpoch * 1000).toISOString(),
  };
}

function scheduleShutdown() {
  if (shutdownTimer) clearTimeout(shutdownTimer);

  const info = getShutdownInfo();
  if (info.remainingSeconds <= 0) {
    console.log('[Timer] Shutdown time already passed, triggering now...');
    performShutdown();
    return;
  }

  console.log(`[Timer] Auto-shutdown scheduled in ${Math.floor(info.remainingSeconds / 60)}m ${info.remainingSeconds % 60}s`);

  shutdownTimer = setTimeout(() => {
    console.log('[Timer] ⏰ Auto-shutdown timer expired!');
    performShutdown();
  }, info.remainingSeconds * 1000);
}

function extendShutdown(extraSeconds: number = 3600): { remainingSeconds: number; shutdownAtISO: string } {
  shutdownAtEpoch += extraSeconds;

  // EC2 mode: also write to file
  if (isEC2) {
    try {
      fs.writeFileSync('/tmp/shutdown-at', shutdownAtEpoch.toString());
      // Reschedule the at job
      const minutesFromNow = Math.max(1, Math.ceil((shutdownAtEpoch - Math.floor(Date.now() / 1000)) / 60));
      try {
        execSync('pkill -f auto-shutdown.sh 2>/dev/null || true');
        execSync(`echo "/usr/local/bin/auto-shutdown.sh" | at now + ${minutesFromNow} minutes 2>/dev/null || true`, { shell: '/bin/bash' });
      } catch (_e) { /* best effort */ }
    } catch (_e) { /* best effort */ }
  }

  // Reschedule in-process timer
  scheduleShutdown();

  const info = getShutdownInfo();
  return { remainingSeconds: info.remainingSeconds, shutdownAtISO: info.shutdownAtISO };
}

async function getEC2InstanceId(): Promise<string> {
  // Get IMDSv2 token
  const tokenRes = await fetch('http://169.254.169.254/latest/api/token', {
    method: 'PUT',
    headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
  });
  const token = await tokenRes.text();

  // Get instance ID
  const idRes = await fetch('http://169.254.169.254/latest/meta-data/instance-id', {
    headers: { 'X-aws-ec2-metadata-token': token },
  });
  return idRes.text();
}

async function getEC2Region(): Promise<string> {
  const tokenRes = await fetch('http://169.254.169.254/latest/api/token', {
    method: 'PUT',
    headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
  });
  const token = await tokenRes.text();

  const regionRes = await fetch('http://169.254.169.254/latest/meta-data/placement/region', {
    headers: { 'X-aws-ec2-metadata-token': token },
  });
  return regionRes.text();
}

async function performShutdown() {
  console.log(`[Shutdown] Performing shutdown (mode=${isEC2 ? 'ec2' : 'local'})...`);

  if (isEC2) {
    // EC2: stop the instance via AWS SDK (uses instance role credentials)
    try {
      const [instanceId, region] = await Promise.all([getEC2InstanceId(), getEC2Region()]);
      console.log(`[Shutdown] Stopping EC2 instance ${instanceId} in ${region}...`);
      const ec2 = new EC2Client({ region });
      await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
      console.log('[Shutdown] EC2 stop command sent successfully');
    } catch (e) {
      console.error('[Shutdown] EC2 shutdown failed:', e);
    }
  } else {
    // Local: stop Docker containers via Docker API
    try {
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      const containers = await docker.listContainers({ all: false });

      // Find our project containers (elk-mcp-*)
      const projectContainers = containers.filter(
        (c) => c.Names.some((n) => n.includes('elk-mcp'))
      );

      console.log(`[Shutdown] Stopping ${projectContainers.length} containers...`);

      // Stop other containers first, then ourselves last
      const selfContainerId = process.env.HOSTNAME || '';
      const others = projectContainers.filter((c) => !c.Id.startsWith(selfContainerId));
      const self = projectContainers.filter((c) => c.Id.startsWith(selfContainerId));

      for (const c of others) {
        console.log(`[Shutdown] Stopping ${c.Names[0]}...`);
        try {
          await docker.getContainer(c.Id).stop({ t: 10 });
        } catch (e: any) {
          console.error(`[Shutdown] Failed to stop ${c.Names[0]}:`, e.message);
        }
      }

      // Stop ourselves last
      for (const c of self) {
        console.log(`[Shutdown] Stopping self (${c.Names[0]})...`);
        try {
          await docker.getContainer(c.Id).stop({ t: 10 });
        } catch (_e) {
          // We'll be killed, that's expected
        }
      }

      // If we're still alive (shouldn't be), exit
      process.exit(0);
    } catch (e: any) {
      console.error('[Shutdown] Docker shutdown failed:', e.message);
      // Fallback: just exit the process
      process.exit(1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const app = express();
  app.use(express.json());

  // Serve static dashboard (both at root and under /dashboard/ for API Gateway)
  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir));
  app.use('/dashboard', express.static(publicDir));

  // Wait for Elasticsearch to be ready
  console.log('[Demo] Waiting for Elasticsearch...');
  await waitForElasticsearch();

  // Setup index templates
  console.log('[Demo] Setting up index templates...');
  await setupIndexTemplates();

  // Register all scenarios
  registerScenario(dbTimeoutScenario);
  registerScenario(memoryPressureScenario);
  registerScenario(errorSpikeScenario);
  registerScenario(highLatencyScenario);
  registerScenario(diskCriticalScenario);
  registerScenario(deploymentFailureScenario);

  // Start baseline log generation
  startBaseline();

  // Start the auto-shutdown timer
  scheduleShutdown();

  // --- API Routes (mounted at both /api and /dashboard/api for API Gateway) ---
  const apiRouter = express.Router();

  // Get status
  apiRouter.get('/status', (_req, res) => {
    res.json(getStatus());
  });

  // Trigger a scenario
  apiRouter.post('/scenarios/:id', (req, res) => {
    const result = startScenario(req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Stop a specific scenario
  apiRouter.post('/scenarios/:id/stop', (req, res) => {
    const result = stopScenario(req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Stop all scenarios
  apiRouter.post('/scenarios/stop-all', (_req, res) => {
    const result = stopAllScenarios();
    res.json(result);
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'demo-service' });
  });

  // ─── Environment & Timer (works in both modes) ──────────────────────────

  apiRouter.get('/environment', (_req, res) => {
    const info = getShutdownInfo();
    // Check if Docker socket is available
    let dockerAvailable = false;
    try {
      dockerAvailable = fs.existsSync('/var/run/docker.sock');
    } catch (_e) { /* ignore */ }

    res.json({
      mode: isEC2 ? 'ec2' : 'local',
      isEC2,
      dockerAvailable,
      autoShutdownMinutes: AUTO_SHUTDOWN_MINUTES,
      ...info,
    });
  });

  // ─── Extend Shutdown (+1 hour) ──────────────────────────────────────────

  apiRouter.post('/extend-shutdown', (_req, res) => {
    try {
      const result = extendShutdown(3600);
      res.json({
        success: true,
        message: 'Shutdown extended by 1 hour',
        ...result,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Shutdown Now ───────────────────────────────────────────────────────

  apiRouter.post('/shutdown-now', (_req, res) => {
    res.json({
      success: true,
      message: isEC2
        ? 'EC2 instance shutting down in 5 seconds...'
        : 'Stopping all containers in 5 seconds...',
    });

    // Delay to let the response be sent
    setTimeout(() => {
      performShutdown();
    }, 5000);
  });

  // Mount API router at both /api and /dashboard/api
  app.use('/api', apiRouter);
  app.use('/dashboard/api', apiRouter);

  // Start server
  app.listen(config.port, () => {
    const info = getShutdownInfo();
    const timerStr = `${Math.floor(info.remainingSeconds / 60)}m`;
    console.log(`
╔══════════════════════════════════════════════════════╗
║          ELK Demo Service — Scenario Panel           ║
╠══════════════════════════════════════════════════════╣
║  Mode:            ${isEC2 ? '☁️  EC2' : '🖥️  Local'}                            ║
║  Dashboard:       http://localhost:${config.port}              ║
║  API Status:      http://localhost:${config.port}/api/status   ║
║  Health Check:    http://localhost:${config.port}/health        ║
║  Auto-shutdown:   ${timerStr} remaining                     ║
╚══════════════════════════════════════════════════════╝
    `);
  });
}

main().catch((error) => {
  console.error('Failed to start demo service:', error);
  process.exit(1);
});
