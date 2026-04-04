import { NextRequest } from 'next/server';
import { parseMarkdown } from '@/lib/markdown/parser';
import type { ParsedMarkdownContent } from '@/lib/markdown/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('Parse Markdown');

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      log.error('Invalid Content-Type for markdown upload:', contentType);
      return apiError(
        'INVALID_REQUEST',
        400,
        `Invalid Content-Type: expected multipart/form-data, got "${contentType}"`,
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'No markdown file provided');
    }

    // Read file content as text
    const text = await file.text();

    // Parse markdown using the built-in parser
    const result = parseMarkdown(text, file.name, file.size);

    // Reshape to match ParsedPdfContent so the downstream pipeline is agnostic
    const resultWithMetadata: ParsedMarkdownContent = {
      ...result,
      metadata: {
        ...result.metadata!,
        fileName: file.name,
        fileSize: file.size,
      },
    };

    return apiSuccess({ data: resultWithMetadata });
  } catch (error) {
    log.error('Error parsing markdown:', error);
    return apiError(
      'PARSE_FAILED',
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
