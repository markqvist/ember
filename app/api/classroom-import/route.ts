import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  isValidClassroomId,
  importClassroomFromZip,
  readClassroom,
  MAX_CLASSROOM_EXPORT_SIZE,
  type ClassroomImportResult,
} from '@/lib/server/classroom-storage';

export const dynamic = 'force-dynamic';

/**
 * Parse multipart form data and extract the ZIP file buffer
 */
async function parseMultipartForm(request: NextRequest): Promise<{
  zipBuffer: Buffer;
  allowOverwrite: boolean;
}> {
  const formData = await request.formData();

  // Get the file
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw new Error('Missing or invalid file field');
  }

  // Validate file type
  if (!file.name.endsWith('.zip') && file.type !== 'application/zip') {
    throw new Error('File must be a ZIP archive');
  }

  // Check file size
  if (file.size > MAX_CLASSROOM_EXPORT_SIZE) {
    throw new Error(
      `File size (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds maximum allowed size of ${(MAX_CLASSROOM_EXPORT_SIZE / 1024 / 1024).toFixed(0)} MB`
    );
  }

  // Convert to buffer
  const arrayBuffer = await file.arrayBuffer();
  const zipBuffer = Buffer.from(arrayBuffer);

  // Get allowOverwrite flag
  const allowOverwriteValue = formData.get('allowOverwrite');
  const allowOverwrite = allowOverwriteValue === 'true' || allowOverwriteValue === '1';

  return { zipBuffer, allowOverwrite };
}

export async function POST(request: NextRequest) {
  try {
    // Parse multipart form
    let zipBuffer: Buffer;
    let allowOverwrite: boolean;

    try {
      const parsed = await parseMultipartForm(request);
      zipBuffer = parsed.zipBuffer;
      allowOverwrite = parsed.allowOverwrite;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        'Invalid request body',
        message,
      );
    }

    // Import the classroom
    const result = await importClassroomFromZip(zipBuffer, allowOverwrite);

    return apiSuccess<Record<string, unknown>>(result as unknown as Record<string, unknown>, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Handle specific error cases
    if (message.includes('already exists')) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        409,
        'Classroom already exists',
        message,
      );
    }

    if (message.includes('missing classroom.json') || message.includes('not valid JSON')) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        'Invalid classroom archive',
        message,
      );
    }

    if (message.includes('Invalid classroom')) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        'Invalid classroom data',
        message,
      );
    }

    if (message.includes('exceeds maximum')) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        413,
        'Archive too large',
        message,
      );
    }

    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to import classroom',
      message,
    );
  }
}

/**
 * Check if a classroom ID is available for import
 * Returns 200 if available, 409 if already exists
 */
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required parameter: id',
      );
    }

    if (!isValidClassroomId(id)) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        'Invalid classroom ID format',
      );
    }

    const existing = await readClassroom(id);

    if (existing) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        409,
        'Classroom ID already exists',
        `A classroom with ID "${id}" already exists`,
      );
    }

    return apiSuccess({ available: true, id }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to check classroom availability',
      message,
    );
  }
}
