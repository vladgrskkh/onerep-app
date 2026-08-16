import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getLocalDb } from '../../../shared/db/database';
import { muscleGroupName } from '../../../shared/db/muscleGroups';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ErrorText } from '../../../shared/ui/ErrorText';
import { ScreenContainer } from '../../../shared/ui/ScreenContainer';
import { useTheme } from '../../../shared/ui/ThemeProvider';

export interface ExerciseDetailScreenProps {
  exerciseId: string;
  onGoBack?: () => void;
}

export function ExerciseDetailScreen({ exerciseId, onGoBack }: ExerciseDetailScreenProps) {
  const theme = useTheme();
  const exercise = getLocalDb().getExercise(exerciseId);

  if (!exercise) {
    return (
      <ScreenContainer>
        <ErrorText testID="exerciseDetail.notFound">Exercise not found</ErrorText>
        {onGoBack ? (
          <Button testID="exerciseDetail.back" title="Go back" variant="ghost" onPress={onGoBack} />
        ) : null}
      </ScreenContainer>
    );
  }

  const muscleGroups = exercise.muscle_groups ?? [];
  const primary = muscleGroups.filter((group) => group.is_primary);
  const secondary = muscleGroups.filter((group) => !group.is_primary);
  const media = exercise.media ?? [];

  return (
    <ScreenContainer>
      {onGoBack ? (
        <Button testID="exerciseDetail.back" title="Back" variant="ghost" onPress={onGoBack} />
      ) : null}

      <Text style={[styles.title, { color: theme.text }]}>{exercise.name}</Text>
      {exercise.is_built_in ? (
        <Text style={[styles.builtIn, { color: theme.overlay0 }]}>Built-in exercise</Text>
      ) : null}

      {exercise.description ? (
        <Text style={[styles.section, { color: theme.text }]}>{exercise.description}</Text>
      ) : null}

      <Text style={[styles.heading, { color: theme.subtext0 }]}>MUSCLE GROUPS</Text>
      <View style={styles.chipRow}>
        {primary.map((group) => (
          <View
            key={group.id}
            testID={`exerciseDetail.primary.${group.id}`}
            style={[styles.chip, styles.primaryChip, { borderColor: theme.mauve }]}
          >
            <Text style={[styles.chipLabel, { color: theme.mauve }]}>
              {muscleGroupName(group.id)} · primary
            </Text>
          </View>
        ))}
        {secondary.map((group) => (
          <View
            key={group.id}
            testID={`exerciseDetail.muscle.${group.id}`}
            style={[styles.chip, { borderColor: theme.surface1 }]}
          >
            <Text style={[styles.chipLabel, { color: theme.subtext0 }]}>
              {muscleGroupName(group.id)}
            </Text>
          </View>
        ))}
        {muscleGroups.length === 0 ? (
          <Text style={[styles.empty, { color: theme.subtext0 }]}>No muscle groups recorded</Text>
        ) : null}
      </View>

      {exercise.notes ? (
        <>
          <Text style={[styles.heading, { color: theme.subtext0 }]}>NOTES</Text>
          <Text style={[styles.section, { color: theme.text }]}>{exercise.notes}</Text>
        </>
      ) : null}

      <Text style={[styles.heading, { color: theme.subtext0 }]}>MEDIA</Text>
      {media.length === 0 ? (
        <Text style={[styles.empty, { color: theme.subtext0 }]}>No media attached</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mediaRow}
        >
          {media.map((item) => (
            // Presigned GET URLs are not returned by the gym API yet
            // (onerep-api#13 "media: presigned GET URLs in responses"), so we
            // render a placeholder keyed on s3_key availability. When #13
            // lands, swap this placeholder for:
            //   <Image source={{ uri: item.media_url }} />
            <Card key={item.id} testID={`exerciseDetail.media.${item.id}`} style={styles.mediaCard}>
              <Text style={[styles.mediaType, { color: theme.mauve }]}>{item.media_type}</Text>
              <Text style={[styles.mediaKey, { color: theme.subtext0 }]} numberOfLines={2}>
                {item.s3_key}
              </Text>
            </Card>
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  builtIn: {
    fontSize: 13,
    marginBottom: 12,
  },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 20,
  },
  section: {
    fontSize: 15,
    lineHeight: 22,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  primaryChip: {
    backgroundColor: 'transparent',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  empty: {
    fontSize: 14,
  },
  mediaRow: {
    gap: 12,
    paddingBottom: 8,
  },
  mediaCard: {
    height: 140,
    justifyContent: 'center',
    width: 180,
  },
  mediaType: {
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  mediaKey: {
    fontSize: 12,
    marginTop: 6,
  },
});
