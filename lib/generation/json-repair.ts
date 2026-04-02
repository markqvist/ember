/**
 * JSON parsing with fallback strategies for AI-generated responses.
 */

import { jsonrepair } from 'jsonrepair';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

/**
 * Pre-process JSON string to fix unescaped LaTeX commands before parsing.
 * 
 * This is critical because JSON.parse() will interpret sequences like \f, \t, \n, \r
 * as control characters, corrupting LaTeX commands like \frac, \text, etc.
 * 
 * The function detects when we're inside JSON string values and escapes
 * single backslashes followed by letters that would be interpreted as JSON escapes.
 * 
 * Key insight: We need to handle backslashes by looking at the NEXT character:
 * - If next char is a JSON escape char (f, n, r, t, b, etc.), we need to escape the backslash
 *   so JSON.parse sees \\f instead of \f, producing \f in output instead of form feed
 * - If next char is another backslash, it's already escaped - keep as-is
 */
function preProcessLatexEscapes(jsonStr: string): string {
  // Characters that can follow a backslash to form a valid JSON escape
  const jsonEscapeChars = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
  
  let result = '';
  let i = 0;
  let inString = false;
  
  while (i < jsonStr.length) {
    const char = jsonStr[i];
    
    // Track whether we're inside a JSON string
    if (char === '"') {
      // Check if this quote is escaped by counting preceding backslashes
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && jsonStr[j] === '\\') {
        backslashCount++;
        j--;
      }
      // Quote is escaped if odd number of backslashes precede it
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      result += char;
      i++;
    } else if (char === '\\' && inString && i + 1 < jsonStr.length) {
      const nextChar = jsonStr[i + 1];
      
      // Count how many consecutive backslashes we have
      let consecutiveBackslashes = 1;
      let j = i + 1;
      while (j < jsonStr.length && jsonStr[j] === '\\') {
        consecutiveBackslashes++;
        j++;
      }
      
      // If we have an odd number of backslashes, the last one is "unescaped"
      // and we need to check what follows
      if (consecutiveBackslashes % 2 === 1) {
        // Odd number of backslashes - the sequence ends with an unescaped backslash
        // Check what character comes after all the backslashes
        const charAfterBackslashes = jsonStr[i + consecutiveBackslashes];
        
        if (charAfterBackslashes && jsonEscapeChars.has(charAfterBackslashes)) {
          // The unescaped backslash is followed by a JSON escape character
          // We need to add another backslash to escape it
          // Example: \f becomes \\f (in source: '\\' + '\\' + 'f' = \\\\f)
          // After JSON.parse: \\f becomes \f in the output
          result += '\\'.repeat(consecutiveBackslashes + 1) + charAfterBackslashes;
          i += consecutiveBackslashes + 1;
        } else if (charAfterBackslashes && /[a-zA-Z]/.test(charAfterBackslashes)) {
          // Unescaped backslash followed by a letter that's NOT a JSON escape
          // This is a LaTeX command that needs the same treatment
          result += '\\'.repeat(consecutiveBackslashes + 1) + charAfterBackslashes;
          i += consecutiveBackslashes + 1;
        } else {
          // Other character after backslash(es) - keep as-is
          result += '\\'.repeat(consecutiveBackslashes);
          if (charAfterBackslashes) {
            result += charAfterBackslashes;
          }
          i += consecutiveBackslashes + (charAfterBackslashes ? 1 : 0);
        }
      } else {
        // Even number of backslashes - they're already properly escaped
        // Keep them as-is along with the next character
        const charAfterBackslashes = jsonStr[i + consecutiveBackslashes];
        result += '\\'.repeat(consecutiveBackslashes);
        if (charAfterBackslashes) {
          result += charAfterBackslashes;
        }
        i += consecutiveBackslashes + (charAfterBackslashes ? 1 : 0);
      }
    } else {
      result += char;
      i++;
    }
  }
  
  return result;
}

export function parseJsonResponse<T>(response: string): T | null {
  // Strategy 1: Try to extract JSON from markdown code blocks (may have multiple)
  const codeBlockMatches = response.matchAll(/```(?:json)?\s*([\s\S]*?)```/g);
  for (const match of codeBlockMatches) {
    const extracted = match[1].trim();
    // Only try if it looks like JSON (starts with { or [)
    if (extracted.startsWith('{') || extracted.startsWith('[')) {
      const result = tryParseJson<T>(extracted);
      if (result !== null) {
        log.debug('Successfully parsed JSON from code block');
        return result;
      }
    }
  }

  // Strategy 2: Try to find JSON structure directly in response (no code block)
  // Look for array or object start
  const jsonStartArray = response.indexOf('[');
  const jsonStartObject = response.indexOf('{');

  if (jsonStartArray !== -1 || jsonStartObject !== -1) {
    // Prefer the structure that appears first
    const startIndex =
      jsonStartArray === -1
        ? jsonStartObject
        : jsonStartObject === -1
          ? jsonStartArray
          : Math.min(jsonStartArray, jsonStartObject);

    // Find the matching close bracket
    let depth = 0;
    let endIndex = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < response.length; i++) {
      const char = response[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '[' || char === '{') depth++;
        else if (char === ']' || char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }

    if (endIndex !== -1) {
      const jsonStr = response.substring(startIndex, endIndex + 1);
      const result = tryParseJson<T>(jsonStr);
      if (result !== null) {
        log.debug('Successfully parsed JSON from response body');
        return result;
      }
    }
  }

  // Strategy 3: Last resort - try the whole response
  const result = tryParseJson<T>(response.trim());
  if (result !== null) {
    log.debug('Successfully parsed raw response as JSON');
    return result;
  }

  log.error('Failed to parse JSON from response');
  log.error('Raw response (first 500 chars):', response.substring(0, 500));

  return null;
}

/**
 * Try to parse JSON with various fixes for common AI response issues
 */
export function tryParseJson<T>(jsonStr: string): T | null {
  // Pre-process to fix unescaped LaTeX commands BEFORE first parse attempt
  // This is critical because JSON.parse() will corrupt \frac to <form feed>rac
  const preProcessed = preProcessLatexEscapes(jsonStr);
  
  // Attempt 1: Try parsing the pre-processed string
  try {
    return JSON.parse(preProcessed) as T;
  } catch {
    // Continue to fix attempts
  }

  // Attempt 2: Additional fixes for edge cases
  try {
    let fixed = preProcessed;

    // Fix: Handle any remaining LaTeX-style escapes inside string values
    // This catches cases the pre-processor might have missed
    fixed = fixed.replace(/"([^"]*?)"/g, (_match, content) => {
      // Double-escape any backslash followed by a letter (except valid JSON escapes)
      const fixedContent = content.replace(/\\([a-zA-Z])/g, '\\\\$1');
      return `"${fixedContent}"`;
    });

    // Fix 3: Try to fix truncated JSON arrays/objects
    const trimmed = fixed.trim();
    if (trimmed.startsWith('[') && !trimmed.endsWith(']')) {
      const lastCompleteObj = fixed.lastIndexOf('}');
      if (lastCompleteObj > 0) {
        fixed = fixed.substring(0, lastCompleteObj + 1) + ']';
        log.warn('Fixed truncated JSON array');
      }
    } else if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
      // Try to close incomplete object
      const openBraces = (fixed.match(/{/g) || []).length;
      const closeBraces = (fixed.match(/}/g) || []).length;
      if (openBraces > closeBraces) {
        fixed += '}'.repeat(openBraces - closeBraces);
        log.warn('Fixed truncated JSON object');
      }
    }

    return JSON.parse(fixed) as T;
  } catch {
    // Continue to next attempt
  }

  // Attempt 3: Use jsonrepair to fix malformed JSON (e.g. unescaped quotes in Chinese text)
  try {
    const repaired = jsonrepair(jsonStr);
    return JSON.parse(repaired) as T;
  } catch {
    // Continue to next attempt
  }

  // Attempt 4: More aggressive fixing - remove control characters
  try {
    let fixed = jsonStr;

    // Remove or escape control characters
    fixed = fixed.replace(/[\x00-\x1F\x7F]/g, (char) => {
      switch (char) {
        case '\n':
          return '\\n';
        case '\r':
          return '\\r';
        case '\t':
          return '\\t';
        default:
          return '';
      }
    });

    return JSON.parse(fixed) as T;
  } catch {
    return null;
  }
}
