const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
const MAX_HTML_CHARS = 300_000;
const MAX_TEXT_CHARS = 18_000;

type ImportedRecipe = {
  title: string;
  ingredients: string[];
  method: string[];
  prep_hours: number | null;
  prep_minutes: number | null;
  cook_hours: number | null;
  cook_minutes: number | null;
  serves: number | null;
  difficulty: number | null;
  image_url: string | null;
  source_url: string;
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Unexpected error");
}

function parseHttpUrl(value: unknown): URL | null {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch (_error) {
    return null;
  }
}

function htmlDecode(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");

  const blockBreaks = withoutNoise
    .replace(/<\/(p|div|li|section|article|h1|h2|h3|h4|h5|h6|tr|br)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ");

  const withoutTags = blockBreaks.replace(/<[^>]+>/g, " ");
  return htmlDecode(withoutTags)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractMetaContent(html: string, key: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = html.match(pattern);
  return match?.[1] ? htmlDecode(match[1]).trim() : null;
}

function extractTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch?.[1] ? htmlDecode(titleMatch[1]).trim() : null;
}

function toTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }
  const text = String(value ?? "").trim();
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampInteger(value: unknown, min: number, max: number): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function normalizeTime(hoursRaw: unknown, minutesRaw: unknown) {
  const hours = clampInteger(hoursRaw, 0, 10);
  const minutes = clampInteger(minutesRaw, 0, 60);
  if (hours == null && minutes == null) {
    return { hours: null, minutes: null };
  }

  const safeHours = hours ?? 0;
  const safeMinutes = minutes ?? 0;
  if (safeHours === 0 && safeMinutes === 0) {
    return { hours: null, minutes: null };
  }

  return { hours: safeHours, minutes: safeMinutes };
}

function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end < 0 || end <= start) {
      throw new Error("OpenAI did not return valid JSON.");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

async function callOpenAiForRecipe(payload: {
  pageUrl: string;
  pageTitle: string;
  ogImage: string | null;
  prompt: string;
  pageText: string;
}): Promise<Record<string, unknown>> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured in Supabase Edge Function secrets.");
  }

  const schema = {
    name: "recipe_import",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        ingredients: {
          type: "array",
          items: { type: "string" }
        },
        method: {
          type: "array",
          items: { type: "string" }
        },
        prep_hours: { type: ["integer", "null"], minimum: 0, maximum: 10 },
        prep_minutes: { type: ["integer", "null"], minimum: 0, maximum: 60 },
        cook_hours: { type: ["integer", "null"], minimum: 0, maximum: 10 },
        cook_minutes: { type: ["integer", "null"], minimum: 0, maximum: 60 },
        serves: { type: ["integer", "null"], minimum: 1, maximum: 15 },
        difficulty: { type: ["integer", "null"], minimum: 1, maximum: 10 },
        image_url: { type: ["string", "null"] }
      },
      required: [
        "title",
        "ingredients",
        "method",
        "prep_hours",
        "prep_minutes",
        "cook_hours",
        "cook_minutes",
        "serves",
        "difficulty",
        "image_url"
      ]
    }
  };

  const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: schema
      },
      messages: [
        {
          role: "system",
          content: "You convert webpage recipe content into structured JSON only."
        },
        {
          role: "user",
          content: [
            payload.prompt.trim(),
            `Source URL: ${payload.pageUrl}`,
            `Page title: ${payload.pageTitle}`,
            `Detected image URL: ${payload.ogImage || "none"}`,
            "Page text starts below:",
            payload.pageText
          ].join("\n\n")
        }
      ]
    })
  });

  const rawText = await openAiResponse.text();
  let openAiData: Record<string, unknown> = {};
  try {
    openAiData = rawText ? JSON.parse(rawText) : {};
  } catch (_error) {
    openAiData = {};
  }

  if (!openAiResponse.ok) {
    const apiError = (openAiData?.error as { message?: string } | undefined)?.message;
    throw new Error(apiError || `OpenAI request failed with status ${openAiResponse.status}.`);
  }

  const choices = openAiData?.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content;

  if (typeof content === "string") {
    return extractJsonObject(content);
  }

  if (Array.isArray(content)) {
    const textChunk = content.find(
      (item) => item && typeof item === "object" && "text" in item
    ) as { text?: string } | undefined;
    if (typeof textChunk?.text === "string") {
      return extractJsonObject(textChunk.text);
    }
  }

  throw new Error("OpenAI response did not include parsable content.");
}

function normalizeRecipe(raw: Record<string, unknown>, sourceUrl: string, fallbackTitle: string, fallbackImage: string | null): ImportedRecipe {
  const prep = normalizeTime(raw.prep_hours, raw.prep_minutes);
  const cook = normalizeTime(raw.cook_hours, raw.cook_minutes);
  const serves = clampInteger(raw.serves, 1, 15);
  const difficulty = clampInteger(raw.difficulty, 1, 10) ?? 4;
  const parsedImage = parseHttpUrl(raw.image_url)?.toString() || fallbackImage;

  const title = String(raw.title ?? "").trim() || fallbackTitle || "Imported recipe";
  const ingredients = toTextArray(raw.ingredients);
  const method = toTextArray(raw.method);

  return {
    title,
    ingredients,
    method,
    prep_hours: prep.hours,
    prep_minutes: prep.minutes,
    cook_hours: cook.hours,
    cook_minutes: cook.minutes,
    serves,
    difficulty,
    image_url: parsedImage,
    source_url: sourceUrl
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const body = await request.json();
    const pageUrl = parseHttpUrl(body?.url);
    if (!pageUrl) {
      return jsonResponse(400, { error: "Provide a valid recipe URL (http/https)." });
    }

    const prompt = String(body?.prompt ?? "").trim();
    if (!prompt) {
      return jsonResponse(400, { error: "Import prompt cannot be empty." });
    }

    const pageResponse = await fetch(pageUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "StorecipeBot/1.0 (+https://storecipe.local)"
      }
    });

    if (!pageResponse.ok) {
      return jsonResponse(400, { error: `Could not fetch page (status ${pageResponse.status}).` });
    }

    const html = (await pageResponse.text()).slice(0, MAX_HTML_CHARS);
    const pageTitle = extractMetaContent(html, "og:title") || extractTitle(html) || "Imported recipe";
    const ogImage = parseHttpUrl(extractMetaContent(html, "og:image"))?.toString() || null;
    const pageText = stripHtmlToText(html).slice(0, MAX_TEXT_CHARS);

    if (!pageText) {
      return jsonResponse(400, { error: "The page did not provide readable text to import." });
    }

    const rawRecipe = await callOpenAiForRecipe({
      pageUrl: pageUrl.toString(),
      pageTitle,
      ogImage,
      prompt,
      pageText
    });

    const recipe = normalizeRecipe(rawRecipe, pageUrl.toString(), pageTitle, ogImage);
    return jsonResponse(200, { recipe, model: OPENAI_MODEL });
  } catch (error) {
    return jsonResponse(500, { error: safeErrorMessage(error) });
  }
});
