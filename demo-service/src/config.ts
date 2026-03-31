import * as fs from 'fs';

// Load API key from file if ES_API_KEY_FILE is set (used by docker-compose setup service)
function loadApiKey(): string {
  if (process.env.ES_API_KEY) {
    return process.env.ES_API_KEY;
  }
  const keyFile = process.env.ES_API_KEY_FILE;
  if (keyFile && fs.existsSync(keyFile)) {
    const content = fs.readFileSync(keyFile, 'utf-8');
    const match = content.match(/(?:MCP_API_KEY|DEMO_API_KEY|ES_API_KEY)=(.+)/);
    if (match) return match[1].trim();
  }
  return '';
}

export const config = {
  port: parseInt(process.env.DEMO_SERVICE_PORT || '3001', 10),
  elasticsearch: {
    url: process.env.ES_URL || 'http://elasticsearch:9200',
    apiKey: loadApiKey(),
    username: process.env.ES_USERNAME || '',
    password: process.env.ES_PASSWORD || '',
  },
  // Simulated service details
  service: {
    name: 'order-service',
    version: '2.4.1',
    environment: 'production',
    hostname: 'order-service-pod-7f8b9c6d4-x2k9m',
    namespace: 'default',
  },
};
