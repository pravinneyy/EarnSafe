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
import { loginUser } from '../../../services/api';

const { width, height } = Dimensions.get('window');

export default function ExistingUserScreen({ navigation }) {
  const { colors } = useTheme();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!username || !password) return;
    setLoading(true);
    try {
      const session = await loginUser({
        username: username.trim().toLowerCase(),
        password,
      });
      const { active_policy: activePolicy, ...user } = session;

      if (activePolicy) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main', params: { user, policy: activePolicy } }],
        });
        return;
      }
      navigation.reset({
        index: 0,
        routes: [{ name: 'PlanSelect', params: { user } }],
      });
    } catch (requestError) {
      Alert.alert('Unable to sign in', requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Curved Navy Background */}
      <View style={styles.curveWrapper}>
        <View style={[styles.curveBg, { backgroundColor: colors.navy800 }]} />
      </View>

      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* ────── TOP NAVY SECTION ────── */}
          <View style={styles.topSection}>
            {/* Brand */}
            <View style={styles.brandRow}>
              <Text style={styles.brandEarn}>Earn</Text>
              <Text style={[styles.brandSure, { color: colors.accent }]}>Sure</Text>
            </View>

            {/* Email Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email (Username)</Text>
              <TextInput
                style={styles.input}
                placeholder="ravi_kumar"
                placeholderTextColor="rgba(255, 255, 255, 0.4)"
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
              />
            </View>

            {/* Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="********"
                placeholderTextColor="rgba(255, 255, 255, 0.4)"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            {/* Options Row */}
            <View style={styles.optionsRow}>
              <Pressable style={styles.checkboxRow}>
                <View style={styles.checkbox} />
                <Text style={styles.checkboxText}>Remember me</Text>
              </Pressable>
              <Pressable>
                <Text style={[styles.forgotText, { color: colors.accent }]}>
                  Forgot Password?
                </Text>
              </Pressable>
            </View>

            {/* Sign in Button */}
            <Pressable
              style={({ pressed }) => [
                styles.signInBtn,
                { backgroundColor: colors.accent },
                pressed && styles.pressed,
              ]}
              onPress={handleSignIn}
              disabled={loading}
            >
              <Text style={styles.signInText}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Text>
            </Pressable>
          </View>

          {/* ────── BOTTOM WHITE SECTION ────── */}
          <View style={[styles.bottomSection]}>
            <Text style={[styles.dontHaveText, { color: colors.textMuted }]}>
              Don't have an account?
            </Text>

            <View style={styles.socialRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.socialBtn,
                  { borderColor: colors.borderLight || '#E2E8F0' },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.socialIconFb}>f</Text>
                <Text style={[styles.socialText, { color: colors.text }]}>Facebook</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.socialBtn,
                  { borderColor: colors.borderLight || '#E2E8F0' },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.socialIconG}>G</Text>
                <Text style={[styles.socialText, { color: colors.text }]}>Google</Text>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.signUpBtn,
                { backgroundColor: colors.navy700 },
                pressed && styles.pressed,
              ]}
              onPress={() => navigation.navigate('Register')}
            >
              <Text style={styles.signUpText}>Sign up with email</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  curveWrapper: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    height: height * 0.7,
  },
  curveBg: {
    position: 'absolute',
    top: -height * 0.8,
    left: -width * 0.5,
    width: width * 2,
    height: height * 1.5,
    borderRadius: width,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topSection: {
    paddingHorizontal: 32,
    paddingTop: 50,
    paddingBottom: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 40,
  },
  brandEarn: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandSure: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    height: 52,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 15,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 4,
    marginRight: 8,
  },
  checkboxText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '600',
  },
  signInBtn: {
    borderRadius: 8,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signInText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
  bottomSection: {
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === 'ios' ? 20 : 40,
  },
  dontHaveText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 8,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  socialIconFb: {
    color: '#1877F2',
    fontWeight: 'bold',
    fontSize: 18,
    marginRight: 10,
  },
  socialIconG: {
    color: '#EA4335',
    fontWeight: 'bold',
    fontSize: 18,
    marginRight: 10,
  },
  socialText: {
    fontSize: 15,
    fontWeight: '600',
  },
  signUpBtn: {
    borderRadius: 8,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  signUpText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
