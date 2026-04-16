/**
 * ExistingUserScreen — mock OTP login (no Firebase)
 *
 * Flow:
 *  1. Enter 10-digit phone → tap "Send OTP"
 *  2. Enter any 6-digit code → backend looks up user by phone → logged in
 *  Fallback: username + password login
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../../shared/theme/ThemeContext';
import { loginUser, loginWithPhone } from '../../../services/api';

const { height } = Dimensions.get('window');
const FLOW = { PHONE: 'phone', OTP: 'otp', PASSWORD: 'password' };

// ── Shared field (module scope — prevents keyboard dismiss on keystroke) ──────
function Field({ label, value, onChange, placeholder, keyboardType, maxLength,
                 secureTextEntry, textContentType, autoComplete, autoFocus }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.4)"
        autoCapitalize="none"
        keyboardType={keyboardType || 'default'}
        maxLength={maxLength}
        secureTextEntry={secureTextEntry || false}
        value={value}
        onChangeText={onChange}
        returnKeyType="done"
        textContentType={textContentType}
        autoComplete={autoComplete}
        autoFocus={autoFocus || false}
      />
    </View>
  );
}

export default function ExistingUserScreen({ navigation }) {
  const { colors } = useTheme();
  const [flow, setFlow]         = useState(FLOW.PHONE);
  const [phone, setPhone]       = useState('');
  const [otp, setOtp]           = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  function goToMain(session) {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { user: session, policy: session.active_policy || null } }],
    });
  }

  // Step 1 — validate phone and show OTP input
  function handleSendOtp() {
    const digits = phone.trim().replace(/\D/g, '');
    if (digits.length !== 10) {
      Alert.alert('Invalid number', 'Enter your 10-digit registered mobile number.');
      return;
    }
    setOtp('');
    setFlow(FLOW.OTP);
  }

  // Step 2 — send phone + OTP to backend
  async function handleVerifyOtp() {
    const digits = phone.trim().replace(/\D/g, '');
    const code   = otp.trim();
    if (code.length !== 6 || !/^\d+$/.test(code)) {
      Alert.alert('Invalid OTP', 'Enter any 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      const session = await loginWithPhone(digits, code);
      goToMain(session);
    } catch (err) {
      Alert.alert('Login failed', err?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Fallback — username + password
  async function handlePasswordLogin() {
    if (!username || !password) {
      Alert.alert('Missing fields', 'Enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      const session = await loginUser({ username, password });
      goToMain(session);
    } catch (err) {
      Alert.alert('Login failed', err?.message || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.curveWrapper}>
        <View style={[styles.curveBg, { backgroundColor: colors.navy800 }]} />
      </View>

      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.topSection}>
            {/* Brand */}
            <View style={styles.brandRow}>
              <Text style={styles.brandEarn}>Earn</Text>
              <Text style={[styles.brandSure, { color: colors.accent }]}>Sure</Text>
            </View>

            {/* ─── PHONE ─── */}
            {flow === FLOW.PHONE && (
              <>
                <Text style={styles.flowTitle}>Welcome back</Text>
                <Text style={styles.flowSubtitle}>
                  Enter your 10-digit registered number to get an OTP.
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Mobile number</Text>
                  <View style={styles.phoneRow}>
                    <View style={styles.countryCode}>
                      <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                    </View>
                    <TextInput
                      style={styles.phoneInput}
                      placeholder="98765 43210"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      keyboardType="number-pad"
                      maxLength={10}
                      value={phone}
                      onChangeText={setPhone}
                      returnKeyType="done"
                    />
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.btn, { backgroundColor: colors.accent }, pressed && styles.pressed]}
                  onPress={handleSendOtp}
                >
                  <Text style={styles.btnText}>Send OTP</Text>
                </Pressable>

                <Pressable onPress={() => setFlow(FLOW.PASSWORD)} style={styles.altLink}>
                  <Text style={styles.altLinkText}>Use username & password instead</Text>
                </Pressable>
              </>
            )}

            {/* ─── OTP ─── */}
            {flow === FLOW.OTP && (
              <>
                <Text style={styles.flowTitle}>Enter OTP</Text>
                <Text style={styles.flowSubtitle}>
                  Enter any 6-digit code to sign in as +91 {phone}.
                </Text>

                <Field
                  label="One-time password"
                  value={otp}
                  onChange={setOtp}
                  placeholder="• • • • • •"
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />

                <Pressable
                  style={({ pressed }) => [styles.btn, { backgroundColor: colors.accent }, pressed && styles.pressed]}
                  onPress={handleVerifyOtp}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.btnText}>Verify & Sign in</Text>}
                </Pressable>

                <Pressable onPress={() => setFlow(FLOW.PHONE)} style={styles.altLink}>
                  <Text style={styles.altLinkText}>← Change number</Text>
                </Pressable>
              </>
            )}

            {/* ─── PASSWORD ─── */}
            {flow === FLOW.PASSWORD && (
              <>
                <Text style={styles.flowTitle}>Sign in</Text>
                <Text style={styles.flowSubtitle}>Use the credentials you registered with.</Text>

                <Field
                  label="Username"
                  value={username}
                  onChange={setUsername}
                  placeholder="your_username"
                  textContentType="username"
                  autoComplete="username"
                />
                <Field
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  textContentType="password"
                  autoComplete="password"
                />

                <Pressable
                  style={({ pressed }) => [styles.btn, { backgroundColor: colors.accent }, pressed && styles.pressed]}
                  onPress={handlePasswordLogin}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.btnText}>Sign in</Text>}
                </Pressable>

                <Pressable onPress={() => setFlow(FLOW.PHONE)} style={styles.altLink}>
                  <Text style={styles.altLinkText}>← Use phone OTP instead</Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.bottomSection}>
            <Text style={styles.newUserText}>
              New to EarnSafe?{' '}
              <Text
                style={[styles.newUserLink, { color: colors.accent }]}
                onPress={() => navigation.navigate('Register')}
              >
                Create account
              </Text>
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  curveWrapper: { position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.45 },
  curveBg: { flex: 1, borderBottomLeftRadius: 60, borderBottomRightRadius: 60 },
  topSection: { flex: 1, paddingHorizontal: 28, paddingTop: 40, gap: 16 },
  bottomSection: { paddingBottom: 40, alignItems: 'center' },

  brandRow: { flexDirection: 'row', marginBottom: 8 },
  brandEarn: { fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  brandSure: { fontSize: 32, fontWeight: '800' },

  flowTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  flowSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 20 },

  inputGroup: { gap: 6 },
  label: {
    fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8,
    height: 52, paddingHorizontal: 16, color: '#FFFFFF', fontSize: 15,
  },

  phoneRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, height: 52,
  },
  countryCode: {
    paddingHorizontal: 14, borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.2)',
    height: '100%', justifyContent: 'center',
  },
  countryCodeText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  phoneInput: { flex: 1, height: '100%', paddingHorizontal: 14, color: '#FFFFFF', fontSize: 15 },

  btn: { borderRadius: 8, height: 54, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.8 },

  altLink: { alignItems: 'center', paddingVertical: 10 },
  altLinkText: { color: 'rgba(255,255,255,0.55)', fontSize: 14 },

  newUserText: { fontSize: 14, color: 'rgba(255,255,255,0.55)' },
  newUserLink: { fontWeight: '700' },
});
