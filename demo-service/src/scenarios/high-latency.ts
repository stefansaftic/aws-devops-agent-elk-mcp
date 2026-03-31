import { getEsClient, getDateIndex } from '../elasticsearch.js';
import { config } from '../config.js';
import { generateAccessLog } from '../generators/access-logs.js';
import { Scenario } from './manager.js';

let logInterval: ReturnType<typeof setInterval> | null = null;
let accessInterval: ReturnType<typeof setInterval> | null = null;

const warnMessages = [
  'Request processing time exceeded SLA: {time}ms for GET /api/orders (SLA: 2000ms)',
  'Slow upstream response from payment-service: {time}ms',
  'Database query took {time}ms: SELECT o.*, p.* FROM orders o JOIN payments p ON o.id = p.order_id WHERE o.status = ?',
  'Connection pool wait time: {time}ms before acquiring database connection',
  'Redis cache timeout: {time}ms for key product:catalog:page:1',
  'External API call to inventory-service took {time}ms (timeout threshold: 10000ms)',
  'Thread pool queue depth: 150 - requests are being queued due to slow processing',
  'P99 latency spike detected: {time}ms (baseline: 200ms)',
  'Load balancer health check response time: {time}ms (threshold: 5000ms)',
  'Garbage collection pause causing request delays: {time}ms stop-the-world pause',
];

function randomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function generateLatencyLog(): Promise<void> {
  const client = getEsClient();
  const time = randomInt(5000, 30000);
  const doc = {
    '@timestamp': new Date().toISOString(),
    level: pick(['WARN', 'WARN', 'ERROR']),
    message: pick(warnMessages).replace('{time}', `${time}`),
    service: config.service.name,
    hostname: config.service.hostname,
    trace_id: randomId() + randomId(),
    span_id: randomId(),
    logger: pick(['com.example.order.LatencyMonitor', 'com.example.order.OrderController', 'com.example.order.PerformanceInterceptor']),
    thread: `http-nio-8080-exec-${Math.floor(Math.random() * 5) + 1}`,
  };

  try {
    await client.index({ index: getDateIndex('app-logs'), body: doc });
  } catch (error: any) {
    console.error('[Scenario:latency] Index error:', error.message);
  }
}

async function generateSlowAccessLog(): Promise<void> {
  const client = getEsClient();
  const doc = generateAccessLog({ response_time_ms: randomInt(5000, 30000) });

  try {
    await client.index({ index: getDateIndex('access-logs'), body: doc });
  } catch (error: any) {
    console.error('[Scenario:latency] Access log index error:', error.message);
  }
}

export const highLatencyScenario: Scenario = {
  id: 'latency',
  name: 'High Latency',
  description: 'Simulates API response time spikes to 5-30 seconds for 2 minutes. Generates WARN/ERROR logs and slow access logs.',
  duration: '2 min',
  durationMs: 2 * 60 * 1000,
  icon: '🟡',
  start() {
    logInterval = setInterval(generateLatencyLog, 600);
    accessInterval = setInterval(generateSlowAccessLog, 400);
  },
  stop() {
    if (logInterval) { clearInterval(logInterval); logInterval = null; }
    if (accessInterval) { clearInterval(accessInterval); accessInterval = null; }
  },
};
