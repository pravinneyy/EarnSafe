import React, { createContext, useContext, useState, useCallback } from 'react';
import { lightColors, darkColors, colors as defaultColors } from './index';

const ThemeContext = createContext({
  isDark: true,
  colors: defaultColors,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => !prev);
  }, []);

  const currentColors = isDark ? darkColors : lightColors;

  // Mutate the shared `colors` export so existing static imports still work
  // after a re-render. This is a pragmatic shortcut that avoids rewriting
  // every component to use useTheme().
  Object.assign(defaultColors, currentColors);

  return (
    <ThemeContext.Provider value={{ isDark, colors: currentColors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default ThemeContext;
