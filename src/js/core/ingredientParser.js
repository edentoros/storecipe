(() => {
  const FRACTION_MAP = {
    "\u00BC": 0.25, "\u00BD": 0.5, "\u00BE": 0.75,
    "\u2153": 1/3, "\u2154": 2/3, "\u215B": 0.125,
    "\u215C": 3/8, "\u215D": 5/8, "\u215E": 7/8
  };

  const FRACTION_RE = /(\d+)\s*\/\s*(\d+)/;
  const MIXED_RE = /^(\d+)\s+(\d+\s*\/\s*\d+)/;
  const LEADING_NUM_RE = /^([\d\u00BC-\u00BE\u2150-\u215E.,\/\s-]+)\s+(.*)/;

  function fractionToDecimal(str) {
    const s = String(str).trim();
    if (FRACTION_MAP[s] !== undefined) return FRACTION_MAP[s];
    const m = s.match(FRACTION_RE);
    if (m) {
      const num = Number(m[1]);
      const den = Number(m[2]);
      return den !== 0 ? num / den : null;
    }
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  function parseQuantity(raw) {
    let s = String(raw).trim();
    for (const [char, val] of Object.entries(FRACTION_MAP)) {
      if (s.includes(char)) {
        const parts = s.split(char);
        const whole = parts[0] ? Number(parts[0].trim()) || 0 : 0;
        return whole + val;
      }
    }
    const mixed = s.match(MIXED_RE);
    if (mixed) {
      const whole = Number(mixed[1]) || 0;
      const frac = fractionToDecimal(mixed[2]);
      return frac !== null ? whole + frac : null;
    }
    if (s.includes("-")) {
      const parts = s.split("-").map((p) => fractionToDecimal(p.trim()));
      if (parts[0] !== null) return parts[0];
    }
    return fractionToDecimal(s);
  }

  function decimalToFraction(n) {
    if (n === 0) return "0";
    const whole = Math.floor(n);
    const frac = n - whole;
    if (frac < 0.05) return String(whole || "0");
    const fractions = [
      [0.125, "\u215B"], [0.25, "\u00BC"], [1/3, "\u2153"],
      [0.375, "\u215C"], [0.5, "\u00BD"], [5/8, "\u215D"],
      [2/3, "\u2154"], [0.75, "\u00BE"], [7/8, "\u215E"]
    ];
    let closest = null;
    let minDiff = Infinity;
    for (const [val, sym] of fractions) {
      const diff = Math.abs(frac - val);
      if (diff < minDiff) {
        minDiff = diff;
        closest = sym;
      }
    }
    if (minDiff < 0.05) {
      return whole > 0 ? `${whole} ${closest}` : closest;
    }
    const rounded = Math.round(n * 100) / 100;
    return String(rounded);
  }

  function parseIngredientLine(line) {
    const raw = String(line).trim();
    if (!raw) return { quantity: null, unit: null, name: "", raw };
    const match = raw.match(LEADING_NUM_RE);
    if (!match) return { quantity: null, unit: null, name: raw, raw };
    const qty = parseQuantity(match[1]);
    if (qty === null) return { quantity: null, unit: null, name: raw, raw };
    const rest = match[2].trim();
    const UNITS = [
      "cups?", "tbsp", "tsp", "tablespoons?", "teaspoons?",
      "oz", "ounces?", "lbs?", "pounds?", "kg", "g", "grams?",
      "ml", "l", "liters?", "litres?", "pinch(?:es)?", "cloves?",
      "slices?", "pieces?", "cans?", "bunche?s?", "sprigs?",
      "stalks?", "heads?", "large", "medium", "small"
    ];
    const unitRe = new RegExp(`^(${UNITS.join("|")})\\.?\\b\\s*(.*)`, "i");
    const unitMatch = rest.match(unitRe);
    if (unitMatch) {
      return { quantity: qty, unit: unitMatch[1].toLowerCase(), name: unitMatch[2].trim() || rest, raw };
    }
    return { quantity: qty, unit: null, name: rest, raw };
  }

  function scaleIngredients(ingredientsText, originalServes, newServes) {
    const origNum = Number(originalServes);
    const newNum = Number(newServes);
    if (!origNum || !newNum || origNum === newNum) return ingredientsText;
    const ratio = newNum / origNum;
    return String(ingredientsText || "").split("\n").map((line) => {
      const parsed = parseIngredientLine(line);
      if (parsed.quantity === null) return line;
      const scaled = parsed.quantity * ratio;
      const formatted = decimalToFraction(scaled);
      const unitPart = parsed.unit ? ` ${parsed.unit}` : "";
      return `${formatted}${unitPart} ${parsed.name}`.trim();
    }).join("\n");
  }

  window.StorecipeIngredientParser = {
    parseIngredientLine,
    parseQuantity,
    decimalToFraction,
    scaleIngredients
  };
})();
