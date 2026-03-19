import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radii, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';

const SEVERITY_MAP = {
  safe: (c) => ({ bg: c.successSoft, border: c.successBorder, icon: '✅', title: c.success, text: c.textSecondary }),
  watch: (c) => ({ bg: c.warningSoft, border: c.warningBorder, icon: '⚠️', title: c.warning, text: c.textSecondary }),
  alert: (c) => ({ bg: c.dangerSoft, border: c.dangerBorder, icon: '🚨', title: c.danger, text: c.textSecondary }),
  info: (c) => ({ bg: c.infoSoft, border: c.infoBorder, icon: 'ℹ️', title: c.info, text: c.textSecondary }),
};

export default function WeatherAlert({ title, message, severity = 'info', style }) {
  const { colors } = useTheme();
  const resolver = SEVERITY_MAP[severity] || SEVERITY_MAP.info;
  const s = resolver(colors);

  return (
    <View style={[styles.card, { backgroundColor: s.bg, borderColor: s.border }, style]}>
      <View style={styles.header}>
        <Text style={styles.icon}>{s.icon}</Text>
        <Text style={[styles.title, { color: s.title }]}>{title}</Text>
      </View>
      {!!message && (
        <Text style={[styles.message, { color: s.text }]}>{message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  icon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  message: {
    fontSize: 13,
    lineHeight: 20,
    paddingLeft: spacing.lg + spacing.xs,
  },
});
