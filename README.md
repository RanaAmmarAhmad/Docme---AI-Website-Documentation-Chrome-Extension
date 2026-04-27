# Docme

Docme is a Chrome extension that turns any website into a clean, black-and-white academic documentation report. It extracts page content, headings, links, metadata, and media references, then generates a chapter-based PDF in a formal report style.
<img width="517" height="738" alt="image" src="https://github.com/user-attachments/assets/aaa1e886-6e30-4722-a4bd-a6d064a79682" />


## Features

- Generate a professional PDF report from the active website.
- Document selected same-domain pages or crawl the entire website with one click.
- Produce a Final Year Project-style structure with a title page, abstract, table of contents, chapters, numbered headings, and justified paragraphs.
- Use AI-assisted academic rewriting through the ModelsLab `openai-gpt-oss-120b-free` model.
- Preserve source-grounded writing by using only information extracted from the website.
- Export clean black-and-white PDF reports without colored overlays or template backgrounds.

## Tech Stack

- Chrome Manifest V3
- TypeScript
- Vite
- pdf-lib
- ModelsLab chat completions API

## Installation

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Then add your ModelsLab API key in `.env`:

```text
VITE_MODELSLAB_API_KEY=your_modelslab_api_key_here
```

Install dependencies:

```powershell
npm.cmd install
```

Build the extension:

```powershell
npm.cmd run build
```

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the generated `dist` folder.
5. Open a website and click the Docme extension icon.
6. Choose selected pages or press `Document entire website`.
7. Click `Docme button` to generate the PDF report.

## AI Configuration

Docme is configured for ModelsLab by default:

```text
Endpoint: https://modelslab.com/api/v7/llm/chat/completions
Model: openai-gpt-oss-120b-free
```

The extension stores AI settings in Chrome local storage. If you publish this project publicly, do not commit private API keys.

Credentials are loaded from `.env` during the Vite build. The `.env` file is ignored by Git; use `.env.example` as the public template.

## Report Structure

Generated PDFs follow an academic report format:

- Title Page
- Abstract
- Table of Contents
- Chapter 1 Introduction
- Chapter 2 Website Overview
- Chapter 3 Page-Level Documentation
- Chapter 4 Technical Content Structure
- Chapter 5 Source Notes and Limitations

## Notes

- Entire website mode crawls same-domain HTML pages and stops at 40 pages for safety.
- If a page cannot be accessed, the report records it as unavailable instead of failing silently.
- The report does not invent facts, technical claims, or implementation details that are not visible in the captured website content.
