/**
 * Image Analyzer
 *
 * Analyzes images using vision-capable LLMs to determine pedagogical relevance.
 * Single-image-per-call design for maximum accuracy with local models.
 */

import { callLLM } from '@/lib/ai/llm';
import { getModel, parseModelString } from '@/lib/ai/providers';
import { resolveApiKey, resolveBaseUrl, resolveProxy } from '@/lib/server/provider-config';
import { buildVisionUserContent } from '@/lib/generation/prompt-formatters';
import { logResolvedPrompt } from '@/lib/generation/prompts';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { LanguageModel } from 'ai';
import type {
  ImageAnalysis,
  ImageAnalysisContext,
  ImageAnalysisConfig,
  ImageAnalysisResult,
  AnalyzedImage,
  ImageForAnalysis,
} from '@/lib/types/image-analysis';
import { createLogger } from '@/lib/logger';

const log = createLogger('ImageAnalyzer');

/**
 * Default concurrency for parallel analysis
 * Optimized for local inference - higher values may overwhelm local models
 */
const DEFAULT_CONCURRENCY = 1;

/**
 * Timeout for individual image analysis (ms)
 * Extended timeout for local models that may be slower
 */
const ANALYSIS_TIMEOUT_MS = 300000;

/**
 * Retry configuration for failed analyses
 */
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

/**
 * Analyzes multiple images individually with course context
 *
 * Design: One image per API call for maximum accuracy with local models
 * Parallel execution with concurrency control for performance
 *
 * @param images - Images to analyze
 * @param context - Course context for relevance determination
 * @param config - Analysis configuration
 * @returns Analysis results for all images
 */
export async function analyzeImages(
  images: ImageForAnalysis[],
  context: ImageAnalysisContext,
  config: ImageAnalysisConfig
): Promise<ImageAnalysisResult> {
  const startTime = Date.now();
  const { concurrency = DEFAULT_CONCURRENCY, onProgress } = config;

  log.info(`Starting analysis of ${images.length} images with concurrency ${concurrency}`);

  // Resolve the model instance
  const languageModel = resolveModel(config);

  // Process in parallel with concurrency limit
  const queue = [...images];
  const results: AnalyzedImage[] = [];
  let completed = 0;

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const image = queue.shift();
      if (!image) break;

      onProgress?.(completed, images.length, image.id, 'analyzing');

      try {
        const analysis = await analyzeSingleImageWithRetry(image, context, languageModel, config);
        completed++;

        const analyzedImage: AnalyzedImage = {
          ...image,
          analysis,
          processedAt: new Date().toISOString(),
          modelUsed: config.modelString,
        };

        results.push(analyzedImage);

        const status = analysis.include ? 'included' : 'rejected';
        onProgress?.(completed, images.length, image.id, status);

        log.debug(
          `Image ${image.id}: ${status}` +
            (analysis.include
              ? ` (${analysis.pedagogical?.contentType})`
              : ` (${analysis.rejectionReason})`)
        );
      } catch (error) {
        completed++;
        log.error(`Failed to analyze image ${image.id}:`, error);

        // Create error analysis (rejected due to error)
        const errorAnalysis: ImageAnalysis = {
          include: false,
          rejectionReason: 'error',
          confidence: 'low',
        };

        results.push({
          ...image,
          analysis: errorAnalysis,
          processedAt: new Date().toISOString(),
          modelUsed: config.modelString,
        });

        onProgress?.(completed, images.length, image.id, 'rejected');
      }
    }
  }

  // Launch workers
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  // Sort results by original order
  const idOrder = new Map(images.map((img, idx) => [img.id, idx]));
  results.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  const processingTimeMs = Date.now() - startTime;
  const included = results.filter((r) => r.analysis.include).length;
  const rejected = results.filter((r) => !r.analysis.include && r.analysis.rejectionReason !== 'error')
    .length;
  const failed = results.filter((r) => r.analysis.rejectionReason === 'error').length;

  log.info(`Analysis complete in ${processingTimeMs}ms: ${included} included, ${rejected} rejected, ${failed} failed`);

  return {
    analyses: results,
    metadata: {
      totalImages: images.length,
      includedImages: included,
      rejectedImages: rejected,
      failedImages: failed,
      processingTimeMs,
      modelUsed: config.modelString,
    },
  };
}

/**
 * Analyze a single image with retry logic
 */
async function analyzeSingleImageWithRetry(
  image: ImageForAnalysis,
  context: ImageAnalysisContext,
  model: LanguageModel,
  config: ImageAnalysisConfig,
  attempt: number = 1
): Promise<ImageAnalysis> {
  try {
    return await analyzeSingleImage(image, context, model, config);
  } catch (error) {
    if (attempt <= MAX_RETRIES) {
      log.warn(`Retrying analysis for image ${image.id} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
      await delay(RETRY_DELAY_MS);
      return analyzeSingleImageWithRetry(image, context, model, config, attempt + 1);
    }
    throw error;
  }
}

/**
 * Analyze a single image with course context
 */
async function analyzeSingleImage(
  image: ImageForAnalysis,
  context: ImageAnalysisContext,
  model: LanguageModel,
  config: ImageAnalysisConfig
): Promise<ImageAnalysis> {
  // Build prompt with context
  const systemPrompt = buildAnalysisSystemPrompt(context);

  // Build user content with image
  const userPromptText = 'Analyze this image for the course described above. Output JSON only.';
  const userContent = buildVisionUserContent(
    userPromptText,
    [{ id: image.id, src: image.src, width: image.width, height: image.height }]
  );

  // Log prompts for introspection (fire-and-forget)
  void logResolvedPrompt('image-analysis', 'system', systemPrompt);
  void logResolvedPrompt('image-analysis', 'user', userPromptText + '\n\n[Image: ' + image.id + ']');

  // Call LLM with vision
  const result = await callLLM(
    {
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      maxOutputTokens: 16384,
    },
    'image-analysis'
  );

  // Parse structured JSON
  const analysis = parseAnalysisJson(result.text);

  // Validate required fields based on include flag
  validateAnalysis(analysis);

  return analysis;
}

/**
 * Build system prompt with course context
 */
function buildAnalysisSystemPrompt(context: ImageAnalysisContext): string {
  const userProfileSection = context.userProfile
    ? `\n\n## Learner Profile\n${context.userProfile}`
    : '';

  return `# Image Analysis for Course Generation

You are evaluating an image for inclusion in an educational course.

## Course Context

**Topic:**
${context.requirement}

**Language:**
${context.language}${userProfileSection}

## Your Task
Analyze the attached image and determine:
1. Is this image pedagogically valuable for the course topic?
2. What does it depict?
3. How relevant is it to the learning objectives?

Consider the learner profile when determining relevance - images should be appropriate and helpful for the student's background and knowledge level.

The description field must contain a precise description of the image contents in natural language, and be informationally and semantically highly optimized. Provide all information about the image relevant to the course and learner context in as few words as possible, but do not leave out important descriptive details.

## Output Format (JSON ONLY)
Respond with ONLY a JSON object, no markdown, no explanation:

{
  "include": boolean,
  "rejectionReason": "irrelevant" | "decorative" | "low_quality", // REQUIRED if include === false
  "description": string,        // REQUIRED if include === true: detailed description
  "concepts": string[],         // REQUIRED if include === true: concepts illustrated
  "pedagogical": {              // REQUIRED if include === true
    "contentType": "diagram" | "illustration" | "photograph" | "chart" | "formula" | "map" | "timeline" | "other",
    "complexity": "basic" | "intermediate" | "advanced",
    "relevanceToCourse": string,// How specifically this supports the course
    "suggestedPlacement": "central_focus" | "supporting_detail" | "example" | "summary"
  },
  "confidence": "high" | "medium" | "low"
}

## Decision Guidelines

REJECT (include: false) if:
- Image is just a logo, header, footer, page decoration, etc.
- Purely decorative graphic with no educational content
- Content completely unrelated to course topic
- Content inappropriate for the learner or target audience

ACCEPT (include: true) if:
- Illustrates a concept relevant to the course
- Diagram, chart, or visualization with educational value
- Photograph showing relevant subject matter
- Formula, equation, or technical drawing
- Map, timeline, or structured information display
`;
}

/**
 * Parse analysis JSON from model response
 * Uses the same robust parsing as the generation pipeline
 */
function parseAnalysisJson(response: string): ImageAnalysis {
  // Use the robust JSON parser from the generation pipeline
  const parsed = parseJsonResponse<ImageAnalysis>(response);

  if (parsed === null) {
    log.error('Failed to parse analysis JSON from response');
    log.error('Raw response:', response.substring(0, 8192));
    throw new Error('Failed to parse analysis JSON: could not extract valid JSON from response');
  }

  // Ensure required fields exist
  if (typeof parsed.include !== 'boolean') {
    log.warn('Missing or invalid "include" field, defaulting to false');
    parsed.include = false;
  }

  if (!['high', 'medium', 'low'].includes(parsed.confidence)) {
    parsed.confidence = 'medium';
  }

  return parsed;
}

/**
 * Validate analysis has required fields based on include flag
 */
function validateAnalysis(analysis: ImageAnalysis): void {
  if (analysis.include) {
    // Required fields for included images
    if (!analysis.description || typeof analysis.description !== 'string') {
      log.warn('Included image missing description, using fallback');
      analysis.description = 'Image relevant to course content';
    }

    if (!Array.isArray(analysis.concepts)) {
      analysis.concepts = [];
    }

    if (!analysis.pedagogical) {
      analysis.pedagogical = {
        contentType: 'other',
        complexity: 'intermediate',
        relevanceToCourse: 'Supports course topic',
        suggestedPlacement: 'supporting_detail',
      };
    }

    // Ensure all pedagogical fields exist
    analysis.pedagogical.contentType = analysis.pedagogical.contentType || 'other';
    analysis.pedagogical.complexity = analysis.pedagogical.complexity || 'intermediate';
    analysis.pedagogical.relevanceToCourse = analysis.pedagogical.relevanceToCourse || 'Relevant to course';
    analysis.pedagogical.suggestedPlacement = analysis.pedagogical.suggestedPlacement || 'supporting_detail';
  } else {
    // Required field for rejected images
    if (!analysis.rejectionReason) {
      analysis.rejectionReason = 'irrelevant';
    }
  }
}

/**
 * Resolve language model from config
 */
function resolveModel(config: ImageAnalysisConfig): LanguageModel {
  const { providerId, modelId } = parseModelString(config.modelString);

  const { model } = getModel({
    providerId,
    modelId,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    providerType: config.providerType as 'openai' | 'anthropic' | 'google',
    requiresApiKey: config.requiresApiKey,
  });

  return model;
}

/**
 * Delay utility for retries
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Filter images to only those marked for inclusion
 */
export function filterIncludedImages(analyses: AnalyzedImage[]): AnalyzedImage[] {
  return analyses.filter((img) => img.analysis.include);
}

/**
 * Format analyzed images for prompt inclusion
 */
export function formatAnalyzedImagesForPrompt(
  analyses: AnalyzedImage[],
  language: string = 'en-US'
): string {
  const included = analyses.filter((img) => img.analysis.include);

  if (included.length === 0) {
    return 'No pedagogically relevant images available.';
  }

  const lines: string[] = [`${included.length} pedagogically relevant images available:`];

  for (const img of included) {
    const a = img.analysis;
    lines.push(`\n**${img.id}**: [${a.pedagogical?.contentType}] ${a.description}`);
    lines.push(`  - Concepts: ${a.concepts?.join(', ') || 'N/A'}`);
    lines.push(`  - Relevance: ${a.pedagogical?.relevanceToCourse}`);
    lines.push(`  - Placement: ${a.pedagogical?.suggestedPlacement}`);
    lines.push(`  - Complexity: ${a.pedagogical?.complexity}`);
    if (img.width && img.height) {
      const ratio = (img.width / img.height).toFixed(2);
      lines.push(`  - Dimensions: ${img.width}×${img.height} (${ratio} aspect ratio)`);
    }
  }

  // Add rejected images summary
  const rejected = analyses.filter((img) => !img.analysis.include);
  if (rejected.length > 0) {
    lines.push(`\n(${rejected.length} images rejected: ${rejected.map((r) => `${r.id} (${r.analysis.rejectionReason})`).join(', ')})`);
  }

  return lines.join('\n');
}
