import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Gender } from '../../shared/api/auth';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ErrorText } from '../../shared/ui/ErrorText';
import { ScreenContainer } from '../../shared/ui/ScreenContainer';
import { AppTextInput } from '../../shared/ui/TextInput';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { getUserMessage, useAuth } from './AuthContext';

const GENDER_OPTIONS: Gender[] = ['male', 'female', 'other'];

type EditingField = 'display_name' | 'gender' | 'birth_date' | null;

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatGender(value?: string): string {
  if (!value) {
    return 'Not set';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ProfileScreen() {
  const theme = useTheme();
  const { user, logout, updateProfile } = useAuth();
  const [editing, setEditing] = useState<EditingField>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!user) {
    return null;
  }

  const startEdit = (field: Exclude<EditingField, null>, initial: string) => {
    setError(null);
    setDraft(initial);
    setEditing(field);
  };

  const cancelEdit = () => {
    setEditing(null);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editing) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing === 'display_name') {
        await updateProfile({ display_name: draft.trim() || undefined });
      } else if (editing === 'gender') {
        await updateProfile({ gender: draft as Gender });
      } else {
        await updateProfile({ birth_date: draft || undefined });
      }
      setEditing(null);
    } catch (err) {
      setError(getUserMessage(err, 'Could not save changes'));
    } finally {
      setSaving(false);
    }
  };

  const logOut = async () => {
    setError(null);
    try {
      await logout();
      // success: the root navigator switches on user == null
    } catch (err) {
      setError(getUserMessage(err, 'Could not sign out'));
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View
          testID="profile.avatar"
          style={[styles.avatar, { backgroundColor: theme.mauve }]}
        >
          <Text style={[styles.avatarText, { color: theme.base }]}>
            {initialsOf(user.display_name) || '?'}
          </Text>
        </View>
        <Text style={[styles.name, { color: theme.text }]}>{user.display_name}</Text>
        {user.email ? (
          <Text testID="profile.email" style={[styles.email, { color: theme.subtext0 }]}>
            {user.email}
          </Text>
        ) : null}
      </View>

      {error ? <ErrorText testID="profile.error">{error}</ErrorText> : null}

      <Card style={styles.card}>
        {editing === 'display_name' ? (
          <View>
            <AppTextInput
              testID="profile.edit.displayName"
              label="Display name"
              value={draft}
              onChangeText={setDraft}
            />
            <View style={styles.row}>
              <Button title="Cancel" variant="ghost" onPress={cancelEdit} style={styles.flex} />
              <Button
                testID="profile.save.displayName"
                title="Save"
                loading={saving}
                disabled={saving}
                onPress={saveEdit}
                style={styles.flex}
              />
            </View>
          </View>
        ) : (
          <SettingsRow
            testID="profile.row.displayName"
            label="Display name"
            value={user.display_name}
            onPress={() => startEdit('display_name', user.display_name)}
          />
        )}

        {editing === 'gender' ? (
          <View>
            <View style={styles.chips}>
              {GENDER_OPTIONS.map((option) => {
                const selected = draft === option;
                return (
                  <Pressable
                    key={option}
                    testID={`profile.gender.${option}`}
                    onPress={() => setDraft(option)}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected ? theme.mauve : theme.surface1,
                        backgroundColor: selected ? theme.surface1 : 'transparent',
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? theme.mauve : theme.subtext0 }}>
                      {formatGender(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.row}>
              <Button title="Cancel" variant="ghost" onPress={cancelEdit} style={styles.flex} />
              <Button
                testID="profile.save.gender"
                title="Save"
                loading={saving}
                disabled={saving}
                onPress={saveEdit}
                style={styles.flex}
              />
            </View>
          </View>
        ) : (
          <SettingsRow
            testID="profile.row.gender"
            label="Gender"
            value={formatGender(user.gender)}
            onPress={() => startEdit('gender', user.gender ?? 'other')}
          />
        )}

        {editing === 'birth_date' ? (
          <View>
            <AppTextInput
              testID="profile.edit.birthDate"
              label="Birth date (YYYY-MM-DD)"
              value={draft}
              onChangeText={setDraft}
              autoCapitalize="none"
              placeholder="1995-07-14"
            />
            <View style={styles.row}>
              <Button title="Cancel" variant="ghost" onPress={cancelEdit} style={styles.flex} />
              <Button
                testID="profile.save.birthDate"
                title="Save"
                loading={saving}
                disabled={saving}
                onPress={saveEdit}
                style={styles.flex}
              />
            </View>
          </View>
        ) : (
          <SettingsRow
            testID="profile.row.birthDate"
            label="Birth date"
            value={user.birth_date ?? 'Not set'}
            onPress={() => startEdit('birth_date', user.birth_date ?? '')}
          />
        )}

        <SettingsRow label="Theme" value="Mocha" onPress={() => {}} />
      </Card>

      <Button
        testID="profile.logout"
        title="Log out"
        variant="destructive"
        onPress={logOut}
        style={styles.logout}
      />
    </ScreenContainer>
  );
}

interface SettingsRowProps {
  label: string;
  value: string;
  onPress: () => void;
  testID?: string;
}

function SettingsRow({ label, value, onPress, testID }: SettingsRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.settingsRow, { borderBottomColor: theme.surface1 }]}
    >
      <Text style={[styles.settingsLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.settingsValue, { color: theme.subtext0 }]}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 48,
    height: 96,
    justifyContent: 'center',
    marginBottom: 12,
    width: 96,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
  },
  card: {
    marginBottom: 16,
    paddingVertical: 4,
  },
  settingsRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 12,
  },
  settingsLabel: {
    fontSize: 16,
  },
  settingsValue: {
    fontSize: 16,
    maxWidth: '60%',
    textAlign: 'right',
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  logout: {
    marginTop: 4,
  },
});
