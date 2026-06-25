import { describe, expect, it } from 'bun:test';

// Spawn the real CLI to verify exit codes + the stdout/stderr discipline that
// the stdio JSON-RPC channel depends on.
const CLI = new URL('../src/cli.ts', import.meta.url).pathname;

async function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', CLI, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const code = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { code, stdout, stderr };
}

describe('agentkarma-mcp CLI output', () => {
  it('--version prints a semver to stdout and exits 0', async () => {
    const { code, stdout } = await run(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('--help prints usage to stdout and exits 0', async () => {
    const { code, stdout } = await run(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage:');
  });

  it('an unknown flag errors on stderr (NOT stdout) and exits 2', async () => {
    const { code, stdout, stderr } = await run(['--nope']);
    expect(code).toBe(2);
    expect(stderr).toContain('unknown option');
    // stdout must stay clean — it is the JSON-RPC channel.
    expect(stdout).toBe('');
  });
});
