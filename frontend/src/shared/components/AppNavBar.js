import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radii, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';

export default function AppNavBar({ items, activeIndex, onPress, style }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.shell, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {items.map((item, i) => {
        const isActive = i === activeIndex;
        return (
          <Pressable
            key={i}
            onPress={() => onPress(i)}
            style={[
              styles.item,
              {
                backgroundColor: isActive ? colors.primary : colors.surfaceMuted,
              },
            ]}
          >
            <Text style={styles.itemIcon}>{item.icon}</Text>
            <Text
              style={[
                styles.label,
                { color: isActive ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    borderRadius: radii.lg,
    padding: spacing.xs,
    borderWidth: 1,
    gap: spacing.xs,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
    gap: spacing.xs,
  },
  itemIcon: {
    fontSize: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
