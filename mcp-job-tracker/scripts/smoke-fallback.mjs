#!/usr/bin/env node
/**
 * Focused smoke test for the interview-pack deterministic fallback.
 *
 * We spawn a tiny mock JSing HTTP server on an ephemeral port that:
 *  - returns a valid job for /api/jobs/:id
 *  - returns { usedLlm: false, ... } for /api/llm/interview-pack (simulating
 *    "LLM not configured")
 *
 * Then we spawn the MCP server pointing at the mock via JSING_BASE_URL,
 * connect a Client, and assert that job_tracker_get_interview_pack returns
 * generatedBy = "deterministic-fallback" with a non-empty pack.
 */

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "..", "dist", "server.js");

const fixtureJob = {
  id: "fixture-1",
  company: "FixtureCo",
  title: "Head of AI Product",
  location: "Remote",
  roleUrl: "https://example.test/role",
  sourceUrl: "",
  discoveryStatus: "target",
  applicationStatus: "in_progress",
  interviewStatus: "waiting",
  score: 82,
  priorityTier: "apply_now",
  summary: "Own the AI product roadmap and drive measurable customer outcomes.",
  keywords: ["AI product", "roadmap", "growth", "measurement"],
  fitHooks: ["Shipped 3 AI features that lifted retention 12%", "Led forward-deployed AI POCs"],
  risks: ["Comp band unclear"],
  nextAction: "Send follow-up to hiring manager",
  dueDate: "2026-07-10",
  updatedAt: "2026-07-07T12:00:00.000Z",
  createdAt: "2026-07-01T12:00:00.000Z",
};

function makeMockJsing() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      res.setHeader("Content-Type", "application/json");
      if (url.pathname === "/api/health") {
        res.end(JSON.stringify({ ok: true, port: 0, dbPath: ":mock:" }));
        return;
      }
      if (url.pathname === "/api/jobs") {
        res.end(JSON.stringify({ jobs: [fixtureJob] }));
        return;
      }
      if (url.pathname === `/api/jobs/${fixtureJob.id}`) {
        res.end(JSON.stringify({ job: fixtureJob }));
        return;
      }
      if (url.pathname === `/api/jobs/${fixtureJob.id}/notes`) {
        res.end(JSON.stringify({ notes: [{ id: "n1", note: "Called recruiter Monday" }] }));
        return;
      }
      if (url.pathname === `/api/jobs/${fixtureJob.id}/contacts`) {
        res.end(JSON.stringify({ contacts: [] }));
        return;
      }
      if (url.pathname === `/api/jobs/${fixtureJob.id}/events`) {
        res.end(JSON.stringify({ events: [] }));
        return;
      }
      if (url.pathname === "/api/reminders") {
        res.end(JSON.stringify({ reminders: [] }));
        return;
      }
      if (url.pathname === "/api/llm/interview-pack" && req.method === "POST") {
        // Simulate "LLM not configured" — this is what real JSing returns
        // when neither env vars nor the encrypted setting have an API key.
        res.end(
          JSON.stringify({
            usedLlm: false,
            text: "LLM is not configured. Add endpoint + API key in Settings to enable generated drafts.",
            fallback: "server-side fallback string (should be ignored by MCP client)",
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

async function main() {
  const { server: mock, port } = await makeMockJsing();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[fallback-smoke] mock JSing on ${baseUrl}`);

  let passed = 0;
  let failed = 0;
  const record = (name, ok, detail) => {
    if (ok) {
      passed += 1;
      console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
    } else {
      failed += 1;
      console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    }
  };

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...process.env, JSING_BASE_URL: baseUrl, JSING_TIMEOUT_MS: "5000" },
  });
  const client = new Client({ name: "smoke-fallback", version: "0.0.1" });
  await client.connect(transport);

  try {
    const res = await client.callTool({
      name: "job_tracker_get_interview_pack",
      arguments: { id: fixtureJob.id },
    });
    const sc = res.structuredContent;
    record(
      "interview_pack routes to deterministic fallback when usedLlm=false",
      !res.isError && sc?.generatedBy === "deterministic-fallback" && sc?.usedLlm === false,
      `generatedBy=${sc?.generatedBy}, usedLlm=${sc?.usedLlm}`,
    );
    record(
      "fallback pack is non-empty and includes expected sections",
      typeof sc?.pack === "string" &&
        sc.pack.includes("Interview Prep") &&
        sc.pack.includes("Likely questions") &&
        sc.pack.includes("Questions to ask them") &&
        sc.pack.includes("Prep checklist"),
      `packLen=${sc?.pack?.length ?? 0}`,
    );
    record(
      "fallback pack references saved job data (keywords + fitHooks)",
      typeof sc?.pack === "string" &&
        sc.pack.includes("AI product") &&
        sc.pack.includes("Shipped 3 AI features"),
    );
    record(
      "fallback pack references risks section when present",
      typeof sc?.pack === "string" && sc.pack.includes("Comp band unclear"),
    );
    record(
      "fallback pack surfaces nextAction + saved-notes count",
      typeof sc?.pack === "string" &&
        sc.pack.includes("Send follow-up to hiring manager") &&
        sc.pack.includes("Saved notes: 1"),
    );
    const jsonStr = JSON.stringify(sc ?? {});
    const secretMatch = /apikey|api_key|_encrypted|authorization|bearer\s/i.exec(jsonStr);
    record("fallback response has no secret-like keys", !secretMatch, secretMatch?.[0]);
  } finally {
    await client.close().catch(() => {});
    await new Promise((r) => mock.close(() => r()));
  }

  console.log(`\nFallback smoke summary: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("fallback smoke crashed:", err?.stack ?? err);
  process.exit(2);
});
