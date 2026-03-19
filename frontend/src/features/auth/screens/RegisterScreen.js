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
    platform: '',
    city: 'Mumbai',
  });
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!formData.name || !formData.username || !formData.password || !formData.platform) {
      Alert.alert('Missing fields', 'Please fill in all required details');
      return;
    }

    setLoading(true);
    try {
      const user = await registerUser({
        ...formData,
        username: formData.username.trim().toLowerCase(),
        platform: formData.platform.toLowerCase(),
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
                  placeholder="Adam Smith"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={formData.name}
                  onChangeText={val => setFormData({ ...formData, name: val })}
                />
              </View>

              {/* Email/Phone */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email / Phone</Text>
                <TextInput
                  style={styles.input}
                  placeholder="adam_smith@email.com"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={formData.username}
                  onChangeText={val => setFormData({ ...formData, username: val })}
                />
              </View>

              {/* Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="********"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  secureTextEntry
                  value={formData.password}
                  onChangeText={val => setFormData({ ...formData, password: val })}
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
                <View style={styles.checkbox} />
                <View style={styles.termsTextColumn}>
                  <Text style={styles.termsTitle}>Terms of Service</Text>
                  <Text style={styles.termsBody}>
                    I accept the <Text style={[styles.termsLink, { color: colors.accent }]}>terms and conditions</Text> as well as the privacy policy
                  </Text>
                </View>
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
    height: height * 0.78,
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
    paddingTop: 50,
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
    marginBottom: 28,
  },
  inputGroup: {
    marginBottom: 18,
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
    marginBottom: 24,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 4,
    marginRight: 12,
    marginTop: 2,
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
