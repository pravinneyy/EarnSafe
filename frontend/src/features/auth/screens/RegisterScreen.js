import React, { useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../../shared/theme/ThemeContext';
import { registerUser } from '../../../services/api';

const { width, height } = Dimensions.get('window');

const PLATFORMS = ['Zomato', 'Swiggy'];

export default function RegisterScreen({ navigation }) {
  const { colors } = useTheme();

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    phone: '',
    platform: '',
    city: 'Chennai',
    delivery_zone: '',
    weekly_income: '',
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!formData.name || !formData.username || !formData.password || !formData.platform) {
      Alert.alert('Missing fields', 'Please fill in all required details');
      return;
    }
    if (!formData.phone || formData.phone.length !== 10) {
      Alert.alert('Invalid phone', 'Please enter a valid 10-digit phone number');
      return;
    }
    if (!formData.delivery_zone) {
      Alert.alert('Missing zone', 'Please enter your delivery zone');
      return;
    }
    if (!termsAccepted) {
      Alert.alert('Terms Required', 'Please accept the terms of service to continue.');
      return;
    }

    setLoading(true);
    try {
      const user = await registerUser({
        ...formData,
        username: formData.username.trim().toLowerCase(),
        platform: formData.platform.toLowerCase(),
        weekly_income: parseFloat(formData.weekly_income) || 4000,
      });
      navigation.reset({
        index: 0,
        routes: [{ name: 'PlanSelect', params: { user } }],
      });
    } catch (error) {
      Alert.alert('Registration failed', error.message);
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
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            {/* ────── TOP NAVY SECTION ────── */}
            <View style={styles.topSection}>
              <Text style={[styles.subtitle, { color: colors.accent }]}>REGISTRATION</Text>
              <Text style={styles.title}>Create an account</Text>

              {/* Full Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ravi Kumar"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={formData.name}
                  onChangeText={val => setFormData({ ...formData, name: val })}
                />
              </View>

              {/* Username */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ravi_kumar"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  autoCapitalize="none"
                  value={formData.username}
                  onChangeText={val => setFormData({ ...formData, username: val })}
                />
              </View>

              {/* Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Min 8 characters"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  secureTextEntry
                  value={formData.password}
                  onChangeText={val => setFormData({ ...formData, password: val })}
                />
              </View>

              {/* Phone */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="9876543210"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={formData.phone}
                  onChangeText={val => setFormData({ ...formData, phone: val.replace(/[^0-9]/g, '') })}
                />
              </View>

              {/* Delivery Zone */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Delivery zone</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Velachery, OMR, Anna Nagar..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={formData.delivery_zone}
                  onChangeText={val => setFormData({ ...formData, delivery_zone: val })}
                />
              </View>

              {/* Weekly Income */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Weekly income (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="4000"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  keyboardType="numeric"
                  value={formData.weekly_income}
                  onChangeText={val => setFormData({ ...formData, weekly_income: val.replace(/[^0-9.]/g, '') })}
                />
              </View>

              {/* Delivery Platform — Button Selector */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Delivery Platform</Text>
                <View style={styles.platformRow}>
                  {PLATFORMS.map((p) => {
                    const isSelected = formData.platform === p;
                    return (
                      <Pressable
                        key={p}
                        style={[
                          styles.platformBtn,
                          isSelected && { backgroundColor: colors.accent, borderColor: colors.accent },
                        ]}
                        onPress={() => setFormData({ ...formData, platform: p })}
                      >
                        <Text
                          style={[
                            styles.platformBtnText,
                            isSelected && styles.platformBtnTextSelected,
                          ]}
                        >
                          {p}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Terms checkbox */}
              <View style={styles.termsRow}>
                <Pressable
                  style={[
                    styles.checkbox,
                    termsAccepted && { borderColor: colors.accent, backgroundColor: 'rgba(16,185,129,0.15)' },
                  ]}
                  onPress={() => setTermsAccepted(!termsAccepted)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {termsAccepted && (
                    <Text style={{ color: colors.accent, fontWeight: 'bold', textAlign: 'center', lineHeight: 16 }}>
                      ✓
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.termsTextColumn}
                  onPress={() => setTermsAccepted(!termsAccepted)}
                >
                  <Text style={styles.termsTitle}>Terms of Service</Text>
                  <Text style={styles.termsBody}>
                    I accept the <Text style={[styles.termsLink, { color: colors.accent }]}>terms and conditions</Text> as well as the privacy policy
                  </Text>
                </Pressable>
              </View>

              {/* Register Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.registerBtn,
                  { backgroundColor: colors.accent },
                  pressed && styles.pressed,
                ]}
                onPress={handleRegister}
                disabled={loading}
              >
                <Text style={styles.registerText}>
                  {loading ? 'Registering...' : 'Register'}
                </Text>
              </Pressable>
            </View>

            {/* ────── BOTTOM SECTION ────── */}
            <View style={styles.bottomSection}>
              <Text style={[styles.alreadyText, { color: colors.textMuted }]}>
                Already have an account?
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.loginBtn,
                  { backgroundColor: colors.navy700 },
                  pressed && styles.pressed,
                ]}
                onPress={() => navigation.navigate('ExistingUser')}
              >
                <Text style={styles.loginText}>Login</Text>
              </Pressable>
            </View>

          </ScrollView>
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
    height: height * 0.85,
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
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: 30,
  },
  topSection: {
    paddingHorizontal: 32,
    paddingTop: 40,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 15,
  },

  // Platform button selector
  platformRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  platformBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  platformBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  platformBtnTextSelected: {
    color: '#FFFFFF',
  },

  // Terms
  termsRow: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: 20,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 4,
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  termsTextColumn: {
    flex: 1,
  },
  termsTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  termsBody: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 18,
  },
  termsLink: {
    fontWeight: '600',
  },

  // Buttons
  registerBtn: {
    borderRadius: 8,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Bottom section
  bottomSection: {
    paddingHorizontal: 32,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 40,
  },
  alreadyText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  loginBtn: {
    borderRadius: 8,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});
