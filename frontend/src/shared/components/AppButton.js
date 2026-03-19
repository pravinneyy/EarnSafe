import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';

import { radii, shadows, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';

export default function AppButton({
  label,
  onPress,
  loading = false,
  variant = 'primary',
  size = 'lg',
  style,
  disabled = false,
  icon,
}) {
  const { colors } = useTheme();
  const isSecondary = variant === 'secondary';
  const isAccent = variant === 'accent';
  const isDanger = variant === 'danger';
  const isDisabled = disabled || loading;

  const bgStyle = isSecondary
    ? { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, shadowOpacity: 0 }
    : isAccent
    ? { backgroundColor: colors.accent }
    : isDanger
    ? { backgroundColor: colors.danger }
    : { backgroundColor: colors.primary };

  const labelColor = isSecondary ? colors.textSecondary : '#FFFFFF';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.baseSm,
        bgStyle,
        isAccent && shadows.glow,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isSecondary ? colors.primary : '#FFFFFF'} />
      ) : (
        <>
          {icon && <Text style={[styles.icon, { color: labelColor }]}>{icon}</Text>}
          <Text
            style={[
              styles.label,
              size === 'sm' && styles.labelSm,
              { color: labelColor },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 58,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    ...shadows.sm,
  },
  baseSm: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  label: {
    fontSize: 17,
    fontWeight: '700',
  },
  labelSm: {
    fontSize: 14,
  },
  icon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
});
