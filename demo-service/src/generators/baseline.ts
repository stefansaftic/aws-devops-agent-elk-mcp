import { getEsClient, getDateIndex } from '../elasticsearch.js';
import { generateAppLog } from './app-logs.js';
import { generateAccessLog } from './access-logs.js';
import { generateMetrics } from './metrics.js';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

let appLogInterval: ReturnType<typeof setTimeout> | null = null;
let accessLogInterval: ReturnType<typeof setTimeout> | null = null;
let metricsInterval: ReturnType<typeof setInterval> | null = null;

async function indexDocument(index: string, doc: Record<string, unknown>): Promise<void> {
  try {
    await getEsClient().index({ index, body: doc });
  } catch (error: any) {
    console.error(`[Baseline] Failed to index to ${index}:`, error.message);
  }
}

function scheduleAppLog(): void {
  const delay = randomInt(1000, 5000); // 1-5 seconds
  appLogInterval = setTimeout(async () => {
    const doc = generateAppLog();
    await indexDocument(getDateIndex('app-logs'), doc);
    scheduleAppLog(); // Schedule next
  }, delay);
}

function scheduleAccessLog(): void {
  const delay = randomInt(500, 3000); // 0.5-3 seconds
  accessLogInterval = setTimeout(async () => {
    const doc = generateAccessLog();
    await indexDocument(getDateIndex('access-logs'), doc);
    scheduleAccessLog(); // Schedule next
  }, delay);
}

export function startBaseline(): void {
  console.log('[Baseline] Starting baseline log and metric generation...');

  // App logs: every 1-5 seconds
  scheduleAppLog();

  // Access logs: every 0.5-3 seconds
  scheduleAccessLog();

  // Metrics: every 10 seconds
  metricsInterval = setInterval(async () => {
    const doc = generateMetrics();
    await indexDocument(getDateIndex('metrics'), doc);
  }, 10000);

  console.log('[Baseline] Baseline generation started');
}

export function stopBaseline(): void {
  if (appLogInterval) clearTimeout(appLogInterval);
  if (accessLogInterval) clearTimeout(accessLogInterval);
  if (metricsInterval) clearInterval(metricsInterval);
  appLogInterval = null;
  accessLogInterval = null;
  metricsInterval = null;
  console.log('[Baseline] Baseline generation stopped');
}
