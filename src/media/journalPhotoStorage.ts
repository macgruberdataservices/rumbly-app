import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { JournalPhoto, StagedJournalPhoto } from '../data/journal';
import { dimensionsForLongEdge } from './journalPhotoSizing';

export const JOURNAL_DISPLAY_LONG_EDGE = 1600;
export const JOURNAL_THUMBNAIL_LONG_EDGE = 360;
export const JOURNAL_DISPLAY_QUALITY = 0.82;
export const JOURNAL_THUMBNAIL_QUALITY = 0.7;

function pendingPhotoDirectory(
  userId: string,
  draftId: string,
  photoId: string
): Directory {
  return new Directory(
    Paths.document,
    'journal',
    'pending',
    encodeURIComponent(userId),
    encodeURIComponent(draftId),
    encodeURIComponent(photoId)
  );
}

// A saved photo's local_uri/local_thumbnail_uri are an absolute file://
// path captured once at staging time. iOS reassigns the app's sandbox
// container UUID on some rebuilds/reinstalls, which silently invalidates
// any previously-stored absolute path even though the relative structure
// under Documents never changed. Reconstructing from Paths.document fresh
// (rather than trusting the stored string) sidesteps that entirely --
// draftId and entryId are the same id once a photo is promoted from a
// draft, so this resolves a saved photo's file just as well as a staged
// one's.
export function resolvePendingJournalPhotoFile(
  userId: string,
  entryId: string,
  photoId: string,
  filename: 'display.jpg' | 'thumbnail.jpg'
): File {
  return new File(pendingPhotoDirectory(userId, entryId, photoId), filename);
}

interface ResolvableJournalPhoto {
  id: string;
  userId: string;
  entryId: string;
}

// Same staleness problem as the sync path (see resolvePendingJournalPhotoFile),
// but for rendering: a saved photo's local_uri/local_thumbnail_uri can point
// at a container that no longer exists after a rebuild/reinstall. Resolving
// fresh and checking .exists means a photo that's actually gone renders as
// nothing (undefined uri) instead of a broken image, and falls back to
// whichever of the two variants is still present.
export function resolveJournalPhotoThumbnailUri(photo: ResolvableJournalPhoto): string | undefined {
  const thumbnail = resolvePendingJournalPhotoFile(photo.userId, photo.entryId, photo.id, 'thumbnail.jpg');
  if (thumbnail.exists) return thumbnail.uri;
  const display = resolvePendingJournalPhotoFile(photo.userId, photo.entryId, photo.id, 'display.jpg');
  return display.exists ? display.uri : undefined;
}

export function resolveJournalPhotoDisplayUri(photo: ResolvableJournalPhoto): string | undefined {
  const display = resolvePendingJournalPhotoFile(photo.userId, photo.entryId, photo.id, 'display.jpg');
  if (display.exists) return display.uri;
  const thumbnail = resolvePendingJournalPhotoFile(photo.userId, photo.entryId, photo.id, 'thumbnail.jpg');
  return thumbnail.exists ? thumbnail.uri : undefined;
}

async function createVariant(
  sourceUri: string,
  width: number,
  height: number,
  longEdge: number,
  quality: number,
  destination: File
): Promise<{ width: number; height: number; bytes: number }> {
  const context = ImageManipulator.manipulate(sourceUri);
  const resize = dimensionsForLongEdge(width, height, longEdge);
  if (resize.width || resize.height) context.resize(resize);
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: quality,
    format: SaveFormat.JPEG,
  });
  const temporary = new File(result.uri);
  await temporary.move(destination, { overwrite: true });
  return {
    width: result.width,
    height: result.height,
    bytes: destination.size,
  };
}

export async function stageJournalPhoto(input: {
  id: string;
  userId: string;
  draftId: string;
  position: number;
  sourceUri: string;
  width: number;
  height: number;
}): Promise<StagedJournalPhoto> {
  const directory = pendingPhotoDirectory(input.userId, input.draftId, input.id);
  directory.create({ intermediates: true, idempotent: true });
  const display = new File(directory, 'display.jpg');
  const thumbnail = new File(directory, 'thumbnail.jpg');

  try {
    const displayResult = await createVariant(
      input.sourceUri,
      input.width,
      input.height,
      JOURNAL_DISPLAY_LONG_EDGE,
      JOURNAL_DISPLAY_QUALITY,
      display
    );
    const thumbnailResult = await createVariant(
      input.sourceUri,
      input.width,
      input.height,
      JOURNAL_THUMBNAIL_LONG_EDGE,
      JOURNAL_THUMBNAIL_QUALITY,
      thumbnail
    );
    return {
      id: input.id,
      userId: input.userId,
      draftId: input.draftId,
      position: input.position,
      displayUri: display.uri,
      thumbnailUri: thumbnail.uri,
      width: displayResult.width,
      height: displayResult.height,
      displayBytes: displayResult.bytes,
      thumbnailBytes: thumbnailResult.bytes,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    if (directory.exists) directory.delete();
    throw error;
  }
}

export function deleteStagedJournalPhotoFiles(photo: StagedJournalPhoto): void {
  const directory = new File(photo.displayUri).parentDirectory;
  if (directory.exists) directory.delete();
}

export function deleteSavedJournalPhotoFiles(photo: JournalPhoto): void {
  const uri = photo.localUri ?? photo.localThumbnailUri;
  if (!uri) return;
  const directory = new File(uri).parentDirectory;
  if (directory.exists) directory.delete();
}

function directoryBytes(directory: Directory): number {
  if (!directory.exists) return 0;
  return directory.list().reduce(
    (total, item) =>
      total + (item instanceof Directory ? directoryBytes(item) : item.size),
    0
  );
}

// Photos are local-device-only storage (see Docs/JOURNAL_BUILD_PLAN.md) --
// this is the entirety of what Journal photos cost in on-device space,
// not a "pending sync" figure. There is no separate downloaded/cached
// copy: nothing is ever fetched from anywhere, so there's nothing to
// distinguish from primary storage or a cache-clear action to offer.
export function getJournalPhotoStorageBytes(): number {
  return directoryBytes(new Directory(Paths.document, 'journal', 'pending'));
}
