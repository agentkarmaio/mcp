import { describe, expect, it } from 'bun:test';
import { parseArgs } from '../src/args.js';

describe('parseArgs', () => {
  it('defaults to stdio', () => {
    expect(parseArgs([])).toMatchObject({ http: false, help: false, version: false });
  });

  it('parses --http with --port and --host', () => {
    expect(parseArgs(['--http', '--port', '9000', '--host', '0.0.0.0'])).toMatchObject({
      http: true,
      port: 9000,
      host: '0.0.0.0',
    });
  });

  it('parses --base-url', () => {
    expect(parseArgs(['--base-url', 'https://staging.agentkarma.io']).baseUrl).toBe(
      'https://staging.agentkarma.io',
    );
  });

  it('flags help and version (long + short)', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['--version']).version).toBe(true);
    expect(parseArgs(['-v']).version).toBe(true);
  });

  it('rejects a bad or missing --port', () => {
    expect(parseArgs(['--port', 'abc']).error).toBeDefined();
    expect(parseArgs(['--port', '99999']).error).toBeDefined();
    expect(parseArgs(['--port']).error).toBeDefined();
  });

  it('rejects empty, whitespace, hex, and float ports (no Number() coercion)', () => {
    expect(parseArgs(['--port', '']).error).toBeDefined();
    expect(parseArgs(['--port', ' ']).error).toBeDefined();
    expect(parseArgs(['--port', '0x50']).error).toBeDefined();
    expect(parseArgs(['--port', '80.5']).error).toBeDefined();
    // valid still works
    expect(parseArgs(['--port', '8787']).port).toBe(8787);
    expect(parseArgs(['--port', '0']).port).toBe(0);
  });

  it('requires a value for --host / --base-url', () => {
    expect(parseArgs(['--base-url']).error).toBeDefined();
    expect(parseArgs(['--host', '--http']).error).toBeDefined();
  });

  it('rejects unknown options', () => {
    expect(parseArgs(['--nope']).error).toContain('unknown option');
  });
});
