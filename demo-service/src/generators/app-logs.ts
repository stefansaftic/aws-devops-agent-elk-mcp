import { config } from '../config.js';

const loggers = ['com.example.order.OrderController', 'com.example.order.PaymentService', 'com.example.order.InventoryClient', 'com.example.order.NotificationService', 'com.example.order.DatabasePool'];
const threads = ['http-nio-8080-exec-1', 'http-nio-8080-exec-2', 'http-nio-8080-exec-3', 'async-pool-1', 'scheduler-1'];

const infoMessages = [
  'Processing order request for customer {customerId}',
  'Order {orderId} created successfully',
  'Payment processed for order {orderId}, amount: ${amount}',
  'Inventory check passed for product {productId}',
  'Notification sent to customer {customerId} for order {orderId}',
  'Database connection pool stats: active={active}, idle={idle}, total={total}',
  'Health check completed successfully',
  'Cache hit for product catalog, key: {cacheKey}',
  'Request completed in {duration}ms',
  'Session validated for user {userId}',
];

const warnMessages = [
  'Slow database query detected: {duration}ms for query on orders table',
  'Connection pool running low: {active}/{total} connections in use',
  'Retry attempt {attempt}/3 for external API call to payment gateway',
  'Response time exceeded threshold: {duration}ms > 2000ms for /api/orders',
  'Cache miss rate above threshold: {rate}% for product catalog',
  'Memory usage above 80%: {used}MB / {total}MB',
];

function randomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fillTemplate(template: string): string {
  return template
    .replace('{customerId}', `cust-${randomId()}`)
    .replace('{orderId}', `ord-${randomId()}`)
    .replace('{productId}', `prod-${randomInt(1000, 9999)}`)
    .replace('{amount}', `${randomInt(10, 500)}.${randomInt(0, 99).toString().padStart(2, '0')}`)
    .replace('{active}', `${randomInt(5, 20)}`)
    .replace('{idle}', `${randomInt(1, 10)}`)
    .replace('{total}', `${randomInt(20, 30)}`)
    .replace('{duration}', `${randomInt(50, 3000)}`)
    .replace('{attempt}', `${randomInt(1, 3)}`)
    .replace('{rate}', `${randomInt(15, 40)}`)
    .replace('{used}', `${randomInt(600, 900)}`)
    .replace('{total}', `${randomInt(1024, 1024)}`)
    .replace('{cacheKey}', `catalog:${randomId()}`)
    .replace('{userId}', `user-${randomId()}`);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateAppLog(level?: string): Record<string, unknown> {
  const logLevel = level || (Math.random() < 0.85 ? 'INFO' : 'WARN');
  const messages = logLevel === 'INFO' ? infoMessages : warnMessages;

  return {
    '@timestamp': new Date().toISOString(),
    level: logLevel,
    message: fillTemplate(pick(messages)),
    service: config.service.name,
    hostname: config.service.hostname,
    trace_id: randomId() + randomId(),
    span_id: randomId(),
    logger: pick(loggers),
    thread: pick(threads),
  };
}
