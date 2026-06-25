/**
 * HTTP (streamable-http) transport for the AgentKarma MCP server.
 *
 * Stateless: each request gets a fresh server + transport (no session state),
 * which suits a read-only, idempotent catalog and lets the endpoint scale
 * horizontally. Read-only and non-routing — same guarantees as stdio.
 *
 * Security: when bound to loopback (the default), DNS-rebinding protection is
 * enabled (Host-header validation) so a malicious web page can't drive the
 * local server. Non-loopback binds (`--host 0.0.0.0`) are an explicit operator
 * opt-in and are left unguarded — see the CLI's startup warning.
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  StreamableHTTPServerTransport,
  type StreamableHTTPServerTransportOptions,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  createAgentKarmaMcpServer,
  type CreateAgentKarmaMcpServerOptions,
} from '@agentkarma/sdk/mcp';

export interface HttpServerOptions extends CreateAgentKarmaMcpServerOptions {
  /** Port to listen on. Default 8787. */
  port?: number;
  /** Host/interface to bind. Default 127.0.0.1. */
  host?: string;
}

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = '127.0.0.1';
/** Tool arguments are tiny; cap the body to bound memory on any exposed bind. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version',
};

/** A bad request the caller can fix — answered with a JSON-RPC error, not a 500. */
class BadRequestError extends Error {
  constructor(
    readonly status: number,
    readonly rpcCode: number,
    message: string,
  ) {
    super(message);
  }
}

function applyCors(res: ServerResponse): void {
  for (const [key, value] of Object.entries(CORS_HEADERS)) res.setHeader(key, value);
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '::';
}

function pathnameOf(req: IncomingMessage): string {
  const url = req.url ?? '/';
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new BadRequestError(413, -32600, 'Request body too large');
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestError(400, -32700, 'Parse error: invalid JSON');
  }
}

/** A real MCP client opens an SSE stream or carries MCP headers; probes don't. */
function isMcpClient(req: IncomingMessage): boolean {
  const accept = req.headers['accept'];
  return (
    (typeof accept === 'string' && accept.includes('text/event-stream')) ||
    req.headers['mcp-session-id'] !== undefined ||
    req.headers['mcp-protocol-version'] !== undefined
  );
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function handleMcp(
  req: IncomingMessage,
  res: ServerResponse,
  config: CreateAgentKarmaMcpServerOptions,
  transportOptions: StreamableHTTPServerTransportOptions,
): Promise<void> {
  const server = createAgentKarmaMcpServer(config);
  const transport = new StreamableHTTPServerTransport(transportOptions);
  res.on('close', () => {
    void transport
      .close()
      .catch((e: unknown) => console.error('[agentkarma-mcp:http] transport close', e));
    void server
      .close()
      .catch((e: unknown) => console.error('[agentkarma-mcp:http] server close', e));
  });
  await server.connect(transport);

  let body: unknown;
  if (req.method === 'POST') {
    try {
      body = await readJsonBody(req);
    } catch (err) {
      if (err instanceof BadRequestError) {
        // Client error — a clean JSON-RPC error, never a 500.
        sendJson(res, err.status, {
          jsonrpc: '2.0',
          error: { code: err.rpcCode, message: err.message },
          id: null,
        });
        return;
      }
      throw err;
    }
  }
  await transport.handleRequest(req, res, body);
}

/**
 * Start the AgentKarma MCP server over HTTP. Returns the listening
 * `http.Server` — `await server.close()`-able for shutdown/tests.
 */
export async function startHttpServer(options: HttpServerOptions = {}): Promise<Server> {
  const { port = DEFAULT_PORT, host = DEFAULT_HOST, ...config } = options;

  // Reassigned after `listen` once the real (possibly ephemeral) port is known.
  let transportOptions: StreamableHTTPServerTransportOptions = {
    sessionIdGenerator: undefined,
  };

  const httpServer = createServer((req, res) => {
    applyCors(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const path = pathnameOf(req);

    // Friendly discovery for non-MCP GETs (browsers, uptime probes).
    if (req.method === 'GET' && (path === '/' || path === '') && !isMcpClient(req)) {
      sendJson(res, 200, {
        server: 'agentkarma',
        transport: 'streamable-http',
        endpoint: '/mcp',
        docs: 'https://agentkarma.io/docs/mcp',
      });
      return;
    }

    // MCP is served on /mcp (and / for convenience); anything else 404s.
    if (path !== '/mcp' && path !== '/') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

    handleMcp(req, res, config, transportOptions).catch((err: unknown) => {
      sendJson(res, 500, { error: 'internal_error' });
      // Detail to stderr only — never leak to the caller.
      console.error('[agentkarma-mcp:http]', err);
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });

  // Loopback binds get Host-header validation (DNS-rebinding protection). The
  // real port (handles `port: 0`) is known only after listen.
  const addr = httpServer.address() as AddressInfo | null;
  const actualPort = addr?.port ?? port;
  if (isLoopbackHost(host)) {
    transportOptions = {
      sessionIdGenerator: undefined,
      enableDnsRebindingProtection: true,
      allowedHosts: [
        `127.0.0.1:${actualPort}`,
        `localhost:${actualPort}`,
        `[::1]:${actualPort}`,
      ],
    };
  }

  return httpServer;
}
