const state = {
  profile: null,
  jobs: [],
  selectedId: "",
  search: "",
  discoveryFilter: "",
  applicationFilter: "",
  showHidden: false,
  showClosed: false,
  strategy: null,
  lookupResults: [],
  statusModel: null,
  metrics: null,
  reminders: [],
  strategyPerformance: null,
  savedViews: [],
  tab: "today",
  showStartHere: false,
  markdownPreview: [],
  researchPrompts: [],
  expandedBreakdowns: new Set(),
  lastFitAnalysis: null,
  lastJdExtract: null
};

const el = {};

const SCORE_CATEGORY_LABELS = {
  location: "Location",
  domain: "Domain fit",
  ai: "AI / systems",
  seniority: "Seniority",
  keywords: "Strategic keywords",
  bridge: "Cross-functional bridge",
  leadership: "Leadership signal",
  value: "Compensation value"
};

const SCORE_CATEGORY_TOOLTIPS = {
  location: "How well the role's location matches your preferred market (NYC, hybrid, or remote).",
  domain: "Match against retail, commerce, merchandising, inventory, allocation, replenishment, workflow, enterprise.",
  ai: "Mentions of AI/GenAI, automation, transformation, modernization, systems, product.",
  seniority: "Whether the title signals senior/lead/manager/director level versus IC/junior.",
  keywords: "Strategic phrases like product strategy, roadmap, cross-functional, stakeholder, governance.",
  bridge: "Cross-functional + technical bridge cues (stakeholder, business + technical, integration).",
  leadership: "Words indicating ownership, accountability, strategy, lead, decision.",
  value: "Compensation floor signal based on the parsed salary minimum."
};

function safe(value) {
  return String(value || "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dollars(value) {
  if (!Number.isFinite(value) || value <= 0) return "Unknown";
  return `$${Math.round(value / 1000)}k`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function selectedJob() {
  return state.jobs.find((job) => job.id === state.selectedId) || null;
}

function parseSalary(label) {
  const values = String(label || "")
    .replace(/,/g, "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number) || [];
  if (!values.length) return null;
  const scaled = values.map((n) => (n < 1000 ? n * 1000 : n));
  return {
    min: Math.min(...scaled),
    max: Math.max(...scaled),
    label
  };
}

function bucketForScore(score) {
  if (score >= 75) return "apply_now";
  if (score >= 60) return "selective";
  return "skip";
}

function normalizeScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function statusOptions(statuses = [], selectedValue = "") {
  return statuses
    .map((status) => `<option value="${status}" ${status === selectedValue ? "selected" : ""}>${status}</option>`)
    .join("");
}

function unifiedStatuses() {
  if (!state.statusModel) return [];
  const interviewStatuses = state.statusModel.interviewStatus.filter((status) => status !== "waiting");
  return [
    ...state.statusModel.discoveryStatus,
    ...state.statusModel.applicationStatus,
    ...interviewStatuses
  ];
}

function getUnifiedStatus(job) {
  if (job.interviewStatus && job.interviewStatus !== "waiting") return job.interviewStatus;
  if (job.applicationStatus && job.applicationStatus !== "not_started") return job.applicationStatus;
  return job.discoveryStatus || "new";
}

function mapUnifiedStatusToModel(job, unifiedStatus) {
  const next = {
    discoveryStatus: job.discoveryStatus || "new",
    applicationStatus: job.applicationStatus || "not_started",
    interviewStatus: job.interviewStatus || "waiting"
  };

  if (state.statusModel?.discoveryStatus.includes(unifiedStatus)) {
    next.discoveryStatus = unifiedStatus;
    if (unifiedStatus === "not_a_fit") {
      next.applicationStatus = "rejected";
      next.interviewStatus = "closed";
    }
    return next;
  }

  if (state.statusModel?.applicationStatus.includes(unifiedStatus)) {
    next.applicationStatus = unifiedStatus;
    if (unifiedStatus === "applied" || unifiedStatus === "in_progress") {
      if (next.discoveryStatus === "new" || next.discoveryStatus === "researching") {
        next.discoveryStatus = "target";
      }
      if (next.interviewStatus === "closed") {
        next.interviewStatus = "waiting";
      }
    }
    if (unifiedStatus === "rejected") {
      next.interviewStatus = "closed";
    }
    return next;
  }

  if (state.statusModel?.interviewStatus.includes(unifiedStatus)) {
    next.interviewStatus = unifiedStatus;
    if (next.applicationStatus === "not_started" || next.applicationStatus === "in_progress") {
      next.applicationStatus = "applied";
    }
    if (next.discoveryStatus === "new" || next.discoveryStatus === "researching") {
      next.discoveryStatus = "target";
    }
    return next;
  }

  return next;
}

function countMatches(text, terms) {
  return terms.reduce((total, term) => (text.includes(term) ? total + 1 : total), 0);
}

function calculateScoreBreakdown(job) {
  const text = `${safe(job.title)} ${safe(job.summary)} ${safe(job.lane)} ${safe(job.company)}`.toLowerCase();
  const locationText = `${safe(job.location)} ${safe(job.locationType)} ${safe(job.workplace)}`.toLowerCase();
  const salaryMin = Number(job.salary?.min || 0);

  const nycTerms = ["nyc", "new york", "manhattan", "brooklyn", "queens", "bronx", "jersey city", "hoboken"];
  const locationScore = nycTerms.some((term) => locationText.includes(term))
    ? 20
    : locationText.includes("hybrid")
      ? 15
      : locationText.includes("remote")
        ? 10
        : 0;

  const domainHits = countMatches(text, [
    "retail", "commerce", "merchandising", "inventory", "allocation", "replenishment", "workflow", "enterprise"
  ]);
  const domainScore = Math.min(15, domainHits >= 3 ? 15 : domainHits * 5);

  const aiHits = countMatches(text, [
    "ai", "genai", "automation", "transformation", "modernization", "systems", "product"
  ]);
  const aiScore = Math.min(15, aiHits >= 3 ? 15 : aiHits * 5);

  const seniorityScore = /(senior|sr\.?|lead|manager|director|principal)/i.test(text)
    ? 10
    : /(associate|junior|intern)/i.test(text)
      ? 0
      : 5;

  const keywordHits = countMatches(text, [
    "product strategy", "roadmap", "cross-functional", "stakeholder", "requirements", "governance",
    "business process", "operating model", "program leadership", "adoption", "launch"
  ]);
  const keywordScore = Math.min(15, keywordHits * 2);

  const bridgeHits = countMatches(text, ["cross-functional", "stakeholder", "business", "technical", "integration"]);
  const bridgeScore = Math.min(10, bridgeHits >= 2 ? 10 : bridgeHits * 4);

  const leadershipHits = countMatches(text, ["lead", "owner", "ownership", "strategy", "decision", "accountability"]);
  const leadershipScore = Math.min(10, leadershipHits >= 2 ? 10 : leadershipHits * 4);

  const valueScore = salaryMin >= 180000 ? 5 : salaryMin >= 160000 ? 3 : 1;

  const categories = [
    { key: "location", value: locationScore, cap: 20 },
    { key: "domain", value: domainScore, cap: 15 },
    { key: "ai", value: aiScore, cap: 15 },
    { key: "seniority", value: seniorityScore, cap: 10 },
    { key: "keywords", value: keywordScore, cap: 15 },
    { key: "bridge", value: bridgeScore, cap: 10 },
    { key: "leadership", value: leadershipScore, cap: 10 },
    { key: "value", value: valueScore, cap: 5 }
  ];

  const total = normalizeScore(categories.reduce((sum, cat) => sum + cat.value, 0));
  return { categories, total };
}

function calculateAutoScore(job) {
  return calculateScoreBreakdown(job).total;
}

function visibleJobs() {
  return state.jobs.filter((job) => {
    if (!state.showClosed && job.postingStatus === "dead") return false;
    if (state.showHidden) return true;
    if (state.discoveryFilter === "not_a_fit") return true;
    return job.discoveryStatus !== "not_a_fit";
  });
}

function strategyFromInputs() {
  const roleFamilies = safe(el.strategyTargetsInput.value)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const keywords = safe(el.strategyKeywordsInput.value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    preferredMarket: safe(el.strategyMarketInput.value).trim(),
    minimumBaseSalaryUsd: Number(el.strategySalaryFloorInput.value || 0),
    maximumTravelPercent: Number(el.strategyTravelInput.value || 0),
    roleFamilies,
    keywords
  };
}

function fillStrategyInputs(strategy) {
  if (!strategy) return;
  el.strategyMarketInput.value = strategy.preferredMarket || "";
  el.strategySalaryFloorInput.value = Number.isFinite(strategy.minimumBaseSalaryUsd) ? strategy.minimumBaseSalaryUsd : "";
  el.strategyTravelInput.value = Number.isFinite(strategy.maximumTravelPercent) ? strategy.maximumTravelPercent : "";
  el.strategyTargetsInput.value = (strategy.roleFamilies || []).join("\n");
  el.strategyKeywordsInput.value = (strategy.keywords || []).join(", ");
}

function renderLookupResults() {
  if (!el.lookupResults) return;
  if (!state.lookupResults.length) {
    el.lookupResults.innerHTML = "<p class=\"muted\">No lookup results yet. Click Lookup new roles.</p>";
    return;
  }
  el.lookupResults.innerHTML = state.lookupResults.map((item, index) => `
    <article class="job-card">
      <div class="job-card-body">
        <h3>${escapeHtml(item.title)}</h3>
        <div class="meta">
          <span>${escapeHtml(item.company || "Unknown company")}</span>
          <span>${escapeHtml(item.location || "Unknown location")}</span>
          <span>${escapeHtml(item.source || "Web")}</span>
          <span class="pill">${item.fitScore || 0}</span>
        </div>
        <p>${escapeHtml(item.summary || "No summary available.")}</p>
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Open listing</a>` : ""}
      </div>
      <div class="actions">
        <button type="button" data-add-lookup="${index}">Add to Jobs</button>
      </div>
    </article>
  `).join("");
}

function renderProfile() {
  if (!state.profile) return;
  const profile = state.profile;
  const prefs = profile.preferences || {};
  const strategy = state.strategy || {};
  const preferredMarket = strategy?.preferredMarket || prefs.locationPreference?.preferredMarket || "Not set";
  const salaryFloor = Number.isFinite(strategy?.minimumBaseSalaryUsd) && strategy.minimumBaseSalaryUsd > 0
    ? strategy.minimumBaseSalaryUsd
    : prefs.compensation?.minimumBaseSalaryUsd || 0;
  const travelMax = Number.isFinite(strategy?.maximumTravelPercent) && strategy.maximumTravelPercent > 0
    ? strategy.maximumTravelPercent
    : prefs.travel?.maximumPercent || 0;
  const roleFamilies = Array.isArray(strategy?.roleFamilies) && strategy.roleFamilies.length
    ? strategy.roleFamilies.map((name) => ({ name }))
    : (profile.targetSearch?.roleFamilies || []);

  el.candidateName.textContent = profile.candidate?.displayName || "Local user";
  el.marketMetric.textContent = preferredMarket;
  el.salaryMetric.textContent = `${dollars(salaryFloor)} floor`;
  el.travelMetric.textContent = `${travelMax}% max`;
  el.targetCount.textContent = String(roleFamilies.length);

  el.roleFamilies.innerHTML = roleFamilies.length
    ? roleFamilies.map((family) => `
      <div class="job-card">
        <div>
          <h3>${escapeHtml(family.name)}</h3>
          <div class="meta">Target family</div>
        </div>
      </div>
    `).join("")
    : "<p class=\"muted\">No target families yet. Add them under Search strategy.</p>";

  el.guardrails.innerHTML = `
    <div><dt>Location</dt><dd>${escapeHtml(preferredMarket)}</dd></div>
    <div><dt>Salary</dt><dd>${dollars(salaryFloor)} minimum</dd></div>
    <div><dt>Travel</dt><dd>${travelMax}% max</dd></div>
    <div><dt>Type</dt><dd>${escapeHtml((prefs.employmentType?.allowed || []).join(", ") || "Not set")}</dd></div>
    <div><dt>Sponsor</dt><dd>${profile.candidate?.workAuthorization?.requiresSponsorship ? "Required" : "Not required"}</dd></div>
  `;
}

function renderStatusFilters() {
  if (!state.statusModel) return;
  const discoveryOptions = ["<option value=\"\">All</option>"]
    .concat(
      state.statusModel.discoveryStatus.map((status) => `<option value="${status}">${status}</option>`)
    )
    .join("");
  el.discoveryFilter.innerHTML = discoveryOptions;

  const applicationOptions = ["<option value=\"\">All</option>"]
    .concat(
      state.statusModel.applicationStatus.map((status) => `<option value="${status}">${status}</option>`)
    )
    .join("");
  el.applicationFilter.innerHTML = applicationOptions;

  el.discoveryStatusInput.innerHTML = state.statusModel.discoveryStatus
    .map((status) => `<option value="${status}">${status}</option>`)
    .join("");
  el.applicationStatusInput.innerHTML = state.statusModel.applicationStatus
    .map((status) => `<option value="${status}">${status}</option>`)
    .join("");
  el.interviewStatusInput.innerHTML = state.statusModel.interviewStatus
    .map((status) => `<option value="${status}">${status}</option>`)
    .join("");
}

async function applySavedViewFilter(filter) {
  state.search = safe(filter.search || "");
  state.discoveryFilter = safe(filter.discoveryStatus || "");
  state.applicationFilter = safe(filter.applicationStatus || "");
  state.showHidden = Boolean(filter.showHidden);
  el.searchInput.value = state.search;
  el.discoveryFilter.value = state.discoveryFilter;
  el.applicationFilter.value = state.applicationFilter;
  el.showHiddenToggle.checked = state.showHidden;
  await loadJobs();
}

function renderSavedViews() {
  if (!state.savedViews.length) {
    el.savedViewList.innerHTML = "<p class=\"muted\">No saved views yet. Filter the pipeline then click Save.</p>";
    return;
  }
  el.savedViewList.innerHTML = state.savedViews.map((view) => `
    <div class="job-card">
      <div>
        <strong>${escapeHtml(view.name)}</strong>
        <div class="meta">${new Date(view.updatedAt).toLocaleDateString()}</div>
      </div>
      <div class="actions">
        <button data-apply-view="${view.id}" type="button">Apply</button>
        <button data-delete-view="${view.id}" type="button">Delete</button>
      </div>
    </div>
  `).join("");
}

function pillForLiveness(status) {
  if (status === "live") return "<span class=\"pill live\">Live</span>";
  if (status === "dead") return "<span class=\"pill dead\">Closed</span>";
  return "<span class=\"pill subtle\">Unverified</span>";
}

function renderJobs() {
  const jobs = visibleJobs();
  const hiddenClosedCount = state.showClosed
    ? 0
    : state.jobs.filter((job) => job.postingStatus === "dead").length;
  const hiddenNotFitCount = state.showHidden
    ? 0
    : state.jobs.filter((job) => job.discoveryStatus === "not_a_fit").length;
  const summaryBits = [];
  if (hiddenClosedCount > 0) summaryBits.push(`${hiddenClosedCount} closed hidden`);
  if (hiddenNotFitCount > 0) summaryBits.push(`${hiddenNotFitCount} not-a-fit hidden`);
  const summarySuffix = summaryBits.length ? ` (${summaryBits.join(", ")})` : "";
  if (!jobs.length) {
    const hintBits = [];
    if (hiddenClosedCount > 0) {
      hintBits.push(`<button type="button" class="ghost-button" data-show-closed>Show ${hiddenClosedCount} closed posting${hiddenClosedCount === 1 ? "" : "s"}</button>`);
    }
    if (hiddenNotFitCount > 0) {
      hintBits.push(`<button type="button" class="ghost-button" data-show-hidden>Show ${hiddenNotFitCount} not-a-fit posting${hiddenNotFitCount === 1 ? "" : "s"}</button>`);
    }
    hintBits.push(`<button type="button" class="primary-button" data-open-add-job>+ Add job</button>`);
    const hintText = (hiddenClosedCount + hiddenNotFitCount) > 0
      ? `<p class="muted">Some postings are hidden by your filters. Bring them back, or add a new role.</p>`
      : `<p class="muted">Add your first role to start tracking.</p>`;
    el.jobList.innerHTML = `
      <div class="hub-card is-empty">
        <h3>No jobs in this view</h3>
        ${hintText}
        <div class="actions left">${hintBits.join("")}</div>
      </div>
    `;
    el.queueSummary.textContent = `0 roles${summarySuffix}`;
    state.selectedId = "";
    fillWorkspaceInputs();
    return;
  }
  if (!state.selectedId || !jobs.find((job) => job.id === state.selectedId)) {
    state.selectedId = jobs[0].id;
  }
  el.queueSummary.textContent = `${jobs.length} role${jobs.length === 1 ? "" : "s"} in view${summarySuffix}`;

  el.jobList.innerHTML = jobs.map((job) => {
    const salaryLabel = job.salary?.label || "Unknown comp";
    const selectedClass = job.id === state.selectedId ? "is-active" : "";
    const deadClass = job.postingStatus === "dead" ? "posting-dead" : "";
    const breakdown = calculateScoreBreakdown(job);
    const score = breakdown.total;
    const riskClass = score >= 75 ? "good" : score >= 60 ? "warn" : "bad";
    const tier = bucketForScore(score);
    const unifiedStatus = getUnifiedStatus(job);
    const unifiedStatusOptions = statusOptions(unifiedStatuses(), unifiedStatus);
    const isExpanded = job.id === state.selectedId;
    const breakdownExpanded = state.expandedBreakdowns.has(job.id);

    const breakdownRows = breakdown.categories.map((cat) => `
      <div class="score-breakdown-row" title="${escapeHtml(SCORE_CATEGORY_TOOLTIPS[cat.key] || "")}">
        <div>${escapeHtml(SCORE_CATEGORY_LABELS[cat.key] || cat.key)}</div>
        <div class="col-num">${cat.value}</div>
        <div class="col-num">/ ${cat.cap}</div>
        <div class="col-contrib">+${cat.value}</div>
      </div>
    `).join("");

    const statusPill = unifiedStatus.replace(/_/g, " ");
    const showLivenessPill = job.postingStatus === "dead" || job.postingStatus === "live";

    return `
      <article class="job-card ${selectedClass} ${deadClass}" data-job-id="${job.id}">
        <div class="job-card-body">
          <div class="job-card-row">
            <div>
              <h3>${escapeHtml(job.title)}</h3>
              <div class="meta">
                <span><strong>${escapeHtml(job.company)}</strong></span>
                <span>${escapeHtml(job.location || "Location unknown")}</span>
                <span>${escapeHtml(salaryLabel)}</span>
              </div>
            </div>
            <button type="button" class="toggle-detail" data-toggle-job="${job.id}">${isExpanded ? "Collapse" : "Expand"}</button>
          </div>
          <div class="meta">
            <span class="pill ${riskClass}">Score ${score}</span>
            <span class="pill tier-${tier}">${tier.replace("_", " ")}</span>
            <span class="pill">${escapeHtml(statusPill)}</span>
            ${showLivenessPill ? pillForLiveness(job.postingStatus) : ""}
            ${job.needsVerification ? "<span class=\"pill warn\">Re-verify</span>" : ""}
            ${job.stalePosting ? `<span class="pill warn">stale ${job.staleDays}d</span>` : ""}
            ${Number.isFinite(job.aiScore) && job.aiScore !== null
              ? `<span class="pill ai" title="AI match analysis">AI ${job.aiScore}${job.aiAnalysis?.tier ? ` &middot; ${escapeHtml(job.aiAnalysis.tier.replace(/_/g, " "))}` : ""}</span>`
              : ""}
            <span class="pill subtle">${escapeHtml(job.source || "Manual")}</span>
          </div>
        </div>
        <div class="job-card-detail ${isExpanded ? "" : "hidden"}">
          <p>${escapeHtml(job.summary || "No summary yet.")}</p>
          <div class="meta">
            <span>Next: ${escapeHtml(job.nextAction || "Not set")}</span>
            <span>Due: ${escapeHtml(job.dueDate || "Not set")}</span>
          </div>
          <div class="meta-line">
            ${job.roleUrl ? `<a href="${escapeHtml(job.roleUrl)}" target="_blank" rel="noreferrer">Open posting</a>` : "<span class=\"muted small\">No posting URL</span>"}
            <span class="liveness">
              <span class="liveness-label">Still live?</span>
              <select data-liveness-select data-job-id="${job.id}">
                <option value="unknown" ${job.postingStatus === "unknown" ? "selected" : ""}>Unknown</option>
                <option value="live" ${job.postingStatus === "live" ? "selected" : ""}>Live</option>
                <option value="dead" ${job.postingStatus === "dead" ? "selected" : ""}>Dead</option>
              </select>
            </span>
            ${job.postingCheckedAt ? `<span class="muted small">Checked ${new Date(job.postingCheckedAt).toLocaleDateString()}</span>` : ""}
          </div>
          <div class="card-actions">
            <button type="button" class="primary-button" data-edit-in-activity="${job.id}">Edit triage below</button>
            <button type="button" class="ghost-button" data-job-action="${job.discoveryStatus === "not_a_fit" ? "restore" : "hide"}" data-job-id="${job.id}">
              ${job.discoveryStatus === "not_a_fit" ? "Unhide" : "Not interested"}
            </button>
          </div>
          <div class="meta-line">
            <button type="button" class="score-breakdown-toggle" data-toggle-breakdown="${job.id}">${breakdownExpanded ? "Hide" : "Why this score?"}</button>
          </div>
          <div class="score-breakdown ${breakdownExpanded ? "" : "hidden"}" data-breakdown="${job.id}">
            <div class="score-breakdown-row head">
              <div>Category</div>
              <div class="col-num">Score</div>
              <div class="col-num">Cap</div>
              <div class="col-contrib">Contribution</div>
            </div>
            ${breakdownRows}
            <div class="score-breakdown-row total">
              <div>Total</div>
              <div class="col-num">${score}</div>
              <div class="col-num">/ 100</div>
              <div class="col-contrib">${score}</div>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join("");

  fillWorkspaceInputs();
}

function fillWorkspaceInputs() {
  const job = selectedJob();
  const panel = document.getElementById("activityPanel");
  if (!job) {
    if (el.selectedJobLabel) el.selectedJobLabel.textContent = "No job selected. Click a job above to begin.";
    if (panel) panel.classList.add("is-disabled");
    return;
  }
  if (panel) panel.classList.remove("is-disabled");
  if (el.selectedJobLabel) {
    el.selectedJobLabel.textContent = `Editing: ${job.company} - ${job.title}`;
  }
  const score = calculateAutoScore(job);
  el.scoreInput.value = String(score);
  el.scoreInput.readOnly = true;
  el.priorityTierInput.value = bucketForScore(score);
  el.scoreNotesInput.value = job.scoreNotes || "";
  el.discoveryStatusInput.value = job.discoveryStatus || "new";
  el.applicationStatusInput.value = job.applicationStatus || "not_started";
  el.interviewStatusInput.value = job.interviewStatus || "waiting";
  el.nextActionInput.value = job.nextAction || "";
  el.dueDateInput.value = job.dueDate || "";
}

function showToast(message, kind = "ok") {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${kind}`;
  toast.textContent = message;
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-show"));
  setTimeout(() => {
    toast.classList.remove("toast-show");
    setTimeout(() => toast.remove(), 240);
  }, 2400);
}

function scrollActivityIntoView() {
  const panel = document.getElementById("activityPanel");
  if (!panel) return;
  requestAnimationFrame(() => {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    panel.classList.add("just-focused");
    setTimeout(() => panel.classList.remove("just-focused"), 900);
  });
}

function setActivityTab(tabName) {
  document.querySelectorAll("[data-activity-tab]").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.activityTab === tabName);
  });
  document.querySelectorAll("[data-activity-pane]").forEach((pane) => {
    pane.classList.toggle("hidden", pane.dataset.activityPane !== tabName);
  });
}

function renderMetrics() {
  if (!state.metrics) {
    el.metricCards.innerHTML = "<p class=\"muted\">No metrics loaded.</p>";
    return;
  }
  const m = state.metrics;
  const cards = [
    { label: "This week applications", value: m.weekly.applications },
    { label: "This week screens", value: m.weekly.screens },
    { label: "This week interviews", value: m.weekly.interviews },
    { label: "Overdue follow-ups", value: m.followups.overdue },
    { label: "Response rate", value: `${m.conversion.responseRate}%` },
    { label: "Interview rate", value: `${m.conversion.interviewRate}%` },
    { label: "Discovery: target", value: m.discovery.target || 0 },
    { label: "Applied", value: m.application.applied || 0 }
  ];
  el.metricCards.innerHTML = cards.map((card) => `
    <div class="job-card">
      <div>
        <div class="meta">${escapeHtml(card.label)}</div>
        <h3>${escapeHtml(String(card.value))}</h3>
      </div>
    </div>
  `).join("");
}

function renderReminders() {
  if (!state.reminders.length) {
    el.reminderList.innerHTML = "<p class=\"muted\">No reminders due right now.</p>";
    return;
  }
  el.reminderList.innerHTML = state.reminders.map((item) => `
    <article class="reminder-card">
      <div class="meta">
        <span class="pill ${item.severity === "high" ? "bad" : item.severity === "medium" ? "warn" : "subtle"}">${item.severity}</span>
        <span>${escapeHtml(item.type)}</span>
        <span>Due: ${escapeHtml(item.dueDate)}</span>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p class="muted small">${escapeHtml(item.detail)}</p>
      <div class="actions">
        <button type="button" data-reminder-action="snooze" data-reminder-key="${encodeURIComponent(item.key)}">Snooze 1 day</button>
        <button type="button" data-reminder-action="complete" data-reminder-key="${encodeURIComponent(item.key)}">Complete</button>
      </div>
    </article>
  `).join("");
}

function renderStrategyPerformance() {
  const sourceRows = state.strategyPerformance?.sources || [];
  const savedRows = state.strategyPerformance?.savedViews || [];

  if (!sourceRows.length) {
    el.sourcePerformanceList.innerHTML = "<p class=\"muted\">No source data yet. Add and apply to a few roles, then check back.</p>";
  } else {
    el.sourcePerformanceList.innerHTML = sourceRows.map((row) => `
      <div class="job-card">
        <div>
          <h3>${escapeHtml(row.source)}</h3>
          <div class="meta">
            <span>Sourced: ${row.sourced}</span>
            <span>Applied: ${row.applied}</span>
            <span>Response: ${row.responseRate}%</span>
            <span>Interview: ${row.interviewRate}%</span>
          </div>
        </div>
        ${row.underperforming ? "<span class=\"pill bad\">underperforming</span>" : "<span class=\"pill good\">healthy</span>"}
      </div>
    `).join("");
  }

  if (!savedRows.length) {
    el.savedSearchPerformanceList.innerHTML = "<p class=\"muted\">No saved-view performance yet.</p>";
    return;
  }
  el.savedSearchPerformanceList.innerHTML = savedRows.map((row) => `
    <div class="job-card">
      <div>
        <h3>${escapeHtml(row.name)}</h3>
        <div class="meta">
          <span>Matched: ${row.matched}</span>
          <span>Applied: ${row.applied}</span>
          <span>Screens: ${row.screens}</span>
          <span>Screen rate: ${row.screenRate}%</span>
        </div>
      </div>
      ${row.underperforming ? "<span class=\"pill bad\">underperforming</span>" : "<span class=\"pill good\">healthy</span>"}
    </div>
  `).join("");
}

function renderTab() {
  document.querySelectorAll("[data-section]").forEach((section) => {
    const match = section.dataset.section === state.tab;
    section.classList.toggle("hidden", !match);
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === state.tab);
  });
  document.querySelectorAll("[data-section-when]").forEach((panel) => {
    const match = panel.dataset.sectionWhen === state.tab;
    panel.classList.toggle("hidden", !match);
  });
}

/* =========== TODAY HUB =========== */

function jobsAwaitingScoring() {
  return state.jobs.filter((job) => {
    if (job.discoveryStatus === "not_a_fit") return false;
    if (job.applicationStatus === "applied" || job.applicationStatus === "rejected") return false;
    return job.score < 60;
  });
}

function jobsToVerify() {
  return state.jobs.filter((job) => job.needsVerification && job.postingStatus !== "dead");
}

function jobsWithUpcomingDueDates() {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 7);
  const horizonIso = horizon.toISOString().slice(0, 10);
  return state.jobs
    .filter((job) => job.dueDate && job.dueDate >= today && job.dueDate <= horizonIso)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
}

function renderTodayHub() {
  const today = new Date();
  el.todayDateLabel.textContent = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

  if (state.showStartHere) {
    el.startHerePanel.classList.remove("hidden");
  } else {
    el.startHerePanel.classList.add("hidden");
  }

  const highReminders = state.reminders.filter((item) => item.severity === "high");
  const mediumReminders = state.reminders.filter((item) => item.severity === "medium");
  const toScore = jobsAwaitingScoring();
  const toVerify = jobsToVerify();
  const upcoming = jobsWithUpcomingDueDates();

  const cards = [
    {
      title: "Outreach due",
      tone: "high",
      count: highReminders.length,
      items: highReminders.slice(0, 4).map((r) => ({
        jobId: r.jobId,
        label: `${r.detail} - ${r.title}`
      })),
      emptyMsg: "No urgent outreach right now.",
      tab: "insights"
    },
    {
      title: "Follow-ups + overdue",
      tone: "medium",
      count: mediumReminders.length + state.reminders.filter((r) => r.severity === "low" && r.type !== "verify_posting").length,
      items: [...mediumReminders, ...state.reminders.filter((r) => r.severity === "low" && r.type !== "verify_posting")]
        .slice(0, 4)
        .map((r) => ({ jobId: r.jobId, label: `${r.detail} - ${r.title}` })),
      emptyMsg: "Nothing overdue.",
      tab: "insights"
    },
    {
      title: "Awaiting triage",
      tone: "medium",
      count: toScore.length,
      items: toScore.slice(0, 4).map((j) => ({
        jobId: j.id,
        label: `${j.company} - ${j.title} (score ${j.score})`
      })),
      emptyMsg: "Every active role is triaged.",
      tab: "pipeline"
    },
    {
      title: "Postings to re-verify",
      tone: "low",
      count: toVerify.length,
      items: toVerify.slice(0, 4).map((j) => ({
        jobId: j.id,
        label: `${j.company} - ${j.title}`
      })),
      emptyMsg: "All postings recently verified.",
      tab: "pipeline"
    },
    {
      title: "Due this week",
      tone: "low",
      count: upcoming.length,
      items: upcoming.slice(0, 4).map((j) => ({
        jobId: j.id,
        label: `${j.company} - ${j.title} (${j.dueDate})`
      })),
      emptyMsg: "No upcoming due dates this week.",
      tab: "pipeline"
    }
  ];

  const totalAttention = cards.reduce((sum, card) => sum + card.count, 0);
  if (totalAttention === 0 && state.jobs.length > 0) {
    el.todayHub.innerHTML = `
      <div class="hub-card tone-low all-clear">
        <div class="hub-card-head">
          <h3>All clear</h3>
          <div class="hub-count" style="color: var(--good); text-shadow: 0 0 16px rgba(92,255,177,0.4);">0</div>
        </div>
        <p class="muted small">Nothing demands your attention right now. Use Pipeline to keep moving, or add a new role.</p>
      </div>
    `;
    return;
  }

  el.todayHub.innerHTML = cards.map((card) => `
    <div class="hub-card ${card.count === 0 ? "is-empty" : ""} tone-${card.tone}">
      <div class="hub-card-head">
        <h3>${escapeHtml(card.title)}</h3>
        <div class="hub-count">${card.count}</div>
      </div>
      ${card.items.length ? `
        <ul class="hub-list">
          ${card.items.map((item) => `
            <li>
              ${item.jobId
                ? `<button type="button" class="hub-link" data-go-to-job="${item.jobId}">${escapeHtml(item.label)}</button>`
                : `<span>${escapeHtml(item.label)}</span>`}
            </li>
          `).join("")}
        </ul>
      ` : `<p class="hub-empty">${escapeHtml(card.emptyMsg)}</p>`}
    </div>
  `).join("");
}

/* =========== LOADERS =========== */

async function loadJobs() {
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  if (state.discoveryFilter) params.set("discoveryStatus", state.discoveryFilter);
  if (state.applicationFilter) params.set("applicationStatus", state.applicationFilter);
  const payload = await api(`/api/jobs?${params.toString()}`);
  state.jobs = payload.jobs;
  renderJobs();
  renderTodayHub();
}

async function loadSavedViews() {
  const payload = await api("/api/saved-views");
  state.savedViews = payload.savedViews;
  renderSavedViews();
}

async function loadMetrics() {
  state.metrics = await api("/api/metrics/summary?days=7");
  renderMetrics();
}

async function loadReminders() {
  const payload = await api("/api/reminders");
  state.reminders = payload.reminders || [];
  renderReminders();
  renderTodayHub();
}

async function loadStrategyPerformance() {
  state.strategyPerformance = await api("/api/metrics/strategy-performance");
  renderStrategyPerformance();
}

async function loadLlmSettings() {
  const settings = await api("/api/settings/llm");
  el.llmEndpointInput.value = settings.endpoint || "";
  el.llmModelInput.value = settings.model || "openai.gpt-4.1-mini";
}

async function loadStrategy() {
  const strategy = await api("/api/strategy");
  state.strategy = strategy;
  fillStrategyInputs(strategy);
  el.strategySummary.textContent = `Market: ${strategy.preferredMarket || "unset"} | Salary floor: ${dollars(strategy.minimumBaseSalaryUsd)} | Travel: ${strategy.maximumTravelPercent || 0}% | Keywords: ${(strategy.keywords || []).length}`;
  state.lookupResults = [];
  renderLookupResults();
  renderProfile();
}

async function loadNotesContactsEvents() {
  const job = selectedJob();
  if (!job) {
    el.noteList.innerHTML = "<p class=\"muted\">Select a job to see notes.</p>";
    el.contactList.innerHTML = "<p class=\"muted\">Select a job to see contacts.</p>";
    el.eventList.innerHTML = "<p class=\"muted\">Select a job to see events.</p>";
    return;
  }
  const [notesPayload, contactsPayload, eventsPayload] = await Promise.all([
    api(`/api/jobs/${job.id}/notes`),
    api(`/api/jobs/${job.id}/contacts`),
    api(`/api/jobs/${job.id}/events`)
  ]);
  el.noteList.innerHTML = (notesPayload.notes || []).length
    ? (notesPayload.notes || []).map((note) => `
      <div class="job-card"><div><div>${escapeHtml(note.note)}</div><div class="meta">${escapeHtml(note.note_type)} - ${new Date(note.created_at).toLocaleString()}</div></div></div>
    `).join("")
    : "<p class=\"muted\">No notes yet. Add one above.</p>";

  el.contactList.innerHTML = (contactsPayload.contacts || []).length
    ? (contactsPayload.contacts || []).map((contact) => `
      <div class="job-card"><div><strong>${escapeHtml(contact.name)}</strong><div class="meta">${escapeHtml(contact.contact_type)} ${contact.email ? `- ${escapeHtml(contact.email)}` : ""}</div></div></div>
    `).join("")
    : "<p class=\"muted\">No contacts yet.</p>";

  el.eventList.innerHTML = (eventsPayload.events || []).length
    ? (eventsPayload.events || []).map((event) => `
      <div class="job-card"><div><strong>${escapeHtml(event.event_type)}</strong><div class="meta">${escapeHtml(event.event_date)} ${event.details ? `- ${escapeHtml(event.details)}` : ""}</div></div></div>
    `).join("")
    : "<p class=\"muted\">No events yet. Log application, outreach, interview here.</p>";
}

/* =========== MODALS =========== */

function openModal(modalEl) {
  modalEl.classList.remove("hidden");
}

function closeModal(modalEl) {
  modalEl.classList.add("hidden");
}

function setAddJobMode(mode) {
  document.querySelectorAll("[data-add-mode]").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.addMode === mode);
  });
  document.querySelectorAll("[data-add-pane]").forEach((pane) => {
    pane.classList.toggle("hidden", pane.dataset.addPane !== mode);
  });
}

/* =========== DEEP RESEARCH PROMPT =========== */

function renderResearchPromptText() {
  if (!el.researchPromptSelect || !el.researchPromptText) return;
  const selected = state.researchPrompts.find(
    (prompt) => prompt.id === el.researchPromptSelect.value
  );
  el.researchPromptText.value = selected ? selected.content : "";
}

async function loadResearchPrompts() {
  if (!el.researchPromptSelect) return;
  try {
    const payload = await api("/api/research/prompts");
    state.researchPrompts = Array.isArray(payload.prompts) ? payload.prompts : [];
  } catch {
    state.researchPrompts = [];
  }

  if (!state.researchPrompts.length) {
    if (el.researchPromptBlock) el.researchPromptBlock.classList.add("hidden");
    return;
  }

  if (el.researchPromptBlock) el.researchPromptBlock.classList.remove("hidden");
  el.researchPromptSelect.innerHTML = state.researchPrompts
    .map((prompt) => `<option value="${escapeHtml(prompt.id)}">${escapeHtml(prompt.title)}</option>`)
    .join("");
  el.researchPromptSelect.classList.toggle("hidden", state.researchPrompts.length < 2);
  renderResearchPromptText();
}

async function handleCopyResearchPrompt() {
  const text = el.researchPromptText?.value || "";
  if (!text) {
    el.researchPromptStatus.textContent = "No prompt to copy.";
    return;
  }
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    copied = false;
  }
  if (!copied) {
    el.researchPromptText.removeAttribute("readonly");
    el.researchPromptText.focus();
    el.researchPromptText.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    el.researchPromptText.setAttribute("readonly", "readonly");
    window.getSelection()?.removeAllRanges();
  }
  el.researchPromptStatus.textContent = copied
    ? "Copied. Paste it into your deep-research tool, then bring the results back here."
    : "Copy failed. Select the text manually and copy with Ctrl+C.";
}

/* =========== MARKDOWN IMPORT =========== */

function renderMarkdownPreview() {
  if (!state.markdownPreview.length) {
    el.markdownPreview.innerHTML = "";
    el.markdownPreviewActions.classList.add("hidden");
    return;
  }
  el.markdownPreview.innerHTML = state.markdownPreview.map((item, index) => {
    const dupHtml = item.duplicates && item.duplicates.length
      ? `<div class="meta"><span class="pill warn">Possible duplicate: ${item.duplicates.map((d) => escapeHtml(d.job.company + " - " + d.job.title)).join("; ")}</span></div>`
      : "";
    return `
      <div class="preview-card ${item.duplicates?.length ? "is-duplicate" : ""}">
        <label>
          <input type="checkbox" data-preview-index="${index}" ${item.selected ? "checked" : ""}>
          <strong>${escapeHtml(item.company)} - ${escapeHtml(item.title)}</strong>
        </label>
        <div class="preview-meta">
          ${item.location ? `<span>${escapeHtml(item.location)}</span>` : ""}
          ${item.salaryLabel ? `<span>${escapeHtml(item.salaryLabel)}</span>` : ""}
          ${item.source ? `<span>${escapeHtml(item.source)}</span>` : ""}
          ${item.roleUrl ? `<a href="${escapeHtml(item.roleUrl)}" target="_blank" rel="noreferrer">URL</a>` : ""}
        </div>
        ${item.summary ? `<div class="preview-summary">${escapeHtml(item.summary)}</div>` : ""}
        ${dupHtml}
      </div>
    `;
  }).join("");
  el.markdownPreviewActions.classList.remove("hidden");
}

function looksLikeCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) return false;
  const firstLine = lines[0];
  if (firstLine.includes("|")) return false;
  const cells = firstLine.split(",").map((part) => part.trim());
  if (cells.length < 2 || cells.length > 20) return false;
  if (cells.some((cell) => cell.length > 40)) return false;
  const headers = cells.map((cell) => cell.toLowerCase());
  const hasCompany = headers.some((header) => /\b(company|employer|organi[sz]ation|org)\b/.test(header));
  const hasTitle = headers.some((header) => /\b(title|role|position)\b/.test(header));
  return hasCompany && hasTitle;
}

async function parseCsvText(text) {
  const csv = String(text || "").trim();
  if (!csv) {
    el.markdownStatus.textContent = "Paste CSV or upload a .csv file first.";
    return;
  }
  el.markdownStatus.textContent = "Parsing CSV...";
  el.parseMarkdownButton.disabled = true;
  try {
    const payload = await api("/api/import/csv", {
      method: "POST",
      body: JSON.stringify({ csv })
    });
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    state.markdownPreview = jobs.map((j) => ({ ...j, selected: !(j.duplicates && j.duplicates.length) }));
    el.markdownStatus.textContent = jobs.length
      ? `Parsed ${jobs.length} job${jobs.length === 1 ? "" : "s"} from CSV. Review and add selected.`
      : "No rows detected. Make sure your CSV has company and title/role columns.";
    renderMarkdownPreview();
  } catch (error) {
    const detail = error.payload?.detail ? `\n${error.payload.detail}` : "";
    el.markdownStatus.textContent = `${error.message}${detail}`;
    state.markdownPreview = [];
    renderMarkdownPreview();
  } finally {
    el.parseMarkdownButton.disabled = false;
  }
}

async function handleParseMarkdown() {
  const markdown = el.markdownTextarea.value.trim();
  if (!markdown) {
    el.markdownStatus.textContent = "Paste markdown/CSV or upload a .md or .csv file first.";
    return;
  }
  if (looksLikeCsv(markdown)) {
    await parseCsvText(markdown);
    return;
  }
  el.markdownStatus.textContent = "Parsing with LLM, this can take a few seconds...";
  el.parseMarkdownButton.disabled = true;
  try {
    const payload = await api("/api/import/markdown", {
      method: "POST",
      body: JSON.stringify({ markdown })
    });
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    state.markdownPreview = jobs.map((j) => ({ ...j, selected: !(j.duplicates && j.duplicates.length) }));
    el.markdownStatus.textContent = jobs.length
      ? `Extracted ${jobs.length} job${jobs.length === 1 ? "" : "s"}. Review and add selected.`
      : "No jobs detected. Try adjusting the markdown.";
    renderMarkdownPreview();
  } catch (error) {
    const detail = error.payload?.detail ? `\n${error.payload.detail}` : "";
    el.markdownStatus.textContent = `${error.message}${detail}`;
    state.markdownPreview = [];
    renderMarkdownPreview();
  } finally {
    el.parseMarkdownButton.disabled = false;
  }
}

async function handleAddSelectedMarkdown() {
  const selected = state.markdownPreview.filter((item) => item.selected);
  if (!selected.length) {
    el.markdownStatus.textContent = "Select at least one job to add.";
    return;
  }
  el.markdownStatus.textContent = `Adding ${selected.length} job${selected.length === 1 ? "" : "s"}...`;
  el.addSelectedMarkdownButton.disabled = true;
  let added = 0;
  let skipped = 0;
  for (const item of selected) {
    const salary = parseSalary(item.salaryLabel);
    const job = {
      source: item.source || "Deep Research",
      company: item.company,
      title: item.title,
      roleUrl: item.roleUrl || "",
      location: item.location || "",
      summary: item.summary || "",
      salary,
      discoveryStatus: "new",
      applicationStatus: "not_started",
      interviewStatus: "waiting",
      nextAction: "Review and score role",
      confirmDuplicate: Boolean(item.duplicates && item.duplicates.length)
    };
    const score = calculateAutoScore({ ...job, salary });
    job.score = score;
    job.priorityTier = bucketForScore(score);
    try {
      await api("/api/jobs", { method: "POST", body: JSON.stringify(job) });
      added += 1;
    } catch (error) {
      if (error.status === 409) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }
  el.markdownStatus.textContent = `Added ${added}, skipped ${skipped} duplicates.`;
  state.markdownPreview = [];
  renderMarkdownPreview();
  el.markdownTextarea.value = "";
  await loadJobs();
  el.addSelectedMarkdownButton.disabled = false;
}

/* =========== AI ASSIST =========== */

function aiList(title, items) {
  if (!items || !items.length) return "";
  return `<div class="ai-list"><strong>${escapeHtml(title)}</strong><ul>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul></div>`;
}

function renderFitAnalysis(analysis) {
  if (!analysis) {
    el.fitAnalysisCard.classList.add("hidden");
    return;
  }
  const score = Number(analysis.score || 0);
  const tier = analysis.tier || (score >= 75 ? "apply_now" : score >= 60 ? "selective" : "skip");
  const riskClass = score >= 75 ? "good" : score >= 60 ? "warn" : "bad";
  el.fitScorePill.className = `pill ${riskClass}`;
  el.fitScorePill.textContent = `AI score ${score}`;
  el.fitTierPill.className = `pill tier-${tier}`;
  el.fitTierPill.textContent = tier.replace(/_/g, " ");
  el.fitAnalysisBody.innerHTML = `
    ${analysis.rationale ? `<p>${escapeHtml(analysis.rationale)}</p>` : ""}
    ${aiList("Fit hooks", analysis.fitHooks)}
    ${aiList("Risks", analysis.risks)}
    ${aiList("Keyword gaps", analysis.keywordGaps)}
  `;
  el.fitAnalysisCard.classList.remove("hidden");
}

function renderJdResult(extracted) {
  if (!extracted) {
    el.jdResultCard.classList.add("hidden");
    return;
  }
  const metaBits = [extracted.seniority, extracted.location, extracted.salaryLabel]
    .filter(Boolean)
    .map((bit) => `<span>${escapeHtml(bit)}</span>`)
    .join("");
  el.jdResultBody.innerHTML = `
    ${(extracted.title || extracted.company)
      ? `<h4>${escapeHtml([extracted.title, extracted.company].filter(Boolean).join(" - "))}</h4>`
      : ""}
    ${metaBits ? `<div class="meta">${metaBits}</div>` : ""}
    ${extracted.summary ? `<p>${escapeHtml(extracted.summary)}</p>` : ""}
    ${aiList("Responsibilities", extracted.responsibilities)}
    ${aiList("Qualifications", extracted.qualifications)}
    ${aiList("Keywords", extracted.keywords)}
    ${aiList("Red flags", extracted.redFlags)}
  `;
  el.jdResultCard.classList.remove("hidden");
}

/* =========== EVENTS =========== */

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      state.tab = tab.dataset.tab;
      renderTab();
      if (state.tab === "pipeline") {
        await loadNotesContactsEvents();
      }
      if (state.tab === "insights") {
        await Promise.all([loadMetrics(), loadReminders(), loadStrategyPerformance()]);
      }
      if (state.tab === "today") {
        renderTodayHub();
      }
    });
  });

  el.searchInput.addEventListener("input", async (event) => {
    state.search = event.target.value.trim();
    await loadJobs();
  });

  el.discoveryFilter.addEventListener("change", async (event) => {
    state.discoveryFilter = event.target.value;
    await loadJobs();
  });

  el.applicationFilter.addEventListener("change", async (event) => {
    state.applicationFilter = event.target.value;
    await loadJobs();
  });

  el.showClosedToggle.addEventListener("change", (event) => {
    state.showClosed = event.target.checked;
    renderJobs();
  });

  el.showHiddenToggle.addEventListener("change", (event) => {
    state.showHidden = event.target.checked;
    renderJobs();
  });

  el.saveStrategyButton.addEventListener("click", async () => {
    const strategy = strategyFromInputs();
    state.strategy = await api("/api/strategy", {
      method: "PUT",
      body: JSON.stringify(strategy)
    });
    fillStrategyInputs(state.strategy);
    el.strategySummary.textContent = `Saved strategy for ${state.strategy.preferredMarket || "any market"} (${(state.strategy.roleFamilies || []).length} target families).`;
    renderProfile();
  });

  el.lookupJobsButton.addEventListener("click", async () => {
    const strategy = strategyFromInputs();
    const payload = await api("/api/research/jobs", {
      method: "POST",
      body: JSON.stringify({ strategy, limit: 20 })
    });
    state.lookupResults = payload.results || [];
    renderLookupResults();
  });

  el.lookupResults.addEventListener("click", async (event) => {
    const indexText = event.target.getAttribute("data-add-lookup");
    if (indexText === null) return;
    const item = state.lookupResults[Number(indexText)];
    if (!item) return;
    const score = normalizeScore(Number(item.fitScore || 0));
    const payload = {
      source: item.source || "Lookup",
      company: item.company || "Unknown",
      title: item.title || "Untitled role",
      roleUrl: item.url || "",
      location: item.location || "",
      lane: (state.strategy?.roleFamilies || [])[0] || "",
      summary: item.summary || "",
      score,
      priorityTier: bucketForScore(score),
      discoveryStatus: "new",
      applicationStatus: "not_started",
      interviewStatus: "waiting",
      nextAction: "Review imported role"
    };
    try {
      await api("/api/jobs", { method: "POST", body: JSON.stringify(payload) });
    } catch (error) {
      if (error.status === 409) {
        const summary = (error.payload?.duplicates || [])
          .map((d) => `${d.job.company} - ${d.job.title}`).join("\n");
        if (!window.confirm(`Possible duplicate detected:\n${summary}\n\nAdd anyway?`)) return;
        await api("/api/jobs", { method: "POST", body: JSON.stringify({ ...payload, confirmDuplicate: true }) });
      } else {
        throw error;
      }
    }
    await loadJobs();
  });

  el.jobList.addEventListener("click", async (event) => {
    if (event.target.closest("a")) return;

    const openAddJob = event.target.closest("[data-open-add-job]");
    if (openAddJob) {
      openModal(el.addJobModal);
      setAddJobMode("manual");
      return;
    }

    if (event.target.closest("[data-show-closed]")) {
      state.showClosed = true;
      if (el.showClosedToggle) el.showClosedToggle.checked = true;
      renderJobs();
      return;
    }

    if (event.target.closest("[data-show-hidden]")) {
      state.showHidden = true;
      if (el.showHiddenToggle) el.showHiddenToggle.checked = true;
      renderJobs();
      return;
    }

    const actionButton = event.target.closest("[data-job-action]");
    const action = actionButton?.getAttribute("data-job-action");
    const actionJobId = actionButton?.getAttribute("data-job-id");
    if (action && actionJobId) {
      const actionJob = state.jobs.find((job) => job.id === actionJobId);
      if (!actionJob) return;
      const restore = action === "restore";
      await api(`/api/jobs/${actionJobId}`, {
        method: "PATCH",
        body: JSON.stringify({
          score: calculateAutoScore(actionJob),
          priorityTier: bucketForScore(calculateAutoScore(actionJob)),
          discoveryStatus: restore ? "researching" : "not_a_fit",
          applicationStatus: restore ? "not_started" : "rejected",
          interviewStatus: restore ? "waiting" : "closed"
        })
      });
      if (!restore && !state.showHidden) {
        state.selectedId = "";
      } else {
        state.selectedId = actionJobId;
      }
      await loadJobs();
      return;
    }

    const breakdownButton = event.target.closest("[data-toggle-breakdown]");
    if (breakdownButton) {
      const id = breakdownButton.getAttribute("data-toggle-breakdown");
      if (state.expandedBreakdowns.has(id)) state.expandedBreakdowns.delete(id);
      else state.expandedBreakdowns.add(id);
      renderJobs();
      return;
    }

    const toggleButton = event.target.closest("[data-toggle-job]");
    const toggleJobId = toggleButton?.getAttribute("data-toggle-job");
    if (toggleJobId) {
      const wasSelected = state.selectedId === toggleJobId;
      state.selectedId = wasSelected ? "" : toggleJobId;
      renderJobs();
      if (state.tab === "pipeline") await loadNotesContactsEvents();
      if (!wasSelected) scrollActivityIntoView();
      return;
    }

    if (event.target.closest("[data-liveness-select]")) return;

    const editInActivity = event.target.closest("[data-edit-in-activity]");
    if (editInActivity) {
      const jobId = editInActivity.getAttribute("data-edit-in-activity");
      state.selectedId = jobId;
      renderJobs();
      if (state.tab === "pipeline") await loadNotesContactsEvents();
      scrollActivityIntoView();
      setActivityTab("triage");
      return;
    }

    const card = event.target.closest("[data-job-id]");
    if (!card) return;
    const wasSelected = state.selectedId === card.dataset.jobId;
    state.selectedId = wasSelected ? "" : card.dataset.jobId;
    renderJobs();
    if (state.tab === "pipeline") await loadNotesContactsEvents();
    if (!wasSelected) scrollActivityIntoView();
  });

  el.jobList.addEventListener("change", async (event) => {
    if (event.target?.matches("[data-liveness-select]")) {
      const jobId = event.target.getAttribute("data-job-id");
      const value = event.target.value;
      try {
        await api(`/api/jobs/${jobId}`, {
          method: "PATCH",
          body: JSON.stringify({ postingStatus: value })
        });
        await loadJobs();
        await loadReminders();
        showToast(`Marked posting ${value}`, value === "dead" ? "warn" : "ok");
      } catch (error) {
        showToast(`Update failed: ${error.message}`, "error");
      }
    }
  });

  el.addJobForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const source = document.querySelector("#newSource")?.value?.trim() || "Manual";
    const company = document.querySelector("#newCompany").value.trim();
    const title = document.querySelector("#newTitle").value.trim();
    if (!company || !title) return;
    const roleUrl = document.querySelector("#newRoleUrl").value.trim();
    const location = document.querySelector("#newLocation").value.trim();
    const salaryLabel = document.querySelector("#newSalary").value.trim();
    const lane = document.querySelector("#newLane").value.trim();
    const summary = document.querySelector("#newSummary").value.trim();
    const salary = parseSalary(salaryLabel);
    const score = calculateAutoScore({ company, title, lane, summary, location, salary });
    const priorityTier = bucketForScore(score);
    const body = {
      source,
      company,
      title,
      roleUrl,
      location,
      lane,
      summary,
      salary,
      score,
      priorityTier,
      discoveryStatus: "new",
      applicationStatus: "not_started",
      interviewStatus: "waiting",
      nextAction: "Review and score role"
    };
    try {
      await api("/api/jobs", { method: "POST", body: JSON.stringify(body) });
    } catch (error) {
      if (error.status === 409) {
        const summary = (error.payload?.duplicates || [])
          .map((d) => `${d.job.company} - ${d.job.title}`).join("\n");
        if (!window.confirm(`Possible duplicate detected:\n${summary}\n\nSave anyway?`)) return;
        await api("/api/jobs", { method: "POST", body: JSON.stringify({ ...body, confirmDuplicate: true }) });
      } else {
        throw error;
      }
    }
    event.target.reset();
    closeModal(el.addJobModal);
    await loadJobs();
  });

  el.saveTriageButton.addEventListener("click", async () => {
    const job = selectedJob();
    if (!job) {
      showToast("Select a job from the pipeline first.", "warn");
      return;
    }
    const score = calculateAutoScore(job);
    const priorityTier = el.priorityTierInput.value || bucketForScore(score);
    try {
      await api(`/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          score,
          priorityTier,
          scoreNotes: el.scoreNotesInput.value.trim(),
          discoveryStatus: el.discoveryStatusInput.value,
          applicationStatus: el.applicationStatusInput.value,
          interviewStatus: el.interviewStatusInput.value
        })
      });
      await loadJobs();
      if (state.tab === "pipeline") await loadNotesContactsEvents();
      showToast(`Triage saved - ${job.company}`, "ok");
    } catch (error) {
      showToast(`Save failed: ${error.message}`, "error");
    }
  });

  el.savePipelineButton.addEventListener("click", async () => {
    const job = selectedJob();
    if (!job) {
      showToast("Select a job from the pipeline first.", "warn");
      return;
    }
    try {
      await api(`/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nextAction: el.nextActionInput.value.trim(),
          dueDate: el.dueDateInput.value
        })
      });
      await loadJobs();
      showToast(`Next action saved - ${job.company}`, "ok");
    } catch (error) {
      showToast(`Save failed: ${error.message}`, "error");
    }
  });

  el.noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const job = selectedJob();
    if (!job) return;
    const note = el.noteInput.value.trim();
    if (!note) return;
    await api(`/api/jobs/${job.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ note, noteType: "general" })
    });
    el.noteInput.value = "";
    await loadNotesContactsEvents();
  });

  el.contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const job = selectedJob();
    if (!job) return;
    const name = el.contactNameInput.value.trim();
    if (!name) return;
    await api(`/api/jobs/${job.id}/contacts`, {
      method: "POST",
      body: JSON.stringify({
        name,
        contactType: el.contactTypeInput.value,
        email: el.contactEmailInput.value.trim()
      })
    });
    el.contactForm.reset();
    await loadNotesContactsEvents();
  });

  el.eventForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const job = selectedJob();
    if (!job) return;
    await api(`/api/jobs/${job.id}/events`, {
      method: "POST",
      body: JSON.stringify({
        eventType: el.eventTypeInput.value,
        eventDate: el.eventDateInput.value || new Date().toISOString().slice(0, 10),
        details: el.eventDetailsInput.value.trim()
      })
    });
    el.eventDetailsInput.value = "";
    await loadNotesContactsEvents();
    await loadMetrics();
  });

  el.refreshMetricsButton.addEventListener("click", loadMetrics);
  el.refreshRemindersButton.addEventListener("click", loadReminders);

  el.reminderList.addEventListener("click", async (event) => {
    const action = event.target.getAttribute("data-reminder-action");
    const key = event.target.getAttribute("data-reminder-key");
    if (!action || !key) return;
    await api(`/api/reminders/${key}`, {
      method: "PATCH",
      body: JSON.stringify({
        action,
        snoozeDays: action === "snooze" ? 1 : undefined
      })
    });
    await loadReminders();
  });

  el.exportButton.addEventListener("click", async () => {
    const payload = await api("/api/export");
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  el.importInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const raw = await file.text();
    const payload = JSON.parse(raw);
    await api("/api/import", { method: "POST", body: JSON.stringify(payload) });
    await Promise.all([loadJobs(), loadMetrics(), loadSavedViews()]);
    event.target.value = "";
  });

  el.savedViewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = el.savedViewName.value.trim();
    if (!name) return;
    await api("/api/saved-views", {
      method: "POST",
      body: JSON.stringify({
        name,
        filter: {
          search: state.search,
          discoveryStatus: state.discoveryFilter,
          applicationStatus: state.applicationFilter,
          showHidden: state.showHidden
        }
      })
    });
    el.savedViewForm.reset();
    await loadSavedViews();
  });

  el.savedViewList.addEventListener("click", async (event) => {
    const applyButton = event.target.closest("[data-apply-view]");
    const applyId = applyButton?.getAttribute("data-apply-view");
    if (applyId) {
      const view = state.savedViews.find((v) => v.id === applyId);
      if (view) await applySavedViewFilter(view.filter || {});
      return;
    }
    const deleteButton = event.target.closest("[data-delete-view]");
    const deleteId = deleteButton?.getAttribute("data-delete-view");
    if (deleteId) {
      await api(`/api/saved-views/${deleteId}`, { method: "DELETE" });
      await loadSavedViews();
    }
  });

  el.saveLlmSettingsButton.addEventListener("click", async () => {
    await api("/api/settings/llm", {
      method: "PUT",
      body: JSON.stringify({
        endpoint: el.llmEndpointInput.value.trim(),
        model: el.llmModelInput.value.trim() || "openai.gpt-4.1-mini",
        apiKey: el.llmApiKeyInput.value.trim()
      })
    });
    el.llmApiKeyInput.value = "";
    el.llmOutput.value = "LLM settings saved.";
  });

  el.generateFitSummaryButton.addEventListener("click", async () => {
    const job = selectedJob();
    if (!job) {
      el.llmOutput.value = "Select a job in Pipeline first.";
      return;
    }
    const payload = await api("/api/llm/fit-summary", { method: "POST", body: JSON.stringify({ jobId: job.id }) });
    el.llmOutput.value = payload.text || payload.fallback || "";
  });

  el.generateOutreachButton.addEventListener("click", async () => {
    const job = selectedJob();
    if (!job) {
      el.llmOutput.value = "Select a job in Pipeline first.";
      return;
    }
    const payload = await api("/api/llm/outreach-draft", { method: "POST", body: JSON.stringify({ jobId: job.id }) });
    el.llmOutput.value = payload.text || payload.fallback || "";
  });

  el.generateInterviewPackButton.addEventListener("click", async () => {
    const job = selectedJob();
    if (!job) {
      el.llmOutput.value = "Select a job in Pipeline first.";
      return;
    }
    const payload = await api("/api/llm/interview-pack", { method: "POST", body: JSON.stringify({ jobId: job.id }) });
    el.llmOutput.value = payload.text || payload.fallback || "";
  });

  /* ----- AI match score ----- */
  el.generateFitScoreButton.addEventListener("click", async () => {
    const job = selectedJob();
    if (!job) {
      el.aiAssistStatus.textContent = "Select a job in Pipeline first.";
      return;
    }
    el.generateFitScoreButton.disabled = true;
    el.aiAssistStatus.textContent = "Analyzing fit with AI...";
    try {
      const payload = await api("/api/llm/fit-score", {
        method: "POST",
        body: JSON.stringify({ jobId: job.id })
      });
      if (!payload.usedLlm || !payload.analysis) {
        state.lastFitAnalysis = null;
        renderFitAnalysis(null);
        el.aiAssistStatus.textContent = payload.text || "LLM is not configured. Add it under Settings.";
        return;
      }
      state.lastFitAnalysis = payload.analysis;
      renderFitAnalysis(payload.analysis);
      el.aiAssistStatus.textContent = "AI match analysis ready. Review, then Apply to save it to the job.";
    } catch (error) {
      el.aiAssistStatus.textContent = `Fit score failed: ${error.message}`;
    } finally {
      el.generateFitScoreButton.disabled = false;
    }
  });

  el.applyFitAnalysisButton.addEventListener("click", async () => {
    const job = selectedJob();
    const analysis = state.lastFitAnalysis;
    if (!job || !analysis) return;
    const noteLines = [
      `AI match score: ${analysis.score} (${(analysis.tier || "").replace(/_/g, " ")})`,
      analysis.rationale ? `\n${analysis.rationale}` : "",
      analysis.fitHooks?.length ? `\nFit hooks:\n- ${analysis.fitHooks.join("\n- ")}` : "",
      analysis.risks?.length ? `\nRisks:\n- ${analysis.risks.join("\n- ")}` : "",
      analysis.keywordGaps?.length ? `\nKeyword gaps:\n- ${analysis.keywordGaps.join("\n- ")}` : ""
    ].filter(Boolean).join("");
    const mergedKeywords = Array.from(new Set([...(job.keywords || []), ...(analysis.keywordGaps || [])]));
    el.applyFitAnalysisButton.disabled = true;
    try {
      await api(`/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          aiScore: analysis.score,
          aiAnalysis: analysis,
          priorityTier: analysis.tier || bucketForScore(analysis.score),
          scoreNotes: noteLines,
          fitHooks: analysis.fitHooks || [],
          risks: analysis.risks || [],
          keywords: mergedKeywords
        })
      });
      el.aiAssistStatus.textContent = "Applied AI analysis: score, tier, notes, hooks, risks, and keywords saved.";
      el.scoreNotesInput.value = noteLines;
      await loadJobs();
      if (state.tab === "pipeline") await loadNotesContactsEvents();
    } catch (error) {
      el.aiAssistStatus.textContent = `Apply failed: ${error.message}`;
    } finally {
      el.applyFitAnalysisButton.disabled = false;
    }
  });

  /* ----- Summarize / extract a job description ----- */
  el.summarizeJdButton.addEventListener("click", async () => {
    const job = selectedJob();
    const text = el.jdInput.value.trim();
    if (!text) {
      el.aiAssistStatus.textContent = "Paste a job description first.";
      return;
    }
    el.summarizeJdButton.disabled = true;
    el.aiAssistStatus.textContent = "Summarizing job description with AI...";
    try {
      const payload = await api("/api/llm/summarize-jd", {
        method: "POST",
        body: JSON.stringify({ text, jobId: job?.id })
      });
      if (!payload.usedLlm || !payload.extracted) {
        state.lastJdExtract = null;
        renderJdResult(null);
        el.aiAssistStatus.textContent = payload.detail || payload.error || "LLM is not configured.";
        return;
      }
      state.lastJdExtract = payload.extracted;
      renderJdResult(payload.extracted);
      el.applyJdButton.disabled = !job;
      el.aiAssistStatus.textContent = job
        ? "Extracted. Review, then Apply to write the summary + keywords to the selected job."
        : "Extracted. Select a job in Pipeline to apply these details.";
    } catch (error) {
      el.aiAssistStatus.textContent = `Summarize failed: ${error.message}`;
    } finally {
      el.summarizeJdButton.disabled = false;
    }
  });

  el.clearJdButton.addEventListener("click", () => {
    el.jdInput.value = "";
    state.lastJdExtract = null;
    renderJdResult(null);
    el.aiAssistStatus.textContent = "";
  });

  el.applyJdButton.addEventListener("click", async () => {
    const job = selectedJob();
    const extracted = state.lastJdExtract;
    if (!job || !extracted) return;
    const body = {};
    if (extracted.summary) body.summary = extracted.summary;
    const mergedKeywords = Array.from(new Set([...(job.keywords || []), ...(extracted.keywords || [])]));
    if (mergedKeywords.length) body.keywords = mergedKeywords;
    if (extracted.location && !job.location) body.location = extracted.location;
    if (extracted.salaryLabel && !(job.salary && job.salary.label)) {
      body.salary = parseSalary(extracted.salaryLabel) || { label: extracted.salaryLabel };
    }
    el.applyJdButton.disabled = true;
    try {
      await api(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify(body) });
      const noteParts = [];
      if (extracted.responsibilities?.length) noteParts.push(`Responsibilities:\n- ${extracted.responsibilities.join("\n- ")}`);
      if (extracted.qualifications?.length) noteParts.push(`Qualifications:\n- ${extracted.qualifications.join("\n- ")}`);
      if (extracted.redFlags?.length) noteParts.push(`Red flags:\n- ${extracted.redFlags.join("\n- ")}`);
      if (noteParts.length) {
        await api(`/api/jobs/${job.id}/notes`, {
          method: "POST",
          body: JSON.stringify({ note: noteParts.join("\n\n"), noteType: "jd_extract" })
        });
      }
      el.aiAssistStatus.textContent = "Applied job-description details to the selected job.";
      await loadJobs();
      if (state.tab === "pipeline") await loadNotesContactsEvents();
    } catch (error) {
      el.aiAssistStatus.textContent = `Apply failed: ${error.message}`;
    } finally {
      el.applyJdButton.disabled = false;
    }
  });

  /* ----- Today hub events ----- */
  el.todayHub.addEventListener("click", async (event) => {
    const goButton = event.target.closest("[data-go-to-job]");
    if (!goButton) return;
    const jobId = goButton.getAttribute("data-go-to-job");
    state.selectedId = jobId;
    state.tab = "pipeline";
    renderTab();
    renderJobs();
    await loadNotesContactsEvents();
  });

  el.dismissStartHereButton.addEventListener("click", () => {
    state.showStartHere = false;
    try { localStorage.setItem("js_seen_start_here", "1"); } catch {}
    renderTodayHub();
  });

  /* ----- Modal events ----- */
  el.openAddJobButton.addEventListener("click", () => {
    openModal(el.addJobModal);
    setAddJobMode("manual");
  });

  el.openHelpButton.addEventListener("click", () => openModal(el.helpModal));

  document.querySelectorAll("[data-modal-close]").forEach((node) => {
    node.addEventListener("click", () => {
      el.addJobModal.classList.add("hidden");
      el.helpModal.classList.add("hidden");
    });
  });

  document.querySelectorAll("[data-add-mode]").forEach((tab) => {
    tab.addEventListener("click", () => setAddJobMode(tab.dataset.addMode));
  });

  /* ----- Deep research prompt ----- */
  if (el.copyResearchPromptButton) {
    el.copyResearchPromptButton.addEventListener("click", handleCopyResearchPrompt);
  }
  if (el.researchPromptSelect) {
    el.researchPromptSelect.addEventListener("change", () => {
      renderResearchPromptText();
      if (el.researchPromptStatus) el.researchPromptStatus.textContent = "";
    });
  }

  /* ----- Markdown import ----- */
  el.parseMarkdownButton.addEventListener("click", handleParseMarkdown);
  el.addSelectedMarkdownButton.addEventListener("click", handleAddSelectedMarkdown);
  el.clearMarkdownButton.addEventListener("click", () => {
    el.markdownTextarea.value = "";
    state.markdownPreview = [];
    el.markdownStatus.textContent = "";
    renderMarkdownPreview();
  });
  el.markdownFileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const raw = await file.text();
    el.markdownTextarea.value = raw;
    event.target.value = "";
    if (/\.csv$/i.test(file.name) || looksLikeCsv(raw)) {
      await parseCsvText(raw);
    }
  });
  el.markdownPreview.addEventListener("change", (event) => {
    const cb = event.target.closest("[data-preview-index]");
    if (!cb) return;
    const idx = Number(cb.getAttribute("data-preview-index"));
    if (state.markdownPreview[idx]) {
      state.markdownPreview[idx].selected = cb.checked;
    }
  });

  /* ----- Close modal on Escape ----- */
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      el.addJobModal.classList.add("hidden");
      el.helpModal.classList.add("hidden");
    }
  });

  /* ----- Activity tabs (Pipeline detail) ----- */
  document.querySelectorAll("[data-activity-tab]").forEach((tab) => {
    tab.addEventListener("click", async () => {
      setActivityTab(tab.dataset.activityTab);
      if (tab.dataset.activityTab !== "triage" && tab.dataset.activityTab !== "llm") {
        await loadNotesContactsEvents();
      }
    });
  });
}

function hydrateElements() {
  const ids = [
    "candidateName", "marketMetric", "salaryMetric", "travelMetric",
    "targetCount", "roleFamilies", "guardrails", "queueSummary", "jobList",
    "searchInput", "discoveryFilter", "applicationFilter", "showHiddenToggle", "showClosedToggle",
    "strategyMarketInput", "strategySalaryFloorInput", "strategyTravelInput",
    "strategyTargetsInput", "strategyKeywordsInput", "saveStrategyButton",
    "lookupJobsButton", "strategySummary", "lookupResults",
    "sourcePerformanceList", "savedSearchPerformanceList",
    "addJobForm", "scoreInput", "priorityTierInput", "scoreNotesInput",
    "discoveryStatusInput", "applicationStatusInput", "interviewStatusInput",
    "saveTriageButton", "nextActionInput", "dueDateInput", "savePipelineButton",
    "noteForm", "noteInput", "noteList",
    "contactForm", "contactNameInput", "contactTypeInput", "contactEmailInput", "contactList",
    "eventForm", "eventTypeInput", "eventDateInput", "eventDetailsInput", "eventList",
    "metricCards", "reminderList", "refreshMetricsButton", "refreshRemindersButton",
    "exportButton", "importInput",
    "savedViewList", "savedViewForm", "savedViewName",
    "llmEndpointInput", "llmModelInput", "llmApiKeyInput", "saveLlmSettingsButton",
    "generateFitScoreButton", "generateFitSummaryButton", "generateOutreachButton", "generateInterviewPackButton",
    "fitAnalysisCard", "fitScorePill", "fitTierPill", "fitAnalysisBody", "applyFitAnalysisButton",
    "jdInput", "summarizeJdButton", "clearJdButton", "jdResultCard", "jdResultBody", "applyJdButton",
    "aiAssistStatus",
    "llmOutput",
    "todayHub", "todayDateLabel", "startHerePanel", "dismissStartHereButton",
    "openAddJobButton", "openHelpButton", "addJobModal", "helpModal",
    "markdownTextarea", "markdownFileInput", "parseMarkdownButton",
    "clearMarkdownButton", "markdownStatus", "markdownPreview",
    "markdownPreviewActions", "addSelectedMarkdownButton",
    "researchPromptBlock", "researchPromptSelect", "researchPromptText",
    "copyResearchPromptButton", "researchPromptStatus",
    "selectedJobLabel"
  ];
  for (const id of ids) {
    el[id] = document.getElementById(id) || document.querySelector(`#${id}`);
  }
}

async function initialize() {
  hydrateElements();
  try {
    state.showStartHere = localStorage.getItem("js_seen_start_here") !== "1";
  } catch {
    state.showStartHere = true;
  }
  const [profile, statusModel] = await Promise.all([
    api("/api/profile"),
    api("/api/status-model")
  ]);
  state.profile = profile;
  state.statusModel = statusModel;
  renderProfile();
  renderStatusFilters();
  renderTab();
  bindEvents();
  await Promise.all([
    loadJobs(),
    loadMetrics(),
    loadReminders(),
    loadSavedViews(),
    loadLlmSettings(),
    loadStrategy(),
    loadStrategyPerformance(),
    loadResearchPrompts()
  ]);
  renderTodayHub();
}

initialize().catch((error) => {
  const jobList = document.getElementById("jobList");
  if (jobList) {
    jobList.innerHTML = `<p class="muted">Failed to initialize app: ${safe(error.message)}</p>`;
  }
});
