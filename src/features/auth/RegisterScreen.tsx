import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '../../shared/ui/Button';
import { ErrorText } from '../../shared/ui/ErrorText';
import { ScreenContainer } from '../../shared/ui/ScreenContainer';
import { AppTextInput } from '../../shared/ui/TextInput';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { getUserMessage, useAuth } from './AuthContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterScreenProps {
  onNavigateToLogin?: () => void;
}

export function RegisterScreen({ onNavigateToLogin }: RegisterScreenProps) {
  const theme = useTheme();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    displayName?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const next: { email?: string; password?: string; displayName?: string } = {};
    if (!EMAIL_RE.test(email)) {
      next.email = 'Enter a valid email address';
    }
    if (password.length < 8) {
      next.password = 'Password must be at least 8 characters';
    }
    if (!displayName.trim()) {
      next.displayName = 'Display name is required';
    }
    setFieldErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await auth.register(email.trim(), password, displayName.trim());
      // success: the root navigator switches on user != null
    } catch (err) {
      setError(getUserMessage(err, 'Registration failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <Text style={[styles.title, { color: theme.text }]}>Create account</Text>
      <Text style={[styles.subtitle, { color: theme.subtext0 }]}>
        Start tracking your training
      </Text>

      {error ? <ErrorText testID="register.error">{error}</ErrorText> : null}

      <AppTextInput
        testID="register.email"
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={fieldErrors.email}
      />
      <AppTextInput
        testID="register.password"
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        error={fieldErrors.password}
      />
      <AppTextInput
        testID="register.displayName"
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        error={fieldErrors.displayName}
      />

      <Button
        testID="register.submit"
        title="Create account"
        loading={submitting}
        disabled={submitting}
        onPress={submit}
        style={styles.submit}
      />

      <Button
        testID="register.goToLogin"
        title="Already have an account? Sign in"
        variant="ghost"
        onPress={onNavigateToLogin}
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
