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
  // Server
  port: parseInt(process.env.MCP_SERVER_PORT || '3000', 10),

  // Elasticsearch / OpenSearch
  elasticsearch: {
    url: process.env.ES_URL || 'http://elasticsearch:9200',
    apiKey: loadApiKey(),
    username: process.env.ES_USERNAME || '',
    password: process.env.ES_PASSWORD || '',
    sslSkipVerify: process.env.ES_SSL_SKIP_VERIFY === 'true',
  },

  // OAuth 2.0
  oauth: {
    clientId: process.env.OAUTH_CLIENT_ID || 'devops-agent',
    clientSecret: process.env.OAUTH_CLIENT_SECRET || 'change-me-in-production',
    jwtSecret: process.env.JWT_SECRET || 'jwt-secret-change-me-in-production',
    tokenExpirySeconds: parseInt(process.env.TOKEN_EXPIRY_SECONDS || '3600', 10),
    issuer: process.env.OAUTH_ISSUER || 'elk-mcp-server',
    audience: process.env.OAUTH_AUDIENCE || 'elk-mcp',
  },

  // Search defaults
  search: {
    maxResults: 100,
    defaultResults: 20,
    defaultTimeField: '@timestamp',
  },
};
