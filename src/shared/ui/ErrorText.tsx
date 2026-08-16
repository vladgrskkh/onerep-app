import { StyleSheet, Text, TextProps } from 'react-native';

import { useTheme } from './ThemeProvider';

export function ErrorText({ style, ...props }: TextProps) {
  const theme = useTheme();
  return <Text style={[styles.text, { color: theme.red }, style]} {...props} />;
}

const styles = StyleSheet.create({
  text: {
    fontSize: 14,
    marginTop: 8,
  },
});
