# mcp-job-tracker

A local, **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the [JSing / Local Job Tracker](../README.md) REST API as safe agent tools.

It is a thin wrapper: it does not read the SQLite database directly, it does not modify any state, and it talks to the JSing app over HTTP. If the app is not running, the tools return an actionable error telling you to start it.

## What it is

- One TypeScript process, stdio transport, five read-only tools plus one prompt (`prepare_for_interview`).
- Wraps the local JSing REST API at `http://127.0.0.1:4310`.
- Zod-validated inputs, bounded results, `redact()` allow-list on outputs, and stderr-only logging so it is safe to plug into Cursor / Claude Desktop / any stdio MCP client.

## Prerequisites

- Node.js `>=22`.
- JSing running locally on `http://127.0.0.1:4310` (`npm start` from the repo root).

## Install & build

```powershell
cd mcp-job-tracker
npm install
npm run build
```

That produces `dist/server.js`, which is what an MCP client will run.

## Run / inspect

```powershell
# Run the server on stdio (usually launched by an MCP client, not directly)
npm run start

# Interactive UI: browse tools, inputs/outputs, and invoke them
npm run inspect

# Automated smoke test against a running JSing (see scripts/smoke.mjs)
npm run test:smoke
```

`npm run inspect` starts the MCP Inspector against `dist/server.js` and opens a UI in your browser. Use it to confirm all five tools are listed, then invoke each one.

## Tools

All five tools are marked `readOnlyHint: true` and never write to JSing.

| Tool | Purpose | Inputs | Read-only |
| --- | --- | --- | --- |
| `job_tracker_list_jobs` | List jobs with optional filters | `query?`, `limit?`, `discoveryStatus?`, `applicationStatus?`, `interviewStatus?` | yes |
| `job_tracker_get_job` | Full details for one job (notes/contacts/events) | `id` | yes |
| `job_tracker_search_jobs` | Client-side keyword search across company/title/summary/keywords | `query`, `limit?` | yes |
| `job_tracker_get_reminders` | Current follow-up / outreach reminders | `limit?` | yes |
| `job_tracker_get_interview_pack` | Interview prep pack (LLM if configured, deterministic fallback otherwise) | `id` | yes |

Limits are clamped to `1..100` (default `20`). Status enums match JSing's canonical taxonomy (`new/researching/target/not_a_fit`, `not_started/in_progress/applied/rejected`, `waiting/screen_scheduled/screen_done/interview_scheduled/interview_done/offer/closed`).

All tools are annotated `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: false` (closed-world — they only reach the local REST API).

## Prompts

| Prompt | Purpose | Arguments |
| --- | --- | --- |
| `prepare_for_interview` | User-triggered workflow (slash-command in most clients) that loads a job's saved context (summary, keywords, fit hooks, risks) and hands the model a ready-to-run interview-prep brief | `jobId` |

Unlike the `job_tracker_get_interview_pack` tool (which returns a finished pack), the prompt returns instructions + context so the user can steer the conversation. In Cursor / Claude Desktop it appears as a selectable prompt, e.g. `/prepare_for_interview`.

## MCP client config

Add to your client's MCP config (Cursor: `~/.cursor/mcp.json`; Claude Desktop: `%APPDATA%\Claude\claude_desktop_config.json`; same shape for both). Note the doubled backslashes in the Windows path.

```json
{
  "mcpServers": {
    "jsing-job-tracker": {
      "command": "node",
      "args": ["C:\\Users\\mmason042\\Vibe Coding\\JSing\\mcp-job-tracker\\dist\\server.js"],
      "env": {
        "JSING_BASE_URL": "http://127.0.0.1:4310",
        "JSING_TIMEOUT_MS": "10000"
      }
    }
  }
}
```

Restart the client after editing the config. The server will only reach `JSING_BASE_URL` — set that env var if you run JSing on a different port.

## Example prompts

- "List my target jobs and summarize which ones need follow-up."
- "Get the full briefing for job ID `<id>`."
- "Search for AI product roles and compare their fit."
- "Show my current reminders and what's overdue."
- "Generate an interview pack for job ID `<id>`."

Replace `<id>` with a real job id from `job_tracker_list_jobs` (JSing uses UUID-style ids).

## Safety & limitations

- **Read-only.** No tools create, update, or delete anything. No writes to `data/job-tracker.db`.
- **Bounded results.** Every list-style tool clamps `limit` to `[1, 100]`.
- **No secret leakage.** Every response is passed through a shared `redact()` allow-list; keys like `apiKey`, `*_encrypted`, `authorization`, and `settings` never make it back to the agent.
- **Actionable errors.** If JSing is not running, tools return `Cannot reach JSing at <baseUrl>. Start JSing with \`npm start\` first.` A timeout produces a similar clear message.
- **Requires JSing running.** This server is a wrapper — it needs the JSing app on port 4310 (or `JSING_BASE_URL`).
- **stdio-safe logging.** All diagnostics go to stderr; stdout is reserved for the MCP protocol.

## Roadmap (deferred)

The first version is intentionally read-only. Future write tools that would require confirmation UX and `destructiveHint: true`:

- `add_job`, `update_status`, `add_note`, `add_event`
- `snooze_reminder`, `complete_reminder`

None of these are shipped in v1.
