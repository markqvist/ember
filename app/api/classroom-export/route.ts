import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  isValidClassroomId,
  exportClassroomToZip,
  readClassroom,
} from '@/lib/server/classroom-storage';

export const dynamic = 'force-dynamic';

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

    // Verify classroom exists before attempting export
    const classroom = await readClassroom(id);
    if (!classroom) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        404,
        'Classroom not found',
      );
    }

    // Generate ZIP export
    const { buffer, filename, size } = await exportClassroomToZip(id);

    // Create a Blob from the buffer for Response compatibility
    // Use type assertion to work around strict TypeScript checking
    const blobParts: BlobPart[] = [buffer as unknown as BlobPart];
    const blob = new Blob(blobParts, { type: 'application/zip' });

    // Return ZIP file as download
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(size),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Handle specific error cases
    if (message.includes('exceeds maximum')) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        413,
        'Classroom too large for export',
        message,
      );
    }

    if (message.includes('not found')) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        404,
        'Classroom not found',
        message,
      );
    }

    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to export classroom',
      message,
    );
  }
}
