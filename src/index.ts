/**
 * @agentkarma/mcp — programmatic entry point.
 *
 * A turnkey MCP server for AgentKarma. Unlike the `agentkarma-mcp` bin inside
 * `@agentkarma/sdk` (which needs the `@modelcontextprotocol/sdk` peer installed
 * separately), this package depends on both as REGULAR dependencies, so
 * `npx @agentkarma/mcp` and the helpers below work with no extra setup.
 *
 * Read-only and non-routing: the server exposes AgentKarma's read catalog and
 * never signs, executes, or proxies a call.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  createAgentKarmaMcpServer,
  type CreateAgentKarmaMcpServerOptions,
} from '@agentkarma/sdk/mcp';

/**
 * Start the AgentKarma MCP server over stdio and connect it. Resolves once the
 * transport is connected; the process then serves until stdin closes.
 */
export async function startStdioServer(
  options: CreateAgentKarmaMcpServerOptions = {},
): Promise<void> {
  const server = createAgentKarmaMcpServer(options);
  await server.connect(new StdioServerTransport());
}

// Re-export the SDK's MCP building blocks so consumers can embed or extend the
// server without a separate `@agentkarma/sdk` import.
export {
  createAgentKarmaMcpServer,
  agentKarmaMcpTools,
  callAgentKarmaTool,
} from '@agentkarma/sdk/mcp';
export type { CreateAgentKarmaMcpServerOptions } from '@agentkarma/sdk/mcp';

export { startHttpServer } from './http.js';
export type { HttpServerOptions } from './http.js';
