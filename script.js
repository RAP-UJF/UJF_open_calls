const callsContainer = document.getElementById("calls-container");
const loadingState = document.getElementById("loading-state");
const heroLastUpdated = document.getElementById("hero-last-updated");
const heroCallCount = document.getElementById("hero-call-count");
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

    updateHero(calls);
    renderCalls(calls);
    loadingState.textContent = `${calls.length} call${calls.length === 1 ? "" : "s"} currently listed.`;
  } catch (error) {
    console.error("Failed to load funding calls:", error);
    if (heroLastUpdated) {
      heroLastUpdated.textContent = "Unavailable";
    }
    if (heroCallCount) {
      heroCallCount.textContent = "0 calls";
    }
    loadingState.textContent = "Unable to load calls at the moment.";
    callsContainer.innerHTML = `
      <article class="empty-state">
        <h3>Data unavailable</h3>
        <p>The calls list could not be loaded from the JSON source.</p>
      </article>
    `;
  }
}

function updateHero(calls) {
  if (heroCallCount) {
    heroCallCount.textContent = `${calls.length} call${calls.length === 1 ? "" : "s"}`;
  }

  if (!heroLastUpdated) {
    return;
  }

  const latestUpdate = calls
    .map((call) => call && call.last_updated)
    .filter((value) => typeof value === "string" && value.trim())
    .sort()
    .at(-1);

  heroLastUpdated.textContent = latestUpdate ? formatDisplayDate(latestUpdate) : "Unknown";
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
        <h3>No calls listed</h3>
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
        <div class="card-heading">
          <h3>
            <a
              class="call-title-link"
              href="${escapeAttribute(sourceUrl)}"
              target="_blank"
              rel="noreferrer noopener"
            >
              ${escapeHtml(title)}
            </a>
          </h3>
          <div class="program-line">${escapeHtml(program)}</div>
        </div>
        <div class="card-side">
          <span class="badge badge-neutral">${escapeHtml(scope)}</span>
          <span class="badge badge-status-${escapeHtmlClass(call.status)}">${escapeHtml(status)}</span>
        </div>
      </div>

      <div class="card-badges">
        <span class="badge badge-priority-${escapeHtmlClass(call.priority)}">Priority: ${escapeHtml(priority)}</span>
        <span class="badge badge-neutral">Relevance: ${escapeHtml(relevance)}</span>
      </div>

      <div class="card-facts">
        <div class="fact">
          <span class="fact-label">Deadline</span>
          <span class="fact-value">${escapeHtml(deadline)}</span>
        </div>
        <div class="fact">
          <span class="fact-label">Status</span>
          <span class="fact-value">${escapeHtml(status)}</span>
        </div>
        <div class="fact">
          <span class="fact-label">Scope</span>
          <span class="fact-value">${escapeHtml(scope)}</span>
        </div>
      </div>

      <div class="card-copy">
        <p class="summary">${escapeHtml(summary)}</p>
        <p class="insight"><strong>Reality check:</strong> ${escapeHtml(realityCheck)}</p>
      </div>

      <div class="card-tags" aria-label="Domains">
        ${domains.length ? domains.map((domain) => `<span class="tag">${escapeHtml(domain)}</span>`).join("") : '<span class="tag">General research</span>'}
      </div>

      <div class="card-footer">
        <span class="source-note">Source: ${escapeHtml(sourceLabel)}</span>
      </div>
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

  return Number.isNaN(Date.parse(deadline)) ? "N/A" : formatDisplayDate(deadline);
}

function formatDisplayDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
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
