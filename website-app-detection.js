/**
 * NAGALAND ME — IN-APP DETECTION SNIPPET
 * Add to every Nagaland Me website via WPCode (JS snippet, site-wide header):
 *   nagalandai.com, experts.nagaland.me, helpnagaland.com,
 *   nagalandprofiles.com, nagalanddictionary.com, nagalandnewstoday.com.
 *
 * The webview injects two flags at every page load:
 *   window.IS_NAGALAND_ME_APP = true
 *   navigator.userAgent contains "NagalandMe-App"
 *
 * The legacy IS_NAGALAND_AI_APP / NagalandAI-App tokens are kept for
 * backwards compatibility with existing site CSS / JS.
 *
 * CSS hook (hide elements only inside the app):
 *   body.nagaland-me-app .hide-in-app { display: none !important; }
 * JS hook:
 *   if (window.IS_NAGALAND_ME_APP) { ... }
 */
(function () {
  var ua = navigator.userAgent || '';
  var isApp =
    window.IS_NAGALAND_ME_APP ||
    window.IS_NAGALAND_AI_APP ||
    ua.indexOf('NagalandMe-App') !== -1 ||
    ua.indexOf('NagalandAI-App') !== -1;

  if (!isApp) return;
  document.body.classList.add('nagaland-me-app');
  document.body.classList.add('nagaland-ai-app'); // legacy
  // eslint-disable-next-line no-console
  console.log('Nagaland Me App v' + (window.APP_VERSION || '1.0') + ' detected');
})();
