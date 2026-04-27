import type { PageDocumentation } from "../shared/types";

export function extractActivePage(): PageDocumentation {
  const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();
  const pageUrl = window.location.href;
  const blockedProtocols = new Set(["mailto:", "tel:", "javascript:", "data:", "blob:"]);
  const sameOrigin = (candidate: string) => {
    try {
      return new URL(candidate).origin === window.location.origin;
    } catch {
      return false;
    }
  };
  const readable = (candidate: string) => {
    try {
      return !blockedProtocols.has(new URL(candidate).protocol);
    } catch {
      return false;
    }
  };
  const unique = <T extends { href?: string; src?: string }>(items: T[], keyName: "href" | "src") => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const raw = item[keyName];
      if (!raw) {
        return false;
      }
      const key = raw.replace(/#.*$/, "");
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  const title = normalizeText(
    document.querySelector("meta[property='og:title']")?.getAttribute("content") ||
      document.querySelector("title")?.textContent ||
      document.title ||
      window.location.hostname
  );
  const description = normalizeText(
    document.querySelector("meta[name='description']")?.getAttribute("content") ||
      document.querySelector("meta[property='og:description']")?.getAttribute("content") ||
      ""
  );
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
    .map((node) => ({
      level: Number(node.tagName.substring(1)) as 1 | 2 | 3 | 4 | 5 | 6,
      text: normalizeText(node.textContent || "")
    }))
    .filter((heading) => heading.text)
    .slice(0, 48);
  const paragraphs = Array.from(document.querySelectorAll("main p, article p, section p, p, li"))
    .map((node) => normalizeText(node.textContent || ""))
    .filter((text) => text.length > 45)
    .filter((text, index, all) => all.indexOf(text) === index)
    .slice(0, 28);
  const links = unique(
    Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((anchor) => ({
        text: normalizeText(anchor.textContent || anchor.getAttribute("aria-label") || anchor.href),
        href: anchor.href,
        sameDomain: sameOrigin(anchor.href)
      }))
      .filter((link) => link.href && readable(link.href)),
    "href"
  ).slice(0, 36);
  const images = unique(
    Array.from(document.querySelectorAll<HTMLImageElement>("img[src]")).map((image) => ({
      alt: normalizeText(image.alt || image.getAttribute("aria-label") || "Website image"),
      src: image.currentSrc || image.src
    })),
    "src"
  ).slice(0, 18);

  return {
    url: pageUrl,
    title,
    description,
    language: document.documentElement.lang || "Not specified",
    headings,
    paragraphs,
    links,
    images,
    status: "ready",
    extractedAt: new Date().toISOString()
  };
}
