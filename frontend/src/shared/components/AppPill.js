import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radii, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';

const TONE_MAP = {
  accent: (c) => ({ bg: c.accentSoft, text: c.accent, border: c.accentBorder }),
  success: (c) => ({ bg: c.successSoft, text: c.success, border: c.successBorder }),
  warning: (c) => ({ bg: c.warningSoft, text: c.warning, border: c.warningBorder }),
  danger: (c) => ({ bg: c.dangerSoft, text: c.danger, border: c.dangerBorder }),
  neutral: (c) => ({ bg: c.surfaceMuted, text: c.textSecondary, border: c.border }),
};

export default function AppPill({ label, tone = 'neutral', style }) {
  const { colors } = useTheme();
  const resolver = TONE_MAP[tone] || TONE_MAP.neutral;
  const t = resolver(colors);

  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 1,
    borderRadius: radii.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
