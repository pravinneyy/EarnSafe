import React, { useState } from 'react';
import {
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
import auth from '@react-native-firebase/auth';

import { useTheme } from '../../../shared/theme/ThemeContext';
import { loginUser, loginWithFirebase } from '../../../services/api';

const { width, height } = Dimensions.get('window');

const FLOW = {
  PHONE: 'phone',
  OTP: 'otp',
  PASSWORD: 'password',
};

// ── Field component — MUST be at module scope (not inside render) ──────────
// Defining it inside a component causes React to remount the TextInput on
// every keystroke (new function ref = new component type), dismissing keyboard.
function Field({ label, value, onChange, placeholder, keyboardType, maxLength, secureTextEntry, hint, textContentType, autoComplete, autoFocus }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="rgba(255, 255, 255, 0.4)"
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
      {hint ? <Text style={styles.inputHint}>{hint}</Text> : null}
    </View>
  );
}

export default function ExistingUserScreen({ navigation }) {
  const { colors } = useTheme();

  const [flow, setFlow] = useState(FLOW.PHONE);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Firebase confirmation result — holds the verifier needed to confirm OTP
  const [confirmation, setConfirmation] = useState(null);

  function goToMain(session) {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { user: session, policy: session.active_policy || null } }],
    });
  }

  // ── Step 1: send OTP via Firebase ────────────────────────────────────────
  async function handleSendOtp() {
    const trimmedPhone = phone.trim().replace(/\D/g, '');
    if (trimmedPhone.length !== 10) {
      Alert.alert('Invalid phone', 'Enter the 10-digit mobile number you registered with.');
      return;
    }
    setLoading(true);
    try {
      // Firebase sends the OTP SMS — no backend call needed here
      const e164Phone = `+91${trimmedPhone}`;
      const confirmationResult = await auth().signInWithPhoneNumber(e164Phone);
      setConfirmation(confirmationResult);
      setFlow(FLOW.OTP);
    } catch (err) {
      const msg = err?.message || 'Could not send OTP. Try again.';
      if (msg.includes('TOO_MANY_REQUESTS') || msg.includes('too-many-requests')) {
        Alert.alert('Too many attempts', 'Firebase has rate-limited this number. Wait a few minutes.');
      } else if (msg.includes('INVALID_PHONE_NUMBER') || msg.includes('invalid-phone-number')) {
        Alert.alert('Invalid number', 'Check the phone number and try again.');
      } else {
        Alert.alert('Could not send OTP', msg);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify OTP with Firebase → get ID token → backend JWT ────────
  async function handleVerifyOtp() {
    const trimmedOtp = otp.trim();
    if (trimmedOtp.length !== 6) {
      Alert.alert('Invalid OTP', 'Enter the 6-digit code sent to your phone.');
      return;
    }
    if (!confirmation) {
      Alert.alert('Session expired', 'Please go back and resend the OTP.');
      return;
    }
    setLoading(true);
    try {
      // Verify OTP with Firebase
      const credential = await confirmation.confirm(trimmedOtp);
      // Get the Firebase ID token
      const firebaseToken = await credential.user.getIdToken();
      // Exchange Firebase token for EarnSafe JWT
      const session = await loginWithFirebase(firebaseToken);
      goToMain(session);
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('invalid-verification-code') || msg.includes('INVALID_CODE')) {
        Alert.alert('Wrong OTP', 'The code is incorrect or has expired. Tap "Resend" to get a new one.');
      } else if (err?.status === 404 || msg.includes('No EarnSafe account')) {
        Alert.alert(
          'Phone not registered',
          'This phone number is not linked to any EarnSafe account.\n\nPlease register first or use the phone number you signed up with.',
        );
      } else if (err?.status === 401) {
        Alert.alert('Authentication failed', msg || 'Could not verify your identity.');
      } else {
        Alert.alert('Verification failed', msg || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Password login (secondary) ────────────────────────────────────────────
  async function handlePasswordLogin() {
    if (!username.trim() || !password) return;
    setLoading(true);
    try {
      const session = await loginUser({ username: username.trim().toLowerCase(), password });
      goToMain(session);
    } catch (err) {
      Alert.alert('Unable to sign in', err.message);
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

            {/* ─── PHONE INPUT ─── */}
            {flow === FLOW.PHONE && (
              <>
                <Text style={styles.flowTitle}>Welcome back</Text>
                <Text style={styles.flowSubtitle}>
                  Enter your registered mobile number. We'll send a one-time code via SMS.
                </Text>
                <Field
                  label="Mobile number (10 digits)"
                  value={phone}
                  onChange={setPhone}
                  placeholder="9876543210"
                  keyboardType="number-pad"
                  maxLength={10}
                />
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.accent }, pressed && styles.pressed]}
                  onPress={handleSendOtp}
                  disabled={loading}
                >
                  <Text style={styles.primaryBtnText}>{loading ? 'Sending OTP…' : 'Send OTP'}</Text>
                </Pressable>
              </>
            )}

            {/* ─── OTP VERIFY ─── */}
            {flow === FLOW.OTP && (
              <>
                <Text style={styles.flowTitle}>Enter OTP</Text>
                <Text style={styles.flowSubtitle}>
                  A 6-digit code was sent to +91{phone.trim().replace(/\D/g, '')}.{'\n'}
                  It expires in a few minutes.
                </Text>

                <Field
                  label="6-digit OTP"
                  value={otp}
                  onChange={setOtp}
                  placeholder="482931"
                  keyboardType="number-pad"
                  maxLength={6}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  autoFocus
                />
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.accent }, pressed && styles.pressed]}
                  onPress={handleVerifyOtp}
                  disabled={loading}
                >
                  <Text style={styles.primaryBtnText}>{loading ? 'Verifying…' : 'Verify & Sign in'}</Text>
                </Pressable>

                <Pressable
                  style={styles.linkRow}
                  onPress={() => { setOtp(''); setConfirmation(null); setFlow(FLOW.PHONE); }}
                >
                  <Text style={[styles.linkText, { color: colors.accent }]}>← Change number / resend OTP</Text>
                </Pressable>
              </>
            )}

            {/* ─── PASSWORD LOGIN ─── */}
            {flow === FLOW.PASSWORD && (
              <>
                <Text style={styles.flowTitle}>Sign in with password</Text>
                <Text style={styles.flowSubtitle}>
                  Use your username and password to access your account.
                </Text>
                <Field label="Username" value={username} onChange={setUsername} placeholder="ravi_kumar" />
                <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" secureTextEntry />
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.accent }, pressed && styles.pressed]}
                  onPress={handlePasswordLogin}
                  disabled={loading}
                >
                  <Text style={styles.primaryBtnText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
                </Pressable>
                <Pressable style={styles.linkRow} onPress={() => setFlow(FLOW.PHONE)}>
                  <Text style={[styles.linkText, { color: colors.accent }]}>← Use OTP login instead</Text>
                </Pressable>
              </>
            )}
          </View>

          {/* ── BOTTOM SECTION ── */}
          <View style={styles.bottomSection}>
            {(flow === FLOW.PHONE || flow === FLOW.OTP) && (
              <Pressable style={styles.linkRow} onPress={() => setFlow(FLOW.PASSWORD)}>
                <Text style={[styles.smallLink, { color: colors.textMuted }]}>
                  Don't know your phone? Sign in with username & password
                </Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.signUpBtn, { backgroundColor: colors.navy700 }, pressed && styles.pressed]}
              onPress={() => navigation.navigate('Register')}
            >
              <Text style={styles.signUpText}>New rider? Create account</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  curveWrapper: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', height: height * 0.75 },
  curveBg: {
    position: 'absolute', top: -height * 0.8, left: -width * 0.5,
    width: width * 2, height: height * 1.5, borderRadius: width,
  },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1, justifyContent: 'space-between' },
  topSection: { paddingHorizontal: 32, paddingTop: 50, paddingBottom: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 28 },
  brandEarn: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  brandSure: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  flowTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 6 },
  flowSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 20, marginBottom: 24 },
  inputGroup: { marginBottom: 20 },
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8,
    height: 52, paddingHorizontal: 16, color: '#FFFFFF', fontSize: 15,
  },
  inputHint: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 },
  primaryBtn: { borderRadius: 8, height: 54, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  linkRow: { marginTop: 16, alignItems: 'center' },
  linkText: { fontSize: 13, fontWeight: '600' },
  smallLink: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  bottomSection: {
    paddingHorizontal: 32, paddingBottom: Platform.OS === 'ios' ? 20 : 40, gap: 12,
  },
  signUpBtn: { borderRadius: 8, height: 54, justifyContent: 'center', alignItems: 'center' },
  signUpText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
