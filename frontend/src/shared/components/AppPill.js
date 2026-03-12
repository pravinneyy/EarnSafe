import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme';

const TONES = {
  neutral: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    color: colors.textSoft,
  },
  accent: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    color: colors.primary,
  },
  success: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
    color: colors.success,
  },
  warning: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
    color: colors.warning,
  },
  danger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
    color: colors.danger,
  },
};

export default function AppPill({ label, tone = 'neutral', style }) {
  const currentTone = TONES[tone] || TONES.neutral;

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: currentTone.backgroundColor,
          borderColor: currentTone.borderColor,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: currentTone.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
