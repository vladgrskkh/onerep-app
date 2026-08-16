import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '../../shared/ui/Button';
import { ErrorText } from '../../shared/ui/ErrorText';
import { ScreenContainer } from '../../shared/ui/ScreenContainer';
import { AppTextInput } from '../../shared/ui/TextInput';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { getUserMessage, useAuth } from './AuthContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LoginScreenProps {
  onNavigateToRegister?: () => void;
}

export function LoginScreen({ onNavigateToRegister }: LoginScreenProps) {
  const theme = useTheme();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const next: { email?: string; password?: string } = {};
    if (!EMAIL_RE.test(email)) {
      next.email = 'Enter a valid email address';
    }
    if (!password) {
      next.password = 'Password is required';
    }
    setFieldErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await auth.login(email.trim(), password);
      // success: the root navigator switches on user != null
    } catch (err) {
      setError(getUserMessage(err, 'Sign in failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <Text style={[styles.title, { color: theme.text }]}>Welcome back</Text>
      <Text style={[styles.subtitle, { color: theme.subtext0 }]}>
        Sign in to continue your training
      </Text>

      {error ? <ErrorText testID="login.error">{error}</ErrorText> : null}

      <AppTextInput
        testID="login.email"
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={fieldErrors.email}
      />
      <AppTextInput
        testID="login.password"
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        error={fieldErrors.password}
      />

      <Button
        testID="login.submit"
        title="Sign in"
        loading={submitting}
        disabled={submitting}
        onPress={submit}
        style={styles.submit}
      />

      <Button
        testID="login.goToRegister"
        title="Create an account"
        variant="ghost"
        onPress={onNavigateToRegister}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 24,
  },
  submit: {
    marginTop: 8,
    marginBottom: 12,
  },
});
