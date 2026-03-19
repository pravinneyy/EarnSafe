import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { radii, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';

export default function AppField({ label, error, style, ...props }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrapper, style]}>
      {!!label && <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          {
            borderColor: error ? colors.danger : colors.border,
            backgroundColor: error ? colors.dangerSoft : colors.surface,
            color: colors.text,
          },
        ]}
        placeholderTextColor={colors.textMuted}
        {...props}
      />
      {!!error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs + 2,
  },
  input: {
    minHeight: 54,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: 12,
    fontWeight: '500',
  },
});
