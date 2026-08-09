// RFC 9728 path-suffixed variant for the MCP resource. For a resource with a
// path, the well-known segment is inserted between host and resource path, so
// the metadata for https://host/api/v1/mcp lives at
// https://host/.well-known/oauth-protected-resource/api/v1/mcp — which is
// exactly the URL the 401 challenge from /api/v1/mcp advertises.
// Same document as the root variant.
export { GET } from '../../../+server';
