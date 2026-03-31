import { getEsClient, getDateIndex } from '../elasticsearch.js';
import { config } from '../config.js';
import { Scenario } from './manager.js';

let logInterval: ReturnType<typeof setInterval> | null = null;

const errorMessages = [
  'CrashLoopBackOff: Container order-service restarted 5 times in the last 3 minutes',
  'FATAL: Application failed to start - Bean creation exception: dataSource',
  'Readiness probe failed: HTTP probe failed with statuscode: 503',
  'Liveness probe failed: connection refused on port 8080',
  'Deployment rollout failed: deadline exceeded waiting for deployment "order-service" to complete',
  'ImagePullBackOff: Failed to pull image "registry.example.com/order-service:2.4.2" - manifest not found',
  'Container killed due to OOM during startup: init memory requirement exceeds limit',
  'ConfigMap "order-service-config" not found - deployment cannot proceed',
  'Secret "db-credentials" version mismatch - expected v3, found v2',
  'FATAL: Database migration failed: Column "payment_method" already exists in table "orders"',
  'Startup probe failed: application did not become ready within 120 seconds',
  'Rolling update paused: 3/5 new replicas are unavailable',
  'WARN: Previous version rollback initiated - reverting from v2.4.2 to v2.4.1',
  'ERROR: Health endpoint /actuator/health returned 503 - downstream dependency check failed',
  'Container exit code 137 (SIGKILL) - possible OOM or resource limit exceeded during startup',
];

function randomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generateDeploymentLog(): Promise<void> {
  const client = getEsClient();
  const doc = {
    '@timestamp': new Date().toISOString(),
    level: pick(['ERROR', 'ERROR', 'FATAL', 'WARN']),
    message: pick(errorMessages),
    service: config.service.name,
    hostname: pick([
      'order-service-pod-7f8b9c6d4-new1',
      'order-service-pod-7f8b9c6d4-new2',
      'order-service-pod-7f8b9c6d4-new3',
      config.service.hostname,
    ]),
    trace_id: randomId() + randomId(),
    span_id: randomId(),
    logger: pick([
      'kubernetes.deployment-controller',
      'com.example.order.Application',
      'org.springframework.boot.SpringApplication',
      'com.example.order.HealthCheck',
    ]),
    thread: pick(['main', 'deployment-controller', 'kubelet', 'readiness-probe']),
  };

  try {
    await client.index({ index: getDateIndex('app-logs'), body: doc });
  } catch (error: any) {
    console.error('[Scenario:deployment] Index error:', error.message);
  }
}

export const deploymentFailureScenario: Scenario = {
  id: 'deployment',
  name: 'Deployment Failure',
  description: 'Simulates a bad deployment with crash loops, failed probes, and rollback events for 3 minutes. Generates FATAL/ERROR logs from Kubernetes and application startup.',
  duration: '3 min',
  durationMs: 3 * 60 * 1000,
  icon: '🟡',
  start() {
    logInterval = setInterval(generateDeploymentLog, 700);
  },
  stop() {
    if (logInterval) {
      clearInterval(logInterval);
      logInterval = null;
    }
  },
};
