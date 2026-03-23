/**
 * Media extraction utilities for classroom persistence
 * Extracts audio and media file references from scenes and collects them from IndexedDB
 */

import { db, type AudioFileRecord, type MediaFileRecord } from './database';
import { blobToBase64, getMimeType } from './base64';
import type { Scene } from '@/lib/types/stage';
import type { Action, SpeechAction } from '@/lib/types/action';
import { isMediaPlaceholder } from '@/lib/store/media-generation';
import { createLogger } from '@/lib/logger';

const log = createLogger('MediaExtractor');

export interface ExtractedAudioFile {
  id: string;
  base64: string;
  format: string;
  mimeType: string;
}

export interface ExtractedMediaFile {
  id: string; // elementId (e.g., "gen_img_1")
  stageId: string;
  type: 'image' | 'video';
  base64: string;
  mimeType: string;
  posterBase64?: string; // For videos
  prompt: string;
  params: string;
}

/**
 * Extract all audioIds from speech actions in scenes
 */
export function extractAudioIdsFromScenes(scenes: Scene[]): string[] {
  const audioIds = new Set<string>();

  for (const scene of scenes) {
    if (!scene.actions) continue;

    for (const action of scene.actions) {
      if (action.type === 'speech') {
        const speechAction = action as SpeechAction;
        if (speechAction.audioId) {
          audioIds.add(speechAction.audioId);
        }
      }
    }
  }

  return Array.from(audioIds);
}

/**
 * Extract all media placeholder IDs from slide scenes
 * Returns elementIds like "gen_img_1", "gen_vid_1"
 */
export function extractMediaIdsFromScenes(scenes: Scene[]): string[] {
  const mediaIds = new Set<string>();

  for (const scene of scenes) {
    if (scene.type !== 'slide') continue;

    const canvas = (scene.content as { canvas?: { elements?: Array<{ id: string; src?: string; type?: string }> } })?.canvas;
    if (!canvas?.elements) continue;

    for (const element of canvas.elements) {
      if ((element.type === 'image' || element.type === 'video') &&
          element.src &&
          isMediaPlaceholder(element.src)) {
        mediaIds.add(element.src);
      }
    }
  }

  return Array.from(mediaIds);
}

/**
 * Collect audio files from IndexedDB and convert to base64
 */
export async function collectAudioFiles(audioIds: string[]): Promise<ExtractedAudioFile[]> {
  const files: ExtractedAudioFile[] = [];

  for (const id of audioIds) {
    try {
      const record = await db.audioFiles.get(id);
      if (!record) {
        log.warn(`Audio file not found in IndexedDB: ${id}`);
        continue;
      }

      const base64 = await blobToBase64(record.blob);
      files.push({
        id,
        base64,
        format: record.format,
        mimeType: getMimeType(record.format),
      });
    } catch (error) {
      log.error(`Failed to collect audio file ${id}:`, error);
    }
  }

  return files;
}

/**
 * Collect media files from IndexedDB and convert to base64
 */
export async function collectMediaFiles(
  stageId: string,
  elementIds: string[]
): Promise<ExtractedMediaFile[]> {
  const files: ExtractedMediaFile[] = [];

  for (const elementId of elementIds) {
    try {
      // Media files use compound key: stageId:elementId
      const compoundKey = `${stageId}:${elementId}`;
      const record = await db.mediaFiles.get(compoundKey);

      if (!record) {
        log.warn(`Media file not found in IndexedDB: ${compoundKey}`);
        continue;
      }

      // Skip failed/error records (empty blobs)
      if (record.error || record.blob.size === 0) {
        log.warn(`Skipping failed media file: ${compoundKey}`);
        continue;
      }

      const base64 = await blobToBase64(record.blob);

      let posterBase64: string | undefined;
      if (record.poster) {
        posterBase64 = await blobToBase64(record.poster);
      }

      files.push({
        id: elementId,
        stageId,
        type: record.type,
        base64,
        mimeType: record.mimeType,
        posterBase64,
        prompt: record.prompt,
        params: record.params,
      });
    } catch (error) {
      log.error(`Failed to collect media file ${elementId}:`, error);
    }
  }

  return files;
}

/**
 * Collect all media for a classroom (both audio and images/videos)
 */
export async function collectAllMediaForClassroom(
  stageId: string,
  scenes: Scene[]
): Promise<{
  audioFiles: ExtractedAudioFile[];
  mediaFiles: ExtractedMediaFile[];
}> {
  const audioIds = extractAudioIdsFromScenes(scenes);
  const mediaIds = extractMediaIdsFromScenes(scenes);

  log.info(`Collecting media for classroom ${stageId}:`, {
    audioFiles: audioIds.length,
    mediaFiles: mediaIds.length,
  });

  const [audioFiles, mediaFiles] = await Promise.all([
    collectAudioFiles(audioIds),
    collectMediaFiles(stageId, mediaIds),
  ]);

  return { audioFiles, mediaFiles };
}

/**
 * Store audio files back to IndexedDB (used when loading from server)
 */
export async function storeAudioFilesToIndexedDB(
  files: ExtractedAudioFile[]
): Promise<void> {
  log.info("AF STORE!!!!!!!!!!");
  console.log("AF STORE!!!!!!!!!!");
  const { base64ToBlob } = await import('./base64');

  for (const file of files) {
    try {

      const existing = await db.audioFiles.get(file.id);
      if (!existing) {
        log.info("INSERTING NON-EXISTING");
        const blob = base64ToBlob(file.base64, file.mimeType);
        await db.audioFiles.put({
          id: file.id,
          blob,
          format: file.format,
          createdAt: Date.now(),
        });
        log.info(`Stored audio file to IndexedDB: ${file.id}`);
      } else {
        log.info("SKIP EXISTING");
      }
    } catch (error) {
      log.error(`Failed to store audio file ${file.id} to IndexedDB:`, error);
    }
  }
}

/**
 * Store media files back to IndexedDB (used when loading from server)
 */
export async function storeMediaFilesToIndexedDB(
  stageId: string,
  files: ExtractedMediaFile[]
): Promise<void> {
  const { base64ToBlob } = await import('./base64');
  const { useMediaGenerationStore } = await import('@/lib/store/media-generation');

  for (const file of files) {
    try {
      const blob = base64ToBlob(file.base64, file.mimeType);
      const posterBlob = file.posterBase64
        ? base64ToBlob(file.posterBase64, 'image/jpeg')
        : undefined;

      await db.mediaFiles.put({
        id: `${stageId}:${file.id}`,
        stageId,
        type: file.type,
        blob,
        mimeType: file.mimeType,
        size: blob.size,
        poster: posterBlob,
        prompt: file.prompt,
        params: file.params,
        createdAt: Date.now(),
      });

      // Also add to media generation store so UI can use it immediately
      useMediaGenerationStore.getState().addRestoredTasks(stageId, file.id, blob, posterBlob);

      log.info(`Stored media file to IndexedDB: ${file.id}`);
    } catch (error) {
      log.error(`Failed to store media file ${file.id} to IndexedDB:`, error);
    }
  }
}
