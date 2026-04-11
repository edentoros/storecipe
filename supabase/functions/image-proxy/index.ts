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

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StorecipeImageProxy/1.0)",
        Accept: "image/*"
      },
      redirect: "follow"
    });
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
