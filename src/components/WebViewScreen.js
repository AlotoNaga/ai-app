import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, BackHandler, Platform, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';
import NetInfo from '@react-native-community/netinfo';
import OfflineScreen from './OfflineScreen';
import { INTERNAL_DOMAINS, COLORS, APP_VERSION } from '../config/constants';

// Tiny scriptlet injected on every page load.
// Sets a flag so the website can detect the in-app environment, hides any
// elements with the `.hide-in-app` class, and pings the host with the page
// URL (used to clear loading state).  We deliberately do NOT lock zoom —
// pinch-to-zoom is required by Apple Accessibility 4.1 and Play Store
// accessibility checks.
// JSON.stringify the interpolated values. APP_VERSION and Platform.OS are
// build-time constants today, but this prevents any future dynamic value
// from breaking out of the string literal and turning the scriptlet into
// a JS injection vector.
const INJECTED_JS = `
  (function() {
    window.IS_NAGALAND_ME_APP = true;
    window.IS_NAGALAND_AI_APP = true;
    window.APP_VERSION = ${JSON.stringify(APP_VERSION)};
    window.APP_PLATFORM = ${JSON.stringify(Platform.OS)};
    if (document.body) {
      document.body.classList.add('nagaland-me-app');
      document.body.classList.add('nagaland-ai-app');
    }

    if (document.head) {
      var style = document.createElement('style');
      style.textContent = '.hide-in-app { display: none !important; } * { -webkit-tap-highlight-color: transparent; } html { scroll-behavior: smooth; }';
      document.head.appendChild(style);
    }

    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'PAGE_LOADED', url: window.location.href, title: document.title
      }));
    }
    true;
  })();
`;

const EXTERNAL_SCHEMES = [
  'tel:', 'mailto:', 'whatsapp:', 'intent:', 'market:',
  'upi:', 'razorpay:', 'paytm:', 'gpay:', 'phonepe:',
  'itms-apps:', 'itms-appss:', 'maps:', 'comgooglemaps:',
];

function isInternalDomain(urlString) {
  try {
    const u = new URL(urlString);
    return INTERNAL_DOMAINS.some(
      (d) => u.hostname === d || u.hostname.endsWith('.' + d),
    );
  } catch { return false; }
}

export default function WebViewScreen({ url, onNavigationStateChange }) {
  const webViewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline]   = useState(true);
  const [hasError, setHasError]   = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online);
      if (online && hasError) handleRetry();
    });
    return () => unsub();
  }, [hasError]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [canGoBack]);

  const handleNavigationStateChange = useCallback((navState) => {
    setCanGoBack(navState.canGoBack);
    if (onNavigationStateChange) onNavigationStateChange(navState);
  }, [onNavigationStateChange]);

  const handleShouldStartLoadWithRequest = useCallback((request) => {
    const { url: reqUrl } = request;
    if (reqUrl.startsWith('about:') || reqUrl.startsWith('javascript:')) return true;

    // Razorpay handles its own checkout — keep it inside the WebView.
    if (reqUrl.includes('api.razorpay.com') || reqUrl.includes('razorpay.com/checkout')) {
      return true;
    }

    if (EXTERNAL_SCHEMES.some((s) => reqUrl.startsWith(s))) {
      Linking.openURL(reqUrl).catch(() => {});
      return false;
    }

    try {
      const u = new URL(reqUrl);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && !isInternalDomain(reqUrl)) {
        Linking.openURL(reqUrl).catch(() => {});
        return false;
      }
    } catch {}
    return true;
  }, []);

  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'PAGE_LOADED') {
        setIsLoading(false);
        setHasError(false);
      }
    } catch {}
  }, []);

  const handleRetry = useCallback(() => {
    // When OfflineScreen is showing, the WebView is unmounted and re-mounting
    // re-loads the URL automatically. When the WebView is up but onError fired,
    // reload() is what clears the error frame.
    setHasError(false);
    setIsLoading(true);
    webViewRef.current?.reload?.();
  }, []);

  if (!isOnline || hasError) {
    return (
      <OfflineScreen
        onRetry={handleRetry}
        message={!isOnline ? 'No internet connection.' : 'Something went wrong. Please try again.'}
      />
    );
  }

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webview}
        onNavigationStateChange={handleNavigationStateChange}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        javaScriptEnabled
        injectedJavaScript={INJECTED_JS}
        onMessage={handleMessage}
        domStorageEnabled
        startInLoadingState={false}
        cacheEnabled
        cacheMode="LOAD_DEFAULT"
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        incognito={false}
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onError={() => { setHasError(true); setIsLoading(false); }}
        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) setHasError(true); }}
        onLoadEnd={() => setIsLoading(false)}
        originWhitelist={['https://*', 'tel:*', 'mailto:*', 'whatsapp:*', 'upi:*', 'razorpay:*']}
        mixedContentMode="never"
        applicationNameForUserAgent={`NagalandMe-App/${APP_VERSION}`}
        setSupportMultipleWindows={false}
        textZoom={100}
        allowsInlineMediaPlayback
        allowsBackForwardNavigationGestures
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustContentInsets={false}
        keyboardDisplayRequiresUserAction={false}
        dataDetectorTypes="none"
        decelerationRate="normal"
        overScrollMode="never"
        androidLayerType="hardware"
        pullToRefreshEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  webview:   { flex: 1, backgroundColor: COLORS.background },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
});
