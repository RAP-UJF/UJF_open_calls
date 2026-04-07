const callsContainer = document.getElementById("calls-container");
const loadingState = document.getElementById("loading-state");
const DATA_URL = "data/calls.json";

const STATUS_ORDER = {
  closing_soon: 0,
  open: 1,
  monitoring: 2
};

loadCalls();

async function loadCalls() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const calls = Array.isArray(data) ? data.slice().sort(compareCalls) : [];

    renderCalls(calls);
    loadingState.textContent = `${calls.length} call${calls.length === 1 ? "" : "s"} loaded.`;
  } catch (error) {
    console.error("Failed to load funding calls:", error);
    loadingState.textContent = "Unable to load calls at the moment.";
    callsContainer.innerHTML = `
      <article class="empty-state">
        <h2>Data unavailable</h2>
        <p>The calls list could not be loaded from the JSON source.</p>
      </article>
    `;
  }
}

function compareCalls(a, b) {
  const statusDelta = getStatusRank(a && a.status) - getStatusRank(b && b.status);
  if (statusDelta !== 0) {
    return statusDelta;
  }

  return getDeadlineRank(a && a.deadline) - getDeadlineRank(b && b.deadline);
}

function getStatusRank(status) {
  return STATUS_ORDER[status] ?? Number.MAX_SAFE_INTEGER;
}

function getDeadlineRank(deadline) {
  if (typeof deadline !== "string" || deadline.trim() === "") {
    return Number.MAX_SAFE_INTEGER;
  }

  const timestamp = Date.parse(deadline);
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function renderCalls(calls) {
  if (!calls.length) {
    callsContainer.innerHTML = `
      <article class="empty-state">
        <h2>No calls listed</h2>
        <p>Update <code>data/calls.json</code> to publish funding opportunities.</p>
      </article>
    `;
    return;
  }

  callsContainer.innerHTML = calls.map(createCardMarkup).join("");
}

function createCardMarkup(call) {
  const title = toText(call.title, "Untitled call");
  const program = toText(call.program, "N/A");
  const deadline = formatDeadline(call.deadline);
  const status = formatLabel(call.status, "unknown");
  const relevance = formatLabel(call.relevance, "unknown");
  const summary = toText(call.summary, "No summary available.");
  const realityCheck = toText(call.reality_check, "No practical note available.");
  const scope = toText(call.scope, "N/A");
  const priority = formatLabel(call.priority, "unknown");
  const domains = Array.isArray(call.domains) ? call.domains.filter(Boolean) : [];
  const sourceLabel = toText(call.source_label, "Source");
  const sourceUrl = sanitizeUrl(call.source_url);

  return `
    <article class="call-card">
      <div class="card-top">
        <span class="pill">${escapeHtml(scope)}</span>
        <span class="pill pill-status-${escapeHtmlClass(call.status)}">${escapeHtml(status)}</span>
        <span class="pill pill-priority-${escapeHtmlClass(call.priority)}">${escapeHtml(priority)}</span>
      </div>

      <div>
        <h2>${escapeHtml(title)}</h2>
      </div>

      <dl class="meta-list">
        <div class="meta-row">
          <dt class="meta-label">Program</dt>
          <dd>${escapeHtml(program)}</dd>
        </div>
        <div class="meta-row">
          <dt class="meta-label">Deadline</dt>
          <dd>${escapeHtml(deadline)}</dd>
        </div>
        <div class="meta-row">
          <dt class="meta-label">Relevance</dt>
          <dd>${escapeHtml(relevance)}</dd>
        </div>
      </dl>

      <p class="summary">${escapeHtml(summary)}</p>
      <p class="insight"><strong>Reality check:</strong> ${escapeHtml(realityCheck)}</p>

      <div class="tag-list" aria-label="Domains">
        ${domains.length ? domains.map((domain) => `<span class="tag">${escapeHtml(domain)}</span>`).join("") : '<span class="tag">General research</span>'}
      </div>

      <a
        class="source-link"
        href="${escapeAttribute(sourceUrl)}"
        target="_blank"
        rel="noreferrer noopener"
      >
        ${escapeHtml(sourceLabel)}
      </a>
    </article>
  `;
}

function toText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatDeadline(deadline) {
  if (typeof deadline !== "string" || deadline.trim() === "") {
    return "N/A";
  }

  return Number.isNaN(Date.parse(deadline)) ? "N/A" : deadline;
}

function formatLabel(value, fallback) {
  return toText(value, fallback).replace(/_/g, " ");
}

function sanitizeUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : "#";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function escapeHtmlClass(value) {
  return String(value || "unknown").replace(/[^a-z0-9_-]/gi, "").toLowerCase();
}
