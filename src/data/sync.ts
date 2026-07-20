// Milestone 12: two-way sync of the local `activity` event log with
// Supabase, keyed by client_id (unique per user via the migration's
// `unique (user_id, client_id)`). Last-write-wins per row on updated_at --
// matches activity.ts's event-log design (a row per action, not boolean
// columns), so there's no field-level merge to do, just "which copy of
// this row is newer."
//
// `value` (Milestone 14's ratings column) is carried through so it
// round-trips once a local column exists for it, but nothing sets it yet.

import { getAllActivityRows, applyRemoteRow, type ActivityRow } from './activity';
import { supabase } from './supabaseClient';

interface RemoteActivityRow extends ActivityRow {
  value: number | null;
}

let inFlight: Promise<void> | null = null;

export function syncActivity(userId: string): Promise<void> {
  if (!inFlight) {
    inFlight = runSync(userId).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runSync(userId: string): Promise<void> {
  const [localRows, remoteResult] = await Promise.all([
    getAllActivityRows(),
    supabase
      .from('activity')
      .select(
        'client_id, target_type, restaurant_id, item_id, activity_type, value, occurred_at, created_at, updated_at, deleted'
      )
      .eq('user_id', userId),
  ]);

  if (remoteResult.error) {
    console.warn('syncActivity fetch failed:', remoteResult.error.message);
    return;
  }
  const remoteRows = (remoteResult.data ?? []) as RemoteActivityRow[];

  const localByClientId = new Map(localRows.map((row) => [row.client_id, row]));
  const remoteByClientId = new Map(remoteRows.map((row) => [row.client_id, row]));

  const toPush: ActivityRow[] = [];
  const toPull: RemoteActivityRow[] = [];

  for (const [clientId, local] of localByClientId) {
    const remote = remoteByClientId.get(clientId);
    if (!remote) {
      toPush.push(local);
      continue;
    }
    const localTime = new Date(local.updated_at).getTime();
    const remoteTime = new Date(remote.updated_at).getTime();
    if (localTime > remoteTime) {
      toPush.push(local);
    } else if (remoteTime > localTime) {
      toPull.push(remote);
    }
  }
  for (const [clientId, remote] of remoteByClientId) {
    if (!localByClientId.has(clientId)) {
      toPull.push(remote);
    }
  }

  if (toPush.length > 0) {
    const { error } = await supabase.from('activity').upsert(
      toPush.map((row) => ({ user_id: userId, ...row })),
      { onConflict: 'user_id,client_id' }
    );
    if (error) {
      console.warn('syncActivity push failed:', error.message);
    }
  }

  for (const remote of toPull) {
    await applyRemoteRow(remote);
  }
}
