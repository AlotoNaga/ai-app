// ============================================================
// Teacher login view.
//
// Same WordPress account that works on schools.nagalandai.com web admin.
// Calls attendanceApi.login(); on success the API has already stored the
// session in SecureStore, fetched the class list, and returned both
// teacher info and classes — we hand that payload to the parent so it
// can populate SQLite without a second round-trip.
//
// Single prop: onSignedIn({ teacher, classes }) — required.
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../config/constants';
import { login, AttendanceApiError } from '../../services/attendanceApi';
import s from './styles';

export default function AttendanceLogin({ onSignedIn }) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  const submit = async () => {
    const u = username.trim();
    if (!u || !password) {
      setError('Enter username and password.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const payload = await login(u, password);
      // Don't keep the password in memory longer than necessary.
      setPassword('');
      onSignedIn(payload);
    } catch (e) {
      const msg = e instanceof AttendanceApiError
        ? e.message
        : 'Network error. Check your connection.';
      setError(msg);
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[
        s.centered,
        { paddingTop: insets.top + 32, paddingBottom: Math.max(insets.bottom, 20) + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{
        width: 96, height: 96, borderRadius: 48,
        backgroundColor: 'rgba(16,185,129,0.08)',
        alignItems: 'center', justifyContent: 'center', marginBottom: 20,
      }}>
        <Ionicons name="clipboard" size={48} color={COLORS.primary} />
      </View>

      <Text style={{ fontSize: 24, fontWeight: '700', color: '#FFF', marginBottom: 8 }}>
        Teacher Sign-In
      </Text>
      <Text style={{
        fontSize: 14, color: COLORS.textSecondary, textAlign: 'center',
        lineHeight: 21, marginBottom: 28, maxWidth: 320,
      }}>
        Use the same username and password you use on schools.nagalandai.com.
        Once you're in, attendance works even without internet — entries sync
        automatically when you're back online.
      </Text>

      <View style={[s.inputWrap, { width: '100%', maxWidth: 360 }]}>
        <Ionicons name="person-outline" size={18} color={COLORS.textMuted} style={{ marginRight: 10 }} />
        <TextInput
          style={s.input}
          placeholder="Username"
          placeholderTextColor={COLORS.textMuted}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          editable={!busy}
        />
      </View>

      <View style={[s.inputWrap, { width: '100%', maxWidth: 360 }]}>
        <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} style={{ marginRight: 10 }} />
        <TextInput
          style={s.input}
          placeholder="Password"
          placeholderTextColor={COLORS.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPwd}
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!busy}
        />
        <TouchableOpacity
          onPress={() => setShowPwd(!showPwd)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={showPwd ? 'Hide password' : 'Show password'}
        >
          <Ionicons
            name={showPwd ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color={COLORS.textMuted}
          />
        </TouchableOpacity>
      </View>

      {error ? <Text style={s.errText}>{error}</Text> : null}

      <TouchableOpacity
        style={[s.primaryBtn, { width: '100%', maxWidth: 360 }, busy && s.primaryBtnDisabled]}
        onPress={submit}
        activeOpacity={0.7}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="log-in-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={s.primaryBtnText}>Sign In</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={[s.hint, { maxWidth: 320 }]}>
        Only accounts assigned as teachers by a school administrator can mark
        attendance. Contact your school office if sign-in fails.
      </Text>
    </ScrollView>
  );
}
