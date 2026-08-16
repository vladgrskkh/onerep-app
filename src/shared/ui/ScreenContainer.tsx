import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from './ThemeProvider';

export interface ScreenContainerProps {
  children?: React.ReactNode;
  contentContainerStyle?: ViewStyle;
  scrollable?: boolean;
}

export function ScreenContainer({ children, contentContainerStyle, scrollable = true }: ScreenContainerProps) {
  const theme = useTheme();
  const body = scrollable ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.base }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
});
