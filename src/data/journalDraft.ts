import type { JournalEntryDraft } from './journal';

// Autosave should respond only to user-visible draft content. updatedAt is
// deliberately excluded so timestamps and provider refreshes cannot create a
// save loop.
export function journalDraftFingerprint(
  draft: JournalEntryDraft
): string {
  return JSON.stringify([
    draft.id,
    draft.userId,
    draft.clientId,
    draft.restaurantId,
    draft.itemId,
    draft.restaurantNameSnapshot,
    draft.itemNameSnapshot,
    draft.visitedOn,
    draft.mealPeriodSnapshot,
    draft.note,
    draft.rating,
    draft.photoIds,
  ]);
}
