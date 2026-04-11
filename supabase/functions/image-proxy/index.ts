const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml"
];
const MAX_BYTES = 10 * 1024 * 1024;

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch (_error) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const target = parseHttpUrl(body.url);
  if (!target) {
    return jsonResponse(400, { error: "Missing or invalid url" });
  }

  const browserHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `${target.protocol}//${target.host}/`
  };

  async function fetchUpstream(headers: Record<string, string>) {
    return await fetch(target.toString(), { headers, redirect: "follow" });
  }

  let upstream: Response;
  try {
    upstream = await fetchUpstream(browserHeaders);
    if (upstream.status === 401 || upstream.status === 403) {
      // Some hosts block any Referer; retry without it.
      const { Referer: _omit, ...noReferer } = browserHeaders;
      upstream = await fetchUpstream(noReferer);
    }
  } catch (error) {
    return jsonResponse(502, { error: `Fetch failed: ${(error as Error).message}` });
  }

  if (!upstream.ok) {
    return jsonResponse(upstream.status, { error: `Upstream status ${upstream.status}` });
  }

  const contentType = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return jsonResponse(415, { error: `Unsupported content-type: ${contentType || "unknown"}` });
  }

  const buffer = await upstream.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    return jsonResponse(413, { error: "Image too large" });
  }

  return new Response(buffer, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store"
    }
  });
});
