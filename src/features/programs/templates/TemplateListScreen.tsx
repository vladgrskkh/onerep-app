import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { Template } from '../../../shared/api/gym';
import { gymApi } from '../../../shared/api/gym';
import { getLocalDb, type TemplateLocalRow } from '../../../shared/db/database';
import { useSync } from '../../../shared/sync/useSync';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ErrorText } from '../../../shared/ui/ErrorText';
import { ScreenContainer } from '../../../shared/ui/ScreenContainer';
import { useTheme } from '../../../shared/ui/ThemeProvider';
import { getUserMessage, useAuth } from '../../auth/AuthContext';

export interface TemplateListScreenProps {
  onSelectTemplate?: (template: Template) => void;
  onStartWorkout?: (template: Template) => void;
  onEditTemplate?: (template: Template) => void;
  onCreateTemplate?: () => void;
}

type Segment = 'mine' | 'public';

export function TemplateListScreen({
  onSelectTemplate,
  onStartWorkout,
  onEditTemplate,
  onCreateTemplate,
}: TemplateListScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const { sync, isSyncing, lastSyncAt } = useSync();
  const [segment, setSegment] = useState<Segment>('mine');
  const [mine, setMine] = useState<TemplateLocalRow[]>(() => {
    const userId = user?.id;
    const rows = getLocalDb().getTemplates();
    return userId ? rows.filter((row) => row.created_by_user_id === userId) : [];
  });
  const [publicTemplates, setPublicTemplates] = useState<Template[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);

  const readMine = useCallback(() => {
    const userId = user?.id;
    const rows = getLocalDb().getTemplates();
    return userId ? rows.filter((row) => row.created_by_user_id === userId) : [];
  }, [user]);

  // The sync engine only pulls the authenticated user's templates. Public
  // templates are fetched on demand with the public=true query per the API
  // contract (GET /v1/templates?public=true).
  const refreshPublic = useCallback(async () => {
    setPublicLoading(true);
    setPublicError(null);
    try {
      setPublicTemplates(await gymApi.templates.list({ public: true }));
    } catch (error) {
      setPublicError(getUserMessage(error, 'Could not load public templates'));
    } finally {
      setPublicLoading(false);
    }
  }, []);

  // Re-read own templates after a background sync lands.
  useEffect(() => {
    if (lastSyncAt === null) {
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setMine(readMine());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lastSyncAt, readMine]);

  const selectSegment = (next: Segment) => {
    setSegment(next);
    if (next === 'mine') {
      setMine(readMine());
    } else {
      void refreshPublic();
    }
  };

  const onRefresh = async () => {
    if (segment === 'public') {
      await refreshPublic();
    } else {
      await sync();
      setMine(readMine());
    }
  };

  const rows = segment === 'mine' ? mine : publicTemplates;

  const renderRow = ({ item }: { item: Template }) => {
    const exerciseCount = item.exercises?.length ?? 0;
    return (
      <Pressable
        testID={`templates.row.${item.id}`}
        accessibilityRole="button"
        onPress={() => onSelectTemplate?.(item)}
      >
        <Card style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[styles.rowName, { color: theme.text }]}>{item.name}</Text>
            <Text testID={`templates.count.${item.id}`} style={[styles.rowSub, { color: theme.subtext0 }]}>
              {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}
            </Text>
          </View>
          {segment === 'public' ? null : (
            <View style={styles.rowActions}>
              <Button
                testID={`templates.start.${item.id}`}
                title="START"
                variant="primary"
                onPress={() => onStartWorkout?.(item)}
                style={styles.rowButton}
              />
              <Button
                testID={`templates.edit.${item.id}`}
                title="EDIT"
                variant="ghost"
                onPress={() => onEditTemplate?.(item)}
                style={styles.rowButton}
              />
            </View>
          )}
        </Card>
      </Pressable>
    );
  };

  return (
    <ScreenContainer scrollable={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Templates</Text>
        <Button
          testID="templates.create"
          title="New template"
          variant="ghost"
          onPress={onCreateTemplate}
          style={styles.createButton}
        />
      </View>

      <View style={[styles.segment, { borderColor: theme.surface1 }]}>
        <Pressable
          testID="templates.segment.mine"
          accessibilityRole="button"
          accessibilityState={{ selected: segment === 'mine' }}
          onPress={() => selectSegment('mine')}
          style={[
            styles.segmentItem,
            segment === 'mine' ? { backgroundColor: theme.mauve } : undefined,
          ]}
        >
          <Text style={[styles.segmentLabel, { color: segment === 'mine' ? theme.base : theme.subtext0 }]}>
            My templates
          </Text>
        </Pressable>
        <Pressable
          testID="templates.segment.public"
          accessibilityRole="button"
          accessibilityState={{ selected: segment === 'public' }}
          onPress={() => selectSegment('public')}
          style={[
            styles.segmentItem,
            segment === 'public' ? { backgroundColor: theme.mauve } : undefined,
          ]}
        >
          <Text style={[styles.segmentLabel, { color: segment === 'public' ? theme.base : theme.subtext0 }]}>
            Public
          </Text>
        </Pressable>
      </View>

      {publicError ? (
        <ErrorText testID="templates.error">{publicError}</ErrorText>
      ) : null}

      {segment === 'public' && publicLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.mauve} />
        </View>
      ) : (
        <FlatList
          testID="templates.list"
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isSyncing || publicLoading}
              onRefresh={onRefresh}
              tintColor={theme.mauve}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.subtext0 }]}>
              {segment === 'mine' ? 'No templates yet' : 'No public templates'}
            </Text>
          }
          renderItem={renderRow}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  createButton: {
    minHeight: 40,
    paddingVertical: 6,
  },
  segment: {
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 12,
    overflow: 'hidden',
  },
  segmentItem: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 10,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
  },
  listContent: {
    gap: 12,
    paddingTop: 16,
    paddingBottom: 24,
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
  },
  row: {
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 13,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  rowButton: {
    minHeight: 36,
    paddingVertical: 6,
  },
});
