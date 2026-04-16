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

import { useTheme } from '../../../shared/theme/ThemeContext';
import { loginUser, sendOtp, verifyOtp } from '../../../services/api';

const { width, height } = Dimensions.get('window');

const FLOW = {
  PHONE: 'phone',
  OTP: 'otp',
  PASSWORD: 'password',
  // After password login, show phone linked to account → offer OTP
  PHONE_CONFIRM: 'phone_confirm',
};

// ── Field component — MUST be at module scope (not inside render) ──────────
// Defining it inside a component causes React to remount the TextInput on
// every keystroke (new function ref = new component type), dismissing keyboard.
function Field({ label, value, onChange, placeholder, keyboardType, maxLength, secureTextEntry, hint }) {
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

  // After password login we know the user's phone — offer OTP from there
  const [loggedInSession, setLoggedInSession] = useState(null);

  // In dev/staging the backend returns debug_otp in the response
  const [debugOtp, setDebugOtp] = useState(null);

  function goToMain(session) {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { user: session, policy: session.active_policy || null } }],
    });
  }

  // ── OTP Step 1: send code ───────────────────────────────────────────────
  async function handleSendOtp() {
    const trimmedPhone = phone.trim().replace(/\D/g, ''); // strip non-digits
    if (trimmedPhone.length !== 10) {
      Alert.alert('Invalid phone', 'Enter the 10-digit mobile number you registered with.');
      return;
    }
    setLoading(true);
    setDebugOtp(null);
    try {
      const res = await sendOtp(trimmedPhone);
      // Dev mode: backend returns debug_otp so we can test without SMS
      if (res?.debug_otp) {
        setDebugOtp(res.debug_otp);
        setOtp(res.debug_otp); // auto-fill for convenience
      }
      setFlow(FLOW.OTP);
    } catch (err) {
      if (err.status === 429) {
        Alert.alert('Too many requests', 'Wait a few minutes before requesting another OTP.');
      } else if (err.status === 404) {
        Alert.alert(
          'Phone not registered',
          'No account was found for this number.\n\n• Make sure you enter the exact 10-digit number used during registration.\n• Or use "Sign in with password" below, then check the phone linked to your account.',
        );
      } else {
        Alert.alert('Could not send OTP', err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── OTP Step 2: verify code ─────────────────────────────────────────────
  async function handleVerifyOtp() {
    const trimmedOtp = otp.trim();
    if (trimmedOtp.length !== 6) {
      Alert.alert('Invalid OTP', 'Enter the 6-digit code sent to your phone.');
      return;
    }
    setLoading(true);
    try {
      const session = await verifyOtp(phone.trim().replace(/\D/g, ''), trimmedOtp);
      goToMain(session);
    } catch (err) {
      if (err.status === 401) {
        Alert.alert('Wrong OTP', 'The code is incorrect or has expired. Tap "Resend OTP" to get a new one.');
      } else {
        Alert.alert('Verification failed', err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Password login → reveals linked phone, offers OTP ──────────────────
  async function handlePasswordLogin() {
    if (!username.trim() || !password) return;
    setLoading(true);
    try {
      const session = await loginUser({ username: username.trim().toLowerCase(), password });
      // If they have a phone linked, show it and offer OTP switch
      if (session?.phone) {
        setLoggedInSession(session);
        setPhone(session.phone);
        setFlow(FLOW.PHONE_CONFIRM);
      } else {
        goToMain(session);
      }
    } catch (err) {
      Alert.alert('Unable to sign in', err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── After password login, user confirms their phone and gets OTP ────────
  async function handleConfirmPhone() {
    // Phone already pre-filled from session — just send OTP
    setLoading(true);
    setDebugOtp(null);
    try {
      const res = await sendOtp(phone.trim());
      if (res?.debug_otp) {
        setDebugOtp(res.debug_otp);
        setOtp(res.debug_otp);
      }
      setFlow(FLOW.OTP);
    } catch (err) {
      Alert.alert('Could not send OTP', err.message);
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
                  Enter the mobile number you registered with to receive a login code.
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
                  A 6-digit code was sent to {phone}.{'\n'}It expires in 5 minutes.
                </Text>

                {/* Dev mode banner — shown only when debug_otp is present */}
                {debugOtp ? (
                  <View style={[styles.debugBanner, { borderColor: colors.accent }]}>
                    <Text style={styles.debugLabel}>🧪 Dev mode — OTP auto-filled</Text>
                    <Text style={[styles.debugOtp, { color: colors.accent }]}>{debugOtp}</Text>
                    <Text style={styles.debugNote}>
                      No SMS gateway is configured. This code is returned by the API for testing only.
                    </Text>
                  </View>
                ) : null}

                <Field
                  label="6-digit OTP"
                  value={otp}
                  onChange={setOtp}
                  placeholder="482931"
                  keyboardType="number-pad"
                  maxLength={6}
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
                  onPress={() => { setOtp(''); setDebugOtp(null); setFlow(FLOW.PHONE); }}
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
                  After signing in you'll see which phone is linked to your account.
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

            {/* ─── PHONE CONFIRM (after password login) ─── */}
            {flow === FLOW.PHONE_CONFIRM && (
              <>
                <Text style={styles.flowTitle}>Your phone number</Text>
                <Text style={styles.flowSubtitle}>
                  Your account is linked to this number. Send an OTP to continue, or go straight to the app.
                </Text>
                <View style={[styles.phoneDisplay, { borderColor: colors.accent }]}>
                  <Text style={styles.phoneDisplayLabel}>Phone on file</Text>
                  <Text style={[styles.phoneDisplayValue, { color: colors.accent }]}>{phone}</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.accent }, pressed && styles.pressed]}
                  onPress={handleConfirmPhone}
                  disabled={loading}
                >
                  <Text style={styles.primaryBtnText}>{loading ? 'Sending OTP…' : `Send OTP to ${phone}`}</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: colors.navy700, marginTop: 10 }]}
                  onPress={() => goToMain(loggedInSession)}
                >
                  <Text style={styles.primaryBtnText}>Continue without OTP →</Text>
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

  debugBanner: {
    borderWidth: 1, borderRadius: 8, padding: 12,
    backgroundColor: 'rgba(16,185,129,0.08)', marginBottom: 16,
  },
  debugLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  debugOtp: { fontSize: 28, fontWeight: '900', letterSpacing: 4, marginBottom: 4 },
  debugNote: { color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 16 },

  phoneDisplay: {
    borderWidth: 1.5, borderRadius: 8, padding: 16, marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  phoneDisplayLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  phoneDisplayValue: { fontSize: 22, fontWeight: '800', letterSpacing: 1 },

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
