import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DocumentPackage, PageDocumentation } from "./types";

type PdfContext = {
  doc: PDFDocument;
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
  };
  pageNumber: number;
  page: PDFPage;
  width: number;
  height: number;
};

const theme = {
  ink: rgb(0, 0, 0),
  muted: rgb(0.18, 0.18, 0.18),
  panel: rgb(1, 1, 1),
  line: rgb(0, 0, 0)
};

const pageWidth = 595.32;
const pageHeight = 841.92;
const margin = 58;
const bottomMargin = 62;
const paragraphSize = 10.5;
const paragraphLeading = 15.5;

function cleanText(text: string): string {
  return text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
}

function safeFileName(text: string): string {
  return text.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48) || "website-report";
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = cleanText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      return;
    }
    if (line) {
      lines.push(line);
    }
    line = word;
  });
  if (line) {
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

async function addReportPage(ctx: PdfContext): Promise<void> {
  const page = ctx.doc.addPage([pageWidth, pageHeight]);
  ctx.page = page;
  ctx.pageNumber += 1;
  const size = page.getSize();
  ctx.width = size.width;
  ctx.height = size.height;
  drawFooter(ctx);
}

function drawFooter(ctx: PdfContext): void {
  ctx.page.drawText(`Page ${ctx.pageNumber}`, {
    x: ctx.width - margin - 34,
    y: 28,
    size: 8.5,
    font: ctx.fonts.regular,
    color: theme.muted
  });
}

function drawCentered(ctx: PdfContext, text: string, y: number, size: number, bold = false): number {
  const font = bold ? ctx.fonts.bold : ctx.fonts.regular;
  const lines = wrapText(text, font, size, ctx.width - margin * 2);
  lines.forEach((line, index) => {
    const width = font.widthOfTextAtSize(line, size);
    ctx.page.drawText(line, {
      x: (ctx.width - width) / 2,
      y: y - index * (size + 7),
      size,
      font,
      color: theme.ink
    });
  });
  return y - lines.length * (size + 7);
}

function drawHeading(ctx: PdfContext, text: string, y: number, level: 1 | 2 = 1): number {
  const size = level === 1 ? 16 : 12.5;
  ctx.page.drawText(cleanText(text), {
    x: margin,
    y,
    size,
    font: ctx.fonts.bold,
    color: theme.ink
  });
  if (level === 1) {
    ctx.page.drawLine({
      start: { x: margin, y: y - 8 },
      end: { x: ctx.width - margin, y: y - 8 },
      thickness: 0.8,
      color: theme.line
    });
    return y - 30;
  }
  return y - 22;
}

function drawJustifiedLine(ctx: PdfContext, words: string[], x: number, y: number, maxWidth: number, size: number): void {
  if (words.length <= 1) {
    ctx.page.drawText(words.join(" "), { x, y, size, font: ctx.fonts.regular, color: theme.ink });
    return;
  }
  const rawWidth = words.reduce((total, word) => total + ctx.fonts.regular.widthOfTextAtSize(word, size), 0);
  const gap = (maxWidth - rawWidth) / (words.length - 1);
  let cursor = x;
  words.forEach((word) => {
    ctx.page.drawText(word, { x: cursor, y, size, font: ctx.fonts.regular, color: theme.ink });
    cursor += ctx.fonts.regular.widthOfTextAtSize(word, size) + gap;
  });
}

function drawParagraph(ctx: PdfContext, text: string, y: number, indent = true): number {
  const maxWidth = ctx.width - margin * 2;
  const lines = wrapText(text, ctx.fonts.regular, paragraphSize, maxWidth - (indent ? 18 : 0));
  lines.forEach((line, index) => {
    const x = margin + (index === 0 && indent ? 18 : 0);
    const lineWords = line.split(" ");
    const shouldJustify = index < lines.length - 1 && lineWords.length > 3;
    if (shouldJustify) {
      drawJustifiedLine(ctx, lineWords, x, y - index * paragraphLeading, maxWidth - (index === 0 && indent ? 18 : 0), paragraphSize);
    } else {
      ctx.page.drawText(line, {
        x,
        y: y - index * paragraphLeading,
        size: paragraphSize,
        font: ctx.fonts.regular,
        color: theme.ink
      });
    }
  });
  return y - lines.length * paragraphLeading - 8;
}

async function ensureSpace(ctx: PdfContext, y: number, needed = 64): Promise<number> {
  if (y - needed > bottomMargin) {
    return y;
  }
  await addReportPage(ctx);
  return ctx.height - 92;
}

async function drawParagraphs(ctx: PdfContext, paragraphs: string[], y: number): Promise<number> {
  for (const paragraph of paragraphs) {
    y = await ensureSpace(ctx, y, 80);
    y = drawParagraph(ctx, paragraph, y);
  }
  return y;
}

async function drawTocLine(ctx: PdfContext, title: string, pageLabel: string, y: number): Promise<number> {
  y = await ensureSpace(ctx, y, 26);
  ctx.page.drawText(cleanText(title), {
    x: margin,
    y,
    size: 10.5,
    font: ctx.fonts.regular,
    color: theme.ink
  });
  ctx.page.drawText(pageLabel, {
    x: ctx.width - margin - 20,
    y,
    size: 10.5,
    font: ctx.fonts.regular,
    color: theme.ink
  });
  return y - 20;
}

function pageParagraphs(page: PageDocumentation): string[] {
  if (page.status === "unavailable") {
    return [
      `The page located at ${page.url} was included in the report scope, but the extension could not obtain readable HTML content from the source. The recorded status is retained to preserve the completeness of the capture process.`,
      page.error ? `The reported access issue was: ${page.error}.` : "The access issue was not accompanied by a detailed browser error."
    ];
  }
  const summary = page.description
    ? `The page titled "${page.title}" presents itself through the following published description: ${page.description}`
    : `The page titled "${page.title}" does not provide a published meta description, therefore the analysis is based on visible text, headings, links, and media elements.`;
  const structure = page.headings.length
    ? `The structural outline is led by headings such as ${page.headings
        .slice(0, 6)
        .map((heading) => `"${heading.text}"`)
        .join(", ")}. This hierarchy indicates the main content areas available to the reader.`
    : "No heading hierarchy was detected on this page, which limits the semantic clarity available for automated documentation.";
  const content = page.paragraphs.length
    ? page.paragraphs.slice(0, 5)
    : ["No substantial paragraph text was detected on the page during capture."];
  const links = `The page contains ${page.links.length} readable link references, including ${
    page.links.filter((link) => link.sameDomain).length
  } internal references and ${page.links.filter((link) => !link.sameDomain).length} external references.`;
  const media = `The media review identified ${page.images.length} readable image asset${
    page.images.length === 1 ? "" : "s"
  } from the page source.`;
  return [summary, structure, ...content, links, media];
}

async function addTitlePage(ctx: PdfContext, pack: DocumentPackage): Promise<void> {
  await addReportPage(ctx);
  let y = 606;
  y = drawCentered(ctx, `${pack.siteTitle}`, y, 25, true);
  y = drawCentered(ctx, "Technical Documentation Report", y - 18, 21, true);
  y = drawCentered(ctx, "Final Year Project Style Report", y - 42, 13);
  y -= 60;
  y = drawCentered(ctx, `Source Website: ${pack.sourceUrl}`, y, 11);
  y = drawCentered(ctx, `Generated: ${new Date(pack.generatedAt).toLocaleString()}`, y - 8, 11);
  y = drawCentered(
    ctx,
    `Capture Method: ${pack.captureMode === "entire-site" ? `Same-domain crawl up to ${pack.crawlLimit} pages` : "User-selected website pages"}`,
    y - 8,
    11
  );
  drawCentered(ctx, "Prepared by: Docme Chrome Extension", 182, 11);
}

async function addAbstract(ctx: PdfContext, pack: DocumentPackage): Promise<void> {
  await addReportPage(ctx);
  let y = ctx.height - 96;
  y = drawHeading(ctx, "Abstract", y);
  const readyCount = pack.pages.filter((page) => page.status === "ready").length;
  await drawParagraphs(
    ctx,
    [
      `This report documents the structure and observable content of ${pack.siteTitle} using information captured directly from the selected website pages. The document follows a formal academic report format and records page metadata, content hierarchy, link references, and media evidence available at the time of capture.`,
      `The report includes ${pack.pages.length} page record${pack.pages.length === 1 ? "" : "s"}, of which ${readyCount} returned readable HTML content. The remaining page records are preserved with their access status so that the documentation process remains transparent and reproducible.`,
      `The analysis is limited to source-grounded evidence obtained through the browser extension. It does not infer business claims, implementation details, ownership information, or functional behaviour beyond what is visible in the captured page content.`
    ],
    y
  );
}

async function addTableOfContents(ctx: PdfContext, pack: DocumentPackage): Promise<void> {
  await addReportPage(ctx);
  let y = ctx.height - 96;
  y = drawHeading(ctx, "Table of Contents", y);
  y = await drawTocLine(ctx, "Abstract", "i", y);
  y = await drawTocLine(ctx, "Chapter 1 Introduction", "1", y);
  y = await drawTocLine(ctx, "1.1 Background of the Website", "1", y);
  y = await drawTocLine(ctx, "1.2 Scope of Documentation", "1", y);
  y = await drawTocLine(ctx, "Chapter 2 Website Overview", "2", y);
  y = await drawTocLine(ctx, "2.1 Capture Summary", "2", y);
  y = await drawTocLine(ctx, "2.2 Page Inventory", "2", y);
  y = await drawTocLine(ctx, "Chapter 3 Page-Level Documentation", "3", y);
  pack.pages.slice(0, 18).forEach((page, index) => {
    y -= 0;
    ctx.page.drawText(`3.${index + 1} ${cleanText(page.title || page.url).slice(0, 58)}`, {
      x: margin,
      y,
      size: 9.5,
      font: ctx.fonts.regular,
      color: theme.ink
    });
    y -= 18;
  });
  y = await drawTocLine(ctx, "Chapter 4 Technical Content Structure", "4", y - 4);
  await drawTocLine(ctx, "Chapter 5 Source Notes and Limitations", "5", y);
}

async function addIntroduction(ctx: PdfContext, pack: DocumentPackage): Promise<void> {
  await addReportPage(ctx);
  let y = ctx.height - 96;
  y = drawHeading(ctx, "Chapter 1 Introduction", y);
  y = drawHeading(ctx, "1.1 Background of the Website", y, 2);
  y = await drawParagraphs(
    ctx,
    [
      `${pack.siteTitle} was documented from the source address ${pack.sourceUrl}. The report records the website as it appeared during the capture process, with emphasis on content structure, navigational references, and observable page-level information.`,
      "The documentation is prepared in a formal technical-report format so that the captured website material can be reviewed as a structured academic submission rather than as a raw extraction of browser content."
    ],
    y
  );
  y = await ensureSpace(ctx, y, 90);
  y = drawHeading(ctx, "1.2 Scope of Documentation", y, 2);
  await drawParagraphs(
    ctx,
    [
      pack.captureMode === "entire-site"
        ? `The capture scope includes the active page and same-domain pages discovered through internal links, subject to a maximum limit of ${pack.crawlLimit} pages. This boundary prevents uncontrolled crawling while still allowing the report to represent the broader website structure.`
        : "The capture scope includes the active page and the same-domain pages selected by the user before report generation.",
      "The report does not claim access to server-side implementation, private data, analytics, or administrative functions. Each section is derived from browser-accessible page evidence."
    ],
    y
  );
}

async function addOverview(ctx: PdfContext, pack: DocumentPackage): Promise<void> {
  await addReportPage(ctx);
  let y = ctx.height - 96;
  y = drawHeading(ctx, "Chapter 2 Website Overview", y);
  y = drawHeading(ctx, "2.1 Capture Summary", y, 2);
  y = await drawParagraphs(
    ctx,
    [
      `A total of ${pack.pages.length} page record${pack.pages.length === 1 ? "" : "s"} were included in the generated report. ${
        pack.pages.filter((page) => page.status === "ready").length
      } page record${pack.pages.filter((page) => page.status === "ready").length === 1 ? "" : "s"} returned readable content, while ${
        pack.pages.filter((page) => page.status === "unavailable").length
      } page record${pack.pages.filter((page) => page.status === "unavailable").length === 1 ? "" : "s"} could not be read by the extension.`,
      `The documentation method was ${pack.aiEnabled ? "local extraction with optional source-grounded language refinement" : "local source-grounded extraction without language model refinement"}.`
    ],
    y
  );
  y = await ensureSpace(ctx, y, 100);
  y = drawHeading(ctx, "2.2 Page Inventory", y, 2);
  for (const [index, page] of pack.pages.entries()) {
    y = await ensureSpace(ctx, y, 34);
    y = drawParagraph(ctx, `${index + 1}. ${page.status === "ready" ? "Readable" : "Unavailable"} - ${page.title || page.url} (${page.url})`, y, false);
  }
}

async function addPageDocumentation(ctx: PdfContext, pack: DocumentPackage): Promise<void> {
  await addReportPage(ctx);
  let y = ctx.height - 96;
  y = drawHeading(ctx, "Chapter 3 Page-Level Documentation", y);
  for (const [index, page] of pack.pages.entries()) {
    y = await ensureSpace(ctx, y, 120);
    y = drawHeading(ctx, `3.${index + 1} ${page.title || "Untitled Page"}`, y, 2);
    y = await drawParagraphs(ctx, pageParagraphs(page), y);
  }
}

async function addTechnicalStructure(ctx: PdfContext, pack: DocumentPackage): Promise<void> {
  await addReportPage(ctx);
  let y = ctx.height - 96;
  y = drawHeading(ctx, "Chapter 4 Technical Content Structure", y);
  y = drawHeading(ctx, "4.1 Heading Hierarchy", y, 2);
  const headingCount = pack.pages.reduce((total, page) => total + page.headings.length, 0);
  y = await drawParagraphs(
    ctx,
    [
      `The captured pages contain ${headingCount} heading element${headingCount === 1 ? "" : "s"} across the documented scope. These headings provide the primary semantic outline used to identify visible sections and content priorities.`,
      "Where heading elements were absent, the report records the limitation rather than assigning an artificial structure to the page."
    ],
    y
  );
  y = await ensureSpace(ctx, y, 90);
  y = drawHeading(ctx, "4.2 Links and Media References", y, 2);
  const linkCount = pack.pages.reduce((total, page) => total + page.links.length, 0);
  const imageCount = pack.pages.reduce((total, page) => total + page.images.length, 0);
  await drawParagraphs(
    ctx,
    [
      `The documentation process identified ${linkCount} readable link reference${linkCount === 1 ? "" : "s"} and ${imageCount} readable image asset${imageCount === 1 ? "" : "s"}. Internal links support the website navigation map, while external links indicate references leading beyond the captured domain.`,
      "Media assets are documented by their available alternate text and source reference. The report does not download, reproduce, or evaluate the visual content of those assets beyond the metadata available in the page source."
    ],
    y
  );
}

async function addLimitations(ctx: PdfContext, pack: DocumentPackage): Promise<void> {
  await addReportPage(ctx);
  let y = ctx.height - 96;
  y = drawHeading(ctx, "Chapter 5 Source Notes and Limitations", y);
  y = drawHeading(ctx, "5.1 Source Grounding", y, 2);
  y = await drawParagraphs(
    ctx,
    [
      "All report content is grounded in browser-accessible evidence captured from the selected website pages. The extension records visible text, page metadata, heading elements, anchor references, and image references available during generation.",
      "The report avoids unsupported assumptions about private systems, back-end logic, user accounts, database design, deployment infrastructure, or organisational processes."
    ],
    y
  );
  y = await ensureSpace(ctx, y, 90);
  y = drawHeading(ctx, "5.2 Capture Limitations", y, 2);
  await drawParagraphs(
    ctx,
    [
      "Some pages may restrict automated access, require user interaction, or render content after the initial browser capture. Such constraints can affect the amount of readable evidence available to the extension.",
      "The generated report should therefore be treated as a structured documentation record of the captured website state, not as a complete audit of all possible website behaviour."
    ],
    y
  );
}

function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function generateDocumentationPdf(pack: DocumentPackage): Promise<void> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ctx: PdfContext = {
    doc,
    fonts: { regular, bold },
    pageNumber: 0,
    page: doc.addPage([pageWidth, pageHeight]),
    width: pageWidth,
    height: pageHeight
  };
  doc.removePage(0);

  await addTitlePage(ctx, pack);
  await addAbstract(ctx, pack);
  await addTableOfContents(ctx, pack);
  await addIntroduction(ctx, pack);
  await addOverview(ctx, pack);
  await addPageDocumentation(ctx, pack);
  await addTechnicalStructure(ctx, pack);
  await addLimitations(ctx, pack);

  const bytes = await doc.save();
  downloadPdf(bytes, `Docme-${safeFileName(pack.siteTitle)}.pdf`);
}
