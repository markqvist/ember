/**
 * Image Analysis API
 *
 * Analyzes images using vision-capable LLMs to determine pedagogical relevance.
 * Streams progress via Server-Sent Events (SSE).
 *
 * SSE Events:
 *   { type: 'progress', data: { completed, total, currentId, status } }
 *   { type: 'analysis', data: AnalyzedImage }
 *   { type: 'complete', data: ImageAnalysisResult }
 *   { type: 'error', error: string }
 */

import { NextRequest } from 'next/server';
import { analyzeImages } from '@/lib/analysis/image-analyzer';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { createLogger } from '@/lib/logger';
import type { ImageAnalysisContext, ImageForAnalysis } from '@/lib/types/image-analysis';

const log = createLogger('AnalyzeImages API');

export const maxDuration = 300;

/**
 * Heartbeat interval for SSE connection keepalive
 */
const HEARTBEAT_INTERVAL_MS = 15_000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { images, context } = body as {
      images: ImageForAnalysis[];
      context: ImageAnalysisContext;
    };

    // Validate required fields
    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ type: 'error', error: 'No images provided for analysis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!context || !context.requirement || !context.language) {
      return new Response(
        JSON.stringify({ type: 'error', error: 'Missing required context fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Resolve model from headers
    const { model: languageModel, modelInfo, modelString } = resolveModelFromHeaders(req);

    // Check vision capability - prioritize header from client (for custom models)
    // Fall back to server-side model info lookup (for built-in providers)
    const visionCapableHeader = req.headers.get('x-model-vision-capable');
    const hasVision = visionCapableHeader === 'true' || (!!modelInfo?.capabilities?.vision);
    if (!hasVision) {
      log.warn(`Model ${modelString} does not support vision, returning empty analysis`);
      return new Response(
        JSON.stringify({
          type: 'complete',
          data: {
            analyses: [],
            metadata: {
              totalImages: images.length,
              includedImages: 0,
              rejectedImages: images.length,
              failedImages: 0,
              processingTimeMs: 0,
              modelUsed: modelString,
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    log.info(`Starting image analysis: ${images.length} images using ${modelString}`);

    // Create SSE stream
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        // Heartbeat to prevent connection timeout
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

        const startHeartbeat = () => {
          stopHeartbeat();
          heartbeatTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`:heartbeat\n\n`));
            } catch {
              stopHeartbeat();
            }
          }, HEARTBEAT_INTERVAL_MS);
        };

        const stopHeartbeat = () => {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        };

        const sendEvent = (event: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch (error) {
            log.error('Failed to send SSE event:', error);
          }
        };

        try {
          startHeartbeat();

          // Extract provider configuration from headers (needed for custom providers)
          const providerType = req.headers.get('x-provider-type') || undefined;
          const requiresApiKey = req.headers.get('x-requires-api-key') === 'true';
          const apiKey = req.headers.get('x-api-key') || '';
          const baseUrl = req.headers.get('x-base-url') || '';

          // Run analysis with progress callbacks
          const result = await analyzeImages(images, context, {
            modelString,
            apiKey,
            baseUrl,
            providerType,
            requiresApiKey,
            concurrency: 1,
            onProgress: (completed, total, currentId, status) => {
              sendEvent({
                type: 'progress',
                data: { completed, total, currentId, status },
              });
            },
          });

          // Send individual analysis results
          for (const analysis of result.analyses) {
            sendEvent({
              type: 'analysis',
              data: analysis,
            });
          }

          // Send completion event
          sendEvent({
            type: 'complete',
            data: result,
          });

          log.info(
            `Image analysis complete: ${result.metadata.includedImages}/${result.metadata.totalImages} included`
          );
        } catch (error) {
          log.error('Image analysis failed:', error);
          sendEvent({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error during analysis',
          });
        } finally {
          stopHeartbeat();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    log.error('API error:', error);
    return new Response(
      JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
