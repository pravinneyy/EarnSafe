import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import RegisterScreen from '../../features/auth/screens/RegisterScreen';
import ExistingUserScreen from '../../features/auth/screens/ExistingUserScreen';
import PlanSelectScreen from '../../features/policy/screens/PlanSelectScreen';
import HomeScreen from '../../features/home/screens/HomeScreen';
import ClaimHistoryScreen from '../../features/claims/screens/ClaimHistoryScreen';
import { colors } from '../../shared/theme';

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: {
    backgroundColor: colors.background,
  },
  headerShadowVisible: false,
  headerTintColor: colors.text,
  headerTitleStyle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  contentStyle: {
    backgroundColor: colors.background,
  },
};

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Register"
        screenOptions={screenOptions}
      >
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ExistingUser"
          component={ExistingUserScreen}
          options={{ title: 'Enter the app' }}
        />
        <Stack.Screen
          name="PlanSelect"
          component={PlanSelectScreen}
          options={{ title: 'Choose a plan' }}
        />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Insurance App', headerLeft: () => null }}
        />
        <Stack.Screen
          name="ClaimHistory"
          component={ClaimHistoryScreen}
          options={{ title: 'Claim history' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
