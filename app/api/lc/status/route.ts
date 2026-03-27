/**
 * LC Status API
 *
 * GET /api/lc/status
 * Returns the availability status of lc (Humanity's Last Command) on the server.
 * This endpoint is used by client components to check if lc is configured.
 */

import { isLCAvailable, getLCVersion } from '@/lib/research/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('LCStatusAPI');

export interface LCStatusResponse {
  available: boolean;
  version?: string;
  checkedAt: string;
}

export async function GET() {
  try {
    log.info('[LCStatusAPI] Checking lc availability...');

    const [available, version] = await Promise.all([
      isLCAvailable(),
      getLCVersion(),
    ]);

    const response: LCStatusResponse = {
      available,
      version: version || undefined,
      checkedAt: new Date().toISOString(),
    };

    log.info(`[LCStatusAPI] lc availability: ${available}`);

    return apiSuccess(response as unknown as Record<string, unknown>);
  } catch (err) {
    log.error('[LCStatusAPI] Error checking lc status:', err);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to check lc status',
      err instanceof Error ? err.message : undefined
    );
  }
}
