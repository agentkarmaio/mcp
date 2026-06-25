import { describe, expect, it } from 'bun:test';

// Drive the actual CLI over stdio with a real JSON-RPC handshake. Runs the TS
// source via bun (the published artifact is `node dist/cli.js`, same code).
const CLI = new URL('../src/cli.ts', import.meta.url).pathname;

const RPC =
  [
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'stdio-test', version: '0' },
      },
    }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  ].join('\n') + '\n';

describe('agentkarma-mcp stdio CLI', () => {
  it('completes the handshake and lists tools over stdio', async () => {
    const proc = Bun.spawn(['bun', 'run', CLI], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    proc.stdin.write(RPC);
    await proc.stdin.end();
    const out = await new Response(proc.stdout).text();
    proc.kill();

    expect(out).toContain('get_karma');
    expect(out).toContain('check_trust');
  }, 30_000);
});
