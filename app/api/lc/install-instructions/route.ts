/**
 * LC Install Instructions API
 *
 * GET /api/lc/install-instructions
 * Returns platform-specific installation instructions for lc.
 */

import { getLCInstallInstructions } from '@/lib/research/server';
import { apiSuccess } from '@/lib/server/api-response';

export interface LCInstallInstructionsResponse {
  instructions: string;
  platform: string;
}

export async function GET() {
  const instructions = getLCInstallInstructions();
  const platform = process.platform;

  return apiSuccess({
    instructions,
    platform,
  } as unknown as Record<string, unknown>);
}
