# @agentkarma/mcp

Turnkey [MCP](https://modelcontextprotocol.io) server for [AgentKarma](https://agentkarma.io) — the reputation layer for autonomous on-chain agents.

Expose AgentKarma's read surface (two-faced karma, ERC-8004 agents, succession/bond signals, and a local `check_trust` gate) to any MCP client — Claude Desktop, Cursor, Continue, …

## Run it

```sh
npx @agentkarma/mcp                       # stdio (default) — for Claude Desktop / Cursor
npx @agentkarma/mcp --http --port 8787    # HTTP streamable endpoint at /mcp
```

That's the whole story — this package bundles `@agentkarma/sdk` and `@modelcontextprotocol/sdk` as regular dependencies, so there are no peer flags to remember.

### Options

```
--http              Serve over HTTP instead of stdio (default: stdio)
--port <n>          HTTP port (default 8787)
--host <host>       HTTP host (default 127.0.0.1)
--base-url <url>    AgentKarma API base (default https://agentkarma.io;
                    also reads AGENTKARMA_BASE_URL)
-v, --version       Print version
-h, --help          Show help
```

The HTTP server binds **loopback (`127.0.0.1`) by default** and enables DNS-rebinding
protection there. The endpoint is read-only and **unauthenticated** — binding a
non-loopback host (e.g. `--host 0.0.0.0`) exposes it to the network; put it behind
your own auth/proxy if you do.

### Programmatic use

```ts
import { startStdioServer, startHttpServer, createAgentKarmaMcpServer } from '@agentkarma/mcp';

await startStdioServer();                       // connect over stdio
const http = await startHttpServer({ port: 8787 }); // returns the http.Server
```

### Claude Desktop / Cursor config

```json
{
  "mcpServers": {
    "agentkarma": {
      "command": "npx",
      "args": ["-y", "@agentkarma/mcp"]
    }
  }
}
```

## Tools (read-only)

`get_karma` · `get_celo_agent` · `search_agents` · `get_agent_history` · `get_feedback_summary` · `get_succession` · `get_bond` · `get_surety` · `check_trust`

Every tool is read-only and needs no keys. AgentKarma is **non-routing** — it answers the trust question; it never signs, executes, or proxies a call.

## Under the hood

This is a thin launcher over [`@agentkarma/sdk/mcp`](https://www.npmjs.com/package/@agentkarma/sdk). To embed the server in your own process, or to mount the framework-agnostic tool catalog (`@agentkarma/sdk/tools`) on an existing MCP server, use the SDK directly.

## License

MIT
