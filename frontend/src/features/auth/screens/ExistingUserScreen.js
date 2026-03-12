import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getUserPolicies, listUsers } from '../../../services/api';
import {
  AppButton,
  AppCard,
  AppField,
  Screen,
  SectionHeading,
} from '../../../shared/components';
import { colors, spacing } from '../../../shared/theme';

export default function ExistingUserScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function validate() {
    if (!/^\d{10}$/.test(phone.trim())) {
      return 'Use the 10-digit mobile number used during registration.';
    }

    return null;
  }

  async function handleContinue() {
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }

    setLoading(true);
    try {
      const users = await listUsers();
      const user = users.find(entry => entry.phone === phone.trim());

      if (!user) {
        setError('No profile was found for this number.');
        return;
      }

      const policies = await getUserPolicies(user.id);
      const activePolicy = policies.find(policy => policy.status === 'active');

      if (activePolicy) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Home', params: { user, policy: activePolicy } }],
        });
        return;
      }

      navigation.reset({
        index: 0,
        routes: [{ name: 'PlanSelect', params: { user } }],
      });
    } catch (requestError) {
      Alert.alert('Unable to enter the app', requestError.message);
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
        <SectionHeading
          title="Enter the app"
          subtitle="Use your registered mobile number to continue without creating a new worker profile."
        />

        <AppCard style={styles.card}>
          <AppField
            label="Registered mobile number"
            placeholder="9876543210"
            keyboardType="phone-pad"
            maxLength={10}
            value={phone}
            onChangeText={value => {
              setPhone(value);
              setError(null);
            }}
            error={error}
          />

          <Text style={styles.helperText}>
            If your worker profile exists, the app will take you to your active
            policy. If you do not have a policy yet, it will take you to plan
            selection.
          </Text>
        </AppCard>

        <AppButton
          label="Continue to app"
          onPress={handleContinue}
          loading={loading}
        />
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
  card: {
    marginBottom: spacing.lg,
  },
  helperText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
});
