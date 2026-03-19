import React from 'react';
import { StyleSheet, View } from 'react-native';

import { radii, shadows, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';

export default function AppCard({
  children,
  style,
  variant = 'default',
  noPadding = false,
}) {
  const { colors } = useTheme();

  const variantStyle =
    variant === 'navy'
      ? { backgroundColor: colors.navy800, borderColor: colors.borderNavy }
      : variant === 'muted'
      ? { backgroundColor: colors.surfaceMuted, borderColor: colors.border, ...noShadow }
      : { backgroundColor: colors.surface, borderColor: colors.borderLight };

  return (
    <View
      style={[
        styles.card,
        variantStyle,
        noPadding && styles.noPadding,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const noShadow = { shadowOpacity: 0, elevation: 0 };

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    ...shadows.card,
  },
  noPadding: {
    padding: 0,
  },
});
