import { getEsClient, getDateIndex } from '../elasticsearch.js';
import { config } from '../config.js';
import { generateMetrics } from '../generators/metrics.js';
import { Scenario } from './manager.js';

let logInterval: ReturnType<typeof setInterval> | null = null;
let metricInterval: ReturnType<typeof setInterval> | null = null;

const errorMessages = [
  'CRITICAL: Disk usage at 96.2% on /data - only 3.8GB remaining of 100GB',
  'java.io.IOException: No space left on device while writing to /data/logs/order-service.log',
  'Elasticsearch rejected bulk index request: disk watermark [95%] exceeded on node',
  'Log rotation failed: insufficient disk space to create new log file',
  'WARN: /tmp partition at 98% - temporary file cleanup initiated',
  'Database WAL files consuming excessive disk: 12GB in /data/postgresql/pg_wal',
  'Container overlay filesystem at 94% capacity - image layer cleanup required',
  'FATAL: Unable to write transaction log - disk full on /data/transactions',
  'Disk I/O wait time critical: 45% iowait detected - possible disk saturation',
  'Alert: Disk usage growth rate: 2GB/hour - estimated time to full: 1.9 hours',
];

function randomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generateDiskErrorLog(): Promise<void> {
  const client = getEsClient();
  const doc = {
    '@timestamp': new Date().toISOString(),
    level: pick(['ERROR', 'ERROR', 'WARN']),
    message: pick(errorMessages),
    service: config.service.name,
    hostname: config.service.hostname,
    trace_id: randomId() + randomId(),
    span_id: randomId(),
    logger: pick(['com.example.order.DiskMonitor', 'com.example.order.StorageManager', 'java.io.FileOutputStream']),
    thread: 'disk-monitor-1',
  };

  try {
    await client.index({ index: getDateIndex('app-logs'), body: doc });
  } catch (error: any) {
    console.error('[Scenario:disk] Index error:', error.message);
  }
}

async function generateHighDiskMetric(): Promise<void> {
  const client = getEsClient();
  const diskPercent = 93 + Math.random() * 6;
  const doc = generateMetrics({
    disk_percent: diskPercent,
    disk_used_gb: parseFloat((100 * diskPercent / 100).toFixed(1)),
  });

  try {
    await client.index({ index: getDateIndex('metrics'), body: doc });
  } catch (error: any) {
    console.error('[Scenario:disk] Metric index error:', error.message);
  }
}

export const diskCriticalScenario: Scenario = {
  id: 'disk',
  name: 'Disk Space Critical',
  description: 'Simulates disk usage at 95%+ for 5 minutes. Generates disk-related ERROR logs and high disk usage metrics.',
  duration: '5 min',
  durationMs: 5 * 60 * 1000,
  icon: '🔴',
  start() {
    logInterval = setInterval(generateDiskErrorLog, 2000);
    metricInterval = setInterval(generateHighDiskMetric, 5000);
  },
  stop() {
    if (logInterval) { clearInterval(logInterval); logInterval = null; }
    if (metricInterval) { clearInterval(metricInterval); metricInterval = null; }
  },
};
