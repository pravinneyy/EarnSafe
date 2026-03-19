import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { createPolicy } from '../../../services/api';
import { getRiskMessage, PLANS } from '../constants';
import PlanOptionCard from '../components/PlanOptionCard';
import {
  AppButton,
  AppCard,
  AppPill,
  Screen,
  SectionHeading,
} from '../../../shared/components';
import { spacing } from '../../../shared/theme';
import { useTheme } from '../../../shared/theme/ThemeContext';
import {
  formatPercentFromScore,
  toTitleCase,
} from '../../../shared/utils/format';

export default function PlanSelectScreen({ route, navigation }) {
  const { user, policy } = route.params || {};
  const [selectedTier, setSelectedTier] = useState(policy?.plan_tier || 'standard');
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();

  const selectedPlan = PLANS.find(plan => plan.tier === selectedTier);
  const isViewMode = !!policy;

  async function handleCreatePolicy() {
    setLoading(true);
    try {
      const newPolicy = await createPolicy({
        user_id: user.id,
        plan_tier: selectedTier,
      });
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: { user, policy: newPolicy } }],
      });
    } catch (error) {
      Alert.alert('Plan creation failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <SectionHeading
        title={isViewMode ? 'Your policy' : 'Choose your plan'}
        subtitle={
          isViewMode
            ? `Your ${toTitleCase(policy.plan_tier)} Shield is currently active.`
            : 'Pick the cover that fits a normal riding week.'
        }
      />

      {user && (
        <AppCard variant="navy" style={styles.riskCard}>
          <View style={styles.riskHeader}>
            <View>
              <Text style={styles.riskLabel}>Risk score</Text>
              <Text style={styles.riskValue}>
                {formatPercentFromScore(user.risk_score)}
              </Text>
            </View>
            <AppPill label={user.city} tone="accent" />
          </View>
          <Text style={styles.riskNote}>{getRiskMessage(user.risk_score)}</Text>
          <View style={styles.riskMeta}>
            <RiskMetaItem label="Platform" value={toTitleCase(user.platform)} />
            <RiskMetaItem label="Zone" value={user.delivery_zone} />
            <RiskMetaItem label="Income" value={`₹${user.weekly_income}`} />
          </View>
        </AppCard>
      )}

      {PLANS.map(plan => (
        <PlanOptionCard
          key={plan.tier}
          plan={plan}
          selected={plan.tier === selectedTier}
          onPress={() => !isViewMode && setSelectedTier(plan.tier)}
          disabled={isViewMode}
        />
      ))}

      {!isViewMode && (
        <>
          <AppButton
            label={`Activate ${selectedPlan.label}`}
            variant="accent"
            onPress={handleCreatePolicy}
            loading={loading}
          />
          <AppButton
            label="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          />
        </>
      )}
    </Screen>
  );
}

function RiskMetaItem({ label, value }) {
  return (
    <View style={styles.riskMetaItem}>
      <Text style={styles.riskMetaLabel}>{label}</Text>
      <Text style={styles.riskMetaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg },
  riskCard: { marginBottom: spacing.lg },
  riskHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: spacing.md,
  },
  riskLabel: { color: '#94A3B8', fontSize: 13, marginBottom: 4 },
  riskValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '700' },
  riskNote: { color: '#94A3B8', fontSize: 14, lineHeight: 22, marginBottom: spacing.md },
  riskMeta: { flexDirection: 'row', flexWrap: 'wrap' },
  riskMetaItem: { width: '50%', marginBottom: spacing.sm },
  riskMetaLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 4 },
  riskMetaValue: { color: '#34D399', fontSize: 14, fontWeight: '600' },
  backBtn: { marginTop: spacing.sm },
});
