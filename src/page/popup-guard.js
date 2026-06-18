/**
 * popup-guard.js  (MAIN world — classic script, NOT a module)
 * -----------------------------------------------------------------------------
 * Injected into the page's own JavaScript world (manifest content_scripts with
 * "world": "MAIN") because a normal content script runs in an isolated world and
 * therefore cannot intercept the page's `window.open`. This is the only way to
 * stop script-driven pop-ups / pop-unders.
 *
 * Conservative policy (per product decision): block a `window.open` call only
 * when it is NOT backed by a transient user activation — i.e. auto pop-ups and
 * ad-script pop-ups fire with no gesture and are blocked, while a window the user
 * actually clicked open (including OAuth login windows) sails through.
 *
 * The guard is inert until the isolated content script opts the page in by
 * setting `data-urt-popup-guard` on <html> (shared DOM, so no messaging needed).
 *
 * No imports, no chrome APIs — this code runs as page script.
 */
(function () {
  if (window.__urtPopupGuardInstalled) return;
  window.__urtPopupGuardInstalled = true;

  var nativeOpen = window.open;
  if (typeof nativeOpen !== 'function') return;

  function guardEnabled() {
    try {
      var root = document.documentElement;
      return !!root && root.hasAttribute('data-urt-popup-guard');
    } catch (e) {
      return false;
    }
  }

  // True when a real, recent user gesture is in effect. If the browser can't
  // tell us, we err toward allowing so we never break legitimate popups.
  function userInitiated() {
    try {
      var ua = navigator.userActivation;
      if (ua && typeof ua.isActive === 'boolean') return ua.isActive;
    } catch (e) {
      /* fall through */
    }
    return true;
  }

  function guardedOpen() {
    if (guardEnabled() && !userInitiated()) {
      try {
        console.warn('[URT] blocked non-user-initiated window.open:', arguments[0]);
      } catch (e) {
        /* ignore */
      }
      return null;
    }
    return nativeOpen.apply(this || window, arguments);
  }

  // Make the wrapper look like the native function to casual detection.
  try {
    guardedOpen.toString = function () {
      return nativeOpen.toString();
    };
  } catch (e) {
    /* ignore */
  }

  window.open = guardedOpen;
})();
