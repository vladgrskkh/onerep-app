import { createContext, useContext } from 'react';

import { Theme, ThemeFlavor, themes } from './theme';

const ThemeContext = createContext<{ theme: Theme; flavor: ThemeFlavor }>({
  theme: themes.mocha,
  flavor: 'mocha',
});

export interface ThemeProviderProps {
  flavor?: ThemeFlavor;
  children?: React.ReactNode;
}

export function ThemeProvider({ flavor = 'mocha', children }: ThemeProviderProps) {
  return (
    <ThemeContext.Provider value={{ theme: themes[flavor], flavor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

export function useThemeFlavor(): ThemeFlavor {
  return useContext(ThemeContext).flavor;
}
