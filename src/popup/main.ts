import "../popup/styles.css";
import { DEFAULT_SETTINGS, MAX_SITE_CRAWL_PAGES } from "../shared/defaults";
import { createUnavailablePage, discoverSameDomainLinks, extractFromHtml } from "../shared/extractor";
import { polishPageWithAi } from "../shared/ai";
import { generateDocumentationPdf } from "../shared/pdf";
import type { DocLink, ExtensionSettings, PageDocumentation } from "../shared/types";
import { extractActivePage } from "./pageScript";

type AppState = {
  activePage?: PageDocumentation;
  links: DocLink[];
  selectedUrls: Set<string>;
  settings: ExtensionSettings;
  busy: boolean;
  status: string;
  error: string;
};

const app = document.querySelector<HTMLDivElement>("#app");

const state: AppState = {
  links: [],
  selectedUrls: new Set<string>(),
  settings: DEFAULT_SETTINGS,
  busy: false,
  status: "Ready to document the current website.",
  error: ""
};

function chromeAvailable(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.tabs && chrome.scripting && chrome.storage);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.pathname || "/"}${url.search}`.slice(0, 58);
  } catch {
    return value.slice(0, 58);
  }
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}

function mergeSettings(saved?: Partial<ExtensionSettings>): ExtensionSettings {
  return {
    ai: {
      ...DEFAULT_SETTINGS.ai,
      ...(saved?.ai || {}),
      enabled: true,
      apiKey: saved?.ai?.apiKey || DEFAULT_SETTINGS.ai.apiKey
    }
  };
}

async function loadSettings(): Promise<ExtensionSettings> {
  if (!chromeAvailable()) {
    return DEFAULT_SETTINGS;
  }
  const result = await chrome.storage.local.get("docmeSettings");
  return mergeSettings(result.docmeSettings as Partial<ExtensionSettings> | undefined);
}

async function saveSettings(settings: ExtensionSettings): Promise<void> {
  state.settings = settings;
  if (chromeAvailable()) {
    await chrome.storage.local.set({ docmeSettings: settings });
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw new Error("No readable active tab was found.");
  }
  if (!/^https?:\/\//i.test(tab.url)) {
    throw new Error("Docme can document regular http and https websites only.");
  }
  return tab;
}

async function readActivePage(): Promise<PageDocumentation> {
  const tab = await getActiveTab();
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id as number },
    func: extractActivePage
  });
  if (!result?.result) {
    throw new Error("The active page did not return readable content.");
  }
  return result.result as PageDocumentation;
}

async function refreshPage(): Promise<void> {
  state.busy = true;
  state.error = "";
  state.status = "Reading the active page and discovering same-site links...";
  render();
  try {
    const page = await readActivePage();
    state.activePage = page;
    state.links = discoverSameDomainLinks(page);
    state.selectedUrls = new Set<string>([page.url]);
    state.status = `Found ${state.links.length} same-site page${state.links.length === 1 ? "" : "s"} to choose from.`;
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unable to inspect this page.";
    state.status = "Docme could not read the current tab.";
  } finally {
    state.busy = false;
    render();
  }
}

async function fetchPage(url: string): Promise<PageDocumentation> {
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      throw new Error("The selected URL did not return HTML content.");
    }
    const html = await response.text();
    return extractFromHtml(html, url);
  } catch (error) {
    return createUnavailablePage(url, error);
  }
}

async function collectSelectedPages(): Promise<PageDocumentation[]> {
  if (!state.activePage) {
    return [];
  }
  const selectedUrls = Array.from(state.selectedUrls);
  const pages: PageDocumentation[] = [];
  for (const url of selectedUrls) {
    if (canonicalUrl(url) === canonicalUrl(state.activePage.url)) {
      pages.push(state.activePage);
    } else {
      state.status = `Reading ${shortUrl(url)}...`;
      render();
      pages.push(await fetchPage(url));
    }
  }
  return pages;
}

async function collectEntireSitePages(): Promise<PageDocumentation[]> {
  if (!state.activePage) {
    return [];
  }
  const origin = new URL(state.activePage.url).origin;
  const queue = [canonicalUrl(state.activePage.url), ...state.links.map((link) => canonicalUrl(link.href))];
  const queued = new Set(queue);
  const visited = new Set<string>();
  const pages: PageDocumentation[] = [];

  while (queue.length && pages.length < MAX_SITE_CRAWL_PAGES) {
    const url = queue.shift() as string;
    if (visited.has(url)) {
      continue;
    }
    visited.add(url);
    state.status = `Documenting entire website: ${pages.length + 1}/${MAX_SITE_CRAWL_PAGES} - ${shortUrl(url)}`;
    render();
    const page = canonicalUrl(url) === canonicalUrl(state.activePage.url) ? state.activePage : await fetchPage(url);
    pages.push(page);
    if (page.status !== "ready") {
      continue;
    }
    page.links
      .filter((link) => {
        try {
          const linkUrl = new URL(link.href);
          return linkUrl.origin === origin && /^https?:$/i.test(linkUrl.protocol);
        } catch {
          return false;
        }
      })
      .map((link) => canonicalUrl(link.href))
      .forEach((href) => {
        if (!queued.has(href) && !visited.has(href) && pages.length + queue.length < MAX_SITE_CRAWL_PAGES) {
          queued.add(href);
          queue.push(href);
        }
      });
  }

  return pages;
}

async function buildPackage(captureMode: "selected" | "entire-site" = "selected"): Promise<void> {
  if (!state.activePage) {
    await refreshPage();
  }
  if (!state.activePage) {
    return;
  }

  state.busy = true;
  state.error = "";
  state.status = captureMode === "entire-site" ? "Starting same-domain website crawl..." : "Collecting selected pages...";
  render();

  const pages = captureMode === "entire-site" ? await collectEntireSitePages() : await collectSelectedPages();

  if (state.settings.ai.enabled && state.settings.ai.apiKey.trim()) {
    state.status = "Applying optional source-grounded AI polish...";
    render();
    for (const page of pages) {
      if (page.status !== "ready") {
        continue;
      }
      try {
        page.paragraphs = await polishPageWithAi(page, state.settings.ai);
      } catch (error) {
        page.error = error instanceof Error ? error.message : "AI polishing failed. Local text was used.";
      }
    }
  }

  state.status = "Building the aligned PDF...";
  render();
  const siteTitle = state.activePage.title || new URL(state.activePage.url).hostname;
  await generateDocumentationPdf({
    siteTitle,
    sourceUrl: state.activePage.url,
    generatedAt: new Date().toISOString(),
    pages,
    aiEnabled: state.settings.ai.enabled && Boolean(state.settings.ai.apiKey.trim()),
    captureMode,
    crawlLimit: MAX_SITE_CRAWL_PAGES
  });
  state.busy = false;
  state.status = `PDF generated with ${pages.length} ${captureMode === "entire-site" ? "website" : "selected"} page${pages.length === 1 ? "" : "s"}.`;
  render();
}

function toggleUrl(url: string, checked: boolean): void {
  if (checked) {
    state.selectedUrls.add(url);
  } else if (state.activePage?.url !== url) {
    state.selectedUrls.delete(url);
  }
  render();
}

function updateSettingsFromForm(): void {
  const enabled = document.querySelector<HTMLInputElement>("#ai-enabled")?.checked ?? false;
  const apiKey = document.querySelector<HTMLInputElement>("#ai-key")?.value ?? "";
  const endpoint = document.querySelector<HTMLInputElement>("#ai-endpoint")?.value ?? DEFAULT_SETTINGS.ai.endpoint;
  const model = document.querySelector<HTMLInputElement>("#ai-model")?.value ?? DEFAULT_SETTINGS.ai.model;
  void saveSettings({
    ai: {
      enabled,
      apiKey,
      endpoint,
      model
    }
  });
}

function bindEvents(): void {
  document.querySelector<HTMLButtonElement>("#refresh")?.addEventListener("click", () => void refreshPage());
  document.querySelector<HTMLButtonElement>("#generate")?.addEventListener("click", () => void buildPackage("selected"));
  document.querySelector<HTMLButtonElement>("#generate-all")?.addEventListener("click", () => void buildPackage("entire-site"));
  document.querySelectorAll<HTMLInputElement>("[data-url]").forEach((input) => {
    input.addEventListener("change", () => toggleUrl(input.dataset.url || "", input.checked));
  });
  document.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((input) => {
    input.addEventListener("change", updateSettingsFromForm);
    input.addEventListener("input", updateSettingsFromForm);
  });
}

function renderLinks(): string {
  if (!state.activePage) {
    return `<p class="empty">Open a website tab and press Scan page to begin.</p>`;
  }
  const activeChecked = state.selectedUrls.has(state.activePage.url) ? "checked" : "";
  const currentPage = `
    <label class="page-row locked">
      <input type="checkbox" ${activeChecked} disabled />
      <span>
        <strong>Current page</strong>
        <small>${escapeHtml(shortUrl(state.activePage.url))}</small>
      </span>
    </label>`;
  const discovered = state.links
    .map((link) => {
      const checked = state.selectedUrls.has(link.href) ? "checked" : "";
      return `
        <label class="page-row">
          <input type="checkbox" data-url="${escapeHtml(link.href)}" ${checked} />
          <span>
            <strong>${escapeHtml(link.text || "Untitled page")}</strong>
            <small>${escapeHtml(shortUrl(link.href))}</small>
          </span>
        </label>`;
    })
    .join("");
  return currentPage + (discovered || `<p class="empty">No same-site links were discovered on this page.</p>`);
}

function render(): void {
  if (!app) {
    return;
  }
  const selectedCount = state.selectedUrls.size || 0;
  const disabled = state.busy ? "disabled" : "";
  const ai = state.settings.ai;
  app.innerHTML = `
    <main class="shell">
      <section class="hero-card">
        <div class="orb orb-one"></div>
        <div class="orb orb-two"></div>
        <nav class="topline">
          <span class="brand-mark">D</span>
          <span class="brand">Docme</span>
          <span class="chip">3D PDF</span>
        </nav>
        <div class="hero-grid">
          <div>
            <p class="eyebrow">Website to documentation</p>
            <h1>Make an academic report PDF from selected pages.</h1>
            <p class="subcopy">Docme extracts visible page structure, links, media, and metadata, then exports a formal chapter-based report.</p>
          </div>
          <div class="mascot-card" aria-hidden="true">
            <div class="helmet"></div>
            <div class="face"></div>
            <div class="body"></div>
          </div>
        </div>
        <div class="stats">
          <span><strong>${state.activePage?.headings.length ?? 0}</strong> headings</span>
          <span><strong>${state.links.length}</strong> pages</span>
          <span><strong>${selectedCount}</strong> selected</span>
        </div>
      </section>

      <section class="control-card">
        <div class="actions">
          <button id="refresh" class="button secondary" ${disabled}>Scan page</button>
          <button id="generate" class="button primary" ${disabled || !state.activePage ? "disabled" : ""}>Docme button</button>
        </div>
        <button id="generate-all" class="button whole-site" ${disabled || !state.activePage ? "disabled" : ""}>Document entire website</button>
        <p class="status ${state.error ? "error" : ""}">${escapeHtml(state.error || state.status)}</p>
      </section>

      <section class="panel">
        <div class="section-title">
          <span>Select pages</span>
          <small>Same-domain only</small>
        </div>
        <div class="page-list">${renderLinks()}</div>
      </section>

      <section class="panel settings">
        <div class="section-title">
          <span>ModelsLab AI polish</span>
          <small>Optional</small>
        </div>
        <label class="toggle">
          <input id="ai-enabled" data-setting="enabled" type="checkbox" ${ai.enabled ? "checked" : ""} />
          <span>Enable source-grounded polish</span>
        </label>
        <input id="ai-key" data-setting="apiKey" type="password" placeholder="ModelsLab API key, stored locally" value="${escapeHtml(ai.apiKey)}" />
        <div class="split">
          <input id="ai-model" data-setting="model" type="text" aria-label="AI model" value="${escapeHtml(ai.model)}" />
          <input id="ai-endpoint" data-setting="endpoint" type="url" aria-label="AI endpoint" value="${escapeHtml(ai.endpoint)}" />
        </div>
      </section>
    </main>
  `;
  bindEvents();
}

async function init(): Promise<void> {
  state.settings = await loadSettings();
  render();
  if (chromeAvailable()) {
    await refreshPage();
  } else {
    state.error = "Chrome extension APIs are available only after loading the built extension in Chrome.";
    render();
  }
}

void init();
