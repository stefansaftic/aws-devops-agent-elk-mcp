import { getEsClient, getDateIndex } from '../elasticsearch.js';
import { config } from '../config.js';
import { generateMetrics } from '../generators/metrics.js';
import { Scenario } from './manager.js';

let logInterval: ReturnType<typeof setInterval> | null = null;
let metricInterval: ReturnType<typeof setInterval> | null = null;

const errorMessages = [
  'java.lang.OutOfMemoryError: Java heap space - failed to allocate 67108864 bytes',
  'java.lang.OutOfMemoryError: GC overhead limit exceeded',
  'WARN: GC pause time exceeded threshold: 4523ms (threshold: 200ms)',
  'Memory usage critical: 1890MB / 2048MB (92.3%) - triggering emergency GC',
  'Container memory limit approaching: 1950MB / 2048MB - OOM kill imminent',
  'Kubernetes OOMKilled: Container order-service exceeded memory limit of 2Gi',
  'FATAL: Process killed by OOM killer (score: 985). RSS: 2097152kB',
  'Emergency heap dump triggered: /tmp/heapdump-20240115-143022.hprof (1.8GB)',
  'Thread pool exhausted due to memory pressure: active=50, queued=200, rejected=45',
  'Large object allocation failed: requested 128MB, available 12MB in old generation',
];

function randomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generateMemoryErrorLog(): Promise<void> {
  const client = getEsClient();
  const doc = {
    '@timestamp': new Date().toISOString(),
    level: pick(['ERROR', 'ERROR', 'ERROR', 'WARN']),
    message: pick(errorMessages),
    service: config.service.name,
    hostname: config.service.hostname,
    trace_id: randomId() + randomId(),
    span_id: randomId(),
    logger: pick(['com.example.order.MemoryMonitor', 'java.lang.Runtime', 'com.example.order.OrderService']),
    thread: pick(['GC-thread-1', 'http-nio-8080-exec-3', 'memory-monitor-1']),
    exception_class: 'java.lang.OutOfMemoryError',
    exception_message: 'Java heap space',
  };

  try {
    await client.index({ index: getDateIndex('app-logs'), body: doc });
  } catch (error: any) {
    console.error('[Scenario:memory] Index error:', error.message);
  }
}

async function generateHighMemoryMetric(): Promise<void> {
  const client = getEsClient();
  const doc = generateMetrics({
    memory_percent: 88 + Math.random() * 10,
    memory_used_mb: 1800 + Math.random() * 200,
    heap_used_mb: 900 + Math.random() * 120,
    gc_pause_ms: 500 + Math.random() * 4000,
    cpu_percent: 70 + Math.random() * 25,
  });

  try {
    await client.index({ index: getDateIndex('metrics'), body: doc });
  } catch (error: any) {
    console.error('[Scenario:memory] Metric index error:', error.message);
  }
}

export const memoryPressureScenario: Scenario = {
  id: 'memory',
  name: 'Memory Pressure / OOM',
  description: 'Simulates memory pressure with OOM kills, GC pauses, and heap exhaustion for 3 minutes. Generates ERROR logs and high memory metrics.',
  duration: '3 min',
  durationMs: 3 * 60 * 1000,
  icon: '🟡',
  start() {
    logInterval = setInterval(generateMemoryErrorLog, 800);
    metricInterval = setInterval(generateHighMemoryMetric, 5000);
  },
  stop() {
    if (logInterval) { clearInterval(logInterval); logInterval = null; }
    if (metricInterval) { clearInterval(metricInterval); metricInterval = null; }
  },
};
