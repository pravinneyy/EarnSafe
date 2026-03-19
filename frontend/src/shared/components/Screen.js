import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';

export default function Screen({
  children,
  contentStyle,
  style,
  refreshControl,
  scroll = true,
  edges = ['top', 'left', 'right'],
  padded = true,
}) {
  const { colors } = useTheme();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }, style]}
      edges={edges}
    >
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            padded && styles.padded,
            styles.content,
            contentStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[padded && styles.padded, styles.content, contentStyle]}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
  content: {
    paddingBottom: spacing.xl,
  },
});
