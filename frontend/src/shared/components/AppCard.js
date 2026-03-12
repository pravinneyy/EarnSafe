import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, shadows, spacing } from '../theme';

export default function AppCard({ children, style, toned = false }) {
  return (
    <View style={[styles.card, toned && styles.tonedCard, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.card,
  },
  tonedCard: {
    backgroundColor: colors.surfaceMuted,
  },
});
