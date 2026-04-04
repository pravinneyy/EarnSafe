import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { spacing } from '../../../shared/theme';
import { useTheme } from '../../../shared/theme/ThemeContext';

export default function SplashScreen({ navigation }) {
  const { colors } = useTheme();

  // Brand text animations
  const earnOpacity = useRef(new Animated.Value(0)).current;
  const earnTranslateX = useRef(new Animated.Value(-40)).current;
  const sureOpacity = useRef(new Animated.Value(0)).current;
  const sureTranslateX = useRef(new Animated.Value(40)).current;
  const brandScale = useRef(new Animated.Value(0.85)).current;

  // Tagline
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(12)).current;

  // Glow line under brand
  const glowWidth = useRef(new Animated.Value(0)).current;

  // Bottom dots pulse
  const dotPulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    let cancelled = false;

    const introAnimation = Animated.sequence([
      // 1. "Earn" slides in from left
      Animated.parallel([
        Animated.timing(earnOpacity, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(earnTranslateX, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // 2. "Sure" slides in from right
      Animated.parallel([
        Animated.timing(sureOpacity, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(sureTranslateX, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // 3. Scale up together + glow line
      Animated.parallel([
        Animated.spring(brandScale, {
          toValue: 1,
          friction: 6,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(glowWidth, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
      // 4. Tagline fades in
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(taglineTranslateY, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);

    introAnimation.start(({ finished }) => {
      if (finished && !cancelled) {
        navigation.replace('ExistingUser');
      }
    });

    // Dot pulse loop
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(dotPulse, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseAnimation.start();

    return () => {
      cancelled = true;
      introAnimation.stop();
      pulseAnimation.stop();
    };
  }, []);

  const glowInterpolated = glowWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '60%'],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.navy900 }]}>
      {/* Brand name row */}
      <Animated.View
        style={[
          styles.brandRow,
          { transform: [{ scale: brandScale }] },
        ]}
      >
        <Animated.Text
          style={[
            styles.brandEarn,
            {
              opacity: earnOpacity,
              transform: [{ translateX: earnTranslateX }],
            },
          ]}
        >
          Earn
        </Animated.Text>
        <Animated.Text
          style={[
            styles.brandSure,
            {
              opacity: sureOpacity,
              transform: [{ translateX: sureTranslateX }],
              color: colors.accent,
            },
          ]}
        >
          Sure
        </Animated.Text>
      </Animated.View>

      {/* Glow line under brand */}
      <View style={styles.glowLineContainer}>
        <Animated.View
          style={[
            styles.glowLine,
            {
              width: glowInterpolated,
              backgroundColor: colors.accent,
            },
          ]}
        />
      </View>

      {/* Tagline */}
      <Animated.Text
        style={[
          styles.tagline,
          {
            opacity: taglineOpacity,
            transform: [{ translateY: taglineTranslateY }],
          },
        ]}
      >
       
      </Animated.Text>

      {/* Bottom dots animation */}
      <View style={styles.bottom}>
        <View style={styles.dotsRow}>
          <Animated.View
            style={[
              styles.dot,
              { backgroundColor: colors.accent, opacity: dotPulse },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              styles.dotMid,
              {
                backgroundColor: colors.accent,
                opacity: dotPulse.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [0.6, 0.4],
                }),
              },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              {
                backgroundColor: colors.accent,
                opacity: dotPulse.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [1, 0.3],
                }),
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brandEarn: {
    color: '#FFFFFF',
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -1,
  },
  brandSure: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -1,
  },
  glowLineContainer: {
    height: 3,
    width: '60%',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: spacing.lg,
  },
  glowLine: {
    height: 3,
    borderRadius: 2,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
  tagline: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.xl,
  },
  bottom: {
    position: 'absolute',
    bottom: 60,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotMid: {
    marginHorizontal: spacing.sm,
  },
});
