/**
 * Image Analysis Types
 *
 * Semantic analysis of images for educational content generation.
 * Provides vision-to-text understanding for pedagogical relevance determination.
 */

/**
 * Course context passed to image analyzer for relevance judgment
 */
export interface ImageAnalysisContext {
  /** Original user requirement/topic */
  requirement: string;
  /** Inferred or specified subject area */
  subject?: string;
  /** Target audience for pedagogical calibration */
  targetAudience?: string;
  /** Course language */
  language: string;
  /** Learner profile information (name, bio) for personalization */
  userProfile?: string;
}

/**
 * Rejection reasons for filtered images
 */
export type ImageRejectionReason = 'irrelevant' | 'decorative' | 'low_quality' | 'error';

/**
 * Pedagogical content type classification
 */
export type PedagogicalContentType =
  | 'diagram'
  | 'illustration'
  | 'photograph'
  | 'chart'
  | 'formula'
  | 'map'
  | 'timeline'
  | 'other';

/**
 * Complexity level for pedagogical calibration
 */
export type ContentComplexity = 'basic' | 'intermediate' | 'advanced';

/**
 * Suggested placement on slide
 */
export type SuggestedPlacement = 'central_focus' | 'supporting_detail' | 'example' | 'summary';

/**
 * Confidence level in analysis
 */
export type AnalysisConfidence = 'high' | 'medium' | 'low';

/**
 * Pedagogical metadata for accepted images
 */
export interface PedagogicalMetadata {
  /** Educational content type */
  contentType: PedagogicalContentType;
  /** Complexity level */
  complexity: ContentComplexity;
  /** How this specifically supports the course topic */
  relevanceToCourse: string;
  /** Recommended placement context */
  suggestedPlacement: SuggestedPlacement;
}

/**
 * Structured analysis output for a single image
 */
export interface ImageAnalysis {
  /** Whether this image should be included in the course */
  include: boolean;

  /** If include === false, why it was rejected */
  rejectionReason?: ImageRejectionReason;

  /** Comprehensive description of image content (only if include === true) */
  description?: string;

  /** Educational concepts illustrated (only if include === true) */
  concepts?: string[];

  /** Pedagogical classification (only if include === true) */
  pedagogical?: PedagogicalMetadata;

  /** Technical confidence in analysis */
  confidence: AnalysisConfidence;
}

/**
 * Raw image input for analysis
 */
export interface ImageForAnalysis {
  /** Unique identifier */
  id: string;
  /** Base64 data URL or URL */
  src: string;
  /** Page number in source document */
  pageNumber: number;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Source file identifier */
  sourceFileId?: string;
  /** Source file name */
  sourceFileName?: string;
}

/**
 * Complete analyzed image record
 */
export interface AnalyzedImage extends ImageForAnalysis {
  /** Analysis result */
  analysis: ImageAnalysis;

  /** Processing metadata */
  processedAt: string;
  modelUsed: string;
}

/**
 * Analysis configuration
 */
export interface ImageAnalysisConfig {
  /** Model identifier string */
  modelString: string;
  /** API key for the provider */
  apiKey: string;
  /** Base URL for the provider */
  baseUrl?: string;
  /** Provider type */
  providerType?: string;
  /** Whether API key is required */
  requiresApiKey?: boolean;

  /** Concurrency limit for parallel analysis (default: 3) */
  concurrency?: number;

  /** Progress callback */
  onProgress?: (
    completed: number,
    total: number,
    currentId: string,
    status: 'analyzing' | 'included' | 'rejected'
  ) => void;
}

/**
 * Batch analysis result with metadata
 */
export interface ImageAnalysisResult {
  /** All analyzed images (both included and rejected) */
  analyses: AnalyzedImage[];

  /** Processing metadata */
  metadata: {
    /** Total images processed */
    totalImages: number;
    /** Images marked for inclusion */
    includedImages: number;
    /** Images rejected */
    rejectedImages: number;
    /** Images that failed analysis */
    failedImages: number;
    /** Processing time in milliseconds */
    processingTimeMs: number;
    /** Model used for analysis */
    modelUsed: string;
  };
}

/**
 * SSE event types for streaming analysis
 */
export type ImageAnalysisEvent =
  | {
      type: 'progress';
      data: {
        completed: number;
        total: number;
        currentId: string;
        status: 'analyzing' | 'included' | 'rejected';
      };
    }
  | {
      type: 'analysis';
      data: AnalyzedImage;
    }
  | {
      type: 'complete';
      data: ImageAnalysisResult;
    }
  | {
      type: 'error';
      error: string;
    };
