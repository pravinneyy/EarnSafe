import { StatusBar } from 'expo-status-bar';
import React from 'react';

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
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
