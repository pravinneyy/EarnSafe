import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppPill,
  Screen,
  SectionHeading,
} from '../../../shared/components';
import { clearSession } from '../../../services/api';
import { radii, shadows, spacing } from '../../../shared/theme';
import { useTheme } from '../../../shared/theme/ThemeContext';
import { formatCurrency, toTitleCase } from '../../../shared/utils/format';

export default function AccountScreen({ navigation, route }) {
  const { user, policy } = route.params || {};
  const { isDark, toggleTheme, colors } = useTheme();

  async function handleSignOut() {
    clearSession();
    navigation.getParent()?.reset({
      index: 0,
      routes: [{ name: 'ExistingUser' }],
    });
  }

  return (
    <Screen contentStyle={styles.content}>
      {/* Profile Hero */}
      <View style={styles.profileHero}>
        <View style={[styles.avatarCircle, { backgroundColor: colors.accent }]}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{user?.name || 'Rider'}</Text>
        <Text style={[styles.username, { color: colors.textSecondary }]}>
          @{user?.username || 'unknown'}
        </Text>
        <AppPill label="Active rider" tone="success" style={styles.statusPill} />
      </View>

      <SectionHeading title="Account details" />

      <AppCard style={styles.card}>
        <InfoRow label="Phone" value={user?.phone} />
        <InfoRow label="City" value={user?.city} />
        <InfoRow label="Zone" value={user?.delivery_zone} />
        <InfoRow label="Platform" value={toTitleCase(user?.platform || '')} />
        <InfoRow
          label="Weekly income"
          value={formatCurrency(user?.weekly_income || 0)}
          last
        />
      </AppCard>

      {/* Appearance toggle */}
      <SectionHeading title="Appearance" style={styles.sectionGap} />

      <AppCard style={styles.card}>
        <View style={styles.themeRow}>
          <View style={styles.themeInfo}>
            <Text style={styles.themeIcon}>{isDark ? '🌙' : '☀️'}</Text>
            <View>
              <Text style={[styles.themeLabel, { color: colors.text }]}>Dark mode</Text>
              <Text style={[styles.themeSublabel, { color: colors.textMuted }]}>
                {isDark ? 'Dark theme active' : 'Light theme active'}
              </Text>
            </View>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#FFFFFF"
          />
        </View>
      </AppCard>

      {policy && (
        <>
          <SectionHeading title="Active plan" style={styles.sectionGap} />
          <AppCard variant="navy" style={styles.card}>
            <View style={styles.planHeader}>
              <Text style={styles.planTitle}>
                {toTitleCase(policy.plan_tier)} Shield
              </Text>
              <AppPill label="Active" tone="success" />
            </View>
            <View style={styles.planStats}>
              <PlanStat label="Daily cover" value={formatCurrency(policy.daily_coverage)} />
              <PlanStat label="Premium" value={`${formatCurrency(policy.weekly_premium)}/wk`} />
              <PlanStat label="Max payout" value={formatCurrency(policy.max_weekly_payout)} />
            </View>
          </AppCard>
        </>
      )}

      <AppButton
        label="Sign out"
        variant="secondary"
        onPress={handleSignOut}
        style={styles.signOutBtn}
      />

      <Text style={[styles.versionText, { color: colors.textMuted }]}>EarnSafe v1.0.0</Text>
    </Screen>
  );
}

function InfoRow({ label, value, last = false }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.infoRow, !last && { borderBottomColor: colors.borderLight }]}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value || '—'}</Text>
    </View>
  );
}

function PlanStat({ label, value }) {
  return (
    <View style={styles.planStatItem}>
      <Text style={styles.planStatValue}>{value}</Text>
      <Text style={styles.planStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xl },
  profileHero: { alignItems: 'center', marginBottom: spacing.xl },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md, ...shadows.elevated,
  },
  avatarText: { color: '#FFFFFF', fontSize: 32, fontWeight: '700' },
  name: { fontSize: 26, fontWeight: '700', marginBottom: 4 },
  username: { fontSize: 15, marginBottom: spacing.sm },
  statusPill: { marginTop: spacing.xs },
  card: { marginBottom: spacing.md },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm + 2, borderBottomWidth: 1,
  },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 15, fontWeight: '600' },

  sectionGap: { marginTop: spacing.sm },
  themeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  themeInfo: { flexDirection: 'row', alignItems: 'center' },
  themeIcon: { fontSize: 24, marginRight: spacing.md },
  themeLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  themeSublabel: { fontSize: 12 },

  planHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md,
  },
  planTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  planStats: { flexDirection: 'row' },
  planStatItem: { flex: 1 },
  planStatValue: { color: '#34D399', fontSize: 17, fontWeight: '700', marginBottom: 2 },
  planStatLabel: { color: '#94A3B8', fontSize: 12 },

  signOutBtn: { marginTop: spacing.lg },
  versionText: { fontSize: 12, textAlign: 'center', marginTop: spacing.xl },
});
