/**
 * Media extraction utilities for classroom persistence
 * Extracts audio and media file references from scenes and collects them from IndexedDB
 */

import { db, type AudioFileRecord, type MediaFileRecord } from './database';
import { blobToBase64, getMimeType, getExtensionFromMimeType } from './base64';
import type { Scene } from '@/lib/types/stage';
import type { Action, SpeechAction } from '@/lib/types/action';
import { isMediaPlaceholder, isEmbeddedMediaPlaceholder } from '@/lib/store/media-generation';
import { createLogger } from '@/lib/logger';

const log = createLogger('MediaExtractor');

export interface ExtractedAudioFile {
  id: string;
  base64: string;
  format: string;
  mimeType: string;
}

export interface ExtractedMediaFile {
  id: string; // elementId (e.g., "gen_img_1" or "emb_img_abc123")
  stageId: string;
  type: 'image' | 'video';
  base64: string;
  mimeType: string;
  posterBase64?: string; // For videos
  prompt: string;
  params: string;
}

/**
 * Check if a string is an embedded media ID (user-uploaded or migrated base64)
 * Pattern: emb_{type}_{hash} where type is img, vid, or aud
 */
export function isEmbeddedMediaId(value: string): boolean {
  if (!value) return false;
  return /^emb_(img|vid|aud)_[a-f0-9]{8,}$/i.test(value);
}

/**
 * Generate a short hash from a string for embedded media IDs
 * Uses a simple hash of the first 1KB of data for uniqueness
 */
function generateHashFromString(str: string): string {
  // Use first 1KB of data for hash (base64 can be huge)
  const sample = str.slice(0, 1024);
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to positive hex string, take first 8 chars
  return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
}

/**
 * Generate an embedded media ID from base64 data
 * Format: emb_{type}_{hash}
 */
export function generateEmbeddedMediaId(base64Data: string, mediaType: 'image' | 'video' | 'audio'): string {
  const typeMap = { image: 'img', video: 'vid', audio: 'aud' };
  const hash = generateHashFromString(base64Data);
  return `emb_${typeMap[mediaType]}_${hash}`;
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
 * Returns elementIds like "gen_img_1", "gen_vid_1", "emb_img_abc123"
 */
export function extractMediaIdsFromScenes(scenes: Scene[]): string[] {
  const mediaIds = new Set<string>();

  for (const scene of scenes) {
    if (scene.type !== 'slide') continue;

    const canvas = (scene.content as { canvas?: { elements?: Array<{ id: string; src?: string; type?: string }> } })?.canvas;
    if (!canvas?.elements) continue;

    for (const element of canvas.elements) {
      if ((element.type === 'image' || element.type === 'video') && element.src) {
        // Include AI-generated placeholders (gen_img_*, gen_vid_*)
        if (isMediaPlaceholder(element.src)) {
          mediaIds.add(element.src);
        }
        // Include embedded media placeholders (emb_img_*, emb_vid_*)
        else if (isEmbeddedMediaId(element.src)) {
          mediaIds.add(element.src);
        }
      }
    }
  }

  return Array.from(mediaIds);
}

/**
 * Find all base64-encoded media in scenes that should be migrated to IndexedDB
 * Returns a map of elementKey -> { element, sceneIndex, elementIndex, base64Data }
 */
export function findBase64MediaInScenes(scenes: Scene[]): Map<string, {
  sceneIndex: number;
  elementIndex: number;
  base64Data: string;
  mediaType: 'image' | 'video';
  mimeType: string;
}> {
  const base64Media = new Map<string, {
    sceneIndex: number;
    elementIndex: number;
    base64Data: string;
    mediaType: 'image' | 'video';
    mimeType: string;
  }>();

  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
    const scene = scenes[sceneIndex];
    if (scene.type !== 'slide') continue;

    const canvas = (scene.content as { canvas?: { elements?: Array<{ id: string; src?: string; type?: string }> } })?.canvas;
    if (!canvas?.elements) continue;

    for (let elementIndex = 0; elementIndex < canvas.elements.length; elementIndex++) {
      const element = canvas.elements[elementIndex];
      if ((element.type === 'image' || element.type === 'video') && element.src) {
        // Check if src is a base64 data URL
        if (element.src.startsWith('data:')) {
          const mediaType = element.type === 'image' ? 'image' : 'video';
          // Extract mime type from data URL
          const mimeMatch = element.src.match(/^data:([^;]+);base64,/);
          const mimeType = mimeMatch?.[1] || (mediaType === 'image' ? 'image/png' : 'video/mp4');
          // Extract base64 data (remove prefix)
          const base64Data = element.src.split(',')[1];
          
          const key = `${sceneIndex}:${elementIndex}`;
          base64Media.set(key, {
            sceneIndex,
            elementIndex,
            base64Data,
            mediaType,
            mimeType,
          });
        }
      }
    }
  }

  return base64Media;
}

/**
 * Migrate base64 media in scenes to IndexedDB with embedded media IDs
 * Modifies scenes in place and returns the list of embedded media IDs created
 */
export async function migrateBase64MediaToIndexedDB(
  stageId: string,
  scenes: Scene[]
): Promise<string[]> {
  const base64Media = findBase64MediaInScenes(scenes);
  
  if (base64Media.size === 0) {
    return [];
  }

  log.info(`Found ${base64Media.size} base64 media elements to migrate`);
  const embeddedIds: string[] = [];

  for (const [key, data] of base64Media) {
    const { sceneIndex, elementIndex, base64Data, mediaType, mimeType } = data;
    
    // Generate embedded media ID
    const embeddedId = generateEmbeddedMediaId(base64Data, mediaType);
    
    try {
      // Check if already in IndexedDB (by compound key)
      const compoundKey = `${stageId}:${embeddedId}`;
      const existing = await db.mediaFiles.get(compoundKey);
      
      if (!existing) {
        // Convert base64 to blob and store in IndexedDB
        const { base64ToBlob } = await import('./base64');
        const blob = base64ToBlob(base64Data, mimeType);
        
        await db.mediaFiles.put({
          id: compoundKey,
          stageId,
          type: mediaType,
          blob,
          mimeType,
          size: blob.size,
          prompt: '', // User-uploaded, no AI prompt
          params: JSON.stringify({ source: 'user_upload', migrated: true }),
          createdAt: Date.now(),
        });
        
        log.info(`Migrated base64 media to IndexedDB: ${embeddedId} (${Math.round(blob.size / 1024)}KB)`);
      }
      
      // Update the scene element to use the embedded ID instead of base64
      const scene = scenes[sceneIndex];
      if (scene.type === 'slide') {
        const canvas = (scene.content as { canvas: { elements: Array<{ src?: string }> } }).canvas;
        canvas.elements[elementIndex].src = embeddedId;
        embeddedIds.push(embeddedId);
        log.debug(`Updated element src to embedded ID: ${embeddedId}`);
      }
    } catch (error) {
      log.error(`Failed to migrate base64 media at ${key}:`, error);
    }
  }

  if (embeddedIds.length > 0) {
    log.info(`Successfully migrated ${embeddedIds.length} base64 media elements to embedded IDs`);
  }

  return embeddedIds;
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
 * Handles both AI-generated (gen_*) and embedded (emb_*) media
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
 * Migrate media files stored with 'editor' stageId to the actual stageId
 * This handles files uploaded in the editor before the classroom was saved
 */
async function migrateEditorMediaToStageId(stageId: string, mediaIds: string[]): Promise<void> {
  for (const elementId of mediaIds) {
    // Only process embedded media IDs (emb_img_*, emb_vid_*)
    if (!isEmbeddedMediaId(elementId)) continue;

    const editorKey = `editor:${elementId}`;
    const stageKey = `${stageId}:${elementId}`;

    try {
      // Check if exists with editor key
      const editorRecord = await db.mediaFiles.get(editorKey);
      if (!editorRecord) continue; // Not an editor-stored file

      // Check if already exists with stage key
      const existing = await db.mediaFiles.get(stageKey);
      if (existing) {
        // Already migrated, delete editor key
        await db.mediaFiles.delete(editorKey);
        log.debug(`Deleted editor key for already-migrated media: ${elementId}`);
        continue;
      }

      // Migrate: create new record with stageId, delete old
      await db.mediaFiles.put({
        ...editorRecord,
        id: stageKey,
        stageId: stageId,
      });
      await db.mediaFiles.delete(editorKey);
      log.info(`Migrated editor media to stageId ${stageId}: ${elementId}`);
    } catch (error) {
      log.error(`Failed to migrate editor media ${elementId}:`, error);
    }
  }
}

/**
 * Collect all media for a classroom (both audio and images/videos)
 * Also migrates any base64-encoded media to IndexedDB for efficient storage
 */
export async function collectAllMediaForClassroom(
  stageId: string,
  scenes: Scene[]
): Promise<{
  audioFiles: ExtractedAudioFile[];
  mediaFiles: ExtractedMediaFile[];
}> {
  // First, migrate any base64 media to IndexedDB (modifies scenes in place)
  await migrateBase64MediaToIndexedDB(stageId, scenes);

  // Now extract IDs (will include newly created embedded IDs)
  const audioIds = extractAudioIdsFromScenes(scenes);
  const mediaIds = extractMediaIdsFromScenes(scenes);

  log.info(`Collecting media for classroom ${stageId}:`, {
    audioFiles: audioIds.length,
    mediaFiles: mediaIds.length,
  });

  // Migrate any editor-stored media to the correct stageId before collection
  await migrateEditorMediaToStageId(stageId, mediaIds);

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
  const { base64ToBlob } = await import('./base64');

  for (const file of files) {
    try {

      const existing = await db.audioFiles.get(file.id);
      if (!existing) {
        const blob = base64ToBlob(file.base64, file.mimeType);
        await db.audioFiles.put({
          id: file.id,
          blob,
          format: file.format,
          createdAt: Date.now(),
        });
        log.info(`Stored audio file to IndexedDB: ${file.id}`);
      }
    } catch (error) {
      log.error(`Failed to store audio file ${file.id} to IndexedDB:`, error);
    }
  }
}

/**
 * Store media files back to IndexedDB (used when loading from server)
 * Handles both AI-generated and embedded media
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
