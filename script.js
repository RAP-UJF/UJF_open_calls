const callsContainer = document.getElementById("calls-container");
const loadingState = document.getElementById("loading-state");
const heroLastUpdated = document.getElementById("hero-last-updated");
const heroCallCount = document.getElementById("hero-call-count");
const dataHealthWarning = document.getElementById("data-health-warning");
const dashboardMetricElements = document.querySelectorAll("[data-dashboard-metric]");
const callSearch = document.getElementById("call-search");
const domainFilter = document.getElementById("domain-filter");
const accessFilter = document.getElementById("access-filter");
const statusFilter = document.getElementById("status-filter");
const deadlineFilter = document.getElementById("deadline-filter");
const DATA_URL = "data/calls.json";
const CLOSING_SOON_DAYS = 42;
const PARTNERSHIP_ACCESS_BARRIERS = new Set([
  "partner_required",
  "bilateral_partner_required",
  "consortium_gated"
]);

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
  monitoring: 10,
  expired: 99
};

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
  monitoring: "Monitoring",
  expired: "Past deadline"
};

const ACTIVE_MANUAL_STATUSES = new Set([
  "closing_soon",
  "open_now",
  "open",
  "open_rolling",
  "open_partner_required",
  "open_bilateral_partner_required",
  "open_consortium_gated",
  "open_excellence_gated"
]);

let allCalls = [];
let activeDomain = "all";
let activeAccess = "all";
let activeStatus = "all";
let activeDeadline = "all";
let activeSearch = "";

loadCalls();

async function loadCalls() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    allCalls = Array.isArray(data) ? data.slice().sort(compareCalls) : [];

    syncRenderedCallStatuses(allCalls);
    updateHero(allCalls);
    updateDataHealthWarning(allCalls);
    renderDomainFilters(allCalls);
    renderAccessFilters();
    renderStatusFilters();
    renderDeadlineFilters();
    bindSearchInput();
    renderPage();
  } catch (error) {
    console.error("Failed to load funding calls:", error);
    if (domainFilter) {
      domainFilter.innerHTML = "";
    }
    if (accessFilter) {
      accessFilter.innerHTML = "";
    }

    const hasStaticFallback = Boolean(callsContainer && callsContainer.children.length);
    if (loadingState) {
      loadingState.textContent = hasStaticFallback
        ? "Showing the embedded calls snapshot. Live refresh is unavailable at the moment."
        : "Unable to load calls at the moment.";
    }

    if (!hasStaticFallback) {
      if (heroLastUpdated) {
        heroLastUpdated.textContent = "Unavailable";
      }
      if (heroCallCount) {
        heroCallCount.textContent = "0 calls";
      }
      callsContainer.innerHTML = `
        <article class="empty-state">
          <h3>Data unavailable</h3>
          <p>The calls list could not be loaded from the JSON source.</p>
        </article>
      `;
    }
  }
}

function updateHero(calls) {
  if (heroCallCount) {
    heroCallCount.textContent = `${calls.length} call${calls.length === 1 ? "" : "s"}`;
  }

  updatePortfolioDashboard(calls);

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

function updatePortfolioDashboard(calls) {
  if (!dashboardMetricElements.length) {
    return;
  }

  const metrics = calculatePortfolioMetrics(calls);
  dashboardMetricElements.forEach((element) => {
    const metricName = element.dataset.dashboardMetric;
    if (metricName && metrics[metricName] !== undefined) {
      element.textContent = String(metrics[metricName]);
    }
  });
}

function calculatePortfolioMetrics(calls) {
  const metrics = {
    tracked: calls.length,
    active: 0,
    monitoring: 0,
    expired: 0,
    next30: 0
  };
  const today = startOfDay(new Date());
  const next30 = new Date(today);
  next30.setDate(today.getDate() + 30);

  calls.forEach((call) => {
    const status = getEffectiveStatus(call);
    if (status === "expired") {
      metrics.expired += 1;
    } else if (ACTIVE_MANUAL_STATUSES.has(status)) {
      metrics.active += 1;
    } else if (status === "monitoring" || status === "monitoring_expected" || status === "monitoring_planned") {
      metrics.monitoring += 1;
    }

    const deadlineDate = parseDateOnly(call && call.deadline);
    if (
      deadlineDate &&
      status !== "expired" &&
      deadlineDate.getTime() >= today.getTime() &&
      deadlineDate.getTime() <= next30.getTime()
    ) {
      metrics.next30 += 1;
    }
  });

  return metrics;
}

function renderPage() {
  const domainFilterSource = filterCalls(allCalls, "all", activeAccess);
  syncActiveDomain(domainFilterSource);
  renderDomainFilters(domainFilterSource);

  const visibleCount = applyFiltersToDom();
  updateLoadingState(visibleCount, allCalls.length);
}

function filterCalls(calls, domain, access) {
  return calls.filter((call) => matchesDomainFilter(call, domain) && matchesAccessFilter(call, access));
}

function matchesDomainFilter(call, domain) {
  if (domain === "all") {
    return true;
  }

  return Array.isArray(call.domains) && call.domains.includes(domain);
}

function matchesAccessFilter(call, access) {
  if (access === "all") {
    return true;
  }

  const accessBarrier = toText(call && call.access_barrier, "");
  if (access === "individual_entry") {
    return accessBarrier === "individual_entry";
  }

  if (access === "partnership") {
    return PARTNERSHIP_ACCESS_BARRIERS.has(accessBarrier);
  }

  return true;
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
      renderPage();
    });
  });
}

function syncActiveDomain(calls) {
  if (activeDomain === "all") {
    return;
  }

  const availableDomains = new Set(
    calls.flatMap((call) => (Array.isArray(call.domains) ? call.domains : []))
      .filter((domain) => typeof domain === "string" && domain.trim())
  );

  if (!availableDomains.has(activeDomain)) {
    activeDomain = "all";
  }
}

function renderAccessFilters() {
  if (!accessFilter) {
    return;
  }

  const items = [
    { value: "all", label: "All access" },
    { value: "individual_entry", label: "Individual entry" },
    { value: "partnership", label: "Partnership" }
  ];

  accessFilter.innerHTML = items.map((item) => createAccessFilterButtonMarkup(item)).join("");

  accessFilter.querySelectorAll("button[data-access]").forEach((button) => {
    button.addEventListener("click", () => {
      activeAccess = button.dataset.access || "all";
      renderAccessFilters();
      renderPage();
    });
  });
}

function renderStatusFilters() {
  if (!statusFilter) {
    return;
  }

  const items = [
    { value: "all", label: "All status" },
    { value: "active", label: "Open / active" },
    { value: "monitoring", label: "Monitoring / planned" },
    { value: "expired", label: "Past deadline" }
  ];

  statusFilter.innerHTML = items.map((item) => createStatusFilterButtonMarkup(item)).join("");

  statusFilter.querySelectorAll("button[data-status-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeStatus = button.dataset.statusFilter || "all";
      renderStatusFilters();
      renderPage();
    });
  });
}

function renderDeadlineFilters() {
  if (!deadlineFilter) {
    return;
  }

  const items = [
    { value: "all", label: "All deadlines" },
    { value: "next_30", label: "Next 30 days" },
    { value: "next_90", label: "Next 90 days" },
    { value: "none", label: "No deadline" },
    { value: "past", label: "Past deadline" }
  ];

  deadlineFilter.innerHTML = items.map((item) => createDeadlineFilterButtonMarkup(item)).join("");

  deadlineFilter.querySelectorAll("button[data-deadline-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeDeadline = button.dataset.deadlineFilter || "all";
      renderDeadlineFilters();
      renderPage();
    });
  });
}

function bindSearchInput() {
  if (!callSearch || callSearch.dataset.bound === "true") {
    return;
  }

  callSearch.dataset.bound = "true";
  callSearch.addEventListener("input", () => {
    activeSearch = normalizeSearchText(callSearch.value);
    renderPage();
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

function createAccessFilterButtonMarkup(item) {
  const isActive = item.value === activeAccess;
  return `
    <button
      type="button"
      class="filter-chip${isActive ? " is-active" : ""}"
      data-access="${escapeAttribute(item.value)}"
      aria-pressed="${isActive ? "true" : "false"}"
    >
      ${escapeHtml(item.label)}
    </button>
  `;
}

function createStatusFilterButtonMarkup(item) {
  const isActive = item.value === activeStatus;
  return `
    <button
      type="button"
      class="filter-chip${isActive ? " is-active" : ""}"
      data-status-filter="${escapeAttribute(item.value)}"
      aria-pressed="${isActive ? "true" : "false"}"
    >
      ${escapeHtml(item.label)}
    </button>
  `;
}

function createDeadlineFilterButtonMarkup(item) {
  const isActive = item.value === activeDeadline;
  return `
    <button
      type="button"
      class="filter-chip${isActive ? " is-active" : ""}"
      data-deadline-filter="${escapeAttribute(item.value)}"
      aria-pressed="${isActive ? "true" : "false"}"
    >
      ${escapeHtml(item.label)}
    </button>
  `;
}

function updateLoadingState(visibleCount, totalCount) {
  if (
    activeDomain === "all" &&
    activeAccess === "all" &&
    activeStatus === "all" &&
    activeDeadline === "all" &&
    activeSearch === ""
  ) {
    loadingState.textContent = `${totalCount} call${totalCount === 1 ? "" : "s"} currently listed.`;
    return;
  }

  loadingState.textContent = `${visibleCount} of ${totalCount} call${totalCount === 1 ? "" : "s"} shown.`;
}

function compareCalls(a, b) {
  const statusDelta = getStatusRank(getEffectiveStatus(a)) - getStatusRank(getEffectiveStatus(b));
  if (statusDelta !== 0) {
    return statusDelta;
  }

  return getDeadlineRank(a && a.deadline) - getDeadlineRank(b && b.deadline);
}

function getEffectiveStatus(call) {
  if (isPastDeadline(call && call.deadline)) {
    return "expired";
  }

  return resolveStatus(call);
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
    return "expired";
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

function isPastDeadline(deadline) {
  const deadlineDate = parseDateOnly(deadline);
  if (!deadlineDate) {
    return false;
  }

  return deadlineDate.getTime() < startOfDay(new Date()).getTime();
}

function updateDataHealthWarning(calls) {
  const overrideCount = countExpiredStatusOverrides(calls);
  const message = overrideCount > 0
    ? "Some calls have deadlines in the past and were marked as expired automatically."
    : "";

  if (dataHealthWarning) {
    dataHealthWarning.textContent = message;
    dataHealthWarning.hidden = overrideCount === 0;
  }

  if (overrideCount > 0) {
    console.warn(message, { overrideCount });
  }
}

function countExpiredStatusOverrides(calls) {
  return calls.filter((call) => {
    const manualStatus = toText(call && call.status, "").toLowerCase();
    return ACTIVE_MANUAL_STATUSES.has(manualStatus) && getEffectiveStatus(call) === "expired";
  }).length;
}

function syncRenderedCallStatuses(calls) {
  if (!callsContainer) {
    return;
  }

  const callsById = new Map(
    calls
      .filter((call) => call && typeof call.id === "string")
      .map((call) => [call.id, call])
  );

  const articles = Array.from(callsContainer.querySelectorAll("article[data-call-id]"));
  articles.forEach((article) => {
    const call = callsById.get(article.dataset.callId || "");
    if (!call) {
      return;
    }

    article.dataset.deadline = toText(call.deadline, "");
    applyEffectiveStatusToArticle(article, getEffectiveStatus(call));
  });

  articles
    .sort((a, b) => compareCalls(callsById.get(a.dataset.callId || ""), callsById.get(b.dataset.callId || "")))
    .forEach((article) => callsContainer.appendChild(article));
}

function applyEffectiveStatusToArticle(article, status) {
  article.dataset.status = status;

  const statusLabel = STATUS_LABELS[status] || formatLabel(status, "Unknown");
  const statusBadge = article.querySelector(".card-side .badge:not(.badge-neutral)");
  if (statusBadge) {
    Array.from(statusBadge.classList)
      .filter((className) => className.startsWith("badge-status-"))
      .forEach((className) => statusBadge.classList.remove(className));
    statusBadge.classList.add(`badge-status-${status}`);
    statusBadge.textContent = statusLabel;
  }

  const statusFact = article.querySelector(".fact-status .fact-value");
  if (statusFact) {
    statusFact.textContent = statusLabel;
  }

  article.dataset.search = buildArticleSearchText(article);
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

function applyFiltersToDom() {
  if (!callsContainer) {
    return 0;
  }

  const articles = Array.from(callsContainer.querySelectorAll("article[data-call-id]"));

  if (!articles.length) {
    return 0;
  }

  let visibleCount = 0;
  articles.forEach((article) => {
    const articleDomains = parseArticleDomains(article.dataset.domains || "");
    const accessBarrier = article.dataset.accessBarrier || "";
    const status = article.dataset.status || "";
    const deadline = article.dataset.deadline || "";
    const searchText = article.dataset.search || buildArticleSearchText(article);
    const matchesDomain = activeDomain === "all" || articleDomains.includes(activeDomain);
    const matchesAccess = matchesAccessBarrier(accessBarrier, activeAccess);
    const matchesStatusValue = matchesStatusFilter(status, activeStatus);
    const matchesDeadlineValue = matchesDeadlineFilter(deadline, activeDeadline);
    const matchesSearchValue = !activeSearch || searchText.includes(activeSearch);
    const isVisible = matchesDomain && matchesAccess && matchesStatusValue && matchesDeadlineValue && matchesSearchValue;
    article.hidden = !isVisible;
    if (isVisible) {
      visibleCount += 1;
    }
  });

  let emptyState = callsContainer.querySelector(".empty-state");
  const hasVisibleArticles = articles.some((article) => !article.hidden);

  if (!hasVisibleArticles) {
    if (!emptyState) {
      emptyState = document.createElement("article");
      emptyState.className = "empty-state";
      emptyState.innerHTML = `
        <h3>No matching calls</h3>
        <p>Try a different search term or loosen one of the filters.</p>
      `;
      callsContainer.appendChild(emptyState);
    }
    emptyState.hidden = false;
    return 0;
  }

  if (emptyState) {
    emptyState.hidden = true;
  }

  return visibleCount;
}

function matchesStatusFilter(status, filter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "expired") {
    return status === "expired";
  }

  if (filter === "monitoring") {
    return status === "monitoring" || status === "monitoring_expected" || status === "monitoring_planned";
  }

  if (filter === "active") {
    return ACTIVE_MANUAL_STATUSES.has(status) && status !== "expired";
  }

  return true;
}

function matchesDeadlineFilter(deadline, filter) {
  const deadlineDate = parseDateOnly(deadline);
  if (filter === "all") {
    return true;
  }

  if (filter === "none") {
    return !deadlineDate;
  }

  if (!deadlineDate) {
    return false;
  }

  const today = startOfDay(new Date());
  const dayDelta = Math.ceil((deadlineDate.getTime() - today.getTime()) / 86400000);

  if (filter === "past") {
    return dayDelta < 0;
  }

  if (dayDelta < 0) {
    return false;
  }

  if (filter === "next_30") {
    return dayDelta <= 30;
  }

  if (filter === "next_90") {
    return dayDelta <= 90;
  }

  return true;
}

function buildArticleSearchText(article) {
  return normalizeSearchText([
    article.textContent || "",
    article.dataset.status || "",
    article.dataset.domains || "",
    article.dataset.scope || "",
    article.dataset.deadline || ""
  ].join(" "));
}

function normalizeSearchText(value) {
  return String(value || "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function parseArticleDomains(value) {
  if (!value) {
    return [];
  }

  return value.split("|").filter((entry) => entry && entry.trim());
}

function matchesAccessBarrier(accessBarrier, access) {
  if (access === "all") {
    return true;
  }

  if (access === "individual_entry") {
    return accessBarrier === "individual_entry";
  }

  if (access === "partnership") {
    return PARTNERSHIP_ACCESS_BARRIERS.has(accessBarrier);
  }

  return true;
}

function toText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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
  const text = toText(value, fallback);
  return text ? text.replace(/_/g, " ") : fallback;
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
