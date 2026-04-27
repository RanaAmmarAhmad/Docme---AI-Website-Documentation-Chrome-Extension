import {
  MAX_DISCOVERED_LINKS,
  MAX_IMAGES_PER_PAGE,
  MAX_LINKS_PER_PAGE,
  MAX_PARAGRAPHS_PER_PAGE
} from "./defaults";
import type { DocHeading, DocImage, DocLink, PageDocumentation } from "./types";

const BLOCKED_PROTOCOLS = new Set(["mailto:", "tel:", "javascript:", "data:", "blob:"]);

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isReadableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return !BLOCKED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function sameOriginUrl(candidate: string, originUrl: string): boolean {
  try {
    return new URL(candidate).origin === new URL(originUrl).origin;
  } catch {
    return false;
  }
}

export function uniqueByUrl(links: DocLink[]): DocLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = link.href.replace(/#.*$/, "");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function extractFromDocument(doc: Document, pageUrl: string): PageDocumentation {
  const title = normalizeText(
    doc.querySelector("meta[property='og:title']")?.getAttribute("content") ||
      doc.querySelector("title")?.textContent ||
      doc.title ||
      new URL(pageUrl).hostname
  );

  const description = normalizeText(
    doc.querySelector("meta[name='description']")?.getAttribute("content") ||
      doc.querySelector("meta[property='og:description']")?.getAttribute("content") ||
      ""
  );

  const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6"))
    .map((node): DocHeading | null => {
      const text = normalizeText(node.textContent || "");
      if (!text) {
        return null;
      }
      return {
        level: Number(node.tagName.substring(1)) as DocHeading["level"],
        text
      };
    })
    .filter((heading): heading is DocHeading => Boolean(heading))
    .slice(0, 48);

  const paragraphs = Array.from(doc.querySelectorAll("main p, article p, section p, p, li"))
    .map((node) => normalizeText(node.textContent || ""))
    .filter((text) => text.length > 45)
    .filter((text, index, all) => all.indexOf(text) === index)
    .slice(0, MAX_PARAGRAPHS_PER_PAGE);

  const links = uniqueByUrl(
    Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((anchor): DocLink | null => {
        const href = anchor.href;
        if (!href || !isReadableUrl(href)) {
          return null;
        }
        return {
          text: normalizeText(anchor.textContent || anchor.getAttribute("aria-label") || href),
          href,
          sameDomain: sameOriginUrl(href, pageUrl)
        };
      })
      .filter((link): link is DocLink => Boolean(link))
  ).slice(0, MAX_LINKS_PER_PAGE);

  const images = Array.from(doc.querySelectorAll<HTMLImageElement>("img[src]"))
    .map((image): DocImage => ({
      alt: normalizeText(image.alt || image.getAttribute("aria-label") || "Website image"),
      src: image.currentSrc || image.src
    }))
    .filter((image, index, all) => image.src && all.findIndex((entry) => entry.src === image.src) === index)
    .slice(0, MAX_IMAGES_PER_PAGE);

  return {
    url: pageUrl,
    title,
    description,
    language: doc.documentElement.lang || "Not specified",
    headings,
    paragraphs,
    links,
    images,
    status: "ready",
    extractedAt: new Date().toISOString()
  };
}

export function discoverSameDomainLinks(page: PageDocumentation): DocLink[] {
  return page.links
    .filter((link) => link.sameDomain)
    .filter((link) => {
      const url = new URL(link.href);
      return url.href.replace(/#.*$/, "") !== page.url.replace(/#.*$/, "");
    })
    .slice(0, MAX_DISCOVERED_LINKS);
}

export async function extractFromHtml(html: string, pageUrl: string): Promise<PageDocumentation> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return extractFromDocument(doc, pageUrl);
}

export function createUnavailablePage(url: string, error: unknown): PageDocumentation {
  return {
    url,
    title: new URL(url).hostname,
    description: "",
    language: "Not available",
    headings: [],
    paragraphs: [],
    links: [],
    images: [],
    status: "unavailable",
    error: error instanceof Error ? error.message : "This page could not be read by the extension.",
    extractedAt: new Date().toISOString()
  };
}
