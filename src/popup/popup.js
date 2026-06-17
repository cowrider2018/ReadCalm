/**
 * popup.js  (ES module)
 * -----------------------------------------------------------------------------
 * Popup UI controller. Reuses SettingsManager and DomainManager so the popup,
 * content script and background all share one definition of settings + domain
 * logic. Every change is persisted and pushed to the active tab for instant,
 * refresh-free application.
 */

import { SettingsManager } from '../content/settings-manager.js';
import { DomainManager } from '../content/domain-manager.js';
import { FONT_OPTIONS, THEMES, MSG, fontStackFor } from '../shared/defaults.js';

const settingsManager = new SettingsManager();

/** Cache DOM references. */
const els = {
  app: document.querySelector('.app'),
  enabled: document.getElementById('enabled'),
  presets: document.getElementById('presets'),
  font: document.getElementById('font'),
  bg: document.getElementById('bg'),
  text: document.getElementById('text'),
  link: document.getElementById('link'),
  lineHeight: document.getElementById('lineHeight'),
  letterSpacing: document.getElementById('letterSpacing'),
  paragraphSpacing: document.getElementById('paragraphSpacing'),
  lineHeightVal: document.getElementById('lineHeight-val'),
  letterSpacingVal: document.getElementById('letterSpacing-val'),
  paragraphSpacingVal: document.getElementById('paragraphSpacing-val'),
  siteHost: document.getElementById('site-host'),
  siteDisabled: document.getElementById('site-disabled'),
  reset: document.getElementById('reset'),
  preview: document.getElementById('preview'),
  previewLink: document.getElementById('preview-link')
};

let settings = null;
let activeTabId = null;
let host = '';

/* ------------------------------ Boot ------------------------------ */
init().catch((err) => console.error('[URT] popup init failed:', err));

async function init() {
  populateFonts();
  settings = await settingsManager.load();
  await resolveActiveTab();
  render();
  wireEvents();
}

function populateFonts() {
  els.font.innerHTML = '';
  for (const opt of FONT_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    els.font.appendChild(o);
  }
}

/** Find the active tab + its host so "disable on this site" works. */
async function resolveActiveTab() {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (tab) {
          activeTabId = tab.id;
          host = DomainManager.normalize(tab.url || '');
        }
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

/* --------------------------- Rendering ---------------------------- */
function render() {
  els.enabled.checked = !!settings.enabled;
  els.font.value = settings.font;
  els.bg.value = toHex(settings.bg);
  els.text.value = toHex(settings.text);
  els.link.value = toHex(settings.link);

  els.lineHeight.value = settings.lineHeight;
  els.letterSpacing.value = settings.letterSpacing;
  els.paragraphSpacing.value = settings.paragraphSpacing;
  updateSliderOutputs();

  els.siteHost.textContent = host || '此頁面';
  const dm = new DomainManager(host);
  els.siteDisabled.checked = dm.inList(settings.blacklist);

  markActivePreset();
  els.app.classList.toggle('disabled', !settings.enabled);
  updatePreview();
}

function updateSliderOutputs() {
  els.lineHeightVal.textContent = Number(settings.lineHeight).toFixed(2);
  els.letterSpacingVal.textContent = `${Number(settings.letterSpacing).toFixed(3)}em`;
  els.paragraphSpacingVal.textContent = `${Number(settings.paragraphSpacing).toFixed(1)}em`;
}

function markActivePreset() {
  const buttons = els.presets.querySelectorAll('.preset');
  buttons.forEach((b) => {
    const t = THEMES[b.dataset.theme];
    const match =
      t &&
      sameColor(t.bg, settings.bg) &&
      sameColor(t.text, settings.text) &&
      sameColor(t.link, settings.link);
    b.classList.toggle('active', !!match);
  });
}

function updatePreview() {
  els.preview.style.background = settings.bg;
  els.preview.style.color = settings.text;
  els.previewLink.style.color = settings.link;
  const stack = fontStackFor(settings.font);
  els.preview.querySelectorAll('.preview-title, .preview-body').forEach((n) => {
    n.style.fontFamily = stack;
    n.style.lineHeight = String(settings.lineHeight);
    n.style.letterSpacing = `${settings.letterSpacing}em`;
  });
}

/* ----------------------------- Events ----------------------------- */
function wireEvents() {
  els.enabled.addEventListener('change', () => {
    commit({ enabled: els.enabled.checked });
    els.app.classList.toggle('disabled', !els.enabled.checked);
  });

  els.presets.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset');
    if (!btn) return;
    const t = THEMES[btn.dataset.theme];
    if (!t) return;
    commit({ theme: btn.dataset.theme, bg: t.bg, text: t.text, link: t.link });
  });

  els.font.addEventListener('change', () => commit({ font: els.font.value }));

  els.bg.addEventListener('input', () => commit({ bg: els.bg.value }, true));
  els.text.addEventListener('input', () => commit({ text: els.text.value }, true));
  els.link.addEventListener('input', () => commit({ link: els.link.value }, true));

  els.lineHeight.addEventListener('input', () =>
    commit({ lineHeight: parseFloat(els.lineHeight.value) }, true)
  );
  els.letterSpacing.addEventListener('input', () =>
    commit({ letterSpacing: parseFloat(els.letterSpacing.value) }, true)
  );
  els.paragraphSpacing.addEventListener('input', () =>
    commit({ paragraphSpacing: parseFloat(els.paragraphSpacing.value) }, true)
  );

  els.siteDisabled.addEventListener('change', onSiteToggle);
  els.reset.addEventListener('click', onReset);
}

function onSiteToggle() {
  if (!host) return;
  const set = new Set(settings.blacklist || []);
  if (els.siteDisabled.checked) set.add(host);
  else set.delete(host);
  commit({ blacklist: Array.from(set) });
}

async function onReset() {
  settings = await settingsManager.reset();
  render();
  pushToTab();
}

/**
 * Persist a patch, update local state + UI, and push to the active tab.
 * When `light` is true (slider/color drag) we update outputs without a full
 * re-render to keep dragging smooth.
 */
async function commit(patch, light = false) {
  settings = { ...settings, ...patch };
  if (light) {
    updateSliderOutputs();
    updatePreview();
    markActivePreset();
  } else {
    render();
  }
  settings = await settingsManager.save(patch);
  pushToTab();
}

/** Send the latest settings to the active tab for instant application. */
function pushToTab() {
  if (typeof activeTabId !== 'number') return;
  try {
    chrome.tabs.sendMessage(activeTabId, { type: MSG.APPLY, settings }, () => {
      void chrome.runtime.lastError; // tab may not host our content script
    });
  } catch (err) {
    console.error('[URT] sendMessage failed:', err);
  }
}

/* ----------------------------- Helpers ---------------------------- */
/** Normalize any color to #rrggbb for <input type=color>. */
function toHex(color) {
  if (!color) return '#000000';
  const c = String(color).trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    return (
      '#' +
      c
        .slice(1)
        .split('')
        .map((x) => x + x)
        .join('')
        .toLowerCase()
    );
  }
  const m = c.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) {
    return (
      '#' +
      [m[1], m[2], m[3]]
        .map((n) => Math.max(0, Math.min(255, +n)).toString(16).padStart(2, '0'))
        .join('')
    );
  }
  return '#000000';
}

function sameColor(a, b) {
  return toHex(a) === toHex(b);
}
