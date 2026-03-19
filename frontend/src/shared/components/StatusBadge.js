import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radii, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';

const TONE_MAP = {
  success: (c) => ({ dot: c.success, text: c.success }),
  warning: (c) => ({ dot: c.warning, text: c.warning }),
  danger: (c) => ({ dot: c.danger, text: c.danger }),
  neutral: (c) => ({ dot: c.textMuted, text: c.textSecondary }),
};

export default function StatusBadge({ label, tone = 'neutral', style }) {
  const { colors } = useTheme();
  const resolver = TONE_MAP[tone] || TONE_MAP.neutral;
  const t = resolver(colors);

  return (
    <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }, style]}>
      <View style={[styles.dot, { backgroundColor: t.dot }]} />
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.full,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs + 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
