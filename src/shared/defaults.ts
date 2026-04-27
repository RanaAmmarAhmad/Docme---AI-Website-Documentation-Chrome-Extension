import type { ExtensionSettings } from "./types";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  ai: {
    enabled: true,
    apiKey: import.meta.env.VITE_MODELSLAB_API_KEY || "",
    endpoint: import.meta.env.VITE_MODELSLAB_ENDPOINT || "https://modelslab.com/api/v7/llm/chat/completions",
    model: import.meta.env.VITE_MODELSLAB_MODEL || "openai-gpt-oss-120b-free"
  }
};

export const MAX_DISCOVERED_LINKS = 24;
export const MAX_SITE_CRAWL_PAGES = 40;
export const MAX_PARAGRAPHS_PER_PAGE = 28;
export const MAX_LINKS_PER_PAGE = 36;
export const MAX_IMAGES_PER_PAGE = 18;
