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

module.exports = ({ config }) => {
  // Start from whatever app.json provides, then layer the env-driven extras.
  const base = config || JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8')).expo;

  const deviceTokenSecret =
    process.env.DEVICE_TOKEN_SECRET || base.extra?.deviceTokenSecret || '';

  // Hard-fail any EAS production build that's missing the shared HMAC secret.
  // Without this, the binary would ship with an empty secret, every push
  // token registration would be rejected by the backend with 401, and we'd
  // discover the failure only after parents stop receiving alerts.
  if (process.env.EAS_BUILD === 'true' &&
      process.env.EAS_BUILD_PROFILE === 'production' &&
      !deviceTokenSecret) {
    throw new Error(
      'DEVICE_TOKEN_SECRET is not set for the production EAS build. ' +
      'Run `eas secret:create --name DEVICE_TOKEN_SECRET --value <long-random>` ' +
      'and confirm eas.json production.env references $DEVICE_TOKEN_SECRET ' +
      'before building. Same value must also live in wp-config.php as ' +
      'NAI_DEVICE_TOKEN_SECRET.'
    );
  }

  return {
    ...base,
    extra: {
      ...(base.extra || {}),
      deviceTokenSecret,
    },
  };
};
