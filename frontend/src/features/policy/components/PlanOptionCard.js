import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard, AppPill } from '../../../shared/components';
import { colors, spacing } from '../../../shared/theme';
import { formatCurrency } from '../../../shared/utils/format';

export default function PlanOptionCard({ plan, selected, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.wrapper}>
      <AppCard style={[styles.card, selected && styles.selectedCard]}>
        <View style={styles.header}>
          <View style={styles.headingBlock}>
            <Text style={styles.title}>{plan.label}</Text>
            <Text style={styles.description}>{plan.description}</Text>
          </View>
          {plan.recommended && <AppPill label="Recommended" tone="accent" />}
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatCurrency(plan.premium)}</Text>
          <Text style={styles.priceSuffix}>per week</Text>
        </View>

        <View style={styles.statsRow}>
          <MetaItem
            label="Daily cover"
            value={formatCurrency(plan.dailyCoverage)}
          />
          <MetaItem
            label="Max payout"
            value={formatCurrency(plan.maxWeeklyPayout)}
          />
        </View>
      </AppCard>
    </Pressable>
  );
}

function MetaItem({ label, value }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedCard: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  headingBlock: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  description: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  price: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginRight: spacing.xs,
  },
  priceSuffix: {
    color: colors.textSoft,
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 4,
  },
  metaValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
