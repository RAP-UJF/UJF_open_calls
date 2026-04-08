const callsContainer = document.getElementById("calls-container");
const loadingState = document.getElementById("loading-state");
const heroLastUpdated = document.getElementById("hero-last-updated");
const heroCallCount = document.getElementById("hero-call-count");
const domainFilter = document.getElementById("domain-filter");
const DATA_URL = "data/calls.json";
const CLOSING_SOON_DAYS = 42;

const STATUS_ORDER = {
  closing_soon: 0,
  open_now: 1,
  open: 2,
  open_rolling: 3,
  open_partner_required: 4,
  open_bilateral_partner_required: 5,
  open_consortium_gated: 6,
  open_excellence_gated: 7,
  monitoring_expected: 8,
  monitoring_planned: 9,
  monitoring: 10
};

let allCalls = [];
let activeDomain = "all";

loadCalls();

async function loadCalls() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    allCalls = Array.isArray(data) ? data.slice().sort(compareCalls) : [];

    updateHero(allCalls);
    renderDomainFilters(allCalls);
    renderPage();
  } catch (error) {
    console.error("Failed to load funding calls:", error);
    if (heroLastUpdated) {
      heroLastUpdated.textContent = "Unavailable";
    }
    if (heroCallCount) {
      heroCallCount.textContent = "0 calls";
    }
    if (domainFilter) {
      domainFilter.innerHTML = "";
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

function renderPage() {
  const visibleCalls = filterCalls(allCalls, activeDomain);
  renderCalls(visibleCalls);
  updateLoadingState(visibleCalls.length, allCalls.length);
}

function filterCalls(calls, domain) {
  if (domain === "all") {
    return calls;
  }

  return calls.filter((call) => Array.isArray(call.domains) && call.domains.includes(domain));
}

function renderDomainFilters(calls) {
  if (!domainFilter) {
    return;
  }

  const domains = Array.from(
    new Set(
      calls.flatMap((call) => (Array.isArray(call.domains) ? call.domains : []))
        .filter((domain) => typeof domain === "string" && domain.trim())
    )
  ).sort((a, b) => a.localeCompare(b));

  const items = [
    { value: "all", label: "All domains" },
    ...domains.map((domain) => ({ value: domain, label: domain }))
  ];

  domainFilter.innerHTML = items.map((item) => createFilterButtonMarkup(item)).join("");

  domainFilter.querySelectorAll("button[data-domain]").forEach((button) => {
    button.addEventListener("click", () => {
      activeDomain = button.dataset.domain || "all";
      renderDomainFilters(allCalls);
      renderPage();
    });
  });
}

function createFilterButtonMarkup(item) {
  const isActive = item.value === activeDomain;
  return `
    <button
      type="button"
      class="filter-chip${isActive ? " is-active" : ""}"
      data-domain="${escapeAttribute(item.value)}"
      aria-pressed="${isActive ? "true" : "false"}"
    >
      ${escapeHtml(item.label)}
    </button>
  `;
}

function updateLoadingState(visibleCount, totalCount) {
  if (activeDomain === "all") {
    loadingState.textContent = `${totalCount} call${totalCount === 1 ? "" : "s"} currently listed.`;
    return;
  }

  loadingState.textContent = `${visibleCount} of ${totalCount} call${totalCount === 1 ? "" : "s"} shown.`;
}

function compareCalls(a, b) {
  const statusDelta = getStatusRank(resolveStatus(a)) - getStatusRank(resolveStatus(b));
  if (statusDelta !== 0) {
    return statusDelta;
  }

  return getDeadlineRank(a && a.deadline) - getDeadlineRank(b && b.deadline);
}

function resolveStatus(call) {
  const explicitStatus = toText(call && call.status, "").toLowerCase();
  if (explicitStatus && STATUS_ORDER[explicitStatus] !== undefined) {
    return explicitStatus;
  }

  return getDerivedStatus(call && call.deadline);
}

function getDerivedStatus(deadline) {
  const deadlineDate = parseDateOnly(deadline);
  if (!deadlineDate) {
    return "monitoring";
  }

  const today = startOfDay(new Date());
  const dayDelta = Math.ceil((deadlineDate.getTime() - today.getTime()) / 86400000);

  if (dayDelta < 0) {
    return "monitoring";
  }

  if (dayDelta <= CLOSING_SOON_DAYS) {
    return "closing_soon";
  }

  return "open";
}

function getStatusRank(status) {
  return STATUS_ORDER[status] ?? Number.MAX_SAFE_INTEGER;
}

function getDeadlineRank(deadline) {
  const deadlineDate = parseDateOnly(deadline);
  return deadlineDate ? deadlineDate.getTime() : Number.MAX_SAFE_INTEGER;
}

function parseDateOnly(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return startOfDay(date);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function renderCalls(calls) {
  if (!calls.length) {
    callsContainer.innerHTML = `
      <article class="empty-state">
        <h3>No matching calls</h3>
        <p>Try a different research tag or return to all domains.</p>
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
  const openingDate = formatOpeningDate(call.opens_on);
  const resolvedStatus = resolveStatus(call);
  const status = formatStatusLabel(resolvedStatus);
  const accessBarrier = formatAccessBarrierLabel(call.access_barrier);
  const relevance = formatLabel(call.relevance, "unknown");
  const summary = toText(call.summary, "No summary available.");
  const realityCheck = toText(call.reality_check, "No practical note available.");
  const actionNote = toText(call.action_note, "");
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
          <span class="badge badge-status-${escapeHtmlClass(resolvedStatus)}">${escapeHtml(status)}</span>
        </div>
      </div>

      <div class="card-badges">
        <span class="badge badge-priority-${escapeHtmlClass(call.priority)}">Priority: ${escapeHtml(priority)}</span>
        <span class="badge badge-relevance-${escapeHtmlClass(call.relevance)}">Relevance: ${escapeHtml(relevance)}</span>
      </div>

      <div class="card-facts">
        <div class="fact">
          <span class="fact-label">${escapeHtml(getOpeningFactLabel(call.opens_on))}</span>
          <span class="fact-value">${escapeHtml(openingDate)}</span>
        </div>
        <div class="fact">
          <span class="fact-label">Deadline</span>
          <span class="fact-value">${escapeHtml(deadline)}</span>
        </div>
        <div class="fact">
          <span class="fact-label">Status</span>
          <span class="fact-value">${escapeHtml(status)}</span>
        </div>
        <div class="fact">
          <span class="fact-label">Access</span>
          <span class="fact-value">${escapeHtml(accessBarrier)}</span>
        </div>
        <div class="fact">
          <span class="fact-label">Scope</span>
          <span class="fact-value">${escapeHtml(scope)}</span>
        </div>
      </div>

      <div class="card-copy">
        <p class="summary">${escapeHtml(summary)}</p>
        <p class="insight"><strong>Reality check:</strong> ${escapeHtml(realityCheck)}</p>
        ${actionNote ? `<p class="action-note"><strong>Action:</strong> ${escapeHtml(actionNote)}</p>` : ""}
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
  const deadlineDate = parseDateOnly(deadline);
  return deadlineDate ? formatDisplayDate(deadlineDate) : "N/A";
}

function formatOpeningDate(opensOn) {
  const openingDate = parseDateOnly(opensOn);
  return openingDate ? formatDisplayDate(openingDate) : "TBD";
}

function formatDisplayDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
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

function formatAccessBarrierLabel(value) {
  const ACCESS_BARRIER_LABELS = {
    individual_entry: "Individual entry",
    excellence_gated: "Excellence-gated",
    consortium_gated: "Consortium-gated",
    partner_required: "Partner required",
    bilateral_partner_required: "Bilateral partner required",
    institutional_only: "Institutional route",
    expected_call: "Expected call"
  };

  return ACCESS_BARRIER_LABELS[value] || formatLabel(value, "General access");
}

function formatStatusLabel(status) {
  const STATUS_LABELS = {
    closing_soon: "Closing soon",
    open_now: "Open now",
    open: "Open",
    open_rolling: "Open, rolling",
    open_partner_required: "Open, partner required",
    open_bilateral_partner_required: "Open, bilateral partner required",
    open_consortium_gated: "Open, consortium-gated",
    open_excellence_gated: "Open, excellence-gated",
    monitoring_expected: "Monitoring, expected",
    monitoring_planned: "Monitoring, planned",
    monitoring: "Monitoring"
  };

  return STATUS_LABELS[status] || formatLabel(status, "unknown");
}

function getOpeningFactLabel(opensOn) {
  const openingDate = parseDateOnly(opensOn);
  if (!openingDate) {
    return "Opens";
  }

  const today = startOfDay(new Date());
  return openingDate.getTime() > today.getTime() ? "Opens" : "Opened";
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
