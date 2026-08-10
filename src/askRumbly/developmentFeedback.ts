import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AskRumblyResponse } from './appExecutor';
import type { AskRumblyPresentation } from './presentation';

const STORAGE_KEY = 'rumbly.development.askRumblyNegativeFeedback.v1';
const MAX_ENTRIES = 100;

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
  dataLastSyncedAt: number | null;
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

export function createAskRumblyNegativeFeedback({
  question,
  response,
  presentation,
  dataLastSyncedAt,
  createdAt = new Date(),
}: {
  question: string;
  response: AskRumblyResponse;
  presentation: AskRumblyPresentation;
  dataLastSyncedAt: number | null;
  createdAt?: Date;
}): AskRumblyNegativeFeedback {
  const timestamp = createdAt.toISOString();
  return {
    schemaVersion: 1,
    id: String(createdAt.getTime()),
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
    dataLastSyncedAt,
  };
}

export function formatAskRumblyFeedbackExport(entries: AskRumblyNegativeFeedback[]): string {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    note: 'Development-only Ask Rumbly thumbs-down feedback. No precise device location is recorded.',
    entries,
  }, null, 2);
}
