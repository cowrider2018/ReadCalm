/**
 * ad-rules.js
 * -----------------------------------------------------------------------------
 * Single source of truth for ALL ad-blocking *data*: element selectors, the
 * attribute-token pattern, IAB iframe sizes, ad/tracker/pop network domains and
 * overlay-detection thresholds. Keeping every list here (and every bit of ad
 * *logic* under src/content/ad/) is the whole point — as new ad types appear,
 * there is exactly one file to extend, so neither the rules nor the code scatter.
 *
 * Single responsibility: configuration data only — no logic, no side effects.
 * Imported by the AdGuard sub-blockers; the network list also feeds the
 * declarativeNetRequest ruleset (rules/ad-network-rules.json must stay in sync).
 */

/**
 * Curated CSS selectors for common ad elements. Hidden via a single injected
 * stylesheet (`display:none !important`), so matching is live and reactive: as
 * soon as a node gains a matching class / id / src — even after async ad-loader
 * code runs — the browser hides it with zero per-element JS work.
 *
 * Deliberately conservative to avoid breaking layouts: bare words like
 * "ad"/"ads" use the `~=` (exact whitespace-separated token) selector, and
 * substring (`*=`) matches are only used on ad-specific compounds (e.g.
 * "ad-slot"), never on the bare string "ad" (which would match
 * read/header/shadow/badge…).
 */
export const AD_SELECTORS = [
  // Google AdSense / Google Publisher Tag
  'ins.adsbygoogle',
  '[class*="adsbygoogle"]',
  'iframe[id^="google_ads_iframe"]',
  '[id^="google_ads_"]',
  '[id^="div-gpt-ad"]',
  '[id*="div-gpt-ad"]',
  '[id^="gpt-ad"]',
  // Generic ad ids
  '[id^="ad-"]',
  '[id$="-ad"]',
  '[id*="-ad-"]',
  '[id^="adunit"]',
  '[id*="adslot"]',
  // Generic ad classes — bare tokens use ~= to avoid false positives
  '[class~="ad"]',
  '[class~="ads"]',
  '[class~="advert"]',
  '[class~="advertisement"]',
  '[class~="sponsored"]',
  '[class*="ad-unit"]',
  '[class*="ad-slot"]',
  '[class*="ad-banner"]',
  '[class*="ad-container"]',
  '[class*="ad-wrapper"]',
  '[class*="ad-placeholder"]',
  '[class*="adsbox"]',
  '[class*="-ads"]',
  '[class*="ads-"]',
  '[class*="advertisement"]',
  '[class*="sponsored-"]',
  '[class*="-sponsored"]',
  // Data attributes used by ad tags
  '[data-ad]',
  '[data-ad-slot]',
  '[data-ad-client]',
  '[data-adunit]',
  '[aria-label="Advertisement"]',
  // Known ad / sponsored-content network iframes & widgets (src is live)
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googleadservices"]',
  'iframe[src*="adservice.google"]',
  'iframe[src*="amazon-adsystem.com"]',
  'iframe[src*="adnxs.com"]',
  'iframe[src*="criteo"]',
  'iframe[src*="pubmatic"]',
  'iframe[src*="rubiconproject"]',
  'iframe[src*="taboola.com"]',
  'iframe[src*="outbrain.com"]',
  '[id^="taboola"]',
  '[class*="taboola"]',
  '[class*="outbrain"]',
  '[class*="trc_rbox"]',
  // Site-specific ad frames / curtains (CSS-hidden)
  'iframe[src*="enjgioijew"]',
  '[id*="img_dggnygsgaagg7gwawac2ygaa9agg72da9gw"]',
  '[id*="et_sticky_pc"]',
  '[class*="top-sky"]',
  '[class*="twin-curtain"]',
  '[class*="part_ad"]',
  '[id*="etiframe_table_pc"]'
];

/**
 * High-confidence anti-adblock / wall roots that resist plain CSS hiding (their
 * own stylesheet or inline !important out-ranks ours). The HardBlocker removes
 * these from the DOM outright — see src/content/ad/hard-blocker.js — and AdGuard
 * keeps watching (childList + class/id changes) to re-remove on re-injection.
 * Promote `top-sky`/`twin-curtain` here if they also resist hiding.
 */
export const HARD_REMOVE_SELECTORS = ['.fc-ab-root'];

/**
 * Selectors for sticky / anchored / floating ad bars that the overlay blocker
 * also considers. Same conservative-token philosophy as AD_SELECTORS.
 */
export const STICKY_SELECTORS = [
  '[class*="sticky-ad"]',
  '[class*="anchor-ad"]',
  '[class*="ad-sticky"]',
  '[class*="ad-anchor"]',
  '[id*="sticky-ad"]',
  '[id*="anchor-ad"]'
];

/**
 * Matches a single attribute-value token that designates an ad. Used by the
 * element blocker to catch ad markers on *any* attribute (e.g. data-owner="ad",
 * data-type="ads", data-section="ad-top") that the static selector list and
 * class/id rules can't express.
 *
 * Token-based, NOT a blind substring, so it stays safe: it hits the bare words
 * ad/ads/advert(s)/advertising/advertisement/advertorial/sponsored, or any
 * `ad-`/`ad_`/`ads-`/`ads_` prefix and `-ad`/`_ad`/`-ads`/`_ads` suffix
 * (e.g. "ad-slot", "top_ads"), while leaving header / download / shadow / badge
 * / thread / advanced / address / adsense / adidas untouched.
 */
export const AD_TOKEN_RE =
  /^(?:ads?|adverts?|advertising|advertisement|advertorial|sponsored)$|^ads?[-_]|[-_]ads?$/i;

/**
 * IAB-standard ad sizes ("WxH"). Used by the iframe heuristic to catch ad
 * frames that carry no tell-tale class / id / src: a cross-origin iframe whose
 * box matches one of these exact sizes is almost certainly an ad slot.
 */
export const AD_IFRAME_SIZES = new Set([
  '300x250', '336x280', '728x90', '970x90', '970x250', '300x600',
  '160x600', '120x600', '320x50', '320x100', '468x60', '234x60',
  '250x250', '200x200', '180x150', '125x125', '300x100'
]);

/**
 * Ad / tracker / pop network hostnames. Drives the declarativeNetRequest block
 * ruleset (rules/ad-network-rules.json mirrors this list) so banners, pop-unders
 * and trackers are killed at the request layer before they ever load. Matching
 * is by registrable domain, so subdomains (e.g. pagead2.googlesyndication.com)
 * are covered automatically.
 */
export const AD_NETWORK_DOMAINS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'googletagservices.com',
  'googletagmanager.com',
  'adservice.google.com',
  'amazon-adsystem.com',
  'adnxs.com',
  'criteo.com',
  'criteo.net',
  'pubmatic.com',
  'rubiconproject.com',
  'taboola.com',
  'outbrain.com',
  'scorecardresearch.com',
  'moatads.com',
  'adsrvr.org',
  'openx.net',
  'casalemedia.com',
  'smartadserver.com',
  'zedo.com',
  'propellerads.com',
  'popads.net',
  'popcash.net',
  'adcash.com',
  'exoclick.com',
  'juicyads.com',
  'mgid.com',
  'revcontent.com',
  'media.net',
  'bidswitch.net',
  'teads.tv',
  'yieldmo.com'
];

/**
 * Overlay-detection thresholds for the interstitial / modal blocker. An element
 * only qualifies as an ad overlay when it is fixed/absolute, covers at least
 * `minCoverage` of the viewport (or is a blocking backdrop), sits above
 * `minZIndex`, AND carries an ad signal — keeping legitimate content modals safe.
 */
export const OVERLAY = {
  minCoverage: 0.6, // fraction of viewport area the element must cover
  minZIndex: 100, // stacking context floor for a "blocking" overlay
  rescanDelayMs: 1500 // one-shot re-sweep; many overlays appear after load
};
