import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import RegisterScreen from '../../features/auth/screens/RegisterScreen';
import ExistingUserScreen from '../../features/auth/screens/ExistingUserScreen';
import SplashScreen from '../../features/auth/screens/SplashScreen';
import PlanSelectScreen from '../../features/policy/screens/PlanSelectScreen';
import HomeScreen from '../../features/home/screens/HomeScreen';
import ClaimHistoryScreen from '../../features/claims/screens/ClaimHistoryScreen';
import AccountScreen from '../../features/account/screens/AccountScreen';
import { radii, shadows, spacing } from '../../shared/theme';
import { useTheme } from '../../shared/theme/ThemeContext';

const Tab = createBottomTabNavigator();
const MainStack = createNativeStackNavigator();

const TAB_ICONS = {
  HomeTab: { active: '🏠', inactive: '🏡' },
  PolicyTab: { active: '🛡️', inactive: '🛡️' },
  WalletTab: { active: '💰', inactive: '💰' },
  ProfileTab: { active: '👤', inactive: '👤' },
};

const TAB_LABELS = {
  HomeTab: 'Home',
  PolicyTab: 'Policy',
  WalletTab: 'Wallet',
  ProfileTab: 'Profile',
};

function TabIcon({ route, focused }) {
  const icons = TAB_ICONS[route.name] || { active: '•', inactive: '•' };
  return (
    <View style={tabStyles.tabIconWrap}>
      <Text style={tabStyles.tabEmoji}>
        {focused ? icons.active : icons.inactive}
      </Text>
      {focused && <View style={tabStyles.activeIndicator} />}
    </View>
  );
}

function MainTabs({ route }) {
  const params = route.params || {};
  const { isDark, colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, spacing.sm);
  const tabBarHeight = 58 + bottomInset;

  return (
    <Tab.Navigator
      screenOptions={({ route: tabRoute }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <TabIcon route={tabRoute} focused={focused} />
        ),
        tabBarLabel: ({ focused }) => (
          <Text
            style={[
              tabStyles.tabLabel,
              { color: focused ? c.accent : c.textMuted },
            ]}
          >
            {TAB_LABELS[tabRoute.name]}
          </Text>
        ),
        tabBarStyle: {
          backgroundColor: isDark ? c.navy900 : '#FFFFFF',
          borderTopWidth: isDark ? 0 : 1,
          borderTopColor: c.border,
          height: tabBarHeight,
          paddingTop: spacing.xs,
          paddingBottom: bottomInset,
          ...shadows.elevated,
        },
        tabBarItemStyle: tabStyles.tabItem,
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} initialParams={params} />
      <Tab.Screen name="PolicyTab" component={PlanSelectScreen} initialParams={params} />
      <Tab.Screen name="WalletTab" component={ClaimHistoryScreen} initialParams={params} />
      <Tab.Screen name="ProfileTab" component={AccountScreen} initialParams={params} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { colors: c } = useTheme();

  return (
    <NavigationContainer>
      <MainStack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.background },
        }}
      >
        <MainStack.Screen name="Splash" component={SplashScreen} />
        <MainStack.Screen name="ExistingUser" component={ExistingUserScreen} />
        <MainStack.Screen name="Register" component={RegisterScreen} />
        {/* PlanSelect kept as a named screen for backwards-compat deep links */}
        <MainStack.Screen name="PlanSelect" component={PlanSelectScreen} />
        <MainStack.Screen name="Main" component={MainTabs} />
      </MainStack.Navigator>
    </NavigationContainer>
  );
}

const tabStyles = StyleSheet.create({
  tabItem: {
    paddingVertical: spacing.xs,
  },
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 32,
  },
  tabEmoji: {
    fontSize: 18,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -2,
    width: 20,
    height: 3,
    borderRadius: radii.full,
    backgroundColor: '#10B981',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
