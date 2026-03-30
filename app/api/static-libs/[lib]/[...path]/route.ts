/**
 * Static Libraries API
 *
 * Serves bundled JavaScript/CSS libraries for offline use in interactive simulations.
 * Libraries are prepared at build time by scripts/prepare-static-libs.ts
 *
 * GET /api/static-libs/tailwind/tailwind.min.js
 * GET /api/static-libs/katex/katex.min.css
 * GET /api/static-libs/katex/fonts/KaTeX_Main-Regular.ttf
 * GET /api/static-libs/d3/d3.min.js
 */

import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

const STATIC_LIBS_DIR = path.join(process.cwd(), 'public', 'static-libs');

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

// Allowed libraries and their valid paths (security whitelist)
const ALLOWED_LIBRARIES = ['tailwind', 'katex', 'd3'];

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ lib: string; path: string[] }> },
) {
  const { lib, path: pathSegments } = await params;

  // Validate library name
  if (!ALLOWED_LIBRARIES.includes(lib)) {
    return NextResponse.json({ error: 'Library not found' }, { status: 404 });
  }

  // Validate path segments (prevent directory traversal)
  const joined = pathSegments.join('/');
  if (joined.includes('..') || pathSegments.some((s) => s.includes('\0'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Construct file path
  const filePath = path.join(STATIC_LIBS_DIR, lib, ...pathSegments);
  const resolvedBase = path.resolve(STATIC_LIBS_DIR, lib);

  try {
    // Resolve symlinks and verify the real path stays within the library dir
    const realPath = await fs.realpath(filePath);
    if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Check file exists and get stats
    const stat = await fs.stat(realPath);
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

    // Read file
    const content = await fs.readFile(realPath);

    // Return with appropriate headers for caching
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache
        'Access-Control-Allow-Origin': '*', // Allow cross-origin for iframe usage
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Static libs error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
