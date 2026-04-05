// Tests for supabase/functions/recipe-import/index.ts normalizer logic
// Run with: node --test tests/edge-function.test.js
// Requires Node 18+

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Since index.ts is TypeScript (Deno), we extract and re-implement the pure
// functions here for testing. These mirror the source exactly — if the source
// changes, update these copies or switch to a TS-aware test runner.

function clampInteger(value, min, max) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function normalizeTime(hoursRaw, minutesRaw) {
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

function toTextArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  const text = String(value ?? "").trim();
  if (!text) return [];
  return text.split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

function htmlDecode(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtmlToText(html) {
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

// --- clampInteger ---
describe("clampInteger", () => {
  it("returns null for null/undefined/empty", () => {
    assert.equal(clampInteger(null, 0, 10), null);
    assert.equal(clampInteger(undefined, 0, 10), null);
    assert.equal(clampInteger("", 0, 10), null);
  });

  it("clamps within range", () => {
    assert.equal(clampInteger(5, 0, 10), 5);
    assert.equal(clampInteger(0, 0, 10), 0);
    assert.equal(clampInteger(10, 0, 10), 10);
  });

  it("returns null for out of range", () => {
    assert.equal(clampInteger(-1, 0, 10), null);
    assert.equal(clampInteger(11, 0, 10), null);
  });

  it("rounds floats", () => {
    assert.equal(clampInteger(5.4, 0, 10), 5);
    assert.equal(clampInteger(5.6, 0, 10), 6);
  });

  it("rejects non-numeric strings", () => {
    assert.equal(clampInteger("abc", 0, 10), null);
    assert.equal(clampInteger(NaN, 0, 10), null);
    assert.equal(clampInteger(Infinity, 0, 10), null);
  });
});

// --- normalizeTime ---
describe("normalizeTime", () => {
  it("returns nulls for all-null input", () => {
    assert.deepEqual(normalizeTime(null, null), { hours: null, minutes: null });
  });

  it("returns nulls for 0h 0m", () => {
    assert.deepEqual(normalizeTime(0, 0), { hours: null, minutes: null });
  });

  it("normalizes partial input (hours only)", () => {
    assert.deepEqual(normalizeTime(2, null), { hours: 2, minutes: 0 });
  });

  it("normalizes partial input (minutes only)", () => {
    assert.deepEqual(normalizeTime(null, 30), { hours: 0, minutes: 30 });
  });

  it("passes through valid values", () => {
    assert.deepEqual(normalizeTime(1, 45), { hours: 1, minutes: 45 });
  });
});

// --- toTextArray ---
describe("toTextArray", () => {
  it("converts array of strings", () => {
    assert.deepEqual(toTextArray(["a", "b", "c"]), ["a", "b", "c"]);
  });

  it("filters empty strings from array", () => {
    assert.deepEqual(toTextArray(["a", "", null, "b"]), ["a", "b"]);
  });

  it("splits string by newlines", () => {
    assert.deepEqual(toTextArray("a\nb\nc"), ["a", "b", "c"]);
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(toTextArray(""), []);
    assert.deepEqual(toTextArray(null), []);
  });
});

// --- stripHtmlToText ---
describe("stripHtmlToText", () => {
  it("strips tags", () => {
    assert.equal(stripHtmlToText("<p>Hello <b>world</b></p>"), "Hello world");
  });

  it("removes script/style blocks", () => {
    const html = "<p>Before</p><script>alert(1)</script><p>After</p>";
    const text = stripHtmlToText(html);
    assert.ok(!text.includes("alert"));
    assert.ok(text.includes("Before"));
    assert.ok(text.includes("After"));
  });

  it("decodes HTML entities", () => {
    assert.equal(stripHtmlToText("fish &amp; chips"), "fish & chips");
    assert.equal(stripHtmlToText("&lt;tag&gt;"), "<tag>");
  });

  it("converts list items to dashes", () => {
    const html = "<ul><li>One</li><li>Two</li></ul>";
    const text = stripHtmlToText(html);
    assert.ok(text.includes("- One"));
    assert.ok(text.includes("- Two"));
  });

  it("collapses whitespace", () => {
    const text = stripHtmlToText("<p>  lots   of   spaces  </p>");
    assert.ok(!text.includes("  "));
  });
});

// --- htmlDecode ---
describe("htmlDecode", () => {
  it("decodes all supported entities", () => {
    assert.equal(htmlDecode("&amp;"), "&");
    assert.equal(htmlDecode("&lt;"), "<");
    assert.equal(htmlDecode("&gt;"), ">");
    assert.equal(htmlDecode("&quot;"), '"');
    assert.equal(htmlDecode("&#39;"), "'");
    assert.equal(htmlDecode("&nbsp;"), " ");
  });
});
