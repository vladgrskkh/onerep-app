import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Exercise } from '../../../shared/api/gym';
import { gymApi, putFile } from '../../../shared/api/gym';
import { getLocalDb } from '../../../shared/db/database';
import { newId } from '../../../shared/db/ids';
import { MUSCLE_GROUPS } from '../../../shared/db/muscleGroups';
import { useSync } from '../../../shared/sync/useSync';
import { Button } from '../../../shared/ui/Button';
import { ErrorText } from '../../../shared/ui/ErrorText';
import { ScreenContainer } from '../../../shared/ui/ScreenContainer';
import { AppTextInput } from '../../../shared/ui/TextInput';
import { useTheme } from '../../../shared/ui/ThemeProvider';
import { getUserMessage, useAuth } from '../../auth/AuthContext';

export interface CreateExerciseScreenProps {
  onCreated?: (exercise: Exercise) => void;
}

async function uploadExercisePhoto(exerciseId: string, asset: ImagePicker.ImagePickerAsset): Promise<void> {
  const contentType = asset.mimeType ?? 'image/jpeg';
  const upload = await gymApi.exercises.uploadMedia(exerciseId, {
    media_type: 'photo',
    content_type: contentType,
  });
  await putFile(
    upload.upload_url,
    { uri: asset.uri, name: asset.fileName ?? 'photo.jpg', type: contentType },
    contentType,
  );
  const refreshed = await gymApi.exercises.get(exerciseId);
  getLocalDb().upsertRemote('exercises', refreshed);
}

export function CreateExerciseScreen({ onCreated }: CreateExerciseScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const { sync } = useSync();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  // Selection order matters: the first selected group is the primary one
  // (the create API only accepts muscle_group_ids, no primary flag).
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleGroup = (id: number) => {
    setSelectedGroupIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setPhoto(result.assets[0]);
      }
    } catch (pickError) {
      setError(getUserMessage(pickError, 'Could not open the photo library'));
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      setFieldErrors({ name: 'Name is required' });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const exercise: Exercise = {
        id: newId(),
        name: name.trim(),
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        is_built_in: false,
        created_by_user_id: user?.id,
        created_at: now,
        updated_at: now,
        version: 1,
        muscle_groups: selectedGroupIds.map((id, index) => ({
          id,
          is_primary: index === 0,
        })),
      };
      // Offline-first: write locally as a pending create, then let the sync
      // engine push it. Media upload needs the server-assigned id, so it runs
      // after the create has been pushed. The server assigns its own id and
      // timestamps; the client_id is the only stable handle back to the
      // pushed row (skipped when still not synced).
      getLocalDb().upsertExercise(exercise, {
        is_dirty: 1,
        operation: 'create',
        client_id: exercise.id,
      });
      await sync();

      if (photo) {
        try {
          const pushed = getLocalDb().findExerciseByClientID(exercise.id);
          if (!pushed || pushed.is_dirty === 1) {
            throw new Error('exercise has not reached the server yet');
          }
          await uploadExercisePhoto(pushed.id, photo);
        } catch (uploadError) {
          setError(
            `Exercise saved locally, but the photo upload failed: ${getUserMessage(
              uploadError,
              'requires a connection',
            )}`,
          );
        }
      }

      onCreated?.(exercise);
    } catch (submitError) {
      setError(getUserMessage(submitError, 'Could not create the exercise'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <Text style={[styles.title, { color: theme.text }]}>New exercise</Text>

      {error ? <ErrorText testID="createExercise.error">{error}</ErrorText> : null}

      <AppTextInput
        testID="createExercise.name"
        label="Name"
        value={name}
        onChangeText={setName}
        error={fieldErrors.name}
      />
      <AppTextInput
        testID="createExercise.description"
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <AppTextInput
        testID="createExercise.notes"
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <Text style={[styles.label, { color: theme.subtext0 }]}>Muscle groups</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {MUSCLE_GROUPS.map((group) => {
          const index = selectedGroupIds.indexOf(group.id);
          const active = index !== -1;
          return (
            <Pressable
              key={group.id}
              testID={`createExercise.muscle.${group.name}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => toggleGroup(group.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.mauve : theme.surface0,
                  borderColor: active ? theme.mauve : theme.surface1,
                },
              ]}
            >
              <Text style={[styles.chipLabel, { color: active ? theme.base : theme.text }]}>
                {group.name}
                {index === 0 ? ' · primary' : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.photoRow}>
        <Button
          testID="createExercise.pickPhoto"
          title={photo ? 'Change photo' : 'Add photo'}
          variant="ghost"
          onPress={pickPhoto}
        />
        {photo ? (
          <Image
            testID="createExercise.photoPreview"
            source={{ uri: photo.uri }}
            style={[styles.preview, { borderColor: theme.surface1 }]}
          />
        ) : null}
      </View>

      <Button
        testID="createExercise.submit"
        title="Create exercise"
        loading={submitting}
        disabled={submitting}
        onPress={submit}
        style={styles.submit}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  chipsRow: {
    gap: 8,
    paddingVertical: 8,
  },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  photoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  preview: {
    borderRadius: 10,
    borderWidth: 1,
    height: 64,
    width: 64,
  },
  submit: {
    marginTop: 20,
  },
});
