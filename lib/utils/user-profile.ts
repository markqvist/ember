/**
 * User Profile Utilities
 *
 * Shared functions for retrieving and formatting user profile information
 * from localStorage for use in AI generation and grading prompts.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('UserProfile');

const USER_PROFILE_STORAGE_KEY = 'user-profile-storage';

/**
 * Raw user profile data structure as stored by Zustand persist
 */
interface UserProfileStorage {
  state?: {
    nickname?: string;
    bio?: string;
    avatar?: string;
  };
  // Fallback for non-Zustand wrapped storage
  nickname?: string;
  bio?: string;
  avatar?: string;
}

/**
 * Retrieve user profile from localStorage and format for generation/grading prompts.
 *
 * @returns Formatted user profile string for prompt injection, or default message if not available
 */
export function getUserProfileFromStorage(): string {
  try {
    const storageData = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (!storageData) {
      log.debug('No user profile found in localStorage');
      return '*No specific learner information available*';
    }

    const parsed: UserProfileStorage = JSON.parse(storageData);

    // Handle both Zustand wrapped state and direct storage
    const nickname = parsed?.state?.nickname || parsed?.nickname || '';
    const bio = parsed?.state?.bio || parsed?.bio || '';

    if (!nickname && !bio) {
      log.debug('User profile exists but is empty');
      return '*No specific learner information available*';
    }

    const formattedProfile = `**Name:** ${nickname || 'Unknown'}${
      bio ? `\n**Provided Information:**\n${bio}` : '\n**Provided Information:** None'
    }\n\nConsider this learner's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`;

    log.debug('Successfully reconstructed userProfile from localStorage');
    return formattedProfile;
  } catch (error) {
    log.warn('Failed to parse user profile from localStorage:', error);
    return '*No specific learner information available*';
  }
}

/**
 * Check if a user profile is configured (has at least nickname or bio)
 *
 * @returns true if profile exists with meaningful data
 */
export function hasUserProfile(): boolean {
  try {
    const storageData = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (!storageData) return false;

    const parsed: UserProfileStorage = JSON.parse(storageData);
    const nickname = parsed?.state?.nickname || parsed?.nickname || '';
    const bio = parsed?.state?.bio || parsed?.bio || '';

    return !!(nickname || bio);
  } catch {
    return false;
  }
}
