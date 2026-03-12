import { StatusBar } from 'expo-status-bar';
import React from 'react';

import RootNavigator from './src/app/navigation/RootNavigator';

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <RootNavigator />
    </>
  );
}
