import { uuid } from 'expo-modules-core';

export interface JournalIdentifiers {
  entryId: string;
  // This exact ID is stored on both the Journal entry and its Got It event.
  clientId: string;
}

export function createJournalIdentifiers(): JournalIdentifiers {
  return {
    entryId: uuid.v4(),
    clientId: uuid.v4(),
  };
}
