#!/usr/bin/env node
/**
 * Smoke test for mcp-job-tracker (Validation Series F).
 *
 * Spawns dist/server.js over stdio, connects an MCP Client, and runs the
 * happy paths + error / edge cases from the plan's test matrix.
 *
 * Requires JSing to be running at JSING_BASE_URL (defaults to
 * http://127.0.0.1:4310). If JSing is not reachable, tool calls will
 * intentionally fail with an actionable error — the smoke tester
 * detects that and reports it clearly instead of throwing.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "..", "dist", "server.js");

const SECRET_PATTERNS = [/apikey/i, /api_key/i, /_encrypted/i, /authorization/i, /bearer\s/i];

let passed = 0;
let failed = 0;
const failures = [];

function record(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    failures.push({ name, detail });
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function assertNoSecrets(name, obj) {
  const json = JSON.stringify(obj ?? {});
  const hit = SECRET_PATTERNS.find((rx) => rx.test(json));
  record(`${name} :: no secret-like keys`, !hit, hit ? `matched ${hit}` : undefined);
}

function isError(res) {
  return Boolean(res?.isError);
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...process.env },
  });
  const client = new Client({ name: "smoke-test", version: "0.0.1" });
  await client.connect(transport);

  try {
    // ---- tools/list ----
    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name).sort();
    const expected = [
      "job_tracker_get_interview_pack",
      "job_tracker_get_job",
      "job_tracker_get_reminders",
      "job_tracker_list_jobs",
      "job_tracker_search_jobs",
    ];
    record(
      "tools/list has 5 tools",
      names.length === expected.length && expected.every((n) => names.includes(n)),
      `got ${JSON.stringify(names)}`,
    );

    for (const t of listed.tools) {
      const ro = t.annotations?.readOnlyHint === true;
      record(`${t.name} :: readOnlyHint true`, ro);
      record(
        `${t.name} :: idempotentHint true`,
        t.annotations?.idempotentHint === true,
      );
      record(
        `${t.name} :: openWorldHint false`,
        t.annotations?.openWorldHint === false,
      );
    }

    // ---- prompts/list ----
    const prompts = await client.listPrompts();
    const promptNames = prompts.prompts.map((p) => p.name);
    record(
      "prompts/list includes prepare_for_interview",
      promptNames.includes("prepare_for_interview"),
      `got ${JSON.stringify(promptNames)}`,
    );

    // ---- list_jobs baseline ----
    const list1 = await client.callTool({
      name: "job_tracker_list_jobs",
      arguments: {},
    });
    const list1IsError = isError(list1);
    if (list1IsError) {
      const errText = list1.content?.[0]?.text ?? "";
      const jsingDown =
        errText.includes("Cannot reach JSing") || errText.includes("did not respond");
      record(
        "list_jobs (no args) — JSing reachable",
        !jsingDown,
        jsingDown ? `JSing is not running (${errText.slice(0, 90)}); skipping data-dependent checks.` : errText,
      );
      if (jsingDown) {
        console.log("\n[smoke] JSing not running — completed only offline checks.");
        return;
      }
    } else {
      const sc = list1.structuredContent;
      record(
        "list_jobs (no args) — ok, jobs array present",
        sc?.ok === true && Array.isArray(sc?.jobs) && (sc.jobs.length ?? 0) <= 20,
        `count=${sc?.count}, total=${sc?.total}`,
      );
      assertNoSecrets("list_jobs (no args)", sc);
    }

    // Grab an id from the list for downstream tests.
    let realId = null;
    if (!isError(list1) && Array.isArray(list1.structuredContent?.jobs) && list1.structuredContent.jobs.length) {
      realId = list1.structuredContent.jobs[0].id;
    }

    // ---- list_jobs / status filter ----
    const listTarget = await client.callTool({
      name: "job_tracker_list_jobs",
      arguments: { discoveryStatus: "target" },
    });
    record(
      "list_jobs discoveryStatus=target",
      !isError(listTarget) &&
        (listTarget.structuredContent?.jobs ?? []).every((j) => j.discoveryStatus === "target" || j.discoveryStatus === ""),
      `count=${listTarget.structuredContent?.count ?? "-"}`,
    );

    // ---- list_jobs / limit clamping (>100) ----
    const listBig = await client.callTool({
      name: "job_tracker_list_jobs",
      arguments: { limit: 500 },
    });
    record(
      "list_jobs limit=500 clamped to <=100",
      !isError(listBig) && (listBig.structuredContent?.jobs?.length ?? 0) <= 100,
      `returned ${listBig.structuredContent?.jobs?.length ?? "-"} rows`,
    );

    // ---- list_jobs / limit=0 falls back to default ----
    const listZero = await client.callTool({
      name: "job_tracker_list_jobs",
      arguments: { limit: 0 },
    });
    record(
      "list_jobs limit=0 falls back to default (<=20)",
      !isError(listZero) && (listZero.structuredContent?.jobs?.length ?? 0) <= 20,
    );

    // ---- list_jobs / invalid enum rejected by Zod ----
    let badEnumRejected = false;
    try {
      const badEnum = await client.callTool({
        name: "job_tracker_list_jobs",
        arguments: { discoveryStatus: "bogus" },
      });
      badEnumRejected = isError(badEnum);
    } catch (err) {
      badEnumRejected = true;
    }
    record("list_jobs discoveryStatus=bogus rejected", badEnumRejected);

    // ---- search_jobs ----
    const searchRes = await client.callTool({
      name: "job_tracker_search_jobs",
      arguments: { query: "product", limit: 5 },
    });
    record(
      "search_jobs query=product limit=5",
      !isError(searchRes) &&
        Array.isArray(searchRes.structuredContent?.jobs) &&
        (searchRes.structuredContent.jobs.length ?? 0) <= 5 &&
        Array.isArray(searchRes.structuredContent?.fieldsSearched),
      `count=${searchRes.structuredContent?.count ?? "-"}`,
    );
    assertNoSecrets("search_jobs", searchRes.structuredContent);

    // ---- search_jobs / whitespace rejected ----
    let wsRejected = false;
    try {
      const ws = await client.callTool({
        name: "job_tracker_search_jobs",
        arguments: { query: "   " },
      });
      wsRejected = isError(ws);
    } catch {
      wsRejected = true;
    }
    record("search_jobs whitespace-only rejected", wsRejected);

    // ---- search_jobs / big limit clamped ----
    const searchBig = await client.callTool({
      name: "job_tracker_search_jobs",
      arguments: { query: "a", limit: 500 },
    });
    record(
      "search_jobs limit=500 clamped to <=100",
      !isError(searchBig) && (searchBig.structuredContent?.jobs?.length ?? 0) <= 100,
    );

    // ---- get_reminders ----
    const rem = await client.callTool({
      name: "job_tracker_get_reminders",
      arguments: {},
    });
    record(
      "get_reminders default",
      !isError(rem) && Array.isArray(rem.structuredContent?.reminders),
      `count=${rem.structuredContent?.count ?? "-"}`,
    );
    assertNoSecrets("get_reminders", rem.structuredContent);

    const remOne = await client.callTool({
      name: "job_tracker_get_reminders",
      arguments: { limit: 1 },
    });
    record(
      "get_reminders limit=1 returns <=1",
      !isError(remOne) && (remOne.structuredContent?.reminders?.length ?? 0) <= 1,
    );

    // ---- get_job / bogus id ----
    const badGet = await client.callTool({
      name: "job_tracker_get_job",
      arguments: { id: "does-not-exist" },
    });
    const badGetText = badGet.content?.[0]?.text ?? "";
    record(
      "get_job bogus id -> isError with clear message",
      isError(badGet) && /No job found with ID/i.test(badGetText),
      badGetText.slice(0, 90),
    );

    // ---- interview_pack / bogus id ----
    const badPack = await client.callTool({
      name: "job_tracker_get_interview_pack",
      arguments: { id: "does-not-exist" },
    });
    record(
      "interview_pack bogus id -> isError",
      isError(badPack) && /No job found with ID/i.test(badPack.content?.[0]?.text ?? ""),
    );

    // ---- Data-dependent tests (need a real job id) ----
    if (realId) {
      const getRes = await client.callTool({
        name: "job_tracker_get_job",
        arguments: { id: realId },
      });
      const sc = getRes.structuredContent;
      record(
        `get_job real id (${realId})`,
        !isError(getRes) &&
          sc?.ok === true &&
          Array.isArray(sc?.notes) &&
          Array.isArray(sc?.contacts) &&
          Array.isArray(sc?.events),
        `notes=${sc?.notes?.length}, contacts=${sc?.contacts?.length}, events=${sc?.events?.length}`,
      );
      assertNoSecrets("get_job real id", sc);

      const packRes = await client.callTool({
        name: "job_tracker_get_interview_pack",
        arguments: { id: realId },
      });
      const psc = packRes.structuredContent;
      record(
        `interview_pack real id (${realId})`,
        !isError(packRes) &&
          typeof psc?.pack === "string" &&
          psc.pack.length > 0 &&
          (psc.generatedBy === "llm" || psc.generatedBy === "deterministic-fallback"),
        `usedLlm=${psc?.usedLlm}, generatedBy=${psc?.generatedBy}, packLen=${psc?.pack?.length}`,
      );
      assertNoSecrets("interview_pack real id", psc);

      const promptRes = await client.getPrompt({
        name: "prepare_for_interview",
        arguments: { jobId: String(realId) },
      });
      const promptText = promptRes.messages?.[0]?.content?.text ?? "";
      record(
        `prepare_for_interview prompt real id (${realId})`,
        Array.isArray(promptRes.messages) &&
          promptRes.messages.length > 0 &&
          /prepare for the interview/i.test(promptText) &&
          /Saved context/i.test(promptText),
        `messages=${promptRes.messages?.length}, textLen=${promptText.length}`,
      );
      assertNoSecrets("prepare_for_interview prompt", promptRes);
    } else {
      console.log("[smoke] no real job id available — skipping data-dependent get_job / interview_pack checks.");
    }

    // ---- prompts/get bogus id -> graceful guidance, no throw ----
    const promptBad = await client.getPrompt({
      name: "prepare_for_interview",
      arguments: { jobId: "does-not-exist" },
    });
    const promptBadText = promptBad.messages?.[0]?.content?.text ?? "";
    record(
      "prepare_for_interview bogus id -> graceful message",
      /No job found with ID/i.test(promptBadText),
      promptBadText.slice(0, 90),
    );
  } finally {
    await client.close().catch(() => {});
  }

  console.log(`\nSmoke test summary: ${passed} passed, ${failed} failed`);
  if (failed) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f.name}${f.detail ? ` :: ${f.detail}` : ""}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("smoke test crashed:", err?.stack ?? err);
  process.exit(2);
});
