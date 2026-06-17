/**
 * logger.js
 * -----------------------------------------------------------------------------
 * Tiny debug-gated logging wrapper (spec requirement: error handling + logging).
 * All output is prefixed with [URT]. log()/info() only fire when debug mode is
 * enabled; warn()/error() always fire so real problems are never swallowed.
 *
 * Single responsibility: logging only.
 */

const PREFIX = '[URT]';
let debugEnabled = false;

/** Enable/disable verbose logging (driven by settings.debug). */
export function setDebug(value) {
  debugEnabled = Boolean(value);
}

export const logger = {
  log(...args) {
    if (debugEnabled) console.log(PREFIX, ...args);
  },
  info(...args) {
    if (debugEnabled) console.info(PREFIX, ...args);
  },
  warn(...args) {
    console.warn(PREFIX, ...args);
  },
  error(...args) {
    console.error(PREFIX, ...args);
  }
};

/**
 * Run a function, swallowing and logging any error so a failure in one place
 * never breaks the whole content script. Returns `fallback` on error.
 */
export function safe(fn, fallback, context = 'operation') {
  try {
    return fn();
  } catch (err) {
    logger.error(`Failed during ${context}:`, err);
    return fallback;
  }
}
