import { config } from '../config.js';

const endpoints = [
  { method: 'GET', path: '/api/orders', weight: 30 },
  { method: 'POST', path: '/api/orders', weight: 15 },
  { method: 'GET', path: '/api/orders/{id}', weight: 20 },
  { method: 'PUT', path: '/api/orders/{id}/status', weight: 10 },
  { method: 'GET', path: '/api/products', weight: 25 },
  { method: 'GET', path: '/api/products/{id}', weight: 15 },
  { method: 'POST', path: '/api/payments', weight: 10 },
  { method: 'GET', path: '/api/inventory/{id}', weight: 10 },
  { method: 'GET', path: '/health', weight: 20 },
  { method: 'GET', path: '/api/users/me', weight: 10 },
];

const userAgents = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'PostmanRuntime/7.36.0',
  'axios/1.6.2',
  'python-requests/2.31.0',
  'curl/8.4.0',
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomIp(): string {
  return `${randomInt(10, 192)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

function randomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick<T extends { weight: number }>(items: T[]): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

export function generateAccessLog(overrides?: Partial<{
  status_code: number;
  response_time_ms: number;
}>): Record<string, unknown> {
  const endpoint = weightedPick(endpoints);
  const path = endpoint.path
    .replace('{id}', `${randomInt(1000, 9999)}`);

  // Normal distribution: mostly 200s, some 3xx, rare 4xx/5xx
  let statusCode = overrides?.status_code;
  if (!statusCode) {
    const rand = Math.random();
    if (rand < 0.90) statusCode = 200;
    else if (rand < 0.93) statusCode = 201;
    else if (rand < 0.95) statusCode = 304;
    else if (rand < 0.97) statusCode = 400;
    else if (rand < 0.985) statusCode = 404;
    else if (rand < 0.99) statusCode = 401;
    else statusCode = 500;
  }

  // Normal response times: mostly fast, some slow
  let responseTime = overrides?.response_time_ms;
  if (!responseTime) {
    const rand = Math.random();
    if (rand < 0.7) responseTime = randomInt(5, 100);
    else if (rand < 0.9) responseTime = randomInt(100, 500);
    else if (rand < 0.97) responseTime = randomInt(500, 2000);
    else responseTime = randomInt(2000, 5000);
  }

  return {
    '@timestamp': new Date().toISOString(),
    method: endpoint.method,
    path,
    status_code: statusCode,
    response_time_ms: responseTime,
    client_ip: randomIp(),
    user_agent: pick(userAgents),
    service: config.service.name,
    request_id: `req-${randomId()}`,
    bytes_sent: randomInt(200, 50000),
  };
}
