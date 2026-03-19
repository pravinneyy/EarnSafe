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
import { colors, spacing } from '../../../shared/theme';
import {
  formatPercentFromScore,
  toTitleCase,
} from '../../../shared/utils/format';

export default function PlanSelectScreen({ route, navigation }) {
  const { user } = route.params;
  const [selectedTier, setSelectedTier] = useState('standard');
  const [loading, setLoading] = useState(false);

  const selectedPlan = PLANS.find(plan => plan.tier === selectedTier);

  async function handleCreatePolicy() {
    setLoading(true);
    try {
      // 1. GET THE AI PREMIUM FIRST
      const aiResponse = await fetch('http://192.168.0.101:8000/api/v1/calculate-premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone: user.delivery_zone || "Anna Nagar", // <-- Bulletproof fallback
          delivery_persona: user.platform || "Food", // <-- Bulletproof fallback
          tier: selectedTier || "standard"
        })
      });

      if (!aiResponse.ok) {
        throw new Error('AI Server failed. Check the terminal.');
      }

      const aiData = await aiResponse.json();

      // 2. CREATE THE POLICY (Mock Database)
      const policy = await createPolicy({
        user_id: user.id,
        plan_tier: selectedTier,
      });

      // 3. NAVIGATE TO HOME WITH LIVE AI DATA
      navigation.navigate('Home', { 
        user: { 
          ...user, 
          name: user.name || 'Lax', 
          risk_score: aiData.ai_risk_score * 100 
        }, 
        policy: {
          ...policy,
          plan_name: selectedPlan.label,
          weekly_premium: aiData.weekly_premium_inr,
          disruption: aiData.active_disruption
        } 
      });
      
    } catch (error) {
      Alert.alert('Plan creation failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <SectionHeading
        title="Your quote"
        subtitle="This profile is based on the city, delivery zone, and platform you selected."
      />

      <AppCard style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View>
            <Text style={styles.scoreLabel}>Risk score</Text>
            <Text style={styles.scoreValue}>
              {formatPercentFromScore(user.risk_score)}
            </Text>
          </View>
          <AppPill label={user.city} tone="accent" />
        </View>

        <Text style={styles.summaryNote}>{getRiskMessage(user.risk_score)}</Text>

        <View style={styles.metaRow}>
          <MetaItem label="Platform" value={toTitleCase(user.platform)} />
          <MetaItem label="Zone" value={user.delivery_zone} />
          <MetaItem label="Income" value={`Rs. ${user.weekly_income}`} />
        </View>
      </AppCard>

      {PLANS.map(plan => (
        <PlanOptionCard
          key={plan.tier}
          plan={plan}
          selected={plan.tier === selectedTier}
          onPress={() => setSelectedTier(plan.tier)}
        />
      ))}

      <AppButton
        label={`Activate ${selectedPlan.label}`}
        onPress={handleCreatePolicy}
        loading={loading}
      />
    </Screen>
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
  summaryCard: {
    marginBottom: spacing.lg,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  scoreLabel: {
    color: colors.textSoft,
    fontSize: 13,
    marginBottom: 4,
  },
  scoreValue: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
  },
  summaryNote: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metaItem: {
    width: '50%',
    marginBottom: spacing.sm,
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
