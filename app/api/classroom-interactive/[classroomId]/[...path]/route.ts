/**
 * Classroom Interactive Simulations API
 *
 * Serves multi-file interactive simulations from data/classrooms/[id]/interactive/
 *
 * GET /api/classroom-interactive/[classroomId]/[simulationName]/...
 *
 * Features:
 * - Path traversal prevention
 * - Automatic index.html fallback for directory paths
 * - MIME type detection for web assets
 * - No caching (changes reflect immediately for development)
 * - CORS headers for iframe sandbox compatibility
 */

import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { CLASSROOMS_DIR, isValidClassroomId } from '@/lib/server/classroom-storage';

const MIME_TYPES: Record<string, string> = {
  // HTML
  '.html': 'text/html',
  '.htm': 'text/html',
  // JavaScript
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  // CSS
  '.css': 'text/css',
  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  // Fonts
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  // Video/Audio
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  // WebAssembly
  '.wasm': 'application/wasm',
  // Data
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
};

// Maximum file size (250MB) - generous limit for simulations with assets
const MAX_FILE_SIZE = 250 * 1024 * 1024;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classroomId: string; path: string[] }> },
) {
  const { classroomId, path: pathSegments } = await params;

  // Validate classroomId
  if (!isValidClassroomId(classroomId)) {
    return NextResponse.json({ error: 'Invalid classroom ID' }, { status: 400 });
  }

  // Validate path segments — no traversal
  const joined = pathSegments.join('/');
  if (joined.includes('..') || pathSegments.some((s) => s.includes('\0'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Build base interactive directory path
  const interactiveDir = path.join(CLASSROOMS_DIR, classroomId, 'interactive');
  let filePath = path.join(interactiveDir, ...pathSegments);
  const resolvedBase = path.resolve(interactiveDir);

  try {
    // Resolve symlinks and verify the real path stays within the interactive dir
    let realPath = await fs.realpath(filePath);
    if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Check if path exists and what type it is
    let stat = await fs.stat(realPath);

    // If it's a directory, try to serve index.html
    if (stat.isDirectory()) {
      const indexPath = path.join(realPath, 'index.html');
      try {
        realPath = await fs.realpath(indexPath);
        if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        stat = await fs.stat(realPath);
      } catch {
        return NextResponse.json({ error: 'Directory index not found' }, { status: 404 });
      }
    }

    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Check file size
    if (stat.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }

    // Determine content type
    const ext = path.extname(realPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Stream the file to avoid loading large files into memory
    const stream = createReadStream(realPath);
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer | string) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    // No caching headers - changes should reflect immediately
    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*', // Allow cross-origin for iframe usage
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Classroom interactive error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
