import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadows, spacing } from '../theme';

export default function ActionCard({
  icon,
  title,
  subtitle,
  onPress,
  rightContent,
  variant = 'default',
  style,
}) {
  const isNavy = variant === 'navy';

  const Container = onPress ? Pressable : View;
  const containerProps = onPress
    ? {
        onPress,
        accessibilityRole: 'button',
        style: ({ pressed }) => [
          styles.card,
          isNavy && styles.navy,
          pressed && styles.pressed,
          style,
        ],
      }
    : { style: [styles.card, isNavy && styles.navy, style] };

  return (
    <Container {...containerProps}>
      <View style={styles.row}>
        {!!icon && (
          <View style={[styles.iconWrap, isNavy && styles.iconWrapNavy]}>
            <Text style={styles.iconText}>{icon}</Text>
          </View>
        )}
        <View style={styles.textBlock}>
          <Text
            style={[styles.title, isNavy && styles.titleNavy]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {!!subtitle && (
            <Text
              style={[styles.subtitle, isNavy && styles.subtitleNavy]}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          )}
        </View>
        {rightContent || (
          onPress && (
            <Text style={[styles.chevron, isNavy && styles.chevronNavy]}>›</Text>
          )
        )}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  navy: {
    backgroundColor: colors.navy800,
    borderColor: colors.borderNavy,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  iconWrapNavy: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  iconText: {
    fontSize: 20,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  titleNavy: {
    color: colors.textOnDark,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  subtitleNavy: {
    color: colors.textOnDarkMuted,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 24,
    fontWeight: '300',
    marginLeft: spacing.sm,
  },
  chevronNavy: {
    color: colors.textOnDarkMuted,
  },
});
