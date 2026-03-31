import { Client } from '@elastic/elasticsearch';

export async function executeSearch(esClient: Client, args: Record<string, unknown>) {
  const index = args.index as string;
  const queryBody = args.query_body as Record<string, unknown>;
  const fields = args.fields as string[] | undefined;

  // Build search request body - pass query_body directly to ES
  const body = { ...queryBody };

  // If fields are provided, set _source (convenience parameter)
  if (fields && fields.length > 0) {
    if (Array.isArray(body._source)) {
      // Augment existing _source array
      (body._source as string[]).push(...fields);
    } else {
      body._source = fields;
    }
  }

  try {
    const response = await esClient.search({
      index,
      body,
    } as any);

    // Format the response
    const result: Record<string, unknown> = {};

    // Total hits
    const total = typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value ?? 0;

    const hits = response.hits.hits as any[];

    // Only include hit stats if it's not a pure aggregation query
    if (!response.aggregations || hits.length > 0) {
      result.total = total;
      result.showing = hits.length;
    }

    // Include hits
    if (hits.length > 0) {
      result.hits = hits.map((hit: any) => hit._source);
    }

    // Include aggregations
    if (response.aggregations) {
      result.aggregations = response.aggregations;
    }

    // If no hits and no aggregations, still show total
    if (!result.total && !result.aggregations) {
      result.total = total;
      result.hits = [];
    }

    return JSON.stringify(result, null, 2);
  } catch (error: any) {
    throw new Error(`Elasticsearch search error: ${error.message}`);
  }
}
