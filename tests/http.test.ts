import { afterAll, describe, expect, it } from 'bun:test';
import type { Server } from 'node:http';
import { startHttpServer } from '../src/http.js';

// Inject a fake AgentKarma client so the server hits no network.
const fakeClient = {
  baseUrl: 'https://agentkarma.io',
  getKarma: (wallet: string) =>
    Promise.resolve({ address: wallet, face: 'both', provider: { score: 42 } }),
} as never;

let server: Server | undefined;

async function boot(): Promise<string> {
  server = await startHttpServer({ client: fakeClient, port: 0, host: '127.0.0.1' });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return `http://127.0.0.1:${port}`;
}

afterAll(() => {
  server?.close();
});

const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

describe('startHttpServer', () => {
  it('serves a discovery pointer on a plain GET /', async () => {
    const base = await boot();
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { server?: string; endpoint?: string };
    expect(body.server).toBe('agentkarma');
    expect(body.endpoint).toBe('/mcp');
  });

  it('answers CORS preflight', async () => {
    const base = await boot();
    const res = await fetch(`${base}/mcp`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('handles an MCP initialize over POST and returns server info', async () => {
    const base = await boot();
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'http-test', version: '0' },
        },
      }),
    });
    expect(res.ok).toBe(true);
    // streamable-http may answer as JSON or an SSE frame; either carries the
    // initialize result with our server name.
    const text = await res.text();
    expect(text).toContain('agentkarma');
    expect(text).toContain('serverInfo');
  });

  it('lists tools over a stateless POST (no prior session)', async () => {
    const base = await boot();
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toContain('get_karma');
    expect(text).toContain('check_trust');
  });

  it('runs a tools/call round-trip against the injected client', async () => {
    const base = await boot();
    const wallet = 'So11111111111111111111111111111111111111112';
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_karma', arguments: { wallet } },
      }),
    });
    expect(res.ok).toBe(true);
    const text = await res.text();
    // client -> handler -> CallToolResult content is wired: our fake returns score 42.
    expect(text).toContain(wallet);
    expect(text).toContain('42');
  });

  it('answers a malformed JSON body with a clean 400 (no SyntaxError leak)', async () => {
    const base = await boot();
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: '{ not valid json',
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain('-32700');
    expect(text).not.toContain('SyntaxError');
  });

  it('shapes a failing tool call as an error without leaking internal detail', async () => {
    const original = console.error;
    console.error = () => {}; // the SDK logs the raw error server-side; keep output clean
    try {
      const throwingClient = {
        baseUrl: 'https://agentkarma.io',
        getKarma: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5:5432 internal-host')),
      } as never;
      const s = await startHttpServer({ client: throwingClient, port: 0, host: '127.0.0.1' });
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: MCP_HEADERS,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'get_karma',
            arguments: { wallet: 'So11111111111111111111111111111111111111112' },
          },
        }),
      });
      const text = await res.text();
      expect(text).not.toContain('ECONNREFUSED');
      expect(text).not.toContain('10.0.0.5');
      s.close();
    } finally {
      console.error = original;
    }
  });

  it('404s an unknown path instead of serving MCP', async () => {
    const base = await boot();
    const res = await fetch(`${base}/not-the-endpoint`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list' }),
    });
    expect(res.status).toBe(404);
  });
});
