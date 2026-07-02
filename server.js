const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const url = require("node:url");
const crypto = require("node:crypto");
const os = require("node:os");
const { DatabaseSync } = require("node:sqlite");

const root = __dirname;
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "job-tracker.db");
const port = Number(process.env.PORT || 4310);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

const statusModel = {
  discoveryStatus: ["new", "researching", "target", "not_a_fit"],
  applicationStatus: ["not_started", "in_progress", "applied", "rejected"],
  interviewStatus: [
    "waiting",
    "screen_scheduled",
    "screen_done",
    "interview_scheduled",
    "interview_done",
    "offer",
    "closed"
  ]
};

const STALE_POSTING_DAYS = 30;
const FOLLOW_UP_BUSINESS_DAYS = 5;
const POSTING_VERIFY_DAYS = 14;

function nowIso() {
  return new Date().toISOString();
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function createCipherKey() {
  const source = process.env.JOB_TRACKER_SECRET || `${os.hostname()}::job-tracker`;
  return crypto.scryptSync(source, "job-tracker-salt", 32);
}

const cipherKey = createCipherKey();

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cipherKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptSecret(value) {
  if (!value) return "";
  const [ivB64, tagB64, encryptedB64] = String(value).split(".");
  if (!ivB64 || !tagB64 || !encryptedB64) return "";
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      cipherKey,
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, "base64")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

ensureDataDir();
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source TEXT,
      source_url TEXT,
      role_url TEXT,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      lane TEXT DEFAULT '',
      location_type TEXT DEFAULT '',
      location_text TEXT DEFAULT '',
      workplace TEXT DEFAULT '',
      employment_type TEXT DEFAULT '',
      posted_base_min INTEGER,
      posted_base_max INTEGER,
      posted_base_label TEXT DEFAULT '',
      score INTEGER DEFAULT 0,
      score_notes TEXT DEFAULT '',
      priority_tier TEXT DEFAULT '',
      resume_track TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      keywords_json TEXT DEFAULT '[]',
      fit_hooks_json TEXT DEFAULT '[]',
      risks_json TEXT DEFAULT '[]',
      next_action TEXT DEFAULT '',
      due_date TEXT DEFAULT '',
      discovery_status TEXT DEFAULT 'new',
      application_status TEXT DEFAULT 'not_started',
      applied_at TEXT DEFAULT '',
      interview_status TEXT DEFAULT 'waiting',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_notes (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      note TEXT NOT NULL,
      note_type TEXT DEFAULT 'general',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS job_contacts (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      contact_type TEXT DEFAULT 'recruiter',
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      profile_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS job_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_views (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      filter_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reminder_state (
      reminder_key TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'open',
      snooze_until TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_discovery_status ON jobs(discovery_status);
    CREATE INDEX IF NOT EXISTS idx_jobs_application_status ON jobs(application_status);
    CREATE INDEX IF NOT EXISTS idx_jobs_interview_status ON jobs(interview_status);
    CREATE INDEX IF NOT EXISTS idx_job_notes_job_id ON job_notes(job_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id, event_date DESC);
  `);

  const jobColumns = new Set(
    db.prepare("PRAGMA table_info(jobs)").all().map((row) => row.name)
  );
  if (!jobColumns.has("posting_status")) {
    db.exec("ALTER TABLE jobs ADD COLUMN posting_status TEXT DEFAULT 'unknown'");
  }
  if (!jobColumns.has("posting_checked_at")) {
    db.exec("ALTER TABLE jobs ADD COLUMN posting_checked_at TEXT DEFAULT ''");
  }
  if (!jobColumns.has("ai_score")) {
    db.exec("ALTER TABLE jobs ADD COLUMN ai_score INTEGER");
  }
  if (!jobColumns.has("ai_analysis_json")) {
    db.exec("ALTER TABLE jobs ADD COLUMN ai_analysis_json TEXT DEFAULT ''");
  }
  if (!jobColumns.has("applied_at")) {
    db.exec("ALTER TABLE jobs ADD COLUMN applied_at TEXT DEFAULT ''");
  }
  db.exec(`
    UPDATE jobs
    SET applied_at = (
      SELECT MIN(event_date)
      FROM job_events
      WHERE job_events.job_id = jobs.id
        AND job_events.event_type = 'application_submitted'
    )
    WHERE (applied_at IS NULL OR applied_at = '')
      AND application_status = 'applied'
      AND EXISTS (
        SELECT 1
        FROM job_events
        WHERE job_events.job_id = jobs.id
          AND job_events.event_type = 'application_submitted'
      )
  `);
}

function clampScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function jobIsActive(row) {
  if (!row) return false;
  if (row.discovery_status === "not_a_fit") return false;
  if (row.application_status === "rejected") return false;
  if (row.interview_status === "closed") return false;
  return true;
}

function needsVerificationForRow(row) {
  if (!row) return false;
  if (!jobIsActive(row)) return false;
  const status = row.posting_status || "unknown";
  if (status === "dead") return false;
  if (status === "unknown") return true;
  if (!row.posting_checked_at) return true;
  return daysSince(row.posting_checked_at) >= POSTING_VERIFY_DAYS;
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTextToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeRoleUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    const keepParams = [];
    for (const [key, val] of parsed.searchParams.entries()) {
      if (!key.toLowerCase().startsWith("utm_")) {
        keepParams.push([key, val]);
      }
    }
    parsed.search = "";
    for (const [key, val] of keepParams) {
      parsed.searchParams.append(key, val);
    }
    let normalized = `${parsed.origin}${parsed.pathname}`.toLowerCase();
    normalized = normalized.replace(/\/+$/, "");
    if (parsed.search) {
      normalized += parsed.search.toLowerCase();
    }
    return normalized;
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

function daysSince(isoDate) {
  if (!isoDate) return 0;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return 0;
  const diffMs = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function staleDaysForRow(row) {
  if (!row) return 0;
  if (row.discovery_status === "not_a_fit") return 0;
  if (row.application_status === "applied" || row.application_status === "rejected") return 0;
  if (row.interview_status && row.interview_status !== "waiting") return 0;
  return daysSince(row.updated_at || row.created_at);
}

function parseDateOnly(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function businessDaysBetween(startDate, endDate) {
  if (!startDate || !endDate || endDate < startDate) return 0;
  const current = new Date(startDate.getTime());
  let days = 0;
  while (current <= endDate) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return Math.max(0, days - 1);
}

function findDuplicateJobs(candidate, excludeId = "") {
  const titleToken = normalizeTextToken(candidate.title);
  const companyToken = normalizeTextToken(candidate.company);
  const urlToken = normalizeRoleUrl(candidate.roleUrl || candidate.sourceUrl);
  if (!titleToken && !companyToken && !urlToken) {
    return [];
  }

  const rows = db
    .prepare("SELECT * FROM jobs WHERE id <> ? ORDER BY updated_at DESC")
    .all(excludeId || "");
  const duplicates = [];

  for (const row of rows) {
    const existingUrlToken = normalizeRoleUrl(row.role_url || row.source_url);
    const existingTitleToken = normalizeTextToken(row.title);
    const existingCompanyToken = normalizeTextToken(row.company);

    let reason = "";
    if (urlToken && existingUrlToken && urlToken === existingUrlToken) {
      reason = "matching role URL";
    } else if (titleToken && companyToken && existingTitleToken && existingCompanyToken) {
      const titleMatch = existingTitleToken.includes(titleToken) || titleToken.includes(existingTitleToken);
      const companyMatch = existingCompanyToken.includes(companyToken) || companyToken.includes(existingCompanyToken);
      if (titleMatch && companyMatch) {
        reason = "matching company + similar title";
      }
    }

    if (reason) {
      duplicates.push({
        reason,
        job: toJobResponse(row)
      });
      if (duplicates.length >= 5) break;
    }
  }
  return duplicates;
}

function toJobResponse(row) {
  const staleDays = staleDaysForRow(row);
  const postingStatus = row.posting_status || "unknown";
  const postingCheckedAt = row.posting_checked_at || "";
  return {
    id: row.id,
    source: row.source || "Manual",
    sourceUrl: row.source_url || "",
    roleUrl: row.role_url || "",
    company: row.company,
    title: row.title,
    lane: row.lane || "",
    locationType: row.location_type || "",
    location: row.location_text || "",
    workplace: row.workplace || "",
    employmentType: row.employment_type || "",
    salary: row.posted_base_min || row.posted_base_max || row.posted_base_label
      ? {
          min: row.posted_base_min,
          max: row.posted_base_max,
          label: row.posted_base_label || "",
          currency: "USD",
          period: "year"
        }
      : null,
    score: Number(row.score || 0),
    scoreNotes: row.score_notes || "",
    priorityTier: row.priority_tier || "",
    resumeTrack: row.resume_track || "",
    summary: row.summary || "",
    keywords: safeJsonParse(row.keywords_json, []),
    fitHooks: safeJsonParse(row.fit_hooks_json, []),
    risks: safeJsonParse(row.risks_json, []),
    nextAction: row.next_action || "",
    dueDate: row.due_date || "",
    discoveryStatus: row.discovery_status,
    applicationStatus: row.application_status,
    appliedAt: row.applied_at || "",
    interviewStatus: row.interview_status,
    stalePosting: staleDays >= STALE_POSTING_DAYS,
    staleDays,
    postingStatus,
    postingCheckedAt,
    needsVerification: needsVerificationForRow(row),
    aiScore: row.ai_score === null || row.ai_score === undefined ? null : Number(row.ai_score),
    aiAnalysis: safeJsonParse(row.ai_analysis_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function ensureApplicationSubmittedEvent(jobId, appliedAt, now = nowIso()) {
  if (!jobId || !appliedAt) return;
  const existing = db
    .prepare(
      "SELECT id FROM job_events WHERE job_id = ? AND event_type = 'application_submitted' LIMIT 1"
    )
    .get(jobId);
  if (existing) return;
  db.prepare(`
    INSERT INTO job_events (id, job_id, event_type, event_date, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    jobId,
    "application_submitted",
    String(appliedAt).slice(0, 10),
    "Application submitted",
    now
  );
}

function insertSeedDataIfNeeded() {
  const existing = db.prepare("SELECT COUNT(*) AS total FROM jobs").get();
  if (existing.total > 0) return;

  const seedPath = path.join(dataDir, "seed-jobs.json");
  if (!fs.existsSync(seedPath)) return;
  const seedJobs = safeJsonParse(fs.readFileSync(seedPath, "utf8"), []);
  if (!Array.isArray(seedJobs) || !seedJobs.length) return;

  const insertJob = db.prepare(`
    INSERT INTO jobs (
      id, source, source_url, role_url, company, title, lane, location_type, location_text,
      workplace, employment_type, posted_base_min, posted_base_max, posted_base_label, score,
      score_notes, priority_tier, resume_track, summary, keywords_json, fit_hooks_json, risks_json,
      next_action, due_date, discovery_status, application_status, applied_at, interview_status, created_at, updated_at
    ) VALUES (
      @id, @source, @source_url, @role_url, @company, @title, @lane, @location_type, @location_text,
      @workplace, @employment_type, @posted_base_min, @posted_base_max, @posted_base_label, @score,
      @score_notes, @priority_tier, @resume_track, @summary, @keywords_json, @fit_hooks_json, @risks_json,
      @next_action, @due_date, @discovery_status, @application_status, @applied_at, @interview_status, @created_at, @updated_at
    )
  `);

  const now = nowIso();
  const insertEvent = db.prepare(`
    INSERT INTO job_events (id, job_id, event_type, event_date, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const job of seedJobs) {
      const id = job.id || crypto.randomUUID();
      insertJob.run({
        id,
        source: job.source || "Seed",
        source_url: job.sourceUrl || "",
        role_url: job.sourceUrl || "",
        company: job.company || "Unknown",
        title: job.title || "Unknown role",
        lane: "",
        location_type: "",
        location_text: job.location || "",
        workplace: job.workplace || "",
        employment_type: job.employmentType || "",
        posted_base_min: job.salary?.min ?? null,
        posted_base_max: job.salary?.max ?? null,
        posted_base_label: job.salary?.label || "",
        score: 0,
        score_notes: "",
        priority_tier: "",
        resume_track: "",
        summary: job.summary || "",
        keywords_json: JSON.stringify(job.keywords || []),
        fit_hooks_json: JSON.stringify(job.fitHooks || []),
        risks_json: JSON.stringify(job.risks || []),
        next_action: "Review role and score against rubric",
        due_date: "",
        discovery_status: "new",
        application_status: "not_started",
        applied_at: "",
        interview_status: "waiting",
        created_at: now,
        updated_at: now
      });
      insertEvent.run(
        crypto.randomUUID(),
        id,
        "job_added",
        now.slice(0, 10),
        "Imported from seed dataset",
        now
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

migrate();
insertSeedDataIfNeeded();

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(text);
}

async function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("error", reject);
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        const parseError = new Error(`Invalid JSON body: ${error.message}`);
        parseError.statusCode = 400;
        reject(parseError);
      }
    });
  });
}

function getProfile() {
  const profilePath = path.join(dataDir, "candidate-profile.json");
  if (!fs.existsSync(profilePath)) return null;
  return safeJsonParse(fs.readFileSync(profilePath, "utf8"), null);
}

function getResearchPrompts() {
  const docsDir = path.join(root, "Docs");
  if (!fs.existsSync(docsDir)) return [];
  let files = [];
  try {
    files = fs
      .readdirSync(docsDir)
      .filter((name) => /^Deep Research Prompt.*\.md$/i.test(name))
      .sort();
  } catch {
    return [];
  }
  return files.map((name) => {
    let content = "";
    try {
      content = fs.readFileSync(path.join(docsDir, name), "utf8");
    } catch {
      content = "";
    }
    const headingMatch = content.match(/^#\s+(.+)$/m);
    const title = (headingMatch ? headingMatch[1] : name.replace(/\.md$/i, "")).trim();
    return { id: name, title, content };
  });
}

function defaultStrategyFromProfile(profile) {
  const prefs = profile?.preferences || {};
  const roleFamilies = profile?.targetSearch?.roleFamilies || [];
  return {
    preferredMarket: prefs.locationPreference?.preferredMarket || "",
    minimumBaseSalaryUsd: Number(prefs.compensation?.minimumBaseSalaryUsd || 0),
    maximumTravelPercent: Number(prefs.travel?.maximumPercent || 0),
    roleFamilies: roleFamilies.map((family) => family.name).filter(Boolean),
    keywords: []
  };
}

function getStrategyConfig() {
  const profile = getProfile() || {};
  const defaults = defaultStrategyFromProfile(profile);
  const raw = getSetting("strategy_config_json");
  if (!raw) return defaults;
  const saved = safeJsonParse(raw, {});
  return {
    ...defaults,
    ...saved,
    roleFamilies: Array.isArray(saved.roleFamilies) ? saved.roleFamilies : defaults.roleFamilies,
    keywords: Array.isArray(saved.keywords) ? saved.keywords : defaults.keywords
  };
}

function saveStrategyConfig(strategy) {
  const minBaseRaw = strategy.minimumBaseSalaryUsd;
  const maxTravelRaw = strategy.maximumTravelPercent;
  const minimumBaseSalaryUsd =
    minBaseRaw === undefined || minBaseRaw === null || minBaseRaw === ""
      ? 0
      : validateNumberInRange("minimumBaseSalaryUsd", minBaseRaw, { min: 0, max: 10000000 });
  const maximumTravelPercent =
    maxTravelRaw === undefined || maxTravelRaw === null || maxTravelRaw === ""
      ? 0
      : validateNumberInRange("maximumTravelPercent", maxTravelRaw, { min: 0, max: 100 });
  const clean = {
    preferredMarket: String(strategy.preferredMarket || "").trim(),
    minimumBaseSalaryUsd,
    maximumTravelPercent,
    roleFamilies: Array.isArray(strategy.roleFamilies)
      ? strategy.roleFamilies.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    keywords: Array.isArray(strategy.keywords)
      ? strategy.keywords.map((item) => String(item || "").trim()).filter(Boolean)
      : []
  };
  upsertSetting("strategy_config_json", JSON.stringify(clean));
  return clean;
}

// ===== Scoring rubric =====
// The rubric config is stored as JSON in the app_settings table under the
// `rubric_config_json` key. The seed below mirrors the original hardcoded
// scoring exactly, so existing scores stay stable until a user edits the
// rubric in Settings.

const SEED_RUBRIC_CONFIG = {
  defaultRubricId: "default",
  rubrics: [
    {
      id: "default",
      name: "Default rubric",
      lane: null,
      thresholds: { applyNow: 75, selective: 60 },
      categories: [
        {
          key: "location",
          label: "Location",
          cap: 20,
          scorer: {
            kind: "location_match",
            primaryTerms: [
              "nyc",
              "new york",
              "manhattan",
              "brooklyn",
              "queens",
              "bronx",
              "jersey city",
              "hoboken"
            ],
            primaryPoints: 20,
            hybridPoints: 15,
            remotePoints: 10,
            otherPoints: 0
          }
        },
        {
          key: "domain",
          label: "Domain fit",
          cap: 15,
          scorer: {
            kind: "keyword_count",
            terms: [
              "retail",
              "commerce",
              "merchandising",
              "inventory",
              "allocation",
              "replenishment",
              "workflow",
              "enterprise"
            ],
            perMatch: 5
          }
        },
        {
          key: "ai",
          label: "AI / systems",
          cap: 15,
          scorer: {
            kind: "keyword_count",
            terms: [
              "ai",
              "genai",
              "automation",
              "transformation",
              "modernization",
              "systems",
              "product"
            ],
            perMatch: 5
          }
        },
        {
          key: "seniority",
          label: "Seniority",
          cap: 10,
          scorer: {
            kind: "regex_tier",
            matchers: [
              {
                pattern: "(senior|sr\\.?|lead|manager|director|principal)",
                flags: "i",
                points: 10
              },
              {
                pattern: "(associate|junior|intern)",
                flags: "i",
                points: 0
              }
            ],
            defaultPoints: 5
          }
        },
        {
          key: "keywords",
          label: "Strategic keywords",
          cap: 15,
          scorer: {
            kind: "keyword_count",
            terms: [
              "product strategy",
              "roadmap",
              "cross-functional",
              "stakeholder",
              "requirements",
              "governance",
              "business process",
              "operating model",
              "program leadership",
              "adoption",
              "launch"
            ],
            perMatch: 2
          }
        },
        {
          key: "bridge",
          label: "Cross-functional bridge",
          cap: 10,
          scorer: {
            kind: "keyword_threshold",
            terms: [
              "cross-functional",
              "stakeholder",
              "business",
              "technical",
              "integration"
            ],
            tiers: [
              { minHits: 1, points: 4 },
              { minHits: 2, points: 10 }
            ]
          }
        },
        {
          key: "leadership",
          label: "Leadership signal",
          cap: 10,
          scorer: {
            kind: "keyword_threshold",
            terms: [
              "lead",
              "owner",
              "ownership",
              "strategy",
              "decision",
              "accountability"
            ],
            tiers: [
              { minHits: 1, points: 4 },
              { minHits: 2, points: 10 }
            ]
          }
        },
        {
          key: "value",
          label: "Compensation value",
          cap: 5,
          scorer: {
            kind: "salary_floor",
            floors: [
              { minUsd: 180000, points: 5 },
              { minUsd: 160000, points: 3 },
              { minUsd: 0, points: 1 }
            ]
          }
        }
      ]
    }
  ]
};

function defaultRubricConfig() {
  // Deep clone so consumers can't mutate the seed by reference.
  return JSON.parse(JSON.stringify(SEED_RUBRIC_CONFIG));
}

function getRubricConfig() {
  const raw = getSetting("rubric_config_json");
  if (!raw) return defaultRubricConfig();
  const parsed = safeJsonParse(raw, null);
  if (!parsed || !Array.isArray(parsed.rubrics) || parsed.rubrics.length === 0) {
    return defaultRubricConfig();
  }
  return parsed;
}

const KNOWN_SCORER_KINDS = new Set([
  "keyword_count",
  "keyword_threshold",
  "location_match",
  "regex_tier",
  "salary_floor"
]);

function cleanRubricCategory(cat) {
  const scorer = cat?.scorer || {};
  const kind = KNOWN_SCORER_KINDS.has(scorer.kind) ? scorer.kind : "keyword_count";
  let cleanScorer;
  if (kind === "keyword_count") {
    cleanScorer = {
      kind,
      terms: Array.isArray(scorer.terms)
        ? scorer.terms.map((t) => String(t || "").trim().toLowerCase()).filter(Boolean)
        : [],
      perMatch: Math.max(0, Number(scorer.perMatch || 0))
    };
  } else if (kind === "keyword_threshold") {
    cleanScorer = {
      kind,
      terms: Array.isArray(scorer.terms)
        ? scorer.terms.map((t) => String(t || "").trim().toLowerCase()).filter(Boolean)
        : [],
      tiers: Array.isArray(scorer.tiers)
        ? scorer.tiers
            .map((t) => ({
              minHits: Math.max(0, Number(t.minHits || 0)),
              points: Math.max(0, Number(t.points || 0))
            }))
            .sort((a, b) => a.minHits - b.minHits)
        : []
    };
  } else if (kind === "location_match") {
    cleanScorer = {
      kind,
      primaryTerms: Array.isArray(scorer.primaryTerms)
        ? scorer.primaryTerms.map((t) => String(t || "").trim().toLowerCase()).filter(Boolean)
        : [],
      primaryPoints: Math.max(0, Number(scorer.primaryPoints || 0)),
      hybridPoints: Math.max(0, Number(scorer.hybridPoints || 0)),
      remotePoints: Math.max(0, Number(scorer.remotePoints || 0)),
      otherPoints: Math.max(0, Number(scorer.otherPoints || 0))
    };
  } else if (kind === "regex_tier") {
    cleanScorer = {
      kind,
      matchers: Array.isArray(scorer.matchers)
        ? scorer.matchers
            .map((m) => ({
              pattern: String(m.pattern || ""),
              flags: String(m.flags || "i"),
              points: Math.max(0, Number(m.points || 0))
            }))
            .filter((m) => m.pattern)
        : [],
      defaultPoints: Math.max(0, Number(scorer.defaultPoints || 0))
    };
  } else if (kind === "salary_floor") {
    cleanScorer = {
      kind,
      floors: Array.isArray(scorer.floors)
        ? scorer.floors
            .map((f) => ({
              minUsd: Math.max(0, Number(f.minUsd || 0)),
              points: Math.max(0, Number(f.points || 0))
            }))
            .sort((a, b) => b.minUsd - a.minUsd)
        : []
    };
  }
  return {
    key: String(cat?.key || "").trim() || `cat_${crypto.randomUUID().slice(0, 6)}`,
    label: String(cat?.label || "Untitled").trim(),
    cap: Math.max(0, Math.min(100, Number(cat?.cap || 0))),
    scorer: cleanScorer
  };
}

function cleanRubric(rubric) {
  const categories = Array.isArray(rubric?.categories)
    ? rubric.categories.map(cleanRubricCategory)
    : [];
  const thresholds = rubric?.thresholds || {};
  return {
    id: String(rubric?.id || "").trim() || `rub_${crypto.randomUUID().slice(0, 6)}`,
    name: String(rubric?.name || "Untitled rubric").trim(),
    lane: rubric?.lane ? String(rubric.lane).trim() : null,
    thresholds: {
      applyNow: Math.max(0, Math.min(100, Number(thresholds.applyNow ?? 75))),
      selective: Math.max(0, Math.min(100, Number(thresholds.selective ?? 60)))
    },
    categories
  };
}

function saveRubricConfig(input) {
  const rubrics = Array.isArray(input?.rubrics) ? input.rubrics.map(cleanRubric) : [];
  if (rubrics.length === 0) {
    const error = new Error("At least one rubric is required.");
    error.statusCode = 400;
    throw error;
  }
  const ids = new Set();
  for (const r of rubrics) {
    if (ids.has(r.id)) {
      const error = new Error(`Duplicate rubric id: ${r.id}`);
      error.statusCode = 400;
      throw error;
    }
    ids.add(r.id);
  }
  let defaultRubricId = String(input?.defaultRubricId || "").trim();
  if (!ids.has(defaultRubricId)) defaultRubricId = rubrics[0].id;
  const clean = { defaultRubricId, rubrics };
  upsertSetting("rubric_config_json", JSON.stringify(clean));
  return clean;
}

function resetRubricConfig() {
  const seed = defaultRubricConfig();
  upsertSetting("rubric_config_json", JSON.stringify(seed));
  return seed;
}

function fitScoreForLookup(role, strategy) {
  const text = `${role.title || ""} ${role.summary || ""}`.toLowerCase();
  const location = String(role.location || "").toLowerCase();
  let score = 0;
  if ((strategy.preferredMarket || "").trim()) {
    score += location.includes(String(strategy.preferredMarket).toLowerCase()) ? 25 : location.includes("remote") ? 10 : 0;
  }
  const familyHits = (strategy.roleFamilies || []).filter((term) => text.includes(term.toLowerCase())).length;
  const keywordHits = (strategy.keywords || []).filter((term) => text.includes(term.toLowerCase())).length;
  score += Math.min(40, familyHits * 10);
  score += Math.min(35, keywordHits * 7);
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function lookupJobsFromMuse(strategy, limit = 20) {
  const collected = [];
  for (let page = 1; page <= 3; page += 1) {
    try {
      const response = await fetch(`https://www.themuse.com/api/public/jobs?page=${page}`);
      if (!response.ok) continue;
      const payload = await response.json();
      const results = Array.isArray(payload.results) ? payload.results : [];
      for (const role of results) {
        const title = role.name || "";
        const summary = String(role.contents || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const company = role.company?.name || "";
        const location = (role.locations || []).map((item) => item.name).filter(Boolean).join(", ");
        const url = role.refs?.landing_page || "";
        const fitScore = fitScoreForLookup({ title, summary, location }, strategy);
        if (fitScore < 20) continue;
        collected.push({
          source: "The Muse",
          title,
          company,
          location,
          summary: summary.slice(0, 260),
          url,
          fitScore
        });
      }
      if (collected.length >= limit * 2) break;
    } catch {
      // Continue on lookup source failure.
    }
  }
  return collected
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, limit);
}

function getJobs({ search, discoveryStatus, applicationStatus, interviewStatus, lane }) {
  const clauses = [];
  const params = {};
  if (search) {
    clauses.push("(LOWER(company) LIKE @search OR LOWER(title) LIKE @search OR LOWER(summary) LIKE @search)");
    params.search = `%${String(search).toLowerCase()}%`;
  }
  if (discoveryStatus) {
    clauses.push("discovery_status = @discoveryStatus");
    params.discoveryStatus = discoveryStatus;
  }
  if (applicationStatus) {
    clauses.push("application_status = @applicationStatus");
    params.applicationStatus = applicationStatus;
  }
  if (interviewStatus) {
    clauses.push("interview_status = @interviewStatus");
    params.interviewStatus = interviewStatus;
  }
  if (lane) {
    clauses.push("lane = @lane");
    params.lane = lane;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM jobs ${where} ORDER BY updated_at DESC, created_at DESC`)
    .all(params);
  return rows.map(toJobResponse);
}

function validateStatus(field, value) {
  if (!value) return;
  const options = statusModel[field];
  if (!options.includes(value)) {
    const error = new Error(`Invalid ${field}: ${value}`);
    error.statusCode = 400;
    throw error;
  }
}

const POSTING_STATUS_VALUES = ["live", "dead", "unknown"];

function validatePostingStatus(value) {
  if (value === undefined || value === null || value === "") return;
  if (!POSTING_STATUS_VALUES.includes(String(value))) {
    const error = new Error(
      `Invalid postingStatus: ${value}. Expected one of ${POSTING_STATUS_VALUES.join(", ")}.`
    );
    error.statusCode = 400;
    throw error;
  }
}

function requireNonEmptyField(field, value) {
  const trimmed = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!trimmed) {
    const error = new Error(`${field} is required`);
    error.statusCode = 400;
    throw error;
  }
  return trimmed;
}

function validateNumberInRange(field, value, { min, max, allowMissing = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (allowMissing) return undefined;
    const error = new Error(`${field} is required`);
    error.statusCode = 400;
    throw error;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    const error = new Error(`${field} must be a number`);
    error.statusCode = 400;
    throw error;
  }
  if (typeof min === "number" && num < min) {
    const error = new Error(`${field} must be >= ${min}`);
    error.statusCode = 400;
    throw error;
  }
  if (typeof max === "number" && num > max) {
    const error = new Error(`${field} must be <= ${max}`);
    error.statusCode = 400;
    throw error;
  }
  return num;
}

function upsertSetting(key, value) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now);
}

function getSetting(key) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row?.value || "";
}

function upsertReminderState(reminderKey, status, snoozeUntil = "") {
  const now = nowIso();
  db.prepare(`
    INSERT INTO reminder_state (reminder_key, status, snooze_until, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(reminder_key) DO UPDATE SET
      status = excluded.status,
      snooze_until = excluded.snooze_until,
      updated_at = excluded.updated_at
  `).run(reminderKey, status, snoozeUntil, now);
}

function getReminderStateMap(reminderKeys) {
  if (!reminderKeys.length) return new Map();
  const placeholders = reminderKeys.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT reminder_key, status, snooze_until FROM reminder_state WHERE reminder_key IN (${placeholders})`)
    .all(...reminderKeys);
  return new Map(rows.map((row) => [row.reminder_key, row]));
}

function buildReminderQueue() {
  const jobs = db.prepare("SELECT * FROM jobs ORDER BY updated_at DESC").all();
  const events = db
    .prepare("SELECT job_id, event_type, event_date, created_at FROM job_events ORDER BY event_date DESC, created_at DESC")
    .all();
  const byJob = new Map();
  for (const event of events) {
    if (!byJob.has(event.job_id)) byJob.set(event.job_id, []);
    byJob.get(event.job_id).push(event);
  }

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const todayUtc = parseDateOnly(todayIso) || new Date();
  const reminders = [];

  for (const row of jobs) {
    if (row.discovery_status === "not_a_fit") continue;
    if (row.application_status === "rejected" || row.interview_status === "closed") continue;
    const job = toJobResponse(row);
    const jobEvents = byJob.get(row.id) || [];
    const lastApplication =
      jobEvents.find((event) => event.event_type === "application_submitted") ||
      (row.applied_at
        ? {
            event_type: "application_submitted",
            event_date: row.applied_at,
            created_at: row.applied_at
          }
        : null);
    const lastOutreach = jobEvents.find((event) => event.event_type === "outreach_sent");
    const hasScreenSignal = jobEvents.some((event) =>
      ["screen_scheduled", "screen_done", "interview_scheduled", "interview_done", "offer_received"].includes(event.event_type)
    );
    const hasFollowupAfterOutreach = lastOutreach
      ? jobEvents.some((event) => event.event_type === "followup_sent" && event.event_date >= lastOutreach.event_date)
      : false;

    if (lastApplication && !lastOutreach) {
      const appDate = parseDateOnly(lastApplication.event_date);
      const businessDays = businessDaysBetween(appDate, todayUtc);
      if (businessDays >= 1) {
        reminders.push({
          key: `outreach:${row.id}:${lastApplication.event_date}`,
          type: "outreach_due",
          severity: "high",
          dueDate: lastApplication.event_date,
          ageBusinessDays: businessDays,
          title: "Outreach due within 24h of application",
          detail: `${job.company} - ${job.title}`,
          jobId: row.id
        });
      }
    }

    if (lastOutreach && !hasScreenSignal && !hasFollowupAfterOutreach) {
      const outreachDate = parseDateOnly(lastOutreach.event_date);
      const businessDays = businessDaysBetween(outreachDate, todayUtc);
      if (businessDays >= FOLLOW_UP_BUSINESS_DAYS) {
        reminders.push({
          key: `followup:${row.id}:${lastOutreach.event_date}`,
          type: "followup_due",
          severity: "medium",
          dueDate: lastOutreach.event_date,
          ageBusinessDays: businessDays,
          title: "Follow-up due after outreach",
          detail: `${job.company} - ${job.title}`,
          jobId: row.id
        });
      }
    }

    if (row.due_date && row.due_date < todayIso) {
      reminders.push({
        key: `next_action:${row.id}:${row.due_date}`,
        type: "next_action_overdue",
        severity: "low",
        dueDate: row.due_date,
        ageBusinessDays: businessDaysBetween(parseDateOnly(row.due_date), todayUtc),
        title: "Next action date is overdue",
        detail: `${job.company} - ${job.title}`,
        jobId: row.id
      });
    }

    if (needsVerificationForRow(row)) {
      const checked = row.posting_checked_at || row.created_at;
      const checkedDate = checked ? String(checked).slice(0, 10) : todayIso;
      const daysOld = daysSince(checked);
      reminders.push({
        key: `verify_posting:${row.id}:${checkedDate}`,
        type: "verify_posting",
        severity: "low",
        dueDate: checkedDate,
        ageBusinessDays: businessDaysBetween(parseDateOnly(checkedDate), todayUtc),
        title: row.posting_status === "unknown"
          ? "Confirm posting is still live"
          : `Re-verify posting (${daysOld}d since last check)`,
        detail: `${job.company} - ${job.title}`,
        jobId: row.id
      });
    }
  }

  const stateMap = getReminderStateMap(reminders.map((item) => item.key));
  const filtered = reminders.filter((item) => {
    const state = stateMap.get(item.key);
    if (!state) return true;
    if (state.status === "completed") return false;
    if (state.snooze_until && state.snooze_until >= todayIso) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    const severityRank = { high: 3, medium: 2, low: 1 };
    const diff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
    if (diff !== 0) return diff;
    return String(a.dueDate).localeCompare(String(b.dueDate));
  });
}

function summarizeSourcePerformance() {
  const rows = db
    .prepare("SELECT source, application_status, interview_status, created_at FROM jobs ORDER BY created_at DESC")
    .all();
  const map = new Map();
  for (const row of rows) {
    const source = row.source || "Unknown";
    if (!map.has(source)) {
      map.set(source, {
        source,
        sourced: 0,
        applied: 0,
        responses: 0,
        interviews: 0
      });
    }
    const item = map.get(source);
    item.sourced += 1;
    const applied = row.application_status === "applied" || row.application_status === "rejected" || row.interview_status !== "waiting";
    if (applied) item.applied += 1;
    const hasResponse = ["screen_scheduled", "screen_done", "interview_scheduled", "interview_done", "offer", "closed"].includes(
      row.interview_status
    );
    if (hasResponse) item.responses += 1;
    const hasInterview = ["interview_scheduled", "interview_done", "offer", "closed"].includes(row.interview_status);
    if (hasInterview) item.interviews += 1;
  }

  return Array.from(map.values())
    .map((item) => {
      const responseRate = item.applied ? Number(((item.responses / item.applied) * 100).toFixed(1)) : 0;
      const interviewRate = item.applied ? Number(((item.interviews / item.applied) * 100).toFixed(1)) : 0;
      return {
        ...item,
        responseRate,
        interviewRate,
        underperforming: item.applied >= 3 && responseRate < 10
      };
    })
    .sort((a, b) => b.sourced - a.sourced);
}

function matchesSavedView(row, filter) {
  const search = String(filter.search || "").toLowerCase().trim();
  if (search) {
    const haystack = `${row.company || ""} ${row.title || ""} ${row.summary || ""}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  if (filter.discoveryStatus && row.discovery_status !== filter.discoveryStatus) return false;
  if (filter.applicationStatus && row.application_status !== filter.applicationStatus) return false;
  if (!filter.showHidden && row.discovery_status === "not_a_fit") return false;
  return true;
}

function summarizeSavedViewPerformance() {
  const views = db.prepare("SELECT id, name, filter_json FROM saved_views ORDER BY updated_at DESC").all();
  const jobs = db.prepare("SELECT * FROM jobs").all();
  return views.map((view) => {
    const filter = safeJsonParse(view.filter_json, {});
    const matched = jobs.filter((row) => matchesSavedView(row, filter));
    let applied = 0;
    let screens = 0;
    for (const row of matched) {
      const isApplied = row.application_status === "applied" || row.application_status === "rejected" || row.interview_status !== "waiting";
      if (isApplied) applied += 1;
      const hasScreen = ["screen_scheduled", "screen_done", "interview_scheduled", "interview_done", "offer", "closed"].includes(
        row.interview_status
      );
      if (hasScreen) screens += 1;
    }
    const screenRate = applied ? Number(((screens / applied) * 100).toFixed(1)) : 0;
    return {
      id: view.id,
      name: view.name,
      matched: matched.length,
      applied,
      screens,
      screenRate,
      underperforming: applied >= 3 && screenRate < 10
    };
  });
}

function summarizeMetrics(days = 7) {
  const base = {
    discovery: {},
    application: {},
    interview: {}
  };

  for (const status of statusModel.discoveryStatus) {
    const row = db
      .prepare("SELECT COUNT(*) AS count FROM jobs WHERE discovery_status = ?")
      .get(status);
    base.discovery[status] = row.count;
  }
  for (const status of statusModel.applicationStatus) {
    const row = db
      .prepare("SELECT COUNT(*) AS count FROM jobs WHERE application_status = ?")
      .get(status);
    base.application[status] = row.count;
  }
  for (const status of statusModel.interviewStatus) {
    const row = db
      .prepare("SELECT COUNT(*) AS count FROM jobs WHERE interview_status = ?")
      .get(status);
    base.interview[status] = row.count;
  }

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - Math.max(days, 1));
  const startDate = start.toISOString().slice(0, 10);
  const todayDate = today.toISOString().slice(0, 10);

  const weeklyApplications = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM job_events
      WHERE event_type = 'application_submitted'
        AND event_date >= ?
    `)
    .get(startDate).count;

  const weeklyScreens = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM job_events
      WHERE event_type IN ('screen_scheduled', 'screen_done')
        AND event_date >= ?
    `)
    .get(startDate).count;

  const weeklyInterviews = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM job_events
      WHERE event_type IN ('interview_scheduled', 'interview_done')
        AND event_date >= ?
    `)
    .get(startDate).count;

  const overdueFollowups = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM jobs
      WHERE due_date <> ''
        AND due_date < ?
        AND application_status <> 'rejected'
    `)
    .get(todayDate).count;

  const totalApplied = Math.max(base.application.applied || 0, 1);
  const responseRate = Number(((weeklyScreens / totalApplied) * 100).toFixed(1));
  const interviewRate = Number(((weeklyInterviews / totalApplied) * 100).toFixed(1));

  return {
    ...base,
    weekly: {
      windowDays: days,
      applications: weeklyApplications,
      screens: weeklyScreens,
      interviews: weeklyInterviews
    },
    conversion: {
      responseRate,
      interviewRate
    },
    followups: {
      overdue: overdueFollowups
    }
  };
}

function exportSnapshot() {
  const jobs = db.prepare("SELECT * FROM jobs ORDER BY updated_at DESC").all().map(toJobResponse);
  const notes = db.prepare("SELECT * FROM job_notes ORDER BY created_at DESC").all();
  const contacts = db.prepare("SELECT * FROM job_contacts ORDER BY created_at DESC").all();
  const events = db.prepare("SELECT * FROM job_events ORDER BY created_at DESC").all();
  const savedViews = db.prepare("SELECT * FROM saved_views ORDER BY updated_at DESC").all();
  return {
    exportedAt: nowIso(),
    statusModel,
    jobs,
    notes,
    contacts,
    events,
    savedViews
  };
}

function importSnapshot(payload) {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  const notes = Array.isArray(payload?.notes) ? payload.notes : [];
  const contacts = Array.isArray(payload?.contacts) ? payload.contacts : [];
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const savedViews = Array.isArray(payload?.savedViews) ? payload.savedViews : [];

  const insertJob = db.prepare(`
    INSERT INTO jobs (
      id, source, source_url, role_url, company, title, lane, location_type, location_text,
      workplace, employment_type, posted_base_min, posted_base_max, posted_base_label,
      score, score_notes, priority_tier, resume_track, summary, keywords_json, fit_hooks_json, risks_json,
      next_action, due_date, discovery_status, application_status, applied_at, interview_status,
      posting_status, posting_checked_at, created_at, updated_at
    ) VALUES (
      @id, @source, @source_url, @role_url, @company, @title, @lane, @location_type, @location_text,
      @workplace, @employment_type, @posted_base_min, @posted_base_max, @posted_base_label,
      @score, @score_notes, @priority_tier, @resume_track, @summary, @keywords_json, @fit_hooks_json, @risks_json,
      @next_action, @due_date, @discovery_status, @application_status, @applied_at, @interview_status,
      @posting_status, @posting_checked_at, @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      source = excluded.source,
      source_url = excluded.source_url,
      role_url = excluded.role_url,
      company = excluded.company,
      title = excluded.title,
      lane = excluded.lane,
      location_type = excluded.location_type,
      location_text = excluded.location_text,
      workplace = excluded.workplace,
      employment_type = excluded.employment_type,
      posted_base_min = excluded.posted_base_min,
      posted_base_max = excluded.posted_base_max,
      posted_base_label = excluded.posted_base_label,
      score = excluded.score,
      score_notes = excluded.score_notes,
      priority_tier = excluded.priority_tier,
      resume_track = excluded.resume_track,
      summary = excluded.summary,
      keywords_json = excluded.keywords_json,
      fit_hooks_json = excluded.fit_hooks_json,
      risks_json = excluded.risks_json,
      next_action = excluded.next_action,
      due_date = excluded.due_date,
      discovery_status = excluded.discovery_status,
      application_status = excluded.application_status,
      applied_at = excluded.applied_at,
      interview_status = excluded.interview_status,
      posting_status = excluded.posting_status,
      posting_checked_at = excluded.posting_checked_at,
      updated_at = excluded.updated_at
  `);

  const insertNote = db.prepare(`
    INSERT INTO job_notes (id, job_id, note, note_type, created_at, updated_at)
    VALUES (@id, @job_id, @note, @note_type, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      note = excluded.note,
      note_type = excluded.note_type,
      updated_at = excluded.updated_at
  `);

  const insertContact = db.prepare(`
    INSERT INTO job_contacts (id, job_id, contact_type, name, email, profile_url, notes, created_at, updated_at)
    VALUES (@id, @job_id, @contact_type, @name, @email, @profile_url, @notes, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      contact_type = excluded.contact_type,
      name = excluded.name,
      email = excluded.email,
      profile_url = excluded.profile_url,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);

  const insertEvent = db.prepare(`
    INSERT INTO job_events (id, job_id, event_type, event_date, details, created_at)
    VALUES (@id, @job_id, @event_type, @event_date, @details, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      event_type = excluded.event_type,
      event_date = excluded.event_date,
      details = excluded.details
  `);

  const insertView = db.prepare(`
    INSERT INTO saved_views (id, name, filter_json, created_at, updated_at)
    VALUES (@id, @name, @filter_json, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      filter_json = excluded.filter_json,
      updated_at = excluded.updated_at
  `);

  db.exec("BEGIN");
  try {
    for (const job of jobs) {
      validateStatus("discoveryStatus", job.discoveryStatus || "new");
      validateStatus("applicationStatus", job.applicationStatus || "not_started");
      validateStatus("interviewStatus", job.interviewStatus || "waiting");
      validatePostingStatus(job.postingStatus);

      const id = job.id || crypto.randomUUID();
      const appliedAt =
        job.appliedAt ||
        job.applied_at ||
        (job.applicationStatus === "applied" ? nowIso().slice(0, 10) : "");
      insertJob.run({
        id,
        source: job.source || "Import",
        source_url: job.sourceUrl || "",
        role_url: job.roleUrl || "",
        company: job.company || "Unknown",
        title: job.title || "Unknown role",
        lane: job.lane || "",
        location_type: job.locationType || "",
        location_text: job.location || "",
        workplace: job.workplace || "",
        employment_type: job.employmentType || "",
        posted_base_min: job.salary?.min ?? null,
        posted_base_max: job.salary?.max ?? null,
        posted_base_label: job.salary?.label || "",
        score: Number.isFinite(job.score) ? job.score : 0,
        score_notes: job.scoreNotes || "",
        priority_tier: job.priorityTier || "",
        resume_track: job.resumeTrack || "",
        summary: job.summary || "",
        keywords_json: JSON.stringify(job.keywords || []),
        fit_hooks_json: JSON.stringify(job.fitHooks || []),
        risks_json: JSON.stringify(job.risks || []),
        next_action: job.nextAction || "",
        due_date: job.dueDate || "",
        discovery_status: job.discoveryStatus || "new",
        application_status: job.applicationStatus || "not_started",
        applied_at: appliedAt,
        interview_status: job.interviewStatus || "waiting",
        posting_status: job.postingStatus || "unknown",
        posting_checked_at: job.postingCheckedAt || "",
        created_at: job.createdAt || nowIso(),
        updated_at: nowIso()
      });
    }

    for (const note of notes) {
      insertNote.run({
        id: note.id || crypto.randomUUID(),
        job_id: note.job_id || note.jobId,
        note: note.note || "",
        note_type: note.note_type || note.noteType || "general",
        created_at: note.created_at || note.createdAt || nowIso(),
        updated_at: nowIso()
      });
    }

    for (const contact of contacts) {
      insertContact.run({
        id: contact.id || crypto.randomUUID(),
        job_id: contact.job_id || contact.jobId,
        contact_type: contact.contact_type || contact.contactType || "recruiter",
        name: contact.name || "Unknown",
        email: contact.email || "",
        profile_url: contact.profile_url || contact.profileUrl || "",
        notes: contact.notes || "",
        created_at: contact.created_at || contact.createdAt || nowIso(),
        updated_at: nowIso()
      });
    }

    for (const event of events) {
      insertEvent.run({
        id: event.id || crypto.randomUUID(),
        job_id: event.job_id || event.jobId,
        event_type: event.event_type || event.eventType || "updated",
        event_date: event.event_date || event.eventDate || nowIso().slice(0, 10),
        details: event.details || "",
        created_at: event.created_at || event.createdAt || nowIso()
      });
    }

    for (const job of jobs) {
      if ((job.applicationStatus || "not_started") !== "applied") continue;
      const jobId = job.id;
      if (!jobId) continue;
      const appliedAt =
        job.appliedAt ||
        job.applied_at ||
        db
          .prepare(
            "SELECT MIN(event_date) AS applied_at FROM job_events WHERE job_id = ? AND event_type = 'application_submitted'"
          )
          .get(jobId)?.applied_at ||
        nowIso().slice(0, 10);
      ensureApplicationSubmittedEvent(jobId, appliedAt);
    }

    for (const view of savedViews) {
      insertView.run({
        id: view.id || crypto.randomUUID(),
        name: view.name || "Saved View",
        filter_json: view.filter_json || view.filterJson || "{}",
        created_at: view.created_at || view.createdAt || nowIso(),
        updated_at: nowIso()
      });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return {
    importedJobs: jobs.length,
    importedNotes: notes.length,
    importedContacts: contacts.length,
    importedEvents: events.length,
    importedSavedViews: savedViews.length
  };
}

const webDistDir = path.join(root, "web", "dist");

function resolveRequestPath(requestUrl) {
  const parsed = url.parse(requestUrl);
  const pathname = decodeURIComponent(parsed.pathname || "/");

  if (pathname.startsWith("/app/")) {
    const legacyPath = path.join(root, pathname);
    const legacyRelative = path.relative(root, legacyPath);
    if (legacyRelative.startsWith("..") || path.isAbsolute(legacyRelative)) {
      return null;
    }
    return legacyPath;
  }

  const normalized = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.join(webDistDir, normalized);
  const relative = path.relative(webDistDir, fullPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return fullPath;
}

function spaFallbackPath(requestUrl) {
  const parsed = url.parse(requestUrl);
  const pathname = decodeURIComponent(parsed.pathname || "/");
  if (pathname.startsWith("/api/")) return null;
  if (pathname.startsWith("/app/")) return null;
  if (path.extname(pathname)) return null;
  const fallback = path.join(webDistDir, "index.html");
  if (!fs.existsSync(fallback)) return null;
  return fallback;
}

async function tryCallLlm(prompt) {
  const endpoint = getSetting("llm_endpoint") || process.env.LLM_ENDPOINT || "";
  const model = getSetting("llm_model") || process.env.LLM_MODEL || "gpt-4o-mini";
  const encryptedApiKey = getSetting("llm_api_key_encrypted");
  const apiKey = process.env.LLM_API_KEY || decryptSecret(encryptedApiKey);

  if (!endpoint || !apiKey) {
    return {
      usedLlm: false,
      text: "LLM is not configured. Add endpoint + API key in Settings to enable generated drafts."
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are a concise assistant for personal job search workflow support."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        usedLlm: false,
        text: `LLM request failed (${response.status}). ${text.slice(0, 180)}`
      };
    }

    const payload = await response.json();
    const text =
      payload?.choices?.[0]?.message?.content ||
      payload?.output_text ||
      "No content returned by the configured LLM endpoint.";
    return { usedLlm: true, text };
  } catch (error) {
    return {
      usedLlm: false,
      text: `LLM request error: ${error.message}`
    };
  }
}

function extractJsonObject(raw) {
  const text = String(raw || "").trim();
  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };
  let parsed = tryParse(text);
  if (!parsed) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) parsed = tryParse(match[0]);
  }
  return parsed;
}

async function probeUrlLiveness(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    return {
      result: "uncertain",
      httpStatus: null,
      finalUrl: "",
      note: "No posting URL on file."
    };
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      result: "uncertain",
      httpStatus: null,
      finalUrl: trimmed,
      note: "Could not parse the posting URL."
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      result: "uncertain",
      httpStatus: null,
      finalUrl: trimmed,
      note: "Only http(s) URLs can be auto-verified."
    };
  }

  const userAgent =
    "Mozilla/5.0 (compatible; JobSearchCopilot/1.0; +https://localhost)";
  const tryFetch = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(parsed.toString(), {
        method,
        redirect: "follow",
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,*/*"
        },
        signal: controller.signal
      });
      return { ok: true, response };
    } catch (error) {
      return { ok: false, error };
    } finally {
      clearTimeout(timer);
    }
  };

  let attempt = await tryFetch("HEAD");
  let response = attempt.ok ? attempt.response : null;
  // Many job boards block HEAD or bot UAs; fall back to GET to confirm.
  if (
    !response ||
    response.status === 403 ||
    response.status === 405 ||
    response.status === 501
  ) {
    const getAttempt = await tryFetch("GET");
    if (getAttempt.ok) {
      response = getAttempt.response;
      attempt = getAttempt;
    }
  }
  if (!response) {
    const error = attempt.error;
    const note =
      error?.name === "AbortError"
        ? "Posting check timed out after 8 seconds."
        : `Posting check failed: ${error?.message || "unknown error"}`;
    return {
      result: "uncertain",
      httpStatus: null,
      finalUrl: trimmed,
      note
    };
  }
  const status = response.status;
  const finalUrl = response.url || trimmed;
  if (status >= 200 && status < 300) {
    return {
      result: "live",
      httpStatus: status,
      finalUrl,
      note: `Reachable (HTTP ${status}).`
    };
  }
  if (status === 404 || status === 410 || status === 451) {
    return {
      result: "dead",
      httpStatus: status,
      finalUrl,
      note: `Posting returned HTTP ${status}.`
    };
  }
  return {
    result: "uncertain",
    httpStatus: status,
    finalUrl,
    note: `Could not confirm posting (HTTP ${status}). Verify manually.`
  };
}

async function callLlmJson(prompt) {
  const output = await tryCallLlm(prompt);
  if (!output.usedLlm) {
    return { usedLlm: false, text: output.text, data: null };
  }
  return { usedLlm: true, text: String(output.text || ""), data: extractJsonObject(output.text) };
}

function buildCandidateContext() {
  const profile = getProfile() || {};
  const strategy = getStrategyConfig();
  const prefs = profile.preferences || {};
  const keywords = profile.profileKeywords || {};
  const lines = [];
  lines.push(`Candidate: ${profile.candidate?.displayName || "Candidate"}`);
  if (profile.targetSearch?.primaryLane) {
    lines.push(`Primary lane: ${profile.targetSearch.primaryLane}`);
  }
  const seniority = profile.targetSearch?.seniority || [];
  if (seniority.length) lines.push(`Target seniority: ${seniority.join(", ")}`);
  const families = (
    strategy.roleFamilies && strategy.roleFamilies.length
      ? strategy.roleFamilies
      : (profile.targetSearch?.roleFamilies || []).map((family) => family.name)
  ).filter(Boolean);
  if (families.length) lines.push(`Target role families: ${families.join(", ")}`);
  const preferredMarket = strategy.preferredMarket || prefs.locationPreference?.preferredMarket || "";
  if (preferredMarket) lines.push(`Preferred market: ${preferredMarket}`);
  const salaryFloor = strategy.minimumBaseSalaryUsd || prefs.compensation?.minimumBaseSalaryUsd || 0;
  if (salaryFloor) lines.push(`Minimum base salary (hard screen): $${salaryFloor}`);
  const maxTravel = strategy.maximumTravelPercent || prefs.travel?.maximumPercent || 0;
  if (maxTravel) lines.push(`Maximum travel: ${maxTravel}% (more is a dealbreaker)`);
  const blockedTypes = prefs.employmentType?.blocked || [];
  if (blockedTypes.length) lines.push(`Blocked employment types: ${blockedTypes.join(", ")}`);
  const screenOut = profile.targetSearch?.screenOutTitleSignals || [];
  if (screenOut.length) lines.push(`Screen-out title signals: ${screenOut.join(", ")}`);
  if ((keywords.strengths || []).length) lines.push(`Strengths: ${keywords.strengths.join(", ")}`);
  if ((keywords.tools || []).length) lines.push(`Tools: ${keywords.tools.join(", ")}`);
  const savedKeywords = strategy.keywords || [];
  if (savedKeywords.length) lines.push(`Saved search keywords: ${savedKeywords.join(", ")}`);
  return lines.join("\n");
}

function toStringList(value, max) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

const CSV_FIELD_ALIASES = {
  company: ["company", "employer", "organization", "organisation", "org"],
  title: ["title", "role", "position", "job title", "role title", "job"],
  location: ["location", "city", "where", "geo", "location type", "market"],
  roleUrl: [
    "url",
    "link",
    "apply",
    "apply url",
    "posting",
    "posting url",
    "role url",
    "job url",
    "direct apply url"
  ],
  salaryLabel: [
    "salary",
    "comp",
    "compensation",
    "pay",
    "base",
    "salary range",
    "posted base range",
    "base range"
  ],
  summary: ["summary", "description", "notes", "note", "about", "fit", "details"],
  source: ["source", "via", "board", "channel"]
};

function parseCsvRows(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ""));
}

function buildCsvHeaderMap(headerRow) {
  const normalized = headerRow.map((header) =>
    String(header || "")
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, " ")
      .trim()
  );
  const map = {};
  for (const [field, aliases] of Object.entries(CSV_FIELD_ALIASES)) {
    let index = normalized.findIndex((header) => aliases.includes(header));
    if (index === -1) {
      index = normalized.findIndex((header) =>
        aliases.some((alias) => header === alias || header.includes(alias))
      );
    }
    if (index !== -1) map[field] = index;
  }
  return map;
}

async function handleApi(req, res, parsedUrl) {
  const method = req.method || "GET";
  const pathname = parsedUrl.pathname || "/";
  const parts = pathname.split("/").filter(Boolean);

  if (method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, port, dbPath });
    return true;
  }

  if (method === "GET" && pathname === "/api/status-model") {
    sendJson(res, 200, statusModel);
    return true;
  }

  if (method === "GET" && pathname === "/api/profile") {
    sendJson(res, 200, getProfile() || {});
    return true;
  }

  if (method === "GET" && pathname === "/api/jobs") {
    const jobs = getJobs({
      search: parsedUrl.query.search,
      discoveryStatus: parsedUrl.query.discoveryStatus,
      applicationStatus: parsedUrl.query.applicationStatus,
      interviewStatus: parsedUrl.query.interviewStatus,
      lane: parsedUrl.query.lane
    });
    sendJson(res, 200, { jobs });
    return true;
  }

  if (method === "POST" && pathname === "/api/jobs") {
    const body = await parseRequestBody(req);
    const company = requireNonEmptyField("company", body.company);
    const title = requireNonEmptyField("title", body.title);
    validateStatus("discoveryStatus", body.discoveryStatus || "new");
    validateStatus("applicationStatus", body.applicationStatus || "not_started");
    validateStatus("interviewStatus", body.interviewStatus || "waiting");
    validatePostingStatus(body.postingStatus);

    const duplicates = findDuplicateJobs(body);
    if (duplicates.length && !body.confirmDuplicate) {
      sendJson(res, 409, {
        error: "Possible duplicate role detected",
        duplicates
      });
      return true;
    }

    const id = body.id || crypto.randomUUID();
    const now = nowIso();
    const applicationStatus = body.applicationStatus || "not_started";
    const appliedAt =
      body.appliedAt ||
      body.applied_at ||
      (applicationStatus === "applied" ? now.slice(0, 10) : "");
    db.prepare(`
      INSERT INTO jobs (
        id, source, source_url, role_url, company, title, lane, location_type, location_text,
        workplace, employment_type, posted_base_min, posted_base_max, posted_base_label,
        score, score_notes, priority_tier, resume_track, summary, keywords_json, fit_hooks_json, risks_json,
        next_action, due_date, discovery_status, application_status, applied_at, interview_status,
        posting_status, posting_checked_at, created_at, updated_at
      ) VALUES (
        @id, @source, @source_url, @role_url, @company, @title, @lane, @location_type, @location_text,
        @workplace, @employment_type, @posted_base_min, @posted_base_max, @posted_base_label,
        @score, @score_notes, @priority_tier, @resume_track, @summary, @keywords_json, @fit_hooks_json, @risks_json,
        @next_action, @due_date, @discovery_status, @application_status, @applied_at, @interview_status,
        @posting_status, @posting_checked_at, @created_at, @updated_at
      )
    `).run({
      id,
      source: body.source || "Manual",
      source_url: body.sourceUrl || "",
      role_url: body.roleUrl || "",
      company,
      title,
      lane: body.lane || "",
      location_type: body.locationType || "",
      location_text: body.location || "",
      workplace: body.workplace || "",
      employment_type: body.employmentType || "",
      posted_base_min: body.salary?.min ?? null,
      posted_base_max: body.salary?.max ?? null,
      posted_base_label: body.salary?.label || "",
      score: Number.isFinite(body.score) ? body.score : 0,
      score_notes: body.scoreNotes || "",
      priority_tier: body.priorityTier || "",
      resume_track: body.resumeTrack || "",
      summary: body.summary || "",
      keywords_json: JSON.stringify(body.keywords || []),
      fit_hooks_json: JSON.stringify(body.fitHooks || []),
      risks_json: JSON.stringify(body.risks || []),
      next_action: body.nextAction || "",
      due_date: body.dueDate || "",
      discovery_status: body.discoveryStatus || "new",
      application_status: applicationStatus,
      applied_at: appliedAt,
      interview_status: body.interviewStatus || "waiting",
      posting_status: body.postingStatus || "unknown",
      posting_checked_at: body.postingCheckedAt || "",
      created_at: now,
      updated_at: now
    });
    if (applicationStatus === "applied") {
      ensureApplicationSubmittedEvent(id, appliedAt || now.slice(0, 10), now);
    }

    db.prepare(`
      INSERT INTO job_events (id, job_id, event_type, event_date, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      id,
      "job_added",
      now.slice(0, 10),
      "Job created",
      now
    );

    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
    sendJson(res, 201, { job: toJobResponse(row) });
    return true;
  }

  if (parts[0] === "api" && parts[1] === "jobs" && parts[2] && !parts[3]) {
    const jobId = parts[2];
    if (method === "GET") {
      const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
      if (!row) {
        sendJson(res, 404, { error: "Job not found" });
        return true;
      }
      sendJson(res, 200, { job: toJobResponse(row) });
      return true;
    }

    if (method === "PATCH") {
      const body = await parseRequestBody(req);
      validateStatus("discoveryStatus", body.discoveryStatus);
      validateStatus("applicationStatus", body.applicationStatus);
      validateStatus("interviewStatus", body.interviewStatus);
      validatePostingStatus(body.postingStatus);
      if (body.company !== undefined) requireNonEmptyField("company", body.company);
      if (body.title !== undefined) requireNonEmptyField("title", body.title);

      const existing = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
      if (!existing) {
        sendJson(res, 404, { error: "Job not found" });
        return true;
      }

      const merged = {
        ...toJobResponse(existing),
        ...body
      };
      const now = nowIso();
      const postingStatusChanged =
        body.postingStatus !== undefined &&
        String(body.postingStatus) !== String(existing.posting_status || "unknown");
      const postingCheckedAt = postingStatusChanged
        ? now
        : body.postingCheckedAt !== undefined
          ? body.postingCheckedAt || ""
          : existing.posting_checked_at || "";
      const nextApplicationStatus = merged.applicationStatus || "not_started";
      const explicitAppliedAt =
        body.appliedAt !== undefined
          ? body.appliedAt
          : body.applied_at !== undefined
            ? body.applied_at
            : undefined;
      const appliedAt =
        explicitAppliedAt !== undefined
          ? String(explicitAppliedAt || "")
          : nextApplicationStatus === "applied" && !existing.applied_at
            ? now.slice(0, 10)
            : existing.applied_at || "";
      db.prepare(`
        UPDATE jobs SET
          source = @source,
          source_url = @source_url,
          role_url = @role_url,
          company = @company,
          title = @title,
          lane = @lane,
          location_type = @location_type,
          location_text = @location_text,
          workplace = @workplace,
          employment_type = @employment_type,
          posted_base_min = @posted_base_min,
          posted_base_max = @posted_base_max,
          posted_base_label = @posted_base_label,
          score = @score,
          score_notes = @score_notes,
          priority_tier = @priority_tier,
          resume_track = @resume_track,
          summary = @summary,
          keywords_json = @keywords_json,
          fit_hooks_json = @fit_hooks_json,
          risks_json = @risks_json,
          next_action = @next_action,
          due_date = @due_date,
          discovery_status = @discovery_status,
          application_status = @application_status,
          applied_at = @applied_at,
          interview_status = @interview_status,
          posting_status = @posting_status,
          posting_checked_at = @posting_checked_at,
          ai_score = @ai_score,
          ai_analysis_json = @ai_analysis_json,
          updated_at = @updated_at
        WHERE id = @id
      `).run({
        id: jobId,
        source: merged.source || "Manual",
        source_url: merged.sourceUrl || "",
        role_url: merged.roleUrl || "",
        company: merged.company || "",
        title: merged.title || "",
        lane: merged.lane || "",
        location_type: merged.locationType || "",
        location_text: merged.location || "",
        workplace: merged.workplace || "",
        employment_type: merged.employmentType || "",
        posted_base_min: merged.salary?.min ?? null,
        posted_base_max: merged.salary?.max ?? null,
        posted_base_label: merged.salary?.label || "",
        score: Number.isFinite(merged.score) ? merged.score : 0,
        score_notes: merged.scoreNotes || "",
        priority_tier: merged.priorityTier || "",
        resume_track: merged.resumeTrack || "",
        summary: merged.summary || "",
        keywords_json: JSON.stringify(merged.keywords || []),
        fit_hooks_json: JSON.stringify(merged.fitHooks || []),
        risks_json: JSON.stringify(merged.risks || []),
        next_action: merged.nextAction || "",
        due_date: merged.dueDate || "",
        discovery_status: merged.discoveryStatus || "new",
        application_status: nextApplicationStatus,
        applied_at: appliedAt,
        interview_status: merged.interviewStatus || "waiting",
        posting_status: merged.postingStatus || "unknown",
        posting_checked_at: postingCheckedAt,
        ai_score:
          body.aiScore !== undefined
            ? body.aiScore === null
              ? null
              : clampScore(body.aiScore)
            : existing.ai_score ?? null,
        ai_analysis_json:
          body.aiAnalysis !== undefined
            ? body.aiAnalysis
              ? JSON.stringify(body.aiAnalysis)
              : ""
            : existing.ai_analysis_json || "",
        updated_at: now
      });
      if (nextApplicationStatus === "applied" && appliedAt) {
        ensureApplicationSubmittedEvent(jobId, appliedAt, now);
      }

      db.prepare(`
        INSERT INTO job_events (id, job_id, event_type, event_date, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        jobId,
        "job_updated",
        now.slice(0, 10),
        "Role details updated",
        now
      );

      const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
      sendJson(res, 200, { job: toJobResponse(row) });
      return true;
    }
  }

  if (parts[0] === "api" && parts[1] === "jobs" && parts[2] && parts[3] === "notes") {
    const jobId = parts[2];
    if (method === "GET") {
      const notes = db
        .prepare("SELECT * FROM job_notes WHERE job_id = ? ORDER BY created_at DESC")
        .all(jobId);
      sendJson(res, 200, { notes });
      return true;
    }
    if (method === "POST") {
      const body = await parseRequestBody(req);
      const now = nowIso();
      const note = {
        id: crypto.randomUUID(),
        job_id: jobId,
        note: body.note || "",
        note_type: body.noteType || "general",
        created_at: now,
        updated_at: now
      };
      db.prepare(`
        INSERT INTO job_notes (id, job_id, note, note_type, created_at, updated_at)
        VALUES (@id, @job_id, @note, @note_type, @created_at, @updated_at)
      `).run(note);
      sendJson(res, 201, { note });
      return true;
    }
  }

  if (parts[0] === "api" && parts[1] === "jobs" && parts[2] && parts[3] === "contacts") {
    const jobId = parts[2];
    if (method === "GET") {
      const contacts = db
        .prepare("SELECT * FROM job_contacts WHERE job_id = ? ORDER BY created_at DESC")
        .all(jobId);
      sendJson(res, 200, { contacts });
      return true;
    }
    if (method === "POST") {
      const body = await parseRequestBody(req);
      const now = nowIso();
      const contact = {
        id: crypto.randomUUID(),
        job_id: jobId,
        contact_type: body.contactType || "recruiter",
        name: body.name || "",
        email: body.email || "",
        profile_url: body.profileUrl || "",
        notes: body.notes || "",
        created_at: now,
        updated_at: now
      };
      db.prepare(`
        INSERT INTO job_contacts (id, job_id, contact_type, name, email, profile_url, notes, created_at, updated_at)
        VALUES (@id, @job_id, @contact_type, @name, @email, @profile_url, @notes, @created_at, @updated_at)
      `).run(contact);
      sendJson(res, 201, { contact });
      return true;
    }
  }

  if (parts[0] === "api" && parts[1] === "jobs" && parts[2] && parts[3] === "events") {
    const jobId = parts[2];
    if (method === "GET") {
      const events = db
        .prepare("SELECT * FROM job_events WHERE job_id = ? ORDER BY event_date DESC, created_at DESC")
        .all(jobId);
      sendJson(res, 200, { events });
      return true;
    }
    if (method === "POST") {
      const body = await parseRequestBody(req);
      const now = nowIso();
      const event = {
        id: crypto.randomUUID(),
        job_id: jobId,
        event_type: body.eventType || "updated",
        event_date: body.eventDate || now.slice(0, 10),
        details: body.details || "",
        created_at: now
      };
      db.prepare(`
        INSERT INTO job_events (id, job_id, event_type, event_date, details, created_at)
        VALUES (@id, @job_id, @event_type, @event_date, @details, @created_at)
      `).run(event);
      sendJson(res, 201, { event });
      return true;
    }
  }

  if (
    parts[0] === "api" &&
    parts[1] === "jobs" &&
    parts[2] &&
    parts[3] === "verify" &&
    !parts[4]
  ) {
    const jobId = parts[2];
    if (method === "POST") {
      const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
      if (!row) {
        sendJson(res, 404, { error: "Job not found" });
        return true;
      }
      const candidateUrl = row.role_url || row.source_url || "";
      const probe = await probeUrlLiveness(candidateUrl);
      const now = nowIso();
      // Only flip status on a confident result; preserve previous on uncertain
      // so a transient bot-block doesn't erase a known-good "live" record.
      const nextStatus =
        probe.result === "live"
          ? "live"
          : probe.result === "dead"
            ? "dead"
            : row.posting_status || "unknown";
      db.prepare(`
        UPDATE jobs SET
          posting_status = ?,
          posting_checked_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(nextStatus, now, now, jobId);
      db.prepare(`
        INSERT INTO job_events (id, job_id, event_type, event_date, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        jobId,
        "posting_verified",
        now.slice(0, 10),
        `Posting check: ${probe.result}${probe.httpStatus ? ` (HTTP ${probe.httpStatus})` : ""}. ${probe.note}`,
        now
      );
      const updated = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
      sendJson(res, 200, {
        verification: {
          result: probe.result,
          httpStatus: probe.httpStatus,
          finalUrl: probe.finalUrl,
          note: probe.note,
          checkedAt: now
        },
        job: toJobResponse(updated)
      });
      return true;
    }
  }

  if (method === "GET" && pathname === "/api/metrics/summary") {
    const days = Number(parsedUrl.query.days || "7");
    sendJson(res, 200, summarizeMetrics(days));
    return true;
  }

  if (method === "GET" && pathname === "/api/metrics/strategy-performance") {
    sendJson(res, 200, {
      sources: summarizeSourcePerformance(),
      savedViews: summarizeSavedViewPerformance()
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/reminders") {
    sendJson(res, 200, { reminders: buildReminderQueue() });
    return true;
  }

  if (parts[0] === "api" && parts[1] === "reminders" && parts[2] && method === "PATCH") {
    const reminderKey = decodeURIComponent(parts.slice(2).join("/"));
    const body = await parseRequestBody(req);
    const action = String(body.action || "").toLowerCase();
    if (action === "complete") {
      upsertReminderState(reminderKey, "completed", "");
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (action === "snooze") {
      const snoozeDays = Math.max(1, Math.min(30, Number(body.snoozeDays || 1)));
      const date = new Date();
      date.setDate(date.getDate() + snoozeDays);
      upsertReminderState(reminderKey, "open", date.toISOString().slice(0, 10));
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (action === "reopen") {
      upsertReminderState(reminderKey, "open", "");
      sendJson(res, 200, { ok: true });
      return true;
    }
    sendJson(res, 400, { error: "Unsupported reminder action" });
    return true;
  }

  if (pathname === "/api/strategy") {
    if (method === "GET") {
      sendJson(res, 200, getStrategyConfig());
      return true;
    }
    if (method === "PUT") {
      const body = await parseRequestBody(req);
      const strategy = saveStrategyConfig(body || {});
      sendJson(res, 200, strategy);
      return true;
    }
  }

  if (pathname === "/api/rubrics") {
    if (method === "GET") {
      sendJson(res, 200, getRubricConfig());
      return true;
    }
    if (method === "PUT") {
      const body = await parseRequestBody(req);
      try {
        const saved = saveRubricConfig(body || {});
        sendJson(res, 200, saved);
      } catch (error) {
        sendJson(res, error.statusCode || 400, { error: error.message });
      }
      return true;
    }
  }

  if (pathname === "/api/rubrics/reset" && method === "POST") {
    sendJson(res, 200, resetRubricConfig());
    return true;
  }

  if (method === "GET" && pathname === "/api/research/prompts") {
    sendJson(res, 200, { prompts: getResearchPrompts() });
    return true;
  }

  if (pathname === "/api/research/jobs" && method === "POST") {
    const body = await parseRequestBody(req);
    const incoming = body?.strategy || {};
    const strategy = saveStrategyConfig({
      ...getStrategyConfig(),
      ...incoming
    });
    const limit = Math.max(1, Math.min(50, Number(body?.limit || 20)));
    const results = await lookupJobsFromMuse(strategy, limit);
    sendJson(res, 200, { strategy, results });
    return true;
  }

  if (pathname === "/api/saved-views") {
    if (method === "GET") {
      const savedViews = db
        .prepare("SELECT * FROM saved_views ORDER BY updated_at DESC")
        .all()
        .map((row) => ({
          id: row.id,
          name: row.name,
          filter: safeJsonParse(row.filter_json, {}),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));
      sendJson(res, 200, { savedViews });
      return true;
    }

    if (method === "POST") {
      const body = await parseRequestBody(req);
      const now = nowIso();
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO saved_views (id, name, filter_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, body.name || "Saved View", JSON.stringify(body.filter || {}), now, now);
      sendJson(res, 201, { id });
      return true;
    }
  }

  if (parts[0] === "api" && parts[1] === "saved-views" && parts[2]) {
    const viewId = parts[2];
    if (method === "PATCH") {
      const body = await parseRequestBody(req);
      const existing = db.prepare("SELECT * FROM saved_views WHERE id = ?").get(viewId);
      if (!existing) {
        sendJson(res, 404, { error: "Saved view not found" });
        return true;
      }
      db.prepare(`
        UPDATE saved_views
        SET name = ?, filter_json = ?, updated_at = ?
        WHERE id = ?
      `).run(
        body.name || existing.name,
        JSON.stringify(body.filter || safeJsonParse(existing.filter_json, {})),
        nowIso(),
        viewId
      );
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (method === "DELETE") {
      db.prepare("DELETE FROM saved_views WHERE id = ?").run(viewId);
      sendJson(res, 200, { ok: true });
      return true;
    }
  }

  if (method === "GET" && pathname === "/api/export") {
    sendJson(res, 200, exportSnapshot());
    return true;
  }

  if (method === "POST" && pathname === "/api/import") {
    const body = await parseRequestBody(req);
    const summary = importSnapshot(body);
    sendJson(res, 200, summary);
    return true;
  }

  if (method === "POST" && pathname === "/api/import/markdown") {
    const body = await parseRequestBody(req);
    const markdown = String(body.markdown || "").trim();
    if (!markdown) {
      sendJson(res, 400, { error: "Markdown body is empty." });
      return true;
    }
    const endpoint = getSetting("llm_endpoint") || process.env.LLM_ENDPOINT || "";
    const encryptedApiKey = getSetting("llm_api_key_encrypted");
    const apiKey = process.env.LLM_API_KEY || decryptSecret(encryptedApiKey);
    if (!endpoint || !apiKey) {
      sendJson(res, 400, {
        error: "LLM is not configured.",
        detail: "Add an LLM endpoint and API key under Settings to extract jobs from markdown."
      });
      return true;
    }

    const truncated = markdown.length > 18000 ? markdown.slice(0, 18000) : markdown;
    const prompt = [
      "Extract every distinct job posting from the markdown below into a JSON object.",
      "Return ONLY a JSON object of the exact shape: { \"jobs\": [ { ... } ] }.",
      "Do not include any prose, code fences, or commentary outside the JSON.",
      "For each job posting, include these fields (use empty string when unknown):",
      "- company (string, required)",
      "- title (string, required)",
      "- location (string)",
      "- url (string, direct posting URL if present)",
      "- salary (string, raw salary range as written)",
      "- summary (string, 1-3 sentence description of the role)",
      "- source (string, where it came from such as LinkedIn, Indeed, company site, or 'Deep Research')",
      "If you cannot find any jobs, return { \"jobs\": [] }.",
      "",
      "Markdown:",
      "---",
      truncated,
      "---"
    ].join("\n");

    const output = await tryCallLlm(prompt);
    if (!output.usedLlm) {
      sendJson(res, 502, { error: "LLM extraction failed.", detail: output.text });
      return true;
    }

    let parsed = null;
    const raw = String(output.text || "").trim();
    const tryParse = (text) => {
      try { return JSON.parse(text); } catch { return null; }
    };
    parsed = tryParse(raw);
    if (!parsed) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = tryParse(match[0]);
    }
    if (!parsed || !Array.isArray(parsed.jobs)) {
      sendJson(res, 502, {
        error: "LLM did not return valid JSON.",
        detail: raw.slice(0, 400)
      });
      return true;
    }

    const previews = [];
    for (const item of parsed.jobs) {
      const company = String(item.company || "").trim();
      const title = String(item.title || "").trim();
      if (!company || !title) continue;
      const candidate = {
        company,
        title,
        location: String(item.location || "").trim(),
        roleUrl: String(item.url || "").trim(),
        salaryLabel: String(item.salary || "").trim(),
        summary: String(item.summary || "").trim(),
        source: String(item.source || "Markdown Import").trim() || "Markdown Import"
      };
      const duplicates = findDuplicateJobs({
        company: candidate.company,
        title: candidate.title,
        roleUrl: candidate.roleUrl
      });
      previews.push({
        ...candidate,
        duplicates: duplicates.map((dup) => ({
          reason: dup.reason,
          job: { id: dup.job.id, company: dup.job.company, title: dup.job.title }
        }))
      });
    }

    sendJson(res, 200, { jobs: previews });
    return true;
  }

  if (method === "POST" && pathname === "/api/import/csv") {
    const body = await parseRequestBody(req);
    const csv = String(body.csv || "").trim();
    if (!csv) {
      sendJson(res, 400, { error: "CSV body is empty." });
      return true;
    }

    const rows = parseCsvRows(csv);
    if (rows.length < 2) {
      sendJson(res, 400, {
        error: "CSV needs a header row plus at least one data row."
      });
      return true;
    }

    const headerMap = buildCsvHeaderMap(rows[0]);
    if (headerMap.company === undefined || headerMap.title === undefined) {
      sendJson(res, 400, {
        error: "CSV must include a company column and a title/role column.",
        detail: `Detected headers: ${rows[0].join(", ")}`
      });
      return true;
    }

    const cellAt = (cells, field) =>
      headerMap[field] === undefined ? "" : String(cells[headerMap[field]] || "").trim();

    const previews = [];
    for (const cells of rows.slice(1)) {
      const company = cellAt(cells, "company");
      const title = cellAt(cells, "title");
      if (!company || !title) continue;
      const candidate = {
        company,
        title,
        location: cellAt(cells, "location"),
        roleUrl: cellAt(cells, "roleUrl"),
        salaryLabel: cellAt(cells, "salaryLabel"),
        summary: cellAt(cells, "summary"),
        source: cellAt(cells, "source") || "CSV Import"
      };
      const duplicates = findDuplicateJobs({
        company: candidate.company,
        title: candidate.title,
        roleUrl: candidate.roleUrl
      });
      previews.push({
        ...candidate,
        duplicates: duplicates.map((dup) => ({
          reason: dup.reason,
          job: { id: dup.job.id, company: dup.job.company, title: dup.job.title }
        }))
      });
    }

    sendJson(res, 200, { jobs: previews });
    return true;
  }

  if (pathname === "/api/settings/llm") {
    if (method === "GET") {
      const endpoint = getSetting("llm_endpoint");
      const model = getSetting("llm_model") || "gpt-4o-mini";
      const configured = Boolean(process.env.LLM_API_KEY || getSetting("llm_api_key_encrypted"));
      sendJson(res, 200, {
        endpoint,
        model,
        configured,
        source: process.env.LLM_API_KEY ? "environment" : configured ? "local-encrypted" : "not-configured"
      });
      return true;
    }
    if (method === "PUT") {
      const body = await parseRequestBody(req);
      if (body.endpoint !== undefined) upsertSetting("llm_endpoint", String(body.endpoint || ""));
      if (body.model !== undefined) upsertSetting("llm_model", String(body.model || "gpt-4o-mini"));
      if (body.apiKey !== undefined) {
        const encrypted = body.apiKey ? encryptSecret(String(body.apiKey)) : "";
        upsertSetting("llm_api_key_encrypted", encrypted);
      }
      sendJson(res, 200, { ok: true });
      return true;
    }
  }

  if (pathname === "/api/llm/fit-summary" && method === "POST") {
    const body = await parseRequestBody(req);
    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(body.jobId);
    if (!row) {
      sendJson(res, 404, { error: "Job not found" });
      return true;
    }
    const job = toJobResponse(row);
    const prompt = [
      `Create a short fit summary for this role.`,
      `Company: ${job.company}`,
      `Title: ${job.title}`,
      `Summary: ${job.summary}`,
      `Discovery/Application/Interview statuses: ${job.discoveryStatus}/${job.applicationStatus}/${job.interviewStatus}`,
      `Score: ${job.score}`,
      `Keywords: ${(job.keywords || []).join(", ")}`
    ].join("\n");
    const output = await tryCallLlm(prompt);
    sendJson(res, 200, {
      ...output,
      fallback: `Fit summary: ${job.title} at ${job.company} looks best when positioned around ${job.keywords.slice(0, 4).join(", ") || "core strengths"}.`
    });
    return true;
  }

  if (pathname === "/api/llm/outreach-draft" && method === "POST") {
    const body = await parseRequestBody(req);
    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(body.jobId);
    if (!row) {
      sendJson(res, 404, { error: "Job not found" });
      return true;
    }
    const job = toJobResponse(row);
    const prompt = [
      "Write a concise outreach message to a recruiter.",
      `Role: ${job.title} at ${job.company}`,
      `Why fit: ${(job.fitHooks || []).join("; ")}`,
      `Keep it under 150 words and professional.`
    ].join("\n");
    const output = await tryCallLlm(prompt);
    sendJson(res, 200, {
      ...output,
      fallback: `Hi [Name], I am very interested in the ${job.title} role at ${job.company}. My background aligns well with the role's focus, and I would value a quick conversation to discuss fit.`
    });
    return true;
  }

  if (pathname === "/api/llm/interview-pack" && method === "POST") {
    const body = await parseRequestBody(req);
    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(body.jobId);
    if (!row) {
      sendJson(res, 404, { error: "Job not found" });
      return true;
    }
    const job = toJobResponse(row);
    const prompt = [
      "Create interview prep bullet points.",
      `Role: ${job.title} at ${job.company}`,
      `Summary: ${job.summary}`,
      `Keywords: ${(job.keywords || []).join(", ")}`,
      "Provide: 5 likely questions, 5 story prompts, and 5 questions to ask interviewer."
    ].join("\n");
    const output = await tryCallLlm(prompt);
    sendJson(res, 200, {
      ...output,
      fallback: [
        "Likely question: Why this role and why now?",
        "Likely question: Describe a complex cross-functional initiative you led.",
        "Story prompt: AI adoption program with measurable outcomes.",
        "Question to ask: What outcomes define success in the first 90 days?"
      ].join("\n")
    });
    return true;
  }

  if (pathname === "/api/llm/fit-score" && method === "POST") {
    const body = await parseRequestBody(req);
    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(body.jobId);
    if (!row) {
      sendJson(res, 404, { error: "Job not found" });
      return true;
    }
    const job = toJobResponse(row);
    const prompt = [
      "You are a rigorous job-fit analyst. Score how well the role below fits the candidate.",
      "Return ONLY a JSON object (no prose, no markdown, no code fences) of this exact shape:",
      '{ "score": <integer 0-100>, "tier": "apply_now" | "selective" | "skip", "rationale": "<2-4 sentence explanation>", "fitHooks": ["..."], "risks": ["..."], "keywordGaps": ["..."] }',
      "Scoring guidance: 75-100 = apply_now (strong fit); 60-74 = selective (partial fit or notable gaps); below 60 = skip (weak fit, or it violates a hard screen such as the salary floor, travel cap, a blocked employment type, or a screen-out title signal).",
      "fitHooks: up to 5 concrete reasons the candidate is a strong match. risks: up to 5 concerns or gaps. keywordGaps: up to 8 important role keywords the candidate should emphasize or that look missing from their profile.",
      "",
      "CANDIDATE PROFILE:",
      buildCandidateContext(),
      "",
      "ROLE:",
      `Company: ${job.company}`,
      `Title: ${job.title}`,
      `Location: ${job.location || "unknown"}`,
      `Salary: ${job.salary?.label || (job.salary?.min ? `$${job.salary.min}+` : "unknown")}`,
      `Description / summary: ${job.summary || "(none provided)"}`,
      `Existing keywords: ${(job.keywords || []).join(", ") || "none"}`
    ].join("\n");

    const result = await callLlmJson(prompt);
    if (!result.usedLlm) {
      sendJson(res, 200, { usedLlm: false, analysis: null, text: result.text });
      return true;
    }
    if (!result.data || typeof result.data !== "object") {
      sendJson(res, 502, {
        error: "LLM did not return valid JSON.",
        detail: result.text.slice(0, 400)
      });
      return true;
    }
    const data = result.data;
    const score = clampScore(data.score);
    const tier = ["apply_now", "selective", "skip"].includes(data.tier)
      ? data.tier
      : score >= 75
        ? "apply_now"
        : score >= 60
          ? "selective"
          : "skip";
    const analysis = {
      score,
      tier,
      rationale: String(data.rationale || "").trim(),
      fitHooks: toStringList(data.fitHooks, 5),
      risks: toStringList(data.risks, 5),
      keywordGaps: toStringList(data.keywordGaps, 8)
    };
    sendJson(res, 200, { usedLlm: true, analysis });
    return true;
  }

  if (pathname === "/api/llm/summarize-jd" && method === "POST") {
    const body = await parseRequestBody(req);
    const text = String(body.text || "").trim();
    if (!text) {
      sendJson(res, 400, { error: "Job description text is empty." });
      return true;
    }
    const truncated = text.length > 16000 ? text.slice(0, 16000) : text;
    const prompt = [
      "Extract and summarize the following job description.",
      "Return ONLY a JSON object (no prose, no markdown, no code fences) of this exact shape:",
      '{ "title": "", "company": "", "location": "", "salaryLabel": "", "seniority": "", "summary": "", "responsibilities": ["..."], "qualifications": ["..."], "keywords": ["..."], "redFlags": ["..."] }',
      "summary: a neutral 2-3 sentence overview. responsibilities: up to 6 core duties. qualifications: up to 6 required or preferred qualifications. keywords: up to 12 ATS-relevant skills/terms. redFlags: up to 5 concerns (e.g., heavy travel, contract/temp, vague scope, comp below market). Use an empty string or empty array when something is unknown.",
      "",
      "JOB DESCRIPTION:",
      "---",
      truncated,
      "---"
    ].join("\n");

    const result = await callLlmJson(prompt);
    if (!result.usedLlm) {
      sendJson(res, 400, { error: "LLM is not configured.", detail: result.text });
      return true;
    }
    if (!result.data || typeof result.data !== "object") {
      sendJson(res, 502, {
        error: "LLM did not return valid JSON.",
        detail: result.text.slice(0, 400)
      });
      return true;
    }
    const data = result.data;
    const extracted = {
      title: String(data.title || "").trim(),
      company: String(data.company || "").trim(),
      location: String(data.location || "").trim(),
      salaryLabel: String(data.salaryLabel || "").trim(),
      seniority: String(data.seniority || "").trim(),
      summary: String(data.summary || "").trim(),
      responsibilities: toStringList(data.responsibilities, 6),
      qualifications: toStringList(data.qualifications, 6),
      keywords: toStringList(data.keywords, 12),
      redFlags: toStringList(data.redFlags, 5)
    };
    sendJson(res, 200, { usedLlm: true, extracted });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url || "/", true);
    if ((parsedUrl.pathname || "").startsWith("/api/")) {
      const handled = await handleApi(req, res, parsedUrl);
      if (handled) return;
      sendJson(res, 404, { error: "API route not found" });
      return;
    }

    const filePath = resolveRequestPath(req.url || "/");
    if (!filePath) {
      sendText(res, 403, "Forbidden");
      return;
    }

    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        const fallback = spaFallbackPath(req.url || "/");
        if (fallback) {
          res.writeHead(200, {
            "Content-Type": contentTypes[".html"],
            "Cache-Control": "no-store"
          });
          fs.createReadStream(fallback).pipe(res);
          return;
        }
        sendText(res, 404, "Not found");
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": contentTypes[extension] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    sendJson(res, statusCode, {
      error: statusCode === 500 ? "Internal server error" : error.message,
      detail: error.message
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Job Search Copilot running at http://127.0.0.1:${port}`);
  console.log(`SQLite database: ${dbPath}`);
});
