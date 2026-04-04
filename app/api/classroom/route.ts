import { type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  isValidClassroomId,
  persistClassroom,
  readClassroom,
  readClassroomAudioFiles,
  readClassroomMediaFiles,
  type AudioFileData,
  type MediaFileData,
} from '@/lib/server/classroom-storage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { stage, scenes, audioFiles, mediaFiles } = body;

    if (!stage || !scenes) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: stage, scenes',
      );
    }

    const id = stage.id || randomUUID();

    const persisted = await persistClassroom({
      id,
      stage: { ...stage, id },
      scenes,
      audioFiles: audioFiles as AudioFileData[] | undefined,
      mediaFiles: mediaFiles as MediaFileData[] | undefined,
    });

    return apiSuccess({ id: persisted.id, url: persisted.url }, 201);
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to store classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    const includeMedia = request.nextUrl.searchParams.get('includeMedia') === 'true';

    if (!id) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required parameter: id',
      );
    }

    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const classroom = await readClassroom(id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    // If includeMedia is true, also return audio and media files as base64
    // This allows clients to restore IndexedDB when loading on a new computer
    let audioFiles: AudioFileData[] | undefined;
    let mediaFiles: MediaFileData[] | undefined;

    if (includeMedia) {
      [audioFiles, mediaFiles] = await Promise.all([
        readClassroomAudioFiles(id),
        readClassroomMediaFiles(id),
      ]);
    }

    return apiSuccess({
      classroom,
      ...(includeMedia && { audioFiles, mediaFiles }),
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to retrieve classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}
