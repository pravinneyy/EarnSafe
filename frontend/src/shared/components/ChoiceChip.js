import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { radii, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';

export default function ChoiceChip({ label, selected, onPress }) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        {
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: selected ? colors.accent : colors.surface,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, { color: selected ? '#FFFFFF' : colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.full,
    borderWidth: 1.5,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});
