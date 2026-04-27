import type { AiSettings, PageDocumentation } from "./types";

type ResponsesApiPayload = {
  model: string;
  input: string;
  temperature?: number;
};

type ChatCompletionsPayload = {
  model_id: string;
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>;
  max_tokens: number;
  temperature: number;
  key?: string;
};

type ResponsesApiResult = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
};

type ChatCompletionsResult = {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
  message?: {
    content?: string;
  };
  output_text?: string;
  text?: string;
};

function parseAiText(data: ResponsesApiResult & ChatCompletionsResult): string {
  return (
    data.output_text ||
    data.choices?.[0]?.message?.content ||
    data.choices?.[0]?.text ||
    data.message?.content ||
    data.text ||
    data.output
      ?.flatMap((item) => item.content || [])
      .map((content) => content.text || "")
      .join("\n") ||
    ""
  );
}

function isModelsLabEndpoint(endpoint: string): boolean {
  return endpoint.includes("modelslab.com/api/v7/llm/chat/completions");
}

export async function polishPageWithAi(page: PageDocumentation, settings: AiSettings): Promise<string[]> {
  if (!settings.enabled || !settings.apiKey.trim()) {
    return page.paragraphs;
  }

  const sourceFacts = [
    `URL: ${page.url}`,
    `Title: ${page.title}`,
    page.description ? `Description: ${page.description}` : "",
    `Headings: ${page.headings.map((heading) => heading.text).join(" | ")}`,
    `Visible text: ${page.paragraphs.slice(0, 16).join(" ")}`
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = [
    "Write academic report content from the source facts below.",
    "Strict writing rules:",
    "- Use formal academic English suitable for a university technical report.",
    "- Use only facts present in the source facts.",
    "- Do not invent claims, metrics, features, pricing, implementation details, or policies.",
    "- Do not use generic AI phrasing, promotional language, or filler.",
    "- Do not use these phrases: In today's world, This project aims to, In conclusion, revolutionary, cutting-edge.",
    "- Write naturally, with varied sentence structure and a student-report tone.",
    "- Return 4 to 6 short paragraphs separated by blank lines.",
    "- Do not return bullets, markdown, headings, or numbering.",
    "",
    sourceFacts
  ].join("\n");

  const payload: ResponsesApiPayload | ChatCompletionsPayload = isModelsLabEndpoint(settings.endpoint)
    ? {
        model_id: settings.model,
        messages: [
          {
            role: "system",
            content:
              "You are a professional academic technical writer. You produce concise, source-grounded university report prose without AI-like wording or invented facts."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.2,
        key: settings.apiKey
      }
    : {
        model: settings.model,
        input: prompt,
        temperature: 0.2
      };

  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(isModelsLabEndpoint(settings.endpoint) ? {} : { Authorization: `Bearer ${settings.apiKey}` })
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`AI polishing failed with HTTP ${response.status}. Local documentation was used instead.`);
  }

  const data = (await response.json()) as ResponsesApiResult & ChatCompletionsResult;
  const text = parseAiText(data);

  const polished = text
    .split(/\n{2,}|\r\n{2,}/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  return polished.length ? polished : page.paragraphs;
}
