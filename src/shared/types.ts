export type DocLink = {
  text: string;
  href: string;
  sameDomain: boolean;
};

export type DocImage = {
  alt: string;
  src: string;
};

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type DocHeading = {
  level: HeadingLevel;
  text: string;
};

export type PageDocumentation = {
  url: string;
  title: string;
  description: string;
  language: string;
  headings: DocHeading[];
  paragraphs: string[];
  links: DocLink[];
  images: DocImage[];
  status: "ready" | "unavailable";
  error?: string;
  extractedAt: string;
};

export type AiSettings = {
  enabled: boolean;
  apiKey: string;
  endpoint: string;
  model: string;
};

export type ExtensionSettings = {
  ai: AiSettings;
};

export type DocumentPackage = {
  siteTitle: string;
  sourceUrl: string;
  generatedAt: string;
  pages: PageDocumentation[];
  aiEnabled: boolean;
  captureMode: "selected" | "entire-site";
  crawlLimit: number;
};
