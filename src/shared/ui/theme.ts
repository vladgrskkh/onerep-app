export interface Theme {
  base: string;
  mantle: string;
  surface0: string;
  surface1: string;
  text: string;
  subtext0: string;
  overlay0: string;
  mauve: string;
  green: string;
  blue: string;
  teal: string;
  red: string;
  sky: string;
  peach: string;
  yellow: string;
  lavender: string;
}

export type ThemeFlavor = 'latte' | 'frappe' | 'macchiato' | 'mocha';

export const mochaTheme: Theme = {
  base: '#1e1e2e',
  mantle: '#181825',
  surface0: '#313244',
  surface1: '#45475a',
  text: '#cdd6f4',
  subtext0: '#a6adc8',
  overlay0: '#6c7086',
  mauve: '#cba6f7',
  green: '#a6e3a1',
  blue: '#89b4fa',
  teal: '#94e2d5',
  red: '#f38ba8',
  sky: '#89dceb',
  peach: '#fab387',
  yellow: '#f9e2af',
  lavender: '#b4befe',
};

export const themes: Record<ThemeFlavor, Theme> = {
  latte: mochaTheme,
  frappe: mochaTheme,
  macchiato: mochaTheme,
  mocha: mochaTheme,
};
