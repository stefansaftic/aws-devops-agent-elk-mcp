import express from 'express';
import { Client } from '@elastic/elasticsearch';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config.js';
import { createMcpServer } from './mcp/server.js';
import { tokenEndpointRouter } from './oauth/token-endpoint.js';
import { oauthMiddleware } from './oauth/middleware.js';

// Create Elasticsearch client
function createEsClient(): Client {
  const esConfig: Record<string, unknown> = {
    node: config.elasticsearch.url,
  };

  if (config.elasticsearch.apiKey) {
    esConfig.auth = { apiKey: config.elasticsearch.apiKey };
  } else if (config.elasticsearch.username && config.elasticsearch.password) {
    esConfig.auth = {
      username: config.elasticsearch.username,
      password: config.elasticsearch.password,
    };
  }

  if (config.elasticsearch.sslSkipVerify) {
    esConfig.tls = { rejectUnauthorized: false };
  }

  return new Client(esConfig as any);
}

async function main() {
  const app = express();

  // Parse URL-encoded bodies (for OAuth token endpoint)
  app.use(express.urlencoded({ extended: true }));
  // Only parse JSON for non-MCP routes (MCP transport handles its own body parsing)
  app.use((req, res, next) => {
    if (req.path === '/mcp') {
      return next();
    }
    express.json()(req, res, next);
  });

  // Create Elasticsearch client
  const esClient = createEsClient();

  // Store transports by session ID for session management
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // --- Routes ---

  // Health check (no auth required)
  app.get('/health', async (_req, res) => {
    try {
      const esHealth = await esClient.cluster.health();
      res.json({
        status: 'ok',
        elasticsearch: {
          connected: true,
          cluster_name: esHealth.cluster_name,
          status: esHealth.status,
        },
        tools: ['search', 'list_indices', 'get_mappings'],
      });
    } catch (error: any) {
      res.json({
        status: 'degraded',
        elasticsearch: {
          connected: false,
          error: error.message,
        },
        tools: ['search', 'list_indices', 'get_mappings'],
      });
    }
  });

  // OAuth token endpoint (no auth required - this IS the auth endpoint)
  app.use(tokenEndpointRouter);

  // MCP Streamable HTTP endpoint - POST (with OAuth protection)
  app.post('/mcp', oauthMiddleware, async (req, res) => {
    try {
      // Check for existing session
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && transports.has(sessionId)) {
        // Reuse existing transport for this session
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      // New session - create a new transport
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports.set(newSessionId, transport);
          console.log(`[MCP] New session initialized: ${newSessionId}`);
        },
      });

      // Clean up on close
      transport.onclose = () => {
        const sid = Array.from(transports.entries())
          .find(([_, t]) => t === transport)?.[0];
        if (sid) {
          transports.delete(sid);
          console.log(`[MCP] Session closed: ${sid}`);
        }
      };

      // Create a new MCP server instance for this session
      // (each connection needs its own McpServer instance)
      const mcpServer = createMcpServer(esClient);
      await mcpServer.connect(transport);

      // Handle the request
      await transport.handleRequest(req, res);
    } catch (error: any) {
      console.error('[MCP] Error handling POST request:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // MCP Streamable HTTP endpoint - GET (SSE for server-initiated messages)
  app.get('/mcp', oauthMiddleware, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }

    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  // MCP Streamable HTTP endpoint - DELETE (session termination)
  app.delete('/mcp', oauthMiddleware, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }

    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  // Start server
  app.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║          ELK MCP Server for AWS DevOps Agent         ║
╠══════════════════════════════════════════════════════╣
║  MCP Endpoint:    http://localhost:${config.port}/mcp          ║
║  OAuth Token:     http://localhost:${config.port}/oauth/token  ║
║  Health Check:    http://localhost:${config.port}/health       ║
║  Elasticsearch:   ${config.elasticsearch.url.padEnd(33)}║
╚══════════════════════════════════════════════════════╝
    `);
  });
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
