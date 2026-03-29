import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import type { Scene, Stage, ClassroomInferenceConfig } from '@/lib/types/stage';

export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomsDir() {
  await ensureDir(CLASSROOMS_DIR);
}

export async function ensureClassroomJobsDir() {
  await ensureDir(CLASSROOM_JOBS_DIR);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
  /** Inference configuration for this classroom */
  inferenceConfig?: ClassroomInferenceConfig;
}

export interface AudioFileData {
  id: string;
  base64: string;
  format: string;
  mimeType: string;
}

export interface MediaFileData {
  id: string;
  type: 'image' | 'video';
  base64: string;
  mimeType: string;
  posterBase64?: string;
  prompt: string;
  params: string;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  const filePath = path.join(CLASSROOMS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PersistedClassroomData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Read audio files from disk for a classroom
 */
export async function readClassroomAudioFiles(
  classroomId: string
): Promise<AudioFileData[]> {
  const audioDir = path.join(CLASSROOMS_DIR, classroomId, 'audio');
  const files: AudioFileData[] = [];

  try {
    const entries = await fs.readdir(audioDir);
    for (const entry of entries) {
      const filePath = path.join(audioDir, entry);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;

      const ext = path.extname(entry).toLowerCase();
      const id = path.basename(entry, ext);
      const format = ext.slice(1);

      const mimeTypes: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        aac: 'audio/aac',
        webm: 'audio/webm',
      };

      const buffer = await fs.readFile(filePath);
      files.push({
        id,
        base64: buffer.toString('base64'),
        format,
        mimeType: mimeTypes[format] || 'audio/mpeg',
      });
    }
  } catch (error) {
    // Directory doesn't exist or is empty - return empty array
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return files;
}

/**
 * Read media files from disk for a classroom
 */
export async function readClassroomMediaFiles(
  classroomId: string
): Promise<MediaFileData[]> {
  const mediaDir = path.join(CLASSROOMS_DIR, classroomId, 'media');
  const files: MediaFileData[] = [];

  try {
    const entries = await fs.readdir(mediaDir);
    for (const entry of entries) {
      const filePath = path.join(mediaDir, entry);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;

      const ext = path.extname(entry).toLowerCase();
      const id = path.basename(entry, ext);

      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
      };

      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      const type = mimeType.startsWith('video/') ? 'video' : 'image';

      const buffer = await fs.readFile(filePath);

      // Check for poster file (videos)
      let posterBase64: string | undefined;
      if (type === 'video') {
        const posterPath = path.join(mediaDir, `${id}.poster.jpg`);
        try {
          const posterBuffer = await fs.readFile(posterPath);
          posterBase64 = posterBuffer.toString('base64');
        } catch {
          // Poster doesn't exist - that's fine
        }
      }

      files.push({
        id,
        type,
        base64: buffer.toString('base64'),
        mimeType,
        posterBase64,
        prompt: '', // Not stored separately, would need metadata file
        params: '{}',
      });
    }
  } catch (error) {
    // Directory doesn't exist or is empty - return empty array
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return files;
}

/**
 * Save audio files to disk for a classroom
 */
export async function saveClassroomAudioFiles(
  classroomId: string,
  audioFiles: AudioFileData[]
): Promise<void> {
  if (audioFiles.length === 0) return;

  const audioDir = path.join(CLASSROOMS_DIR, classroomId, 'audio');
  await ensureDir(audioDir);

  for (const file of audioFiles) {
    const buffer = Buffer.from(file.base64, 'base64');
    const filePath = path.join(audioDir, `${file.id}.${file.format}`);
    await fs.writeFile(filePath, buffer);
  }
}

/**
 * Save media files to disk for a classroom
 */
export async function saveClassroomMediaFiles(
  classroomId: string,
  mediaFiles: MediaFileData[]
): Promise<void> {
  if (mediaFiles.length === 0) return;

  const mediaDir = path.join(CLASSROOMS_DIR, classroomId, 'media');
  await ensureDir(mediaDir);

  for (const file of mediaFiles) {
    const buffer = Buffer.from(file.base64, 'base64');
    const ext = file.mimeType.split('/')[1] || (file.type === 'video' ? 'mp4' : 'png');
    const filePath = path.join(mediaDir, `${file.id}.${ext}`);
    await fs.writeFile(filePath, buffer);

    // Save poster if present (for videos)
    if (file.posterBase64) {
      const posterPath = path.join(mediaDir, `${file.id}.poster.jpg`);
      const posterBuffer = Buffer.from(file.posterBase64, 'base64');
      await fs.writeFile(posterPath, posterBuffer);
    }
  }
}

/**
 * Update scenes to add audioUrl references for server-served audio files
 */
export function updateScenesWithAudioUrls(
  scenes: Scene[],
  classroomId: string,
  baseUrl: string,
  audioFiles?: AudioFileData[]
): void {
  const audioBaseUrl = `${baseUrl}/api/classroom-media/${classroomId}/audio`;

  // Build a map of audioId -> format
  const audioFormatMap = new Map<string, string>();
  if (audioFiles) {
    for (const file of audioFiles) {
      audioFormatMap.set(file.id, file.format);
    }
  }

  for (const scene of scenes) {
    if (!scene.actions) continue;

    for (const action of scene.actions) {
      if (action.type === 'speech' && action.audioId) {
        // Only update if audioUrl is not already set (preserve existing server URLs)
        if (!action.audioUrl) {
          const format = audioFormatMap.get(action.audioId) || 'mp3';
          action.audioUrl = `${audioBaseUrl}/${action.audioId}.${format}`;
        }
      }
    }
  }
}

/**
 * Check if a string is an embedded media ID
 */
function isEmbeddedMediaId(value: string): boolean {
  return /^emb_(img|vid|aud)_[a-f0-9]{8,}$/i.test(value);
}

/**
 * Update scenes to replace media placeholders with server URLs
 * Handles both AI-generated (gen_*) and embedded (emb_*) media
 */
export function updateScenesWithMediaUrls(
  scenes: Scene[],
  classroomId: string,
  baseUrl: string,
  mediaFiles?: MediaFileData[]
): void {
  const mediaBaseUrl = `${baseUrl}/api/classroom-media/${classroomId}/media`;

  // Build a map of elementId -> extension from mimeType
  const mediaExtMap = new Map<string, string>();
  if (mediaFiles) {
    for (const file of mediaFiles) {
      const ext = file.mimeType.split('/')[1] || (file.type === 'video' ? 'mp4' : 'png');
      mediaExtMap.set(file.id, ext);
    }
  }

  for (const scene of scenes) {
    if (scene.type !== 'slide') continue;

    const canvas = (scene.content as { canvas?: { elements?: Array<{ id: string; src?: string; type?: string }> } })?.canvas;
    if (!canvas?.elements) continue;

    for (const element of canvas.elements) {
      if (element.type !== 'image' && element.type !== 'video') continue;
      if (!element.src) continue;

      // Handle AI-generated placeholders (gen_img_*, gen_vid_*)
      if (element.src.startsWith('gen_')) {
        const ext = mediaExtMap.get(element.src) || (element.type === 'video' ? 'mp4' : 'png');
        element.src = `${mediaBaseUrl}/${element.src}.${ext}`;
      }
      // Handle embedded media (emb_img_*, emb_vid_*)
      else if (isEmbeddedMediaId(element.src)) {
        const ext = mediaExtMap.get(element.src) || (element.type === 'video' ? 'mp4' : 'png');
        element.src = `${mediaBaseUrl}/${element.src}.${ext}`;
      }
    }
  }
}

export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
    audioFiles?: AudioFileData[];
    mediaFiles?: MediaFileData[];
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  // Save audio files to disk if provided
  if (data.audioFiles && data.audioFiles.length > 0) {
    await saveClassroomAudioFiles(data.id, data.audioFiles);
    // Update scenes with audio URLs
    updateScenesWithAudioUrls(data.scenes, data.id, baseUrl, data.audioFiles);
  }

  // Save media files to disk if provided
  if (data.mediaFiles && data.mediaFiles.length > 0) {
    await saveClassroomMediaFiles(data.id, data.mediaFiles);
    // Update scenes with media URLs
    updateScenesWithMediaUrls(data.scenes, data.id, baseUrl, data.mediaFiles);
  }

  const classroomData: PersistedClassroomData = {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    createdAt: new Date().toISOString(),
  };

  await ensureClassroomsDir();
  const filePath = path.join(CLASSROOMS_DIR, `${data.id}.json`);
  await writeJsonFileAtomic(filePath, classroomData);

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/${data.id}`,
  };
}
