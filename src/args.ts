/**
 * Pure CLI argument parser for `agentkarma-mcp`. Kept side-effect free so it can
 * be unit-tested without spawning a server.
 */

export interface CliOptions {
  /** Serve over HTTP instead of stdio. */
  http: boolean;
  /** HTTP port (only meaningful with `http`). */
  port?: number;
  /** HTTP host (only meaningful with `http`). */
  host?: string;
  /** AgentKarma API base URL override. */
  baseUrl?: string;
  /** Print help and exit. */
  help: boolean;
  /** Print version and exit. */
  version: boolean;
  /** Set when parsing failed; the message to show the user. */
  error?: string;
}

export const HELP = `agentkarma-mcp — AgentKarma MCP server (read-only, non-routing)

Usage:
  agentkarma-mcp [options]

Options:
  --http              Serve over HTTP instead of stdio (default: stdio)
  --port <n>          HTTP port (default 8787)
  --host <host>       HTTP host (default 127.0.0.1)
  --base-url <url>    AgentKarma API base (default https://agentkarma.io;
                      also reads AGENTKARMA_BASE_URL)
  -v, --version       Print version and exit
  -h, --help          Show this help and exit

Examples:
  npx @agentkarma/mcp                       # stdio, for Claude Desktop / Cursor
  npx @agentkarma/mcp --http --port 8787    # HTTP endpoint at /mcp
`;

/** Parse `process.argv.slice(2)`. Never throws — returns `{ error }` on bad input. */
export function parseArgs(argv: readonly string[]): CliOptions {
  const opts: CliOptions = { http: false, help: false, version: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--http':
        opts.http = true;
        break;
      case '--port': {
        const value = argv[++i];
        // Require a plain decimal integer — reject '', whitespace, hex (0x50),
        // and floats that Number() would otherwise coerce.
        if (value === undefined || !/^\d+$/.test(value) || Number(value) > 65535) {
          return { ...opts, error: `--port expects an integer 0–65535, got "${value ?? ''}"` };
        }
        opts.port = Number(value);
        break;
      }
      case '--host': {
        const value = argv[++i];
        if (value === undefined || value.startsWith('-')) {
          return { ...opts, error: '--host expects a value' };
        }
        opts.host = value;
        break;
      }
      case '--base-url': {
        const value = argv[++i];
        if (value === undefined || value.startsWith('-')) {
          return { ...opts, error: '--base-url expects a value' };
        }
        opts.baseUrl = value;
        break;
      }
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '-v':
      case '--version':
        opts.version = true;
        break;
      default:
        return { ...opts, error: `unknown option: ${arg}` };
    }
  }

  return opts;
}
