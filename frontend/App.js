import { StatusBar } from 'expo-status-bar';
import React from 'react';
// 1. ADD THIS IMPORT
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootNavigator from './src/app/navigation/RootNavigator';
import { ThemeProvider, useTheme } from './src/shared/theme/ThemeContext';

function AppContent() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    // 2. WRAP EVERYTHING IN SafeAreaProvider
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}