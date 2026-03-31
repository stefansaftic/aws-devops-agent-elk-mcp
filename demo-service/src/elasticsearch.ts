import { Client } from '@elastic/elasticsearch';
import { config } from './config.js';

let esClient: Client;

export function getEsClient(): Client {
  if (!esClient) {
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

    esClient = new Client(esConfig as any);
  }
  return esClient;
}

export async function waitForElasticsearch(maxRetries = 30, delayMs = 2000): Promise<void> {
  const client = getEsClient();
  for (let i = 0; i < maxRetries; i++) {
    try {
      await client.cluster.health({ wait_for_status: 'yellow', timeout: '5s' });
      console.log('[ES] Elasticsearch is ready');
      return;
    } catch (error) {
      console.log(`[ES] Waiting for Elasticsearch... (${i + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Elasticsearch did not become ready in time');
}

export async function setupIndexTemplates(): Promise<void> {
  const client = getEsClient();

  // App logs index template
  await client.indices.putIndexTemplate({
    name: 'app-logs-template',
    index_patterns: ['app-logs-*'],
    template: {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
      },
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          level: { type: 'keyword' },
          message: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 512 } } },
          service: { type: 'keyword' },
          hostname: { type: 'keyword' },
          trace_id: { type: 'keyword' },
          span_id: { type: 'keyword' },
          logger: { type: 'keyword' },
          thread: { type: 'keyword' },
          exception_class: { type: 'keyword' },
          exception_message: { type: 'text' },
          stack_trace: { type: 'text' },
        },
      },
    },
  });

  // Access logs index template
  await client.indices.putIndexTemplate({
    name: 'access-logs-template',
    index_patterns: ['access-logs-*'],
    template: {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
      },
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          method: { type: 'keyword' },
          path: { type: 'keyword' },
          status_code: { type: 'integer' },
          response_time_ms: { type: 'float' },
          client_ip: { type: 'ip' },
          user_agent: { type: 'text' },
          service: { type: 'keyword' },
          request_id: { type: 'keyword' },
          bytes_sent: { type: 'long' },
        },
      },
    },
  });

  // Metrics index template
  await client.indices.putIndexTemplate({
    name: 'metrics-template',
    index_patterns: ['metrics-*'],
    template: {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
      },
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          hostname: { type: 'keyword' },
          service: { type: 'keyword' },
          metric_type: { type: 'keyword' },
          cpu_percent: { type: 'float' },
          memory_percent: { type: 'float' },
          memory_used_mb: { type: 'float' },
          memory_total_mb: { type: 'float' },
          disk_percent: { type: 'float' },
          disk_used_gb: { type: 'float' },
          disk_total_gb: { type: 'float' },
          network_in_bytes: { type: 'long' },
          network_out_bytes: { type: 'long' },
          open_connections: { type: 'integer' },
          active_threads: { type: 'integer' },
          gc_pause_ms: { type: 'float' },
          heap_used_mb: { type: 'float' },
          heap_max_mb: { type: 'float' },
        },
      },
    },
  });

  console.log('[ES] Index templates created');
}

export function getDateIndex(prefix: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${prefix}-${year}.${month}.${day}`;
}
