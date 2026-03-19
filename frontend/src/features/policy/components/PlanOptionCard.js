import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppPill } from '../../../shared/components';
import { radii, shadows, spacing } from '../../../shared/theme';
import { useTheme } from '../../../shared/theme/ThemeContext';
import { formatCurrency } from '../../../shared/utils/format';

export default function PlanOptionCard({ plan, selected, onPress, disabled = false }) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.wrapper,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: selected ? colors.navy800 : colors.surface,
            borderColor: selected ? colors.accent : colors.borderLight,
          },
          selected && shadows.glow,
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headingBlock}>
            <Text style={[styles.title, { color: selected ? '#FFFFFF' : colors.text }]}>
              {plan.label}
            </Text>
            <Text style={[styles.description, { color: selected ? '#94A3B8' : colors.textSecondary }]}>
              {plan.description}
            </Text>
          </View>
          {plan.recommended && <AppPill label="Recommended" tone="success" />}
        </View>

        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: selected ? colors.emerald400 : colors.text }]}>
            {formatCurrency(plan.premium)}
          </Text>
          <Text style={[styles.priceSuffix, { color: selected ? '#94A3B8' : colors.textMuted }]}>
            per week
          </Text>
        </View>

        <View style={styles.statsRow}>
          <MetaItem label="Daily cover" value={formatCurrency(plan.dailyCoverage)} selected={selected} />
          <MetaItem label="Max payout" value={formatCurrency(plan.maxWeeklyPayout)} selected={selected} />
        </View>

        {selected && (
          <View style={styles.selectedIndicator}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.selectedText}>Selected</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function MetaItem({ label, value, selected }) {
  const { colors } = useTheme();
  return (
    <View style={styles.metaItem}>
      <Text style={[styles.metaLabel, { color: selected ? '#94A3B8' : colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: selected ? '#FFFFFF' : colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  card: {
    borderRadius: radii.lg, padding: spacing.lg,
    borderWidth: 2, ...shadows.sm,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: spacing.md,
  },
  headingBlock: { flex: 1, paddingRight: spacing.sm },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  description: { fontSize: 13, lineHeight: 20 },
  priceRow: {
    flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.md,
  },
  price: { fontSize: 30, fontWeight: '700', marginRight: spacing.xs },
  priceSuffix: { fontSize: 13 },
  statsRow: { flexDirection: 'row' },
  metaItem: { flex: 1 },
  metaLabel: {
    fontSize: 11, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 4,
  },
  metaValue: { fontSize: 15, fontWeight: '600' },
  selectedIndicator: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.md,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)',
  },
  checkmark: { color: '#34D399', fontSize: 16, fontWeight: '700', marginRight: spacing.xs },
  selectedText: { color: '#34D399', fontSize: 13, fontWeight: '600' },
});
