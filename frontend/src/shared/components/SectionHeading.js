import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';

export default function SectionHeading({ title, subtitle, style }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrapper, style]}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {!!subtitle && (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
});
