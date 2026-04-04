/**
 * Markdown Parsing Type Definitions
 *
 * Markdown files are parsed locally (no external provider needed).
 * The parser extracts structured content: headings, text blocks,
 * code fences, lists, and metadata — then outputs a unified
 * ParsedMarkdownContent compatible with the downstream generation pipeline.
 */

/**
 * Parsed markdown content — mirrors ParsedPdfContent shape so the
 * generation pipeline can treat both identically after the parse stage.
 */
export interface ParsedMarkdownContent {
  /** Full text content (the markdown source, lightly normalized) */
  text: string;

  /** Images are always empty for .md files (no embedded binary data) */
  images: string[];

  /** Structural headings extracted from the markdown */
  headings?: Array<{
    level: number; // 1–6
    text: string;
    line: number; // 1-based line number
  }>;

  /** Metadata about the parsed file */
  metadata?: {
    fileName?: string;
    fileSize?: number;
    lineCount: number;
    wordCount: number;
    headingCount: number;
    codeBlockCount: number;
    parser: 'built-in';
    processingTime?: number;
    /** Empty — kept for pipeline compatibility with PDF images */
    imageMapping?: Record<string, string>;
    pdfImages?: Array<{
      id: string;
      src: string;
      pageNumber: number;
      description?: string;
      width?: number;
      height?: number;
    }>;
  };
}

/**
 * Request parameters for markdown parsing
 */
export interface ParseMarkdownRequest {
  /** Markdown file to parse */
  file: File;
}

/**
 * Response from markdown parsing API
 */
export interface ParseMarkdownResponse {
  success: boolean;
  data?: ParsedMarkdownContent;
  error?: string;
}
