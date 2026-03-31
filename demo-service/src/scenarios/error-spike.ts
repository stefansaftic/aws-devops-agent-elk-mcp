import { getEsClient, getDateIndex } from '../elasticsearch.js';
import { config } from '../config.js';
import { generateAccessLog } from '../generators/access-logs.js';
import { Scenario } from './manager.js';

let logInterval: ReturnType<typeof setInterval> | null = null;
let accessInterval: ReturnType<typeof setInterval> | null = null;

const errorMessages = [
  'HTTP 500 Internal Server Error: Unhandled exception in OrderController.createOrder()',
  'HTTP 502 Bad Gateway: upstream server returned invalid response',
  'HTTP 503 Service Unavailable: Circuit breaker is OPEN for payment-service',
  'NullPointerException at com.example.order.service.OrderService.processPayment(OrderService.java:142)',
  'IllegalStateException: Order state transition not allowed: PENDING -> CANCELLED',
  'RuntimeException: Failed to serialize response for /api/orders/12345',
  'HTTP 500: Database connection pool exhausted while processing request',
  'HTTP 502: Load balancer received no response from upstream within 60s',
  'HTTP 503: Server is in maintenance mode - deployment in progress',
  'ConstraintViolationException: Duplicate order ID detected: ord-abc12345',
];

function randomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generateErrorLog(): Promise<void> {
  const client = getEsClient();
  const doc = {
    '@timestamp': new Date().toISOString(),
    level: 'ERROR',
    message: pick(errorMessages),
    service: config.service.name,
    hostname: config.service.hostname,
    trace_id: randomId() + randomId(),
    span_id: randomId(),
    logger: pick(['com.example.order.OrderController', 'com.example.order.PaymentService', 'com.example.order.ErrorHandler']),
    thread: `http-nio-8080-exec-${Math.floor(Math.random() * 5) + 1}`,
  };

  try {
    await client.index({ index: getDateIndex('app-logs'), body: doc });
  } catch (error: any) {
    console.error('[Scenario:error-spike] Index error:', error.message);
  }
}

async function generateErrorAccessLog(): Promise<void> {
  const client = getEsClient();
  const statusCode = pick([500, 500, 500, 502, 502, 503]);
  const doc = generateAccessLog({ status_code: statusCode, response_time_ms: 100 + Math.random() * 5000 });

  try {
    await client.index({ index: getDateIndex('access-logs'), body: doc });
  } catch (error: any) {
    console.error('[Scenario:error-spike] Access log index error:', error.message);
  }
}

export const errorSpikeScenario: Scenario = {
  id: 'error-spike',
  name: '5xx Error Spike',
  description: 'Simulates a burst of 500/502/503 HTTP errors for 1 minute. Generates ERROR application logs and 5xx access logs.',
  duration: '1 min',
  durationMs: 1 * 60 * 1000,
  icon: '🔴',
  start() {
    logInterval = setInterval(generateErrorLog, 300);
    accessInterval = setInterval(generateErrorAccessLog, 200);
  },
  stop() {
    if (logInterval) { clearInterval(logInterval); logInterval = null; }
    if (accessInterval) { clearInterval(accessInterval); accessInterval = null; }
  },
};
