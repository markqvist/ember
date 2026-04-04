/**
 * Built-in Markdown Parser
 *
 * Parses markdown files into structured content for the generation pipeline.
 * No external provider needed — markdown is plain text with lightweight structure.
 *
 * Extracts:
 * - Full text content (normalized)
 * - Heading hierarchy (h1–h6)
 * - Code block count
 * - Word / line counts
 */

import type { ParsedMarkdownContent } from './types';

/**
 * Parse a markdown string into structured content.
 */
export function parseMarkdown(
  source: string,
  fileName?: string,
  fileSize?: number,
): ParsedMarkdownContent {
  const startTime = performance.now();

  // Normalize line endings
  const text = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = text.split('\n');
  const lineCount = lines.length;
  const wordCount = text
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  // Extract headings (ATX-style: # Heading)
  const headings: Array<{ level: number; text: string; line: number }> = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  // Count fenced code blocks
  let codeBlockCount = 0;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code blocks (``` or ~~~)
    if (/^(`{3,}|~{3,})/.test(line.trimStart())) {
      if (inCodeBlock) {
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockCount++;
      }
      continue;
    }

    // Only extract headings outside code blocks
    if (!inCodeBlock) {
      const match = line.match(headingRegex);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].replace(/\s+#+\s*$/, '').trim(), // Strip trailing #
          line: i + 1,
        });
      }
    }
  }

  const processingTime = Math.round(performance.now() - startTime);

  return {
    text,
    images: [], // Markdown has no embedded binary images
    headings,
    metadata: {
      fileName,
      fileSize,
      lineCount,
      wordCount,
      headingCount: headings.length,
      codeBlockCount,
      parser: 'built-in',
      processingTime,
      imageMapping: {},
      pdfImages: [],
    },
  };
}
