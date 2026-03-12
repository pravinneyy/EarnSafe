import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { registerUser } from '../../../services/api';
import {
  AppButton,
  AppCard,
  AppField,
  ChoiceChip,
  Screen,
  SectionHeading,
} from '../../../shared/components';
import { colors, radii, spacing } from '../../../shared/theme';

const CITIES = [
  'Pune',
  'Chennai',
  'Mumbai',
  'Delhi',
  'Hyderabad',
  'Bangalore',
];

const PLATFORMS = ['zomato', 'swiggy', 'blinkit', 'zepto'];

export default function RegisterScreen({ navigation }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    city: '',
    delivery_zone: '',
    platform: '',
    weekly_income: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  function updateField(key, value) {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: null }));
  }

  function validate() {
    const nextErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = 'Enter your full name.';
    }

    if (!/^\d{10}$/.test(form.phone)) {
      nextErrors.phone = 'Use a valid 10-digit mobile number.';
    }

    if (!form.city) {
      nextErrors.city = 'Choose your city.';
    }

    if (!form.delivery_zone.trim()) {
      nextErrors.delivery_zone = 'Add your delivery zone.';
    }

    if (!form.platform) {
      nextErrors.platform = 'Select a platform.';
    }

    const weeklyIncome = Number(form.weekly_income);
    if (!weeklyIncome || weeklyIncome <= 0) {
      nextErrors.weekly_income = 'Enter a valid weekly income.';
    }

    return nextErrors;
  }

  async function handleRegister() {
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    try {
      const user = await registerUser({
        ...form,
        weekly_income: Number(form.weekly_income),
      });
      navigation.navigate('PlanSelect', { user });
    } catch (error) {
      Alert.alert('Registration failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.brand}> EarnSafe Insurance App</Text>
          <SectionHeading
            title="Income protection for delivery workers."
            subtitle="Create your worker profile to get a weekly quote, or continue into the app if you have already registered."
          />
        </View>

        <AppCard style={styles.formCard}>
          <AppField
            label="Full name"
            placeholder="Ravi Kumar"
            value={form.name}
            onChangeText={value => updateField('name', value)}
            error={errors.name}
          />
          <AppField
            label="Mobile number"
            placeholder="9876543210"
            keyboardType="phone-pad"
            maxLength={10}
            value={form.phone}
            onChangeText={value => updateField('phone', value)}
            error={errors.phone}
          />
          <AppField
            label="Delivery zone"
            placeholder="Koregaon Park"
            value={form.delivery_zone}
            onChangeText={value => updateField('delivery_zone', value)}
            error={errors.delivery_zone}
          />
          <AppField
            label="Weekly income"
            placeholder="4000"
            keyboardType="numeric"
            value={form.weekly_income}
            onChangeText={value => updateField('weekly_income', value)}
            error={errors.weekly_income}
          />

          <View style={styles.group}>
            <Text style={styles.groupLabel}>City</Text>
            {!!errors.city && <Text style={styles.groupError}>{errors.city}</Text>}
            <View style={styles.chipRow}>
              {CITIES.map(city => (
                <ChoiceChip
                  key={city}
                  label={city}
                  selected={form.city === city}
                  onPress={() => updateField('city', city)}
                />
              ))}
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.groupLabel}>Platform</Text>
            {!!errors.platform && (
              <Text style={styles.groupError}>{errors.platform}</Text>
            )}
            <View style={styles.chipRow}>
              {PLATFORMS.map(platform => (
                <ChoiceChip
                  key={platform}
                  label={platform.charAt(0).toUpperCase() + platform.slice(1)}
                  selected={form.platform === platform}
                  onPress={() => updateField('platform', platform)}
                />
              ))}
            </View>
          </View>
        </AppCard>

        <AppButton
          label="Continue"
          onPress={handleRegister}
          loading={loading}
        />
        <AppButton
          label="Already registered? Enter app"
          variant="secondary"
          onPress={() => navigation.navigate('ExistingUser')}
          style={styles.secondaryAction}
        />

        <View style={styles.note}>
          <Text style={styles.noteText}>
            This is a prototype app
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: spacing.xl,
  },
  hero: {
    marginBottom: spacing.lg,
  },
  brand: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  formCard: {
    marginBottom: spacing.lg,
  },
  group: {
    marginTop: spacing.sm,
  },
  groupLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  groupError: {
    color: colors.danger,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  note: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  secondaryAction: {
    marginTop: spacing.sm,
  },
  noteText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
});
