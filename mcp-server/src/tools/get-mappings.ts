import { Client } from '@elastic/elasticsearch';

export const getMappingsToolDefinition = {
  name: 'get_mappings',
  description:
    'Get field mappings for an Elasticsearch/OpenSearch index. Returns the field names, types, and structure of documents in the index. Use this tool to understand what fields are available before constructing search queries.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      index: {
        type: 'string',
        description:
          'Index name to get mappings for (e.g., "app-logs-2024.01.15"). Wildcards are supported but a specific index is recommended for accurate results.',
      },
    },
    required: ['index'],
  },
};

export async function executeGetMappings(esClient: Client, args: Record<string, unknown>) {
  const index = args.index as string;

  try {
    const response = await esClient.indices.getMapping({ index });

    // Flatten the mappings for readability
    const result: Record<string, unknown> = {};

    for (const [indexName, mapping] of Object.entries(response)) {
      const properties = (mapping as any).mappings?.properties || {};
      result[indexName] = {
        fields: flattenMappings(properties),
      };
    }

    return JSON.stringify(result, null, 2);
  } catch (error: any) {
    throw new Error(`Elasticsearch get mappings error: ${error.message}`);
  }
}

function flattenMappings(
  properties: Record<string, any>,
  prefix: string = ''
): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const [fieldName, fieldMapping] of Object.entries(properties)) {
    const fullName = prefix ? `${prefix}.${fieldName}` : fieldName;

    if (fieldMapping.properties) {
      // Nested object - recurse
      Object.assign(fields, flattenMappings(fieldMapping.properties, fullName));
    } else {
      let type = fieldMapping.type || 'object';
      if (fieldMapping.fields) {
        // Multi-field mapping (e.g., text + keyword)
        const subFields = Object.keys(fieldMapping.fields).join(', ');
        type += ` (sub-fields: ${subFields})`;
      }
      fields[fullName] = type;
    }
  }

  return fields;
}
