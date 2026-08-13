/**
 * OpenAPI 3.1 document built from the REST route table and the zod schemas
 * already on the tools. No second description of the API.
 */
import { z, type ZodTypeAny } from 'zod';
import { REST_ROUTES } from './rest';
import { allTools } from './server';

function pathParams(pattern: string): string[] {
	return pattern
		.split('/')
		.filter((part) => part.startsWith(':'))
		.map((part) => part.slice(1));
}

function openApiPath(pattern: string): string {
	return pattern.replace(/:([A-Za-z]+)/g, '{$1}');
}

function jsonSchemaOf(field: ZodTypeAny): Record<string, unknown> {
	return z.toJSONSchema(field, { target: 'draft-07' }) as Record<string, unknown>;
}

function objectSchema(shape: Record<string, ZodTypeAny>): Record<string, unknown> {
	return jsonSchemaOf(z.object(shape));
}

function isOptional(field: ZodTypeAny): boolean {
	return field.safeParse(undefined).success;
}

export function buildOpenApiDocument(origin: string): Record<string, unknown> {
	const tools = new Map(
		allTools({ userId: 'openapi', organizationId: 'openapi' }).map((tool) => [tool.name, tool])
	);
	const paths: Record<string, Record<string, unknown>> = {};

	for (const route of REST_ROUTES) {
		const tool = tools.get(route.tool);
		if (!tool) continue;
		const path = `/api/v1${openApiPath(route.pattern)}`;
		const params = pathParams(route.pattern);
		const shape = tool.inputSchema as Record<string, ZodTypeAny>;
		const parameters: Record<string, unknown>[] = params.map((name) => ({
			name,
			in: 'path',
			required: true,
			schema: shape[name] ? jsonSchemaOf(shape[name]) : { type: 'string' }
		}));

		const leftover = Object.fromEntries(
			Object.entries(shape).filter(([name]) => !params.includes(name))
		);
		const leftoverKeys = Object.keys(leftover);

		if (route.method === 'GET') {
			for (const name of leftoverKeys) {
				parameters.push({
					name,
					in: 'query',
					required: !isOptional(leftover[name]),
					schema: jsonSchemaOf(leftover[name])
				});
			}
		}

		const operation: Record<string, unknown> = {
			operationId: route.tool,
			summary: tool.description,
			tags: [route.tool.split('_')[0] ?? 'tools'],
			parameters,
			responses: {
				'200': { description: 'The tool payload, as JSON.' },
				'400': { description: 'Validation or a refused tool call.' },
				'401': { description: 'Missing or invalid bearer token.' },
				'404': { description: 'No such route.' }
			}
		};

		if (route.method !== 'GET' && leftoverKeys.length > 0) {
			operation.requestBody = {
				required: leftoverKeys.some((name) => !isOptional(leftover[name])),
				content: {
					'application/json': {
						schema: objectSchema(leftover)
					}
				}
			};
		}

		paths[path] = { ...paths[path], [route.method.toLowerCase()]: operation };
	}

	return {
		openapi: '3.1.0',
		info: {
			title: 'untitledconference API',
			version: '1.0.0',
			description:
				'REST adapter over the same tool registry as the MCP server at /api/v1/mcp. ' +
				'Authenticate with the same OAuth bearer token (scope mcp:tools).'
		},
		servers: [{ url: origin }],
		paths,
		components: {
			securitySchemes: {
				oauth2: {
					type: 'oauth2',
					flows: {
						authorizationCode: {
							authorizationUrl: `${origin}/api/auth/oauth2/authorize`,
							tokenUrl: `${origin}/api/auth/oauth2/token`,
							scopes: { 'mcp:tools': 'Call conference tools as the authorizing user.' }
						}
					}
				}
			}
		},
		security: [{ oauth2: ['mcp:tools'] }]
	};
}
