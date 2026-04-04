import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import JSZip from 'jszip';
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
 * Uses host-relative URLs for portability across different hosts/ports
 */
export function updateScenesWithAudioUrls(
  scenes: Scene[],
  classroomId: string,
  audioFiles?: AudioFileData[]
): void {
  const audioBaseUrl = `/api/classroom-media/${classroomId}/audio`;

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
 * Sanitize a URL to host-relative format
 * Converts absolute URLs to host-relative paths for portability
 * Preserves existing host-relative URLs and non-URL values
 */
export function sanitizeToHostRelative(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    // Return only pathname, preserving query strings if present
    return parsed.pathname + parsed.search;
  } catch {
    // Not a valid absolute URL - could already be relative or invalid
    // If it starts with /, it's already host-relative
    // Otherwise, return as-is (might be a placeholder or data URL)
    return url;
  }
}

/**
 * Sanitize all media URLs in scenes to host-relative format
 * Recursively processes actions and slide content
 */
export function sanitizeScenesToHostRelative(scenes: Scene[]): void {
  for (const scene of scenes) {
    // Sanitize action URLs (audio)
    if (scene.actions) {
      for (const action of scene.actions) {
        if (action.type === 'speech') {
          const speechAction = action as { audioUrl?: string };
          speechAction.audioUrl = sanitizeToHostRelative(speechAction.audioUrl);
        }
      }
    }

    // Sanitize slide element URLs (images/videos)
    if (scene.type === 'slide') {
      const canvas = (scene.content as { canvas?: { elements?: Array<{ src?: string; type?: string }> } })?.canvas;
      if (canvas?.elements) {
        for (const element of canvas.elements) {
          if ((element.type === 'image' || element.type === 'video') && element.src) {
            element.src = sanitizeToHostRelative(element.src) || element.src;
          }
        }
      }
    }
  }
}

/**
 * Update scenes to replace media placeholders with server URLs
 * Handles both AI-generated (gen_*) and embedded (emb_*) media
 * Uses host-relative URLs for portability across different hosts/ports
 */
export function updateScenesWithMediaUrls(
  scenes: Scene[],
  classroomId: string,
  mediaFiles?: MediaFileData[]
): void {
  const mediaBaseUrl = `/api/classroom-media/${classroomId}/media`;

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
): Promise<PersistedClassroomData & { url: string }> {
  // Save audio files to disk if provided
  if (data.audioFiles && data.audioFiles.length > 0) {
    await saveClassroomAudioFiles(data.id, data.audioFiles);
    // Update scenes with audio URLs (host-relative)
    updateScenesWithAudioUrls(data.scenes, data.id, data.audioFiles);
  }

  // Save media files to disk if provided
  if (data.mediaFiles && data.mediaFiles.length > 0) {
    await saveClassroomMediaFiles(data.id, data.mediaFiles);
    // Update scenes with media URLs (host-relative)
    updateScenesWithMediaUrls(data.scenes, data.id, data.mediaFiles);
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
    url: `/classroom/${data.id}`,
  };
}

// ==================== Export/Import Functions ====================

/** Maximum size for classroom export/import: 1 GB */
export const MAX_CLASSROOM_EXPORT_SIZE = 1024 * 1024 * 1024;

/** Name of the main classroom JSON file inside the ZIP */
export const CLASSROOM_JSON_FILENAME = 'classroom.json';

export interface ClassroomExportResult {
  buffer: Buffer;
  filename: string;
  size: number;
}

export interface ClassroomImportResult {
  id: string;
  name: string;
  url: string;
  overwritten: boolean;
}

export interface ClassroomValidationResult {
  valid: boolean;
  id?: string;
  error?: string;
}

/**
 * Recursively get all files in a directory
 */
async function getAllFiles(dir: string, baseDir: string): Promise<{ relativePath: string; absolutePath: string }[]> {
  const files: { relativePath: string; absolutePath: string }[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, absolutePath);

      if (entry.isDirectory()) {
        const subFiles = await getAllFiles(absolutePath, baseDir);
        files.push(...subFiles);
      } else {
        files.push({ relativePath, absolutePath });
      }
    }
  } catch (error) {
    // Directory doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return files;
}

/**
 * Calculate total size of all files in classroom directory
 */
async function calculateClassroomSize(classroomId: string): Promise<number> {
  const classroomDir = path.join(CLASSROOMS_DIR, classroomId);
  const files = await getAllFiles(classroomDir, classroomDir);

  let totalSize = 0;
  for (const file of files) {
    const stat = await fs.stat(file.absolutePath);
    totalSize += stat.size;
  }

  // Add the JSON file size
  const jsonPath = path.join(CLASSROOMS_DIR, `${classroomId}.json`);
  try {
    const jsonStat = await fs.stat(jsonPath);
    totalSize += jsonStat.size;
  } catch {
    // JSON file may not exist
  }

  return totalSize;
}

/**
 * Export a classroom to a ZIP buffer
 * Sanitizes all media URLs to host-relative format for portability and privacy
 */
export async function exportClassroomToZip(classroomId: string): Promise<ClassroomExportResult> {
  // Validate classroom exists
  const classroom = await readClassroom(classroomId);
  if (!classroom) {
    throw new Error(`Classroom not found: ${classroomId}`);
  }

  // Check size limit before processing
  const totalSize = await calculateClassroomSize(classroomId);
  if (totalSize > MAX_CLASSROOM_EXPORT_SIZE) {
    throw new Error(
      `Classroom size (${(totalSize / 1024 / 1024).toFixed(1)} MB) exceeds maximum export size of ${(MAX_CLASSROOM_EXPORT_SIZE / 1024 / 1024).toFixed(0)} MB`
    );
  }

  const zip = new JSZip();

  // Sanitize URLs to host-relative format for portability
  // This ensures classrooms can be imported on any host/port and protects privacy
  const sanitizedClassroom = JSON.parse(JSON.stringify(classroom)) as PersistedClassroomData;
  sanitizeScenesToHostRelative(sanitizedClassroom.scenes);

  // Add the main classroom JSON (sanitized)
  zip.file(CLASSROOM_JSON_FILENAME, JSON.stringify(sanitizedClassroom, null, 2));

  // Add all files from the classroom directory recursively
  const classroomDir = path.join(CLASSROOMS_DIR, classroomId);
  const files = await getAllFiles(classroomDir, classroomDir);

  for (const file of files) {
    const content = await fs.readFile(file.absolutePath);
    zip.file(file.relativePath, content);
  }

  // Generate ZIP buffer
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Generate filename: sanitize stage name + id
  const sanitizedName = classroom.stage.name
    .replace(/[^a-zA-Z0-9\-_\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
  const filename = `${sanitizedName}-${classroomId}.zip`;

  return {
    buffer,
    filename,
    size: buffer.length,
  };
}

/**
 * Validate classroom data structure
 */
export function validateClassroomData(data: unknown): ClassroomValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid classroom data: not an object' };
  }

  const classroom = data as Partial<PersistedClassroomData>;

  if (!classroom.id || typeof classroom.id !== 'string') {
    return { valid: false, error: 'Invalid classroom data: missing or invalid id' };
  }

  if (!isValidClassroomId(classroom.id)) {
    return { valid: false, id: classroom.id, error: 'Invalid classroom ID format' };
  }

  if (!classroom.stage || typeof classroom.stage !== 'object') {
    return { valid: false, id: classroom.id, error: 'Invalid classroom data: missing or invalid stage' };
  }

  if (!classroom.scenes || !Array.isArray(classroom.scenes)) {
    return { valid: false, id: classroom.id, error: 'Invalid classroom data: missing or invalid scenes' };
  }

  return { valid: true, id: classroom.id };
}

/**
 * Import a classroom from a ZIP buffer
 * Sanitizes URLs to host-relative format for portability
 */
export async function importClassroomFromZip(
  zipBuffer: Buffer,
  allowOverwrite = false
): Promise<ClassroomImportResult> {
  // Parse ZIP
  const zip = await JSZip.loadAsync(zipBuffer);

  // Check file size limit by summing compressed sizes as a conservative estimate
  // JSZip doesn't expose uncompressedSize directly, so we use compressed size
  let totalCompressedSize = 0;
  zip.forEach((_, file) => {
    // Access internal _data property which contains compressedSize
    const compressedSize = (file as unknown as { _data?: { compressedSize?: number } })._data?.compressedSize || 0;
    totalCompressedSize += compressedSize;
  });

  // Use compressed size * 10 as a rough estimate of uncompressed size
  const estimatedUncompressedSize = totalCompressedSize * 10;

  if (estimatedUncompressedSize > MAX_CLASSROOM_EXPORT_SIZE) {
    throw new Error(
      `Estimated extracted classroom size (${(estimatedUncompressedSize / 1024 / 1024).toFixed(1)} MB) exceeds maximum import size of ${(MAX_CLASSROOM_EXPORT_SIZE / 1024 / 1024).toFixed(0)} MB`
    );
  }

  // Find and validate classroom.json
  const classroomJsonFile = zip.file(CLASSROOM_JSON_FILENAME);
  if (!classroomJsonFile) {
    throw new Error(`Invalid classroom archive: missing ${CLASSROOM_JSON_FILENAME}`);
  }

  const classroomJsonContent = await classroomJsonFile.async('string');
  let classroomData: unknown;

  try {
    classroomData = JSON.parse(classroomJsonContent);
  } catch (e) {
    throw new Error(`Invalid classroom archive: ${CLASSROOM_JSON_FILENAME} is not valid JSON`);
  }

  // Validate structure
  const validation = validateClassroomData(classroomData);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid classroom data structure');
  }

  const classroomId = validation.id!;
  const classroom = classroomData as PersistedClassroomData;

  // Sanitize URLs to host-relative format
  // This ensures legacy or external ZIPs with absolute URLs are properly sanitized
  sanitizeScenesToHostRelative(classroom.scenes);

  // Check for existing classroom
  const existingClassroom = await readClassroom(classroomId);
  let overwritten = false;

  if (existingClassroom) {
    if (!allowOverwrite) {
      throw new Error(
        `Classroom with ID "${classroomId}" already exists.`
      );
    }

    // Remove existing classroom data
    const existingDir = path.join(CLASSROOMS_DIR, classroomId);
    try {
      await fs.rm(existingDir, { recursive: true, force: true });
    } catch {
      // Directory may not exist
    }

    const existingJson = path.join(CLASSROOMS_DIR, `${classroomId}.json`);
    try {
      await fs.unlink(existingJson);
    } catch {
      // File may not exist
    }

    overwritten = true;
  }

  // Create classroom directory
  const classroomDir = path.join(CLASSROOMS_DIR, classroomId);
  await ensureDir(classroomDir);

  // Extract all files from ZIP (except classroom.json which we handle separately)
  const extractPromises: Promise<void>[] = [];

  zip.forEach((relativePath, file) => {
    if (relativePath === CLASSROOM_JSON_FILENAME) return;
    if (file.dir) return;

    const extractPromise = (async () => {
      const content = await file.async('nodebuffer');
      const targetPath = path.join(classroomDir, relativePath);

      // Ensure parent directory exists
      await ensureDir(path.dirname(targetPath));

      // Write file
      await fs.writeFile(targetPath, content);
    })();

    extractPromises.push(extractPromise);
  });

  await Promise.all(extractPromises);

  // Write the classroom.json file
  const jsonPath = path.join(CLASSROOMS_DIR, `${classroomId}.json`);
  await writeJsonFileAtomic(jsonPath, classroom);

  return {
    id: classroomId,
    name: classroom.stage.name,
    url: `/classroom/${classroomId}`,
    overwritten,
  };
}

/**
 * Delete a classroom and all its associated data
 */
export async function deleteClassroom(classroomId: string): Promise<void> {
  if (!isValidClassroomId(classroomId)) {
    throw new Error('Invalid classroom ID');
  }

  // Delete directory
  const classroomDir = path.join(CLASSROOMS_DIR, classroomId);
  try {
    await fs.rm(classroomDir, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  // Delete JSON file
  const jsonPath = path.join(CLASSROOMS_DIR, `${classroomId}.json`);
  try {
    await fs.unlink(jsonPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
