// Wraps app.json so values can come from environment / EAS secrets at build
// time without committing them to source control.
//
// Usage:
//   1. Set in EAS:   eas secret:create --name DEVICE_TOKEN_SECRET --value '<long-random-string>'
//   2. Reference it from `eas.json` build profile env:
//        "production": { "env": { "DEVICE_TOKEN_SECRET": "$DEVICE_TOKEN_SECRET" } }
//   3. The same secret value goes into wp-config.php on the server:
//        define('NAI_DEVICE_TOKEN_SECRET', '<same-long-random-string>');
//
// The value flows: EAS Secret → process.env → app.config.js → expo-constants
// → src/services/notifications.js (signs every register-device request).
const fs = require('fs');
const path = require('path');

// Any value that contains this marker is treated as an unfilled placeholder
// and will fail the build. Used in app.json (`extra.eas.projectId`) and in
// eas.json (`submit.production.ios.*`) so we don't ship a placeholder by
// accident.
const PLACEHOLDER_MARKER = 'REPLACE_';

function assertNoPlaceholders(obj, pathPrefix, found) {
  if (obj == null) return;
  if (typeof obj === 'string') {
    if (obj.includes(PLACEHOLDER_MARKER)) found.push(pathPrefix);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoPlaceholders(v, `${pathPrefix}[${i}]`, found));
    return;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      assertNoPlaceholders(v, pathPrefix ? `${pathPrefix}.${k}` : k, found);
    }
  }
}

module.exports = ({ config }) => {
  // Start from whatever app.json provides, then layer the env-driven extras.
  const base = config || JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8')).expo;

  const deviceTokenSecret =
    process.env.DEVICE_TOKEN_SECRET || base.extra?.deviceTokenSecret || '';

  const isProductionBuild =
    process.env.EAS_BUILD === 'true' && process.env.EAS_BUILD_PROFILE === 'production';

  // Hard-fail any EAS production build that's missing the shared HMAC secret.
  // Without this, the binary would ship with an empty secret, every push
  // token registration would be rejected by the backend with 401, and we'd
  // discover the failure only after parents stop receiving alerts.
  if (isProductionBuild && !deviceTokenSecret) {
    throw new Error(
      'DEVICE_TOKEN_SECRET is not set for the production EAS build. ' +
      'Run `eas secret:create --name DEVICE_TOKEN_SECRET --value <long-random>` ' +
      'and confirm eas.json production.env references $DEVICE_TOKEN_SECRET ' +
      'before building. Same value must also live in wp-config.php as ' +
      'NAI_DEVICE_TOKEN_SECRET.'
    );
  }

  // Catch unfilled placeholders in app.json (eg. \`projectId: "REPLACE_..."\`)
  // and eas.json before they reach a real build. Always runs locally; only
  // hard-fails on production builds so devs can iterate without first
  // running \`eas init\`.
  const placeholders = [];
  assertNoPlaceholders(base, 'app.json:expo', placeholders);
  try {
    const easPath = path.join(__dirname, 'eas.json');
    if (fs.existsSync(easPath)) {
      const eas = JSON.parse(fs.readFileSync(easPath, 'utf8'));
      assertNoPlaceholders(eas, 'eas.json', placeholders);
    }
  } catch (e) {
    console.warn('[app.config] could not read eas.json:', e.message);
  }
  if (placeholders.length) {
    const msg =
      'Unfilled placeholder(s) detected:\n  - ' + placeholders.join('\n  - ') +
      '\nRun `eas init` and replace any REPLACE_* values before building.';
    if (isProductionBuild) throw new Error(msg);
    console.warn('[app.config] ' + msg);
  }

  return {
    ...base,
    extra: {
      ...(base.extra || {}),
      deviceTokenSecret,
      // Read by src/services/crashReporter.js. Empty string is fine —
      // the reporter silently uses its console fallback.
      sentryDsn: process.env.SENTRY_DSN || base.extra?.sentryDsn || '',
    },
  };
};
