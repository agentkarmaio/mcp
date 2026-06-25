#!/usr/bin/env node
/**
 * `agentkarma-mcp` — AgentKarma MCP server CLI (stdio by default, `--http` opt-in).
 */
import { readFileSync } from 'node:fs';
import { HELP, parseArgs } from './args.js';
import { startHttpServer, startStdioServer } from './index.js';

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const options = parseArgs(process.argv.slice(2));

if (options.error) {
  process.stderr.write(`agentkarma-mcp: ${options.error}\n\n${HELP}`);
  process.exit(2);
}
if (options.help) {
  process.stdout.write(HELP);
  process.exit(0);
}
if (options.version) {
  process.stdout.write(`${readVersion()}\n`);
  process.exit(0);
}

if (!options.http && (options.port !== undefined || options.host !== undefined)) {
  process.stderr.write('agentkarma-mcp: --port/--host are ignored without --http\n');
}

const baseUrl = options.baseUrl ?? process.env.AGENTKARMA_BASE_URL;
const config = baseUrl ? { baseUrl } : undefined;

function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '::';
}

try {
  if (options.http) {
    const host = options.host ?? '127.0.0.1';
    const port = options.port ?? 8787;
    if (!isLoopback(host)) {
      console.error(
        `agentkarma-mcp: WARNING — binding ${host} exposes an unauthenticated, read-only MCP endpoint to the network`,
      );
    }
    const server = await startHttpServer({ config, host, port });
    // stderr only — stdout is reserved for the stdio JSON-RPC channel by convention.
    console.error(
      `agentkarma-mcp HTTP at http://${host}:${port}/mcp (${baseUrl ?? 'https://agentkarma.io'})`,
    );
    const shutdown = (): void => {
      server.close(() => process.exit(0));
      // Don't wait on lingering keep-alive / SSE sockets — force them closed,
      // and exit regardless after a grace period.
      server.closeAllConnections?.();
      setTimeout(() => process.exit(0), 5_000).unref();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    await startStdioServer({ config });
    console.error(`agentkarma-mcp ready (${baseUrl ?? 'https://agentkarma.io'}) over stdio`);
  }
} catch (err) {
  console.error('agentkarma-mcp failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
}
