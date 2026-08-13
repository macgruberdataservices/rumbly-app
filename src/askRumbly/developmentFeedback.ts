import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { publicSupabase } from '../data/supabaseClient';
import type { AskRumblyResponse } from './appExecutor';
import { sanitizeAskRumblyFeedbackPayload } from './feedbackSanitization';
import type { AskRumblyPresentation } from './presentation';

const STORAGE_KEY = 'rumbly.development.askRumblyNegativeFeedback.v1';
const MAX_ENTRIES = 100;
export const ASK_RUMBLY_RUNTIME_VERSION = 'semantic-2026-08-13.1';

export type AskRumblyFeedbackReason =
  | 'misunderstood'
  | 'missing_result'
  | 'wrong_result'
  | 'wording'
  | 'stale_data'
  | 'other';

export interface AskRumblyNegativeFeedback {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  question: string;
  presentedResponse: Pick<AskRumblyPresentation, 'tone' | 'eyebrow' | 'title' | 'message' | 'trustNote'>;
  resultKind: AskRumblyResponse['result']['kind'];
  plan: AskRumblyResponse['plan'];
  result: AskRumblyResponse['result'];
  adaptation?: AskRumblyResponse['adaptation'];
  continuation?: AskRumblyResponse['continuation'];
  dataLastSyncedAt: number | null;
  feedbackReason?: AskRumblyFeedbackReason;
  runtimeVersion?: string;
  uploadedAt?: string;
}

function isFeedbackEntry(value: unknown): value is AskRumblyNegativeFeedback {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AskRumblyNegativeFeedback>;
  return candidate.schemaVersion === 1
    && typeof candidate.id === 'string'
    && typeof candidate.createdAt === 'string'
    && typeof candidate.question === 'string'
    && typeof candidate.resultKind === 'string'
    && Boolean(candidate.presentedResponse)
    && Boolean(candidate.plan)
    && Boolean(candidate.result);
}

export async function loadAskRumblyNegativeFeedback(): Promise<AskRumblyNegativeFeedback[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isFeedbackEntry).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

export async function saveAskRumblyNegativeFeedback(
  entry: AskRumblyNegativeFeedback,
): Promise<number> {
  const existing = await loadAskRumblyNegativeFeedback();
  const next = [entry, ...existing.filter((candidate) => candidate.id !== entry.id)].slice(0, MAX_ENTRIES);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next.length;
}

export async function clearAskRumblyNegativeFeedback(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

function remotePlatform(): 'ios' | 'android' | 'web' | 'unknown' {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') return Platform.OS;
  return 'unknown';
}

export function askRumblyFeedbackRemoteRow(entry: AskRumblyNegativeFeedback) {
  const presentedResponse = sanitizeAskRumblyFeedbackPayload(entry.presentedResponse);
  const result = sanitizeAskRumblyFeedbackPayload(entry.result);
  return {
    client_feedback_id: entry.id,
    client_created_at: entry.createdAt,
    schema_version: entry.schemaVersion,
    question: entry.question,
    response_title: presentedResponse.title,
    response_message: presentedResponse.message,
    presented_response: presentedResponse,
    result_kind: entry.resultKind,
    plan: entry.plan,
    result,
    adaptation: entry.adaptation || entry.continuation
      ? {
          ...(entry.adaptation ? { adaptation: entry.adaptation } : {}),
          ...(entry.continuation ? { continuation: entry.continuation } : {}),
        }
      : null,
    feedback_reason: entry.feedbackReason ?? null,
    runtime_version: entry.runtimeVersion ?? ASK_RUMBLY_RUNTIME_VERSION,
    data_last_synced_at: entry.dataLastSyncedAt === null
      ? null
      : new Date(entry.dataLastSyncedAt).toISOString(),
    app_version: Constants.expoConfig?.version ?? null,
    native_build_version: Constants.nativeBuildVersion ?? null,
    platform: remotePlatform(),
  };
}

async function markAskRumblyFeedbackUploaded(id: string): Promise<void> {
  const entries = await loadAskRumblyNegativeFeedback();
  const uploadedAt = new Date().toISOString();
  const next = entries.map((entry) => entry.id === id ? { ...entry, uploadedAt } : entry);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function deliverAskRumblyNegativeFeedback(
  entry: AskRumblyNegativeFeedback,
): Promise<boolean> {
  const { error } = await publicSupabase
    .from('ask_rumbly_negative_feedback')
    .insert(askRumblyFeedbackRemoteRow(entry));

  // A response can reach Supabase even if the client misses the success
  // response. The unique feedback id makes retries safe; a duplicate means
  // this event is already available for review.
  if (error && error.code !== '23505') return false;
  try {
    await markAskRumblyFeedbackUploaded(entry.id);
  } catch {
    // The server has the entry. If the local acknowledgement cannot be
    // recorded, a later duplicate retry is harmless and will mark it then.
  }
  return true;
}

export async function syncPendingAskRumblyNegativeFeedback(): Promise<number> {
  const entries = await loadAskRumblyNegativeFeedback();
  let delivered = 0;
  for (const entry of entries) {
    if (entry.uploadedAt) continue;
    try {
      if (await deliverAskRumblyNegativeFeedback(entry)) delivered += 1;
    } catch {
      // Local storage remains the offline queue. A later Ask Rumbly mount
      // retries pending entries without interrupting the guest experience.
    }
  }
  return delivered;
}

export function createAskRumblyNegativeFeedback({
  question,
  response,
  presentation,
  dataLastSyncedAt,
  feedbackReason,
  createdAt = new Date(),
}: {
  question: string;
  response: AskRumblyResponse;
  presentation: AskRumblyPresentation;
  dataLastSyncedAt: number | null;
  feedbackReason?: AskRumblyFeedbackReason;
  createdAt?: Date;
}): AskRumblyNegativeFeedback {
  const timestamp = createdAt.toISOString();
  return {
    schemaVersion: 1,
    id: `${createdAt.getTime()}-${Math.random().toString(36).slice(2, 12)}`,
    createdAt: timestamp,
    question,
    presentedResponse: {
      tone: presentation.tone,
      eyebrow: presentation.eyebrow,
      title: presentation.title,
      message: presentation.message,
      ...(presentation.trustNote ? { trustNote: presentation.trustNote } : {}),
    },
    resultKind: response.result.kind,
    plan: response.plan,
    result: response.result,
    ...(response.adaptation ? { adaptation: response.adaptation } : {}),
    ...(response.continuation ? { continuation: response.continuation } : {}),
    dataLastSyncedAt,
    ...(feedbackReason ? { feedbackReason } : {}),
    runtimeVersion: ASK_RUMBLY_RUNTIME_VERSION,
  };
}

export function formatAskRumblyFeedbackExport(entries: AskRumblyNegativeFeedback[]): string {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    note: 'Ask Rumbly thumbs-down feedback. No account identifier, coordinates, or exact distance measurements are recorded.',
    entries: sanitizeAskRumblyFeedbackPayload(entries),
  }, null, 2);
}
