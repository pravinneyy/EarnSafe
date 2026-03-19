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

export default function ClaimListItem({ claim }) {
  const { colors } = useTheme();

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
        <DetailItem label="Amount" value={formatCurrency(claim.claim_amount)} accent />
        <DetailItem label="Hours lost" value={formatHours(claim.hours_lost)} />
        <DetailItem label="Fraud score" value={formatPercent(claim.fraud_score)} />
      </View>

      {!!claim.reason && (
        <Text style={[styles.reason, { borderTopColor: colors.borderLight, color: colors.textSecondary }]}>
          {claim.reason}
        </Text>
      )}
    </AppCard>
  );
}

function DetailItem({ label, value, accent = false }) {
  const { colors } = useTheme();
  return (
    <View style={styles.detailItem}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: accent ? colors.accent : colors.text }]}>
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
  detailsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  detailItem: { width: '33%', marginBottom: spacing.sm },
  detailLabel: {
    fontSize: 11, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 4,
  },
  detailValue: { fontSize: 15, fontWeight: '600' },
  reason: {
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, fontSize: 13, lineHeight: 20,
  },
});
