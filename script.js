const callsContainer = document.getElementById("calls-container");
const loadingState = document.getElementById("loading-state");
const heroLastUpdated = document.getElementById("hero-last-updated");
const heroCallCount = document.getElementById("hero-call-count");
const domainFilter = document.getElementById("domain-filter");
const accessFilter = document.getElementById("access-filter");
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
  monitoring: 10
};

let allCalls = [];
let activeDomain = "all";
let activeAccess = "all";

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
    renderAccessFilters();
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
  const domainFilterSource = filterCalls(allCalls, "all", activeAccess);
  syncActiveDomain(domainFilterSource);
  renderDomainFilters(domainFilterSource);

  const visibleCount = applyFiltersToDom(activeDomain, activeAccess);
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

function updateLoadingState(visibleCount, totalCount) {
  if (activeDomain === "all" && activeAccess === "all") {
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

function applyFiltersToDom(domain, access) {
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
    const matchesDomain = domain === "all" || articleDomains.includes(domain);
    const matchesAccess = matchesAccessBarrier(accessBarrier, access);
    const isVisible = matchesDomain && matchesAccess;
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
        <p>Try a different research tag or return to all domains.</p>
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
