<?php
/**
 * NAGALAND ME — UNIFIED DEVICE TOKEN REGISTRATION + PUSH SENDER
 *
 * File: nai-device-tokens.php
 * Location: nagalandai.com  wp-content/mu-plugins/
 *
 * REST API: POST /wp-json/nai/v1/register-device
 *
 * Security model
 *   1. Shared HMAC secret (wp-config.php constant NAI_DEVICE_TOKEN_SECRET)
 *      — caller signs `timestamp.body` with HMAC-SHA256, sends in
 *      X-NAI-Signature. Body and timestamp must arrive within 5 min.
 *   2. IP rate limit: 30 registrations / hour per IP (WP transient based).
 *   3. Per-token debounce: ignore re-registration of same token < 60s.
 *   4. Format validation per platform.
 *
 * Push sender uses Firebase FCM HTTP v1.  Pushes to iOS REQUIRE the
 * iOS client to register via Firebase Messaging SDK (so the stored
 * token is an FCM token).  Raw APNs tokens are stored but skipped at
 * send-time with a logged warning until APNs HTTP/2 transport is wired.
 *
 * Required wp-config.php constants
 *   define('NAI_DEVICE_TOKEN_SECRET', '...long-random...');
 *   define('NAI_FIREBASE_CREDENTIALS', '/abs/path/to/firebase-credentials.json');
 */

if (!defined('ABSPATH')) exit;

// ---------------------------------------------------------------------------
// REST route registration
// ---------------------------------------------------------------------------
add_action('rest_api_init', function () {
    register_rest_route('nai/v1', '/register-device', array(
        'methods'             => 'POST',
        'callback'            => 'nai_register_device_token',
        'permission_callback' => 'nai_register_device_permission',
    ));
});

add_action('init', function () {
    if (get_option('nai_device_tokens_table_version') !== '1.2') {
        nai_create_device_tokens_table();
        update_option('nai_device_tokens_table_version', '1.2');
    }
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
function nai_create_device_tokens_table() {
    global $wpdb;
    $table   = $wpdb->prefix . 'nai_device_tokens';
    $charset = $wpdb->get_charset_collate();

    $sql = "CREATE TABLE IF NOT EXISTS $table (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        token VARCHAR(500) NOT NULL,
        token_type VARCHAR(20) NOT NULL DEFAULT 'fcm',
        platform VARCHAR(20) NOT NULL DEFAULT 'android',
        device_model VARCHAR(100) DEFAULT NULL,
        os_version VARCHAR(20) DEFAULT NULL,
        app_version VARCHAR(20) DEFAULT NULL,
        user_id BIGINT(20) UNSIGNED DEFAULT NULL,
        parent_code VARCHAR(20) DEFAULT NULL,
        user_role VARCHAR(30) DEFAULT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_token (token(255)),
        KEY idx_user_id (user_id),
        KEY idx_parent_code (parent_code),
        KEY idx_platform (platform),
        KEY idx_token_type (token_type),
        KEY idx_active (is_active),
        KEY idx_user_role (user_role)
    ) $charset;";

    require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
    dbDelta($sql);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function nai_b64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function nai_client_ip() {
    foreach (array('HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR') as $h) {
        if (!empty($_SERVER[$h])) {
            $ip = trim(explode(',', $_SERVER[$h])[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
        }
    }
    return '0.0.0.0';
}

/** Returns canonical token_type: 'apns' (iOS) | 'fcm' (Android) | '' (unknown). */
function nai_canonical_token_type($raw, $platform) {
    $raw = strtolower((string)$raw);
    if (in_array($raw, array('apns', 'ios'), true)) return 'apns';
    if (in_array($raw, array('fcm', 'android'), true)) return 'fcm';
    if ($platform === 'ios')     return 'apns';
    if ($platform === 'android') return 'fcm';
    return '';
}

/** Returns true if token shape matches the expected platform. */
function nai_token_format_ok($token, $token_type) {
    $len = strlen($token);
    if ($len < 32 || $len > 500) return false;
    if ($token_type === 'apns') {
        // APNs raw tokens are 64 lowercase hex chars (post-iOS 13).
        return (bool)preg_match('/^[a-f0-9]{64}$/i', $token);
    }
    if ($token_type === 'fcm') {
        // FCM tokens look like  "<projectId>:APA91b..."  ~140-300 chars.
        return (bool)preg_match('#^[A-Za-z0-9_\-]+:[A-Za-z0-9_\-/]+$#', $token);
    }
    return true; // unknown tokenType — let other checks decide
}

// ---------------------------------------------------------------------------
// Permission callback: HMAC signature + replay window + per-IP rate limit
// ---------------------------------------------------------------------------
function nai_register_device_permission(WP_REST_Request $request) {
    if (!defined('NAI_DEVICE_TOKEN_SECRET') || NAI_DEVICE_TOKEN_SECRET === '') {
        // Mis-configured server — fail closed so we never accept unsigned writes.
        return new WP_Error('nai_misconfigured', 'Server is missing NAI_DEVICE_TOKEN_SECRET', array('status' => 503));
    }

    $ip = nai_client_ip();

    // First gate: a cheap "unauthenticated abuse" counter. Anyone hitting the
    // endpoint at all costs against this; legitimate signed traffic also
    // counts but at a much higher ceiling, so a single school behind one NAT
    // IP can still re-register every device. The hard cutoff prevents an
    // attacker from indefinitely holding that quota open by adding hits.
    $abuse_key = 'nai_rl_abuse_' . md5($ip);
    $abuse_count = (int)get_transient($abuse_key);
    if ($abuse_count >= 300) {
        return new WP_Error('nai_rate_limited', 'Too many requests from this IP', array('status' => 429));
    }

    $sig  = $request->get_header('x-nai-signature');
    $tsh  = $request->get_header('x-nai-timestamp');
    $body = $request->get_body();

    // Increment the abuse counter only when the request looks unsigned or
    // signed-but-invalid. Valid signed requests do not consume this budget.
    $bump_abuse = function () use ($abuse_key, $abuse_count) {
        // Preserve TTL of the existing transient so a sustained attacker
        // can't keep the window open by re-priming it. We can't read the
        // remaining TTL portably across object-cache backends, so we
        // re-set with HOUR_IN_SECONDS only on first hit.
        if ($abuse_count === 0) {
            set_transient($abuse_key, 1, HOUR_IN_SECONDS);
        } else {
            // Best-effort increment that does not extend TTL on backends
            // where wp_cache_incr is available; falls back to a no-extend
            // set on plain-DB transients.
            wp_cache_incr($abuse_key, 1, 'transient');
            set_transient($abuse_key, $abuse_count + 1, false);
        }
    };

    if (!$sig || !$tsh) {
        $bump_abuse();
        return new WP_Error('nai_unsigned', 'Missing signature headers', array('status' => 401));
    }
    $ts = (int)$tsh;
    if ($ts <= 0 || abs(time() - $ts) > 300) {
        $bump_abuse();
        return new WP_Error('nai_stale', 'Stale or invalid timestamp', array('status' => 401));
    }

    $expected = hash_hmac('sha256', $ts . '.' . $body, NAI_DEVICE_TOKEN_SECRET);
    if (!hash_equals($expected, strtolower($sig))) {
        $bump_abuse();
        return new WP_Error('nai_bad_sig', 'Bad signature', array('status' => 401));
    }

    // Signed, fresh, valid — apply a much looser per-IP cap so a campus
    // behind one NAT can still register every device, while one runaway
    // client can't spam millions of inserts.
    $signed_key = 'nai_rl_signed_' . md5($ip);
    $signed_count = (int)get_transient($signed_key);
    if ($signed_count >= 600) {
        return new WP_Error('nai_rate_limited', 'Too many registrations from this IP', array('status' => 429));
    }
    if ($signed_count === 0) {
        set_transient($signed_key, 1, HOUR_IN_SECONDS);
    } else {
        set_transient($signed_key, $signed_count + 1, false);
    }
    return true;
}

// ---------------------------------------------------------------------------
// /register-device handler
// ---------------------------------------------------------------------------
function nai_register_device_token(WP_REST_Request $request) {
    global $wpdb;
    $table = $wpdb->prefix . 'nai_device_tokens';

    $token        = sanitize_text_field($request->get_param('token'));
    $platform_raw = strtolower(sanitize_text_field($request->get_param('platform') ?: 'android'));
    $platform     = in_array($platform_raw, array('ios', 'android'), true) ? $platform_raw : 'android';
    $token_type   = nai_canonical_token_type(
        $request->get_param('token_type') ?: $request->get_param('type'),
        $platform
    );

    $device_model = mb_substr(sanitize_text_field($request->get_param('device_model') ?: ''), 0, 100);
    $os_version   = mb_substr(sanitize_text_field($request->get_param('os_version')   ?: ''), 0, 20);
    $app_version  = mb_substr(sanitize_text_field($request->get_param('app_version')  ?: '1.0.0'), 0, 20);

    if (empty($token) || !$token_type) {
        error_log(sprintf('[nai] register-device 400 invalid-token: platform=%s model=%s os=%s app=%s',
            $platform, $device_model, $os_version, $app_version));
        return new WP_REST_Response(array('success' => false, 'message' => 'Invalid token'), 400);
    }
    if (!nai_token_format_ok($token, $token_type)) {
        // Log every format rejection with device metadata so a regression in
        // either platform (eg. Apple changing APNs token shape, FCM tweaking
        // delimiters) is diagnosable instead of silent.
        error_log(sprintf('[nai] register-device 400 format-mismatch: type=%s platform=%s len=%d model=%s os=%s app=%s',
            $token_type, $platform, strlen($token), $device_model, $os_version, $app_version));
        return new WP_REST_Response(array('success' => false, 'message' => 'Token format mismatch for ' . $token_type), 400);
    }

    $user_id = get_current_user_id() ?: null;

    // Per-token debounce — ignore re-registration of the same token only when
    // the metadata is byte-identical to what we last saw. A token rotation
    // that arrives within 60s of a previous register with different
    // device_model / os_version / app_version is NOT a duplicate and must be
    // written, otherwise we'd silently drop the new metadata and the device
    // would look stuck on the old install for an hour.
    $debounce_fp = md5($token . '|' . $platform . '|' . $device_model . '|' . $os_version . '|' . $app_version);
    $debounce_key = 'nai_tok_' . $debounce_fp;
    if (get_transient($debounce_key)) {
        return new WP_REST_Response(array('success' => true, 'message' => 'Debounced'), 200);
    }
    set_transient($debounce_key, 1, MINUTE_IN_SECONDS);

    $existing = $wpdb->get_row($wpdb->prepare("SELECT id FROM $table WHERE token = %s", $token));

    if ($existing) {
        $wpdb->update($table, array(
            'token_type'   => $token_type,
            'platform'     => $platform,
            'device_model' => $device_model,
            'os_version'   => $os_version,
            'app_version'  => $app_version,
            'is_active'    => 1,
            'last_seen_at' => current_time('mysql'),
            'user_id'      => $user_id,
        ), array('id' => $existing->id));

        return new WP_REST_Response(array(
            'success' => true, 'message' => 'Token updated', 'token_id' => (int)$existing->id,
        ), 200);
    }

    $inserted = $wpdb->insert($table, array(
        'token'        => $token,
        'token_type'   => $token_type,
        'platform'     => $platform,
        'device_model' => $device_model,
        'os_version'   => $os_version,
        'app_version'  => $app_version,
        'user_id'      => $user_id,
        'is_active'    => 1,
        'last_seen_at' => current_time('mysql'),
    ));

    if ($inserted) {
        return new WP_REST_Response(array(
            'success' => true, 'message' => 'Token registered', 'token_id' => (int)$wpdb->insert_id,
        ), 201);
    }
    return new WP_REST_Response(array('success' => false, 'message' => 'Failed'), 500);
}

// ---------------------------------------------------------------------------
// Internal helpers — link, fetch, send
// ---------------------------------------------------------------------------
function nai_link_token_to_parent($token, $parent_code) {
    global $wpdb;
    return $wpdb->update($wpdb->prefix . 'nai_device_tokens',
        array('parent_code' => sanitize_text_field($parent_code)),
        array('token'       => sanitize_text_field($token)));
}

function nai_get_parent_tokens($parent_code) {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare(
        "SELECT token, token_type, platform FROM {$wpdb->prefix}nai_device_tokens
         WHERE parent_code = %s AND is_active = 1",
        sanitize_text_field($parent_code)));
}

function nai_get_user_tokens($user_id) {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare(
        "SELECT token, token_type, platform FROM {$wpdb->prefix}nai_device_tokens
         WHERE user_id = %d AND is_active = 1",
        (int)$user_id));
}

function nai_notify_parent($parent_code, $channel, $title, $body, $data = array()) {
    $tokens  = nai_get_parent_tokens($parent_code);
    $results = array('sent' => 0, 'failed' => 0, 'skipped' => 0);
    foreach ($tokens as $t) {
        $r = nai_send_push($t->token, $channel, $title, $body, $data, $t->token_type);
        if ($r === true)        $results['sent']++;
        elseif ($r === 'skip')  $results['skipped']++;
        else                    $results['failed']++;
    }
    return $results;
}

// ---------------------------------------------------------------------------
// Push sender
// Returns: true (delivered) | false (failed) | 'skip' (no transport for token).
// ---------------------------------------------------------------------------
function nai_send_push($device_token, $channel, $title, $body, $data = array(), $token_type = 'fcm') {
    $channel_config = array(
        'attendance' => array('priority' => 'normal', 'sound' => '',                 'android_priority' => 'low'),
        'absent'     => array('priority' => 'high',   'sound' => 'absent_alert',     'android_priority' => 'high'),
        'emergency'  => array('priority' => 'high',   'sound' => 'emergency_alarm',  'android_priority' => 'max'),
        'holiday'    => array('priority' => 'normal', 'sound' => 'holiday_chime',    'android_priority' => 'default'),
        'orders'     => array('priority' => 'high',   'sound' => 'order_received',   'android_priority' => 'high'),
        'messages'   => array('priority' => 'high',   'sound' => '',                 'android_priority' => 'high'),
        'reviews'    => array('priority' => 'normal', 'sound' => '',                 'android_priority' => 'default'),
        'news'       => array('priority' => 'normal', 'sound' => '',                 'android_priority' => 'default'),
        'system'     => array('priority' => 'normal', 'sound' => '',                 'android_priority' => 'default'),
    );
    $config = $channel_config[$channel] ?? $channel_config['system'];

    // FCM v1 transport — works for FCM tokens (Android, or iOS via Firebase
    // Messaging SDK).  Raw APNs tokens cannot be sent through FCM v1; until
    // an APNs HTTP/2 sender is added, we skip them so the queue stays clean.
    if ($token_type === 'apns') {
        error_log('[nai] APNs token skipped (channel=' . $channel . ') — install @react-native-firebase/messaging on iOS to receive an FCM token, or add APNs HTTP/2 transport.');
        return 'skip';
    }

    $message = array('message' => array(
        'token'        => $device_token,
        'notification' => array('title' => $title, 'body' => $body),
        'data'         => array_merge($data, array(
            'channel'      => $channel,
            'click_action' => 'FLUTTER_NOTIFICATION_CLICK',
        )),
        'android' => array(
            'priority'     => $config['android_priority'] === 'max' ? 'HIGH' : 'NORMAL',
            'notification' => array(
                'channel_id' => $channel,
                'sound'      => $config['sound'],
            ),
        ),
        'apns' => array(
            'headers' => array('apns-priority' => $config['priority'] === 'high' ? '10' : '5'),
            'payload' => array('aps' => array(
                'alert' => array('title' => $title, 'body' => $body),
                'sound' => !empty($config['sound']) ? $config['sound'] . '.wav' : 'default',
                'badge' => 1, 'content-available' => 1,
            )),
        ),
    ));

    if ($channel === 'attendance') {
        // Silent data-only on iOS for daily presence ping
        $message['message']['apns']['payload']['aps'] = array('content-available' => 1, 'badge' => 1);
        unset($message['message']['notification']);
        $message['message']['data']['title'] = $title;
        $message['message']['data']['body']  = $body;
    }

    $access_token = nai_get_firebase_access_token();
    $project_id   = nai_get_firebase_project_id();
    if (!$access_token || !$project_id) return false;

    $response = wp_remote_post(
        "https://fcm.googleapis.com/v1/projects/{$project_id}/messages:send",
        array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $access_token,
                'Content-Type'  => 'application/json',
            ),
            'body'    => wp_json_encode($message),
            'timeout' => 15,
        )
    );

    if (is_wp_error($response)) return false;
    $code = wp_remote_retrieve_response_code($response);
    if ($code === 200) return true;

    // 404 = unregistered, 400 = invalid; mark inactive so we stop hammering.
    if ($code === 404 || $code === 400) {
        global $wpdb;
        $wpdb->update($wpdb->prefix . 'nai_device_tokens',
            array('is_active' => 0),
            array('token' => $device_token));
    }
    return false;
}

// ---------------------------------------------------------------------------
// FCM OAuth — service-account JWT signed with RS256, base64url everywhere.
// ---------------------------------------------------------------------------

/**
 * Per-request cache for the parsed service-account JSON.
 * Avoids re-reading + re-parsing the credentials file once per recipient
 * when a single notification fan-out call sends to N devices.
 * SECURITY NOTE: NAI_FIREBASE_CREDENTIALS must point to a file outside
 * the web root and chmod 600 — anything in ABSPATH risks accidental
 * public exposure.
 */
function nai_firebase_credentials() {
    static $cached = null;
    static $checked = false;
    if ($checked) return $cached;
    $checked = true;
    $path = defined('NAI_FIREBASE_CREDENTIALS') ? NAI_FIREBASE_CREDENTIALS : ABSPATH . 'firebase-credentials.json';
    if (!file_exists($path)) return null;
    $cred = json_decode(file_get_contents($path), true);
    if (!$cred || empty($cred['client_email']) || empty($cred['private_key'])) return null;
    $cached = $cred;
    return $cached;
}

function nai_get_firebase_access_token() {
    $cached = get_transient('nai_firebase_access_token');
    if ($cached) return $cached;

    $cred = nai_firebase_credentials();
    if (!$cred) return false;

    $now    = time();
    $header = nai_b64url_encode(wp_json_encode(array('alg' => 'RS256', 'typ' => 'JWT')));
    $claims = nai_b64url_encode(wp_json_encode(array(
        'iss'   => $cred['client_email'],
        'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
        'aud'   => 'https://oauth2.googleapis.com/token',
        'iat'   => $now,
        'exp'   => $now + 3600,
    )));
    $sig_input = $header . '.' . $claims;

    $sig = '';
    if (!openssl_sign($sig_input, $sig, $cred['private_key'], 'SHA256')) {
        error_log('[nai] openssl_sign failed for FCM JWT');
        return false;
    }
    $jwt = $sig_input . '.' . nai_b64url_encode($sig);

    $resp = wp_remote_post('https://oauth2.googleapis.com/token', array(
        'body'    => array(
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $jwt,
        ),
        'timeout' => 10,
    ));
    if (is_wp_error($resp)) {
        error_log('[nai] OAuth token exchange failed: ' . $resp->get_error_message());
        return false;
    }
    $data = json_decode(wp_remote_retrieve_body($resp), true);
    if (!empty($data['access_token'])) {
        // Cache 50 min; tokens last 60.
        set_transient('nai_firebase_access_token', $data['access_token'], 3000);
        return $data['access_token'];
    }
    error_log('[nai] OAuth response missing access_token: ' . wp_remote_retrieve_body($resp));
    return false;
}

function nai_get_firebase_project_id() {
    $cached = get_option('nai_firebase_project_id');
    if ($cached) return $cached;
    $cred = nai_firebase_credentials();
    if (!empty($cred['project_id'])) {
        update_option('nai_firebase_project_id', $cred['project_id']);
        return $cred['project_id'];
    }
    return false;
}
