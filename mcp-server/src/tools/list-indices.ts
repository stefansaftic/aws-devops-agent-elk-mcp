import { Client } from '@elastic/elasticsearch';

export const listIndicesToolDefinition = {
  name: 'list_indices',
  description:
    'List all available Elasticsearch/OpenSearch indices with their document counts, size, and health status. Use this tool to discover what data is available before searching. Returns index name, health (green/yellow/red), status (open/close), document count, and storage size.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description:
          'Optional index name pattern to filter results (e.g., "app-logs-*", "metrics-*"). If not specified, lists all indices.',
      },
    },
    required: [],
  },
};

export async function executeListIndices(esClient: Client, args: Record<string, unknown>) {
  const pattern = (args.pattern as string) || '*';

  try {
    const response = await esClient.cat.indices({
      index: pattern,
      format: 'json',
      h: 'index,health,status,docs.count,store.size,creation.date.string',
      s: 'index:asc',
    });

    const indices = (response as any[])
      .filter((idx: any) => !idx.index.startsWith('.')) // Filter out system indices
      .map((idx: any) => ({
        index: idx.index,
        health: idx.health,
        status: idx.status,
        docs_count: idx['docs.count'],
        store_size: idx['store.size'],
        created: idx['creation.date.string'],
      }));

    return JSON.stringify(
      {
        total_indices: indices.length,
        indices,
      },
      null,
      2
    );
  } catch (error: any) {
    throw new Error(`Elasticsearch list indices error: ${error.message}`);
  }
}
