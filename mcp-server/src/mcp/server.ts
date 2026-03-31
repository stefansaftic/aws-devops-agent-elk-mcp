import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@elastic/elasticsearch';
import { z } from 'zod';
import { executeSearch } from '../tools/search.js';
import { executeListIndices } from '../tools/list-indices.js';
import { executeGetMappings } from '../tools/get-mappings.js';
export function createMcpServer(esClient: Client): McpServer {
  const server = new McpServer(
    {
      name: 'elk-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register the search tool
  server.tool(
    'search',
    'Perform an Elasticsearch search with the provided query DSL. The query_body parameter accepts a complete Elasticsearch search request body including query, size, from, sort, aggs, _source, etc. Use list_indices to discover available indices and get_mappings to understand field types before searching.',
    {
      index: z.string().describe(
        'Index name or pattern to search (e.g., "app-logs-*", "access-logs-2024.01.15", "metrics-*"). Use list_indices to discover available indices.'
      ),
      query_body: z.record(z.string(), z.unknown()).describe(
        'Complete Elasticsearch query DSL object. Can include query, size, from, sort, aggs, _source, etc. Example: {"query":{"bool":{"must":[{"term":{"level":"ERROR"}}],"filter":[{"range":{"@timestamp":{"gte":"now-1h"}}}]}},"size":10,"sort":[{"@timestamp":"desc"}]}'
      ),
      fields: z.array(z.string()).optional().describe(
        'Optional convenience parameter to filter returned fields (sets _source). E.g., ["message", "level", "@timestamp"]. If query_body already has _source, these fields are appended.'
      ),
    },
    async (args) => {
      try {
        const result = await executeSearch(esClient, args as Record<string, unknown>);
        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // Register the list_indices tool
  server.tool(
    'list_indices',
    'List all available Elasticsearch/OpenSearch indices with their document counts, size, and health status. Use this tool to discover what data is available before searching.',
    {
      pattern: z.string().optional().describe(
        'Optional index name pattern to filter results (e.g., "app-logs-*", "metrics-*"). If not specified, lists all indices.'
      ),
    },
    async (args) => {
      try {
        const result = await executeListIndices(esClient, args as Record<string, unknown>);
        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // Register the get_mappings tool
  server.tool(
    'get_mappings',
    'Get field mappings for an Elasticsearch/OpenSearch index. Returns the field names, types, and structure of documents in the index. Use this tool to understand what fields are available before constructing search queries.',
    {
      index: z.string().describe(
        'Index name to get mappings for (e.g., "app-logs-2024.01.15"). Wildcards are supported but a specific index is recommended for accurate results.'
      ),
    },
    async (args) => {
      try {
        const result = await executeGetMappings(esClient, args as Record<string, unknown>);
        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
