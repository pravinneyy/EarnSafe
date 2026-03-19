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
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../../shared/theme/ThemeContext';
import { registerUser } from '../../../services/api';

const { width, height } = Dimensions.get('window');


const PLATFORMS = ['Zomato', 'Swiggy', 'Blinkit', 'Zepto'];

export default function RegisterScreen({ navigation }) {
  const { colors } = useTheme();

  
  const [formData, setFormData] = useState({
    name: '',
    username: '',      // Pattern: r"^[A-Za-z0-9_]{3,30}$" (unless you updated schemas.py)
    phone: '',         // Pattern: exactly 10 digits
    password: '',      // Min length: 8
    platform: '',      // Enum: zomato, swiggy, etc.
    city: 'Pune',      
    delivery_zone: '', 
    weekly_income: '', // Must be a number > 0
  });
  
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    // 1. Client-side validation (matching your backend rules)
    if (!formData.name || !formData.username || !formData.phone || !formData.password || !formData.platform || !formData.delivery_zone || !formData.weekly_income) {
      Alert.alert('Missing fields', 'Please fill in every field to register.');
      return;
    }

    if (formData.password.length < 8) {
      Alert.alert('Short Password', 'Password must be at least 8 characters long.');
      return;
    }

    if (formData.phone.length !== 10) {
      Alert.alert('Invalid Phone', 'Phone number must be exactly 10 digits.');
      return;
    }

    setLoading(true);
    try {
      // 2. Prepare Payload (USE parseInt for the income)
      const payload = {
        name: formData.name.trim(),
        username: formData.username.trim().toLowerCase(),
        password: formData.password,
        phone: formData.phone.trim(),
        city: formData.city.trim(),
        delivery_zone: formData.delivery_zone.trim(),
        platform: formData.platform.toLowerCase(),
        
        // Use Math.floor to ENSURE there is no decimal sent
        weekly_income: Math.floor(Number(formData.weekly_income)), 
      };

      console.log("Attempting register with:", payload);

      const user = await registerUser(payload);
      
      // Navigate to Plan Selection upon success
      navigation.reset({
        index: 0,
        routes: [{ name: 'PlanSelect', params: { user } }],
      });

    } catch (error) {
      // 3. FIXED ERROR HANDLING for your specific http.js
      console.log("Registration Error:", error.message);
      
      // If the backend returns a list of errors (422), they show up here as a string
      Alert.alert('Registration Failed', error.message);
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
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

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
                <Text style={styles.label}>Username (No spaces or symbols)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ravi_kumar"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  autoCapitalize="none"
                  value={formData.username}
                  onChangeText={val => setFormData({ ...formData, username: val })}
                />
              </View>

              {/* Mobile Number */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Mobile Number (10 digits)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="9876543210"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={formData.phone}
                  onChangeText={val => setFormData({ ...formData, phone: val })}
                />
              </View>

              {/* Delivery Zone */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Delivery Zone</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Koregaon Park"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={formData.delivery_zone}
                  onChangeText={val => setFormData({ ...formData, delivery_zone: val })}
                />
              </View>

              {/* Weekly Income */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Expected Weekly Income (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="4000"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  keyboardType="numeric"
                  value={formData.weekly_income}
                  onChangeText={val => setFormData({ ...formData, weekly_income: val })}
                />
              </View>

              {/* Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password (Min 8 characters)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="********"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  secureTextEntry
                  value={formData.password}
                  onChangeText={val => setFormData({ ...formData, password: val })}
                />
              </View>

              {/* Platform Selector */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Platform</Text>
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
                        <Text style={[styles.platformBtnText, isSelected && styles.platformBtnTextSelected]}>
                          {p}
                        </Text>
                      </Pressable>
                    );
                  })}
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
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.registerText}>Register</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.bottomSection}>
              <Text style={[styles.alreadyText, { color: colors.textMuted }]}>
                Already have an account?
              </Text>
              <Pressable
                style={[styles.loginBtn, { backgroundColor: colors.navy700 }]}
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
  root: { flex: 1 },
  curveWrapper: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', height: height * 0.78 },
  curveBg: { position: 'absolute', top: -height * 0.8, left: -width * 0.5, width: width * 2, height: height * 1.5, borderRadius: width },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'space-between', paddingBottom: 30 },
  topSection: { paddingHorizontal: 32, paddingTop: 50 },
  subtitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginBottom: 28 },
  inputGroup: { marginBottom: 18 },
  label: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 12, marginBottom: 8 },
  input: { backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 8, height: 52, paddingHorizontal: 16, color: '#FFFFFF', fontSize: 15 },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  platformBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.08)' },
  platformBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  platformBtnTextSelected: { color: '#FFFFFF' },
  registerBtn: { borderRadius: 8, height: 54, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  registerText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  bottomSection: { paddingHorizontal: 32, paddingTop: 20 },
  alreadyText: { fontSize: 14, textAlign: 'center', marginBottom: 16 },
  loginBtn: { borderRadius: 8, height: 54, justifyContent: 'center', alignItems: 'center' },
  loginText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.8 },
});