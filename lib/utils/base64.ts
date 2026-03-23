/**
 * Base64 encoding/decoding utilities for binary data
 * Used for embedding media files in classroom persistence
 */

/**
 * Convert a Blob to base64 string
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove the data URL prefix (e.g., "data:audio/mp3;base64,")
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert base64 string to Blob
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Convert base64 string to Buffer (for server-side use)
 */
export function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

/**
 * Convert Buffer to base64 string (for server-side use)
 */
export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Get mime type from format/extension
 */
export function getMimeType(format: string): string {
  const formatLower = format.toLowerCase();
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    aac: 'audio/aac',
    webm: 'audio/webm',
    mp4: 'video/mp4',
    webm_video: 'video/webm',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return mimeTypes[formatLower] || 'application/octet-stream';
}

/**
 * Get file extension from mime type
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return extensions[mimeType] || 'bin';
}
