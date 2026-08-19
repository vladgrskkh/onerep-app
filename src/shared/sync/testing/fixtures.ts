import type { ServerRow, SyncStore, LocalRow } from '../../db/database';
import type { SyncTable } from '../../db/schema';

export class FakeSyncStore implements SyncStore {
  rows = new Map<SyncTable, Map<string, LocalRow>>();
  lastSyncedAt: string | null = null;
  dataGeneration = 0;
  calls: { markSynced: [SyncTable, string, ServerRow][]; removeRow: [SyncTable, string][]; upsertRemote: [SyncTable, ServerRow][] } = {
    markSynced: [],
    removeRow: [],
    upsertRemote: [],
  };

  seed(table: SyncTable, row: LocalRow): void {
    if (!this.rows.has(table)) {
      this.rows.set(table, new Map());
    }
    this.rows.get(table)!.set(row.id, row);
  }

  getDirtyRows(table: SyncTable): LocalRow[] {
    const tableRows = this.rows.get(table);
    if (!tableRows) {
      return [];
    }
    return [...tableRows.values()]
      .filter((row) => row.is_dirty === 1)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  isDirtyRow(table: SyncTable, id: string): boolean {
    const row = this.rows.get(table)?.get(id);
    return row?.is_dirty === 1;
  }

  markSynced(table: SyncTable, id: string, server: ServerRow): void {
    this.calls.markSynced.push([table, id, server]);
    const tableRows = this.rows.get(table);
    if (!tableRows) {
      return;
    }
    const existing = tableRows.get(id);
    if (server.id !== id) {
      tableRows.delete(id);
    }
    // Mirrors LocalDb.markSynced: the server row replaces the local one (its
    // id and timestamps are server-assigned) but the client_id is carried
    // through so lookups by client id keep working after the push.
    tableRows.set(server.id, {
      ...(existing ?? {}),
      ...server,
      client_id: (existing as { client_id?: string } | undefined)?.client_id ?? id,
      is_dirty: 0,
      operation: null,
      last_synced_at: (server as { updated_at?: string }).updated_at ?? null,
    } as LocalRow);
  }

  removeRow(table: SyncTable, id: string): void {
    this.calls.removeRow.push([table, id]);
    this.rows.get(table)?.delete(id);
  }

  upsertRemote(table: SyncTable, row: ServerRow): void {
    this.calls.upsertRemote.push([table, row]);
    if (!this.rows.has(table)) {
      this.rows.set(table, new Map());
    }
    const tableRows = this.rows.get(table)!;
    const existing = tableRows.get(row.id);
    if (existing && existing.is_dirty === 1) {
      return;
    }
    tableRows.set(row.id, {
      ...(existing ?? {}),
      ...row,
      is_dirty: 0,
      operation: null,
      last_synced_at: (row as { updated_at?: string }).updated_at ?? null,
    } as LocalRow);
  }

  getLastSyncedAt(): string | null {
    return this.lastSyncedAt;
  }

  setLastSyncedAt(value: string): void {
    this.lastSyncedAt = value;
  }

  clearPrivateData(): void {
    this.rows.clear();
    this.lastSyncedAt = null;
    this.dataGeneration += 1;
  }

  getDataGeneration(): number {
    return this.dataGeneration;
  }
}

export function dirtyLocalRow(overrides: Partial<LocalRow> & { id: string }): LocalRow {
  const withClientId = overrides as { client_id?: string };
  return {
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    is_dirty: 1,
    operation: 'create',
    last_synced_at: null,
    ...overrides,
    client_id: withClientId.client_id ?? overrides.id,
  } as LocalRow;
}

export function serverRow(overrides: Partial<ServerRow> & { id: string }): ServerRow {
  return {
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  } as ServerRow;
}
