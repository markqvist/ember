/**
 * Stage 1: Generate scene outlines from user requirements.
 * Also contains outline fallback logic.
 */

import { nanoid } from 'nanoid';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type {
  UserRequirements,
  SceneOutline,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';
import { sortPdfImagesForVision } from '@/lib/pdf/document-aggregator';
import { buildPrompt, PROMPT_IDS } from './prompts';
import { formatImageDescription, formatImagePlaceholder } from './prompt-formatters';
import { parseJsonResponse } from './json-repair';
import { uniquifyMediaElementIds } from './scene-builder';
import type { AICallFn, GenerationResult, GenerationCallbacks } from './pipeline-types';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

/**
 * Generate scene outlines from user requirements
 * Now uses simplified UserRequirements with just requirement text and language
 */
export async function generateSceneOutlinesFromRequirements(
  requirements: UserRequirements,
  pdfText: string | undefined,
  pdfImages: PdfImage[] | undefined,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  options?: {
    visionEnabled?: boolean;
    imageMapping?: ImageMapping;
    imageGenerationEnabled?: boolean;
    videoGenerationEnabled?: boolean;
    researchContext?: string;
    teacherContext?: string;
  },
): Promise<GenerationResult<SceneOutline[]>> {
  // Build available images description for the prompt
  let availableImagesText = 'No images available';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (pdfImages && pdfImages.length > 0) {
    // Check if images have semantic analysis
    const hasAnalyzedImages = pdfImages.some((img) => img.analysis);

    if (hasAnalyzedImages) {
      // Use semantic analysis for image descriptions
      availableImagesText = formatAnalyzedImagesForOutline(pdfImages);

      // Still provide vision images if mapping available and vision enabled
      if (options?.visionEnabled && options?.imageMapping) {
        const includedImages = pdfImages.filter((img) => img.analysis?.include !== false);
        const withSrc = includedImages.filter((img) => options.imageMapping![img.id]);
        visionImages = withSrc.slice(0, MAX_VISION_IMAGES).map((img) => ({
          id: img.id,
          src: options.imageMapping![img.id],
          width: img.width,
          height: img.height,
        }));
      }
    } else {
      // Fallback to legacy behavior (no semantic analysis)
      const prioritizedImages = sortPdfImagesForVision(pdfImages);
      if (options?.visionEnabled && options?.imageMapping) {
        // Vision mode: split into vision images (first N) and text-only (rest)
        const allWithSrc = prioritizedImages.filter((img) => options.imageMapping![img.id]);
        const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
        const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
        const noSrcImages = prioritizedImages.filter((img) => !options.imageMapping![img.id]);

        const visionDescriptions = visionSlice.map((img) =>
          formatImagePlaceholder(img, requirements.language),
        );
        const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
          formatImageDescription(img, requirements.language),
        );
        availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

        visionImages = visionSlice.map((img) => ({
          id: img.id,
          src: options.imageMapping![img.id],
          width: img.width,
          height: img.height,
        }));
      } else {
        // Text-only mode: full descriptions
        availableImagesText = prioritizedImages
          .map((img) => formatImageDescription(img, requirements.language))
          .join('\n');
      }
    }
  }

  // Build user profile string for prompt injection
  const userProfileText =
    requirements.userNickname || requirements.userBio
      ? `## Learner Profile\n\n**Name:** ${requirements.userNickname || 'Unknown'}${requirements.userBio ? `\n**Provided Information:**\n${requirements.userBio}` : '\n**Provided Information:** None'}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`
      : '';

  // Build AI-generated media instructions based on enabled flags
  // Only include the relevant snippet if at least one media type is enabled
  const imageEnabled = options?.imageGenerationEnabled ?? false;
  const videoEnabled = options?.videoGenerationEnabled ?? false;
  let aiGeneratedMediaInstructions = '';
  let outputFormatInstructions = '';
  if (imageEnabled && videoEnabled) {
    aiGeneratedMediaInstructions = '{{snippet:ai-media-both}}';
    outputFormatInstructions = '{{snippet:output-format-media}}';
  } else if (imageEnabled) {
    aiGeneratedMediaInstructions = '{{snippet:ai-media-image-only}}';
    outputFormatInstructions = '{{snippet:output-format-media}}';
  } else if (videoEnabled) {
    aiGeneratedMediaInstructions = '{{snippet:ai-media-video-only}}';
    outputFormatInstructions = '{{snippet:output-format-media}}';
  } else {
    outputFormatInstructions = '{{snippet:output-format-no-media}}';
  }
  // If neither is enabled, aiGeneratedMediaInstructions remains empty - the model never learns about the capability

  // Use simplified prompt variables
  const prompts = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
    // New simplified variables
    requirement: requirements.requirement,
    language: requirements.language,
    pdfContent: pdfText ? pdfText.substring(0, MAX_PDF_CONTENT_CHARS) : 'None',
    availableImages: availableImagesText,
    userProfile: userProfileText,
    aiGeneratedMediaInstructions,
    outputFormatInstructions,
    researchContext: options?.researchContext || 'None',
    // Server-side generation populates this via options; client-side populates via formatTeacherPersonaForPrompt
    teacherContext: options?.teacherContext || '',
  });

  if (!prompts) {
    return { success: false, error: 'Prompt template not found' };
  }

  try {
    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 20,
      stageProgress: 50,
      statusMessage: 'Analyzing requirements and generating outlines...',
      scenesGenerated: 0,
      totalScenes: 0,
    });

    const response = await aiCall(prompts.system, prompts.user, visionImages);
    const outlines = parseJsonResponse<SceneOutline[]>(response);

    if (!outlines || !Array.isArray(outlines)) {
      return {
        success: false,
        error: 'Failed to parse scene outlines response',
      };
    }
    // Ensure IDs, order, and language
    const enriched = outlines.map((outline, index) => ({
      ...outline,
      id: outline.id || nanoid(),
      order: index + 1,
      language: requirements.language,
    }));

    // Replace sequential gen_img_N/gen_vid_N with globally unique IDs
    const result = uniquifyMediaElementIds(enriched);

    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 50,
      stageProgress: 100,
      statusMessage: `已生成 ${result.length} 个场景大纲`,
      scenesGenerated: 0,
      totalScenes: result.length,
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Format analyzed images for outline generation prompt
 * Uses semantic analysis data when available
 */
export function formatAnalyzedImagesForOutline(pdfImages: PdfImage[]): string {
  const analyzedImages = pdfImages.filter((img) => img.analysis);

  if (analyzedImages.length === 0) {
    return 'No analyzed images available.';
  }

  const lines: string[] = [`${analyzedImages.length} semantically analyzed images:`];

  for (const img of analyzedImages) {
    const a = img.analysis!;

    if (a.include) {
      // Included image with full details
      lines.push(`\n**${img.id}**: [${a.pedagogical.contentType}] ${a.description}`);
      lines.push(`  - include: true`);
      lines.push(`  - concepts: ${a.concepts.join(', ')}`);
      lines.push(`  - relevance: ${a.pedagogical.relevanceToCourse}`);
      lines.push(`  - placement: ${a.pedagogical.suggestedPlacement}`);
      lines.push(`  - complexity: ${a.pedagogical.complexity}`);
      lines.push(`  - confidence: ${a.confidence}`);
      if (img.width && img.height) {
        const ratio = (img.width / img.height).toFixed(2);
        lines.push(`  - dimensions: ${img.width}×${img.height} (ratio ${ratio})`);
      }
    } else {
      // Rejected image
      const reason = a.rejectionReason || 'irrelevant';
      lines.push(`\n**${img.id}**: [REJECTED - ${reason}]`);
      lines.push(`  - include: false`);
      lines.push(`  - reason: ${reason}`);
    }
  }

  // Summary
  const included = analyzedImages.filter((img) => img.analysis?.include).length;
  const rejected = analyzedImages.filter((img) => !img.analysis?.include).length;
  lines.push(`\n**Summary**: ${included} included, ${rejected} rejected`);

  return lines.join('\n');
}

/**
 * Apply type fallbacks for outlines that can't be generated as their declared type.
 * - interactive without interactiveConfig → slide
 * - pbl without pblConfig or languageModel → slide
 */
export function applyOutlineFallbacks(
  outline: SceneOutline,
  hasLanguageModel: boolean,
): SceneOutline {
  if (outline.type === 'interactive' && !outline.interactiveConfig) {
    log.warn(
      `Interactive outline "${outline.title}" missing interactiveConfig, falling back to slide`,
    );
    return { ...outline, type: 'slide' };
  }
  if (outline.type === 'pbl' && (!outline.pblConfig || !hasLanguageModel)) {
    log.warn(
      `PBL outline "${outline.title}" missing pblConfig or languageModel, falling back to slide`,
    );
    return { ...outline, type: 'slide' };
  }
  return outline;
}
