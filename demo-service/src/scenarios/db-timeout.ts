import { getEsClient, getDateIndex } from '../elasticsearch.js';
import { config } from '../config.js';
import { Scenario } from './manager.js';

let interval: ReturnType<typeof setInterval> | null = null;

const errorMessages = [
  'java.sql.SQLTimeoutException: Connection timed out after 30000ms to database host db-primary.internal:5432',
  'org.postgresql.util.PSQLException: Connection to db-primary.internal:5432 refused. Check that the hostname and port are correct',
  'com.zaxxer.hikari.pool.HikariPool: Connection is not available, request timed out after 30000ms (total=20, active=20, idle=0, waiting=15)',
  'ERROR: Cannot acquire connection from pool - all connections are in use. Pool stats: active=20, idle=0, waiting=23',
  'java.net.SocketTimeoutException: Read timed out while executing SELECT * FROM orders WHERE id = ?',
  'Database health check failed: Unable to validate connection to db-primary.internal:5432',
  'Transaction rolled back due to connection timeout: OrderService.createOrder()',
  'Failover triggered: Attempting connection to db-replica.internal:5432',
  'Circuit breaker OPEN for database connections - failure rate: 85% (threshold: 50%)',
  'FATAL: remaining connection slots are reserved for non-replication superuser connections',
];

function randomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generateDbTimeoutLog(): Promise<void> {
  const client = getEsClient();
  const doc = {
    '@timestamp': new Date().toISOString(),
    level: 'ERROR',
    message: pick(errorMessages),
    service: config.service.name,
    hostname: config.service.hostname,
    trace_id: randomId() + randomId(),
    span_id: randomId(),
    logger: 'com.example.order.DatabasePool',
    thread: `http-nio-8080-exec-${Math.floor(Math.random() * 5) + 1}`,
    exception_class: pick(['java.sql.SQLTimeoutException', 'org.postgresql.util.PSQLException', 'com.zaxxer.hikari.pool.PoolInitializationException']),
    exception_message: 'Connection timed out',
    stack_trace: `java.sql.SQLTimeoutException: Connection timed out\n\tat com.zaxxer.hikari.pool.HikariPool.getConnection(HikariPool.java:188)\n\tat com.example.order.repository.OrderRepository.findById(OrderRepository.java:45)\n\tat com.example.order.service.OrderService.getOrder(OrderService.java:78)\n\tat com.example.order.controller.OrderController.getOrder(OrderController.java:34)`,
  };

  try {
    await client.index({ index: getDateIndex('app-logs'), body: doc });
  } catch (error: any) {
    console.error('[Scenario:db-timeout] Index error:', error.message);
  }
}

export const dbTimeoutScenario: Scenario = {
  id: 'db-timeout',
  name: 'Database Connection Timeout',
  description: 'Simulates database connection pool exhaustion and timeout errors for 2 minutes. Generates ERROR logs with connection timeout exceptions.',
  duration: '2 min',
  durationMs: 2 * 60 * 1000,
  icon: '🔴',
  start() {
    interval = setInterval(generateDbTimeoutLog, 500); // Every 500ms
  },
  stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  },
};
