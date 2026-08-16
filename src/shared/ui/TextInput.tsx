import { useState } from 'react';
import { StyleSheet, Text, TextInput as RNTextInput, TextInputProps, View } from 'react-native';

import { useTheme } from './ThemeProvider';

export interface AppTextInputProps extends TextInputProps {
  label?: string;
  error?: string | null;
}

export function AppTextInput({ label, error, style, onFocus, onBlur, ...props }: AppTextInputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const handleFocus = (e: unknown) => {
    setFocused(true);
    (onFocus as ((event: unknown) => void) | undefined)?.(e);
  };

  const handleBlur = (e: unknown) => {
    setFocused(false);
    (onBlur as ((event: unknown) => void) | undefined)?.(e);
  };

  const borderColor = error ? theme.red : focused ? theme.mauve : theme.surface1;

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: theme.subtext0 }]}>{label}</Text> : null}
      <RNTextInput
        placeholderTextColor={theme.overlay0}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.input,
          { backgroundColor: theme.surface0, borderColor, color: theme.text },
          style,
        ]}
        {...props}
      />
      {error ? <Text style={[styles.error, { color: theme.red }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  error: {
    fontSize: 13,
    marginTop: 4,
  },
});
