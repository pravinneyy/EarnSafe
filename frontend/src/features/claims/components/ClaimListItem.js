import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppCard, StatusBadge } from '../../../shared/components';
import { spacing } from '../../../shared/theme';
import { useTheme } from '../../../shared/theme/ThemeContext';
import {
  getDisruptionLabel,
  getStatusTone,
} from '../constants';
import {
  formatCurrency,
  formatHours,
  formatPercent,
} from '../../../shared/utils/format';

function parseAutoReason(reason) {
  if (!reason) return null;
  const match = reason.match(/^Auto-triggered by event\s+(\S+)\s+\((.+)\)$/i);
  if (!match) return null;
  return {
    eventId: match[1],
    eventType: match[2],
  };
}

export default function ClaimListItem({ claim }) {
  const { colors } = useTheme();
  const isAutoClaim = claim.source === 'auto';
  const middleLabel = isAutoClaim ? 'Payout type' : 'Hours lost';
  const middleValue = isAutoClaim ? 'Parametric' : formatHours(claim.hours_lost);
  const autoReason = isAutoClaim ? parseAutoReason(claim.reason) : null;

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headingBlock}>
          <Text style={[styles.title, { color: colors.text }]}>{getDisruptionLabel(claim.disruption_type)}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Claim #{claim.id}</Text>
        </View>
        <StatusBadge label={claim.status} tone={getStatusTone(claim.status)} />
      </View>

      <View style={styles.detailsRow}>
        <DetailItem
          label="Amount"
          value={formatCurrency(claim.claim_amount)}
          accent
          containerStyle={styles.amountDetail}
        />
        <DetailItem
          label={middleLabel}
          value={middleValue}
          containerStyle={styles.middleDetail}
          valueStyle={isAutoClaim ? styles.autoPayoutValue : null}
        />
        <DetailItem
          label="Fraud score"
          value={formatPercent(claim.fraud_score)}
          containerStyle={styles.scoreDetail}
        />
      </View>

      {!!autoReason && (
        <Text style={[styles.reason, { borderTopColor: colors.borderLight, color: colors.textSecondary }]}>
          <Text>Auto-triggered by event </Text>
          <Text style={[styles.reasonCode, { color: colors.text }]}>{autoReason.eventId}</Text>
          <Text>{` (${autoReason.eventType})`}</Text>
        </Text>
      )}

      {!autoReason && !!claim.reason && (
        <Text style={[styles.reason, { borderTopColor: colors.borderLight, color: colors.textSecondary }]}>
          {claim.reason}
        </Text>
      )}
    </AppCard>
  );
}

function DetailItem({ label, value, accent = false, containerStyle, valueStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.detailItem, containerStyle]}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        numberOfLines={2}
        style={[styles.detailValue, { color: accent ? colors.accent : colors.text }, valueStyle]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: spacing.md,
  },
  headingBlock: { flex: 1, paddingRight: spacing.sm },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  subtitle: { fontSize: 13 },
  detailsRow: { flexDirection: 'row', gap: spacing.sm },
  detailItem: { flex: 1, minWidth: 0, marginBottom: spacing.sm },
  amountDetail: { flex: 0.95 },
  middleDetail: { flex: 1.15 },
  scoreDetail: { flex: 0.8 },
  detailLabel: {
    fontSize: 11, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6, minHeight: 30,
  },
  detailValue: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  autoPayoutValue: { fontSize: 13, letterSpacing: -0.2 },
  reason: {
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, fontSize: 13, lineHeight: 22,
  },
  reasonCode: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
