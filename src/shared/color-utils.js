/**
 * color-utils.js
 * -----------------------------------------------------------------------------
 * Pure color helpers used by the ThemeEngine to decide which backgrounds and
 * text colors to rewrite. Implements the perceived-brightness algorithm from the
 * spec rather than naive exact-white matching.
 *
 * Single responsibility: color parsing + classification only.
 */

import { BRIGHTNESS_THRESHOLD, NEAR_BLACK_MAX } from './defaults.js';

/**
 * Parse any CSS color string into {r, g, b, a}.
 * Handles rgb()/rgba() (the form getComputedStyle returns), #hex (3/4/6/8),
 * and named/other colors via a lazily-created canvas fallback.
 * Returns null if the value cannot be parsed.
 */
let _ctx = null;
function canvasContext() {
  if (_ctx) return _ctx;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    _ctx = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    _ctx = null;
  }
  return _ctx;
}

export function parseColor(input) {
  if (!input) return null;
  const str = String(input).trim().toLowerCase();

  if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  // rgb() / rgba()  (computed styles use this form)
  const rgbMatch = str.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/
  );
  if (rgbMatch) {
    let a = 1;
    if (rgbMatch[4] != null) {
      a = rgbMatch[4].endsWith('%')
        ? parseFloat(rgbMatch[4]) / 100
        : parseFloat(rgbMatch[4]);
    }
    return {
      r: clampByte(rgbMatch[1]),
      g: clampByte(rgbMatch[2]),
      b: clampByte(rgbMatch[3]),
      a
    };
  }

  // #hex
  const hex = parseHex(str);
  if (hex) return hex;

  // Fallback: let the browser resolve named colors etc.
  const ctx = canvasContext();
  if (ctx) {
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = str; // invalid values are ignored, leaving #000
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, alpha] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: alpha / 255 };
    } catch {
      return null;
    }
  }
  return null;
}

function parseHex(str) {
  const m = str.match(/^#([0-9a-f]{3,8})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6 && h.length !== 8) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  };
}

function clampByte(v) {
  const n = Math.round(parseFloat(v));
  return Math.max(0, Math.min(255, n));
}

/** Perceived brightness 0-255 per the spec's weighted formula. */
export function brightness(c) {
  return (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
}

/** A visible, near-white background that should be recolored. */
export function isNearWhite(c) {
  return Boolean(c) && c.a > 0.5 && brightness(c) > BRIGHTNESS_THRESHOLD;
}

/** A visible, near-black text color that should be softened. */
export function isNearBlack(c) {
  return Boolean(c) && c.a > 0.5 && brightness(c) < NEAR_BLACK_MAX;
}

/** Effectively invisible (fully/near transparent) — should be ignored. */
export function isTransparent(c) {
  return !c || c.a < 0.1;
}
