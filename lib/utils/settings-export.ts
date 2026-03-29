/**
 * Settings Export/Import Utilities
 * Handles exporting and importing all application configuration data
 * for backup, migration, and offline deployment scenarios.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('SettingsExport');

/** Current export format version for migration support */
const EXPORT_VERSION = 1;

/** All localStorage keys that need to be captured */
const STORAGE_KEYS = {
  // Zustand persist stores
  zustand: [
    'settings-storage',
    'agent-registry-storage',
    'user-profile-storage',
  ],
  // Manual localStorage keys
  manual: [
    'locale',
    'theme',
    'recentClassroomsOpen',
    'requirementsDraft',
    'webSearchEnabled',
    'generationLanguage',
  ],
} as const;

/** Export metadata structure */
interface ExportMetadata {
  version: number;
  exportedAt: string;
  appName: string;
  appVersion?: string;
}

/** Complete export data structure */
interface ExportData {
  metadata: ExportMetadata;
  data: Record<string, unknown>;
}

/** Import result structure */
interface ImportResult {
  success: boolean;
  importedKeys: string[];
  errors: string[];
}

/**
 * Export all settings to a JSON object
 */
export function exportSettings(): ExportData {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  // Collect all Zustand persist stores
  for (const key of STORAGE_KEYS.zustand) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) {
        data[key] = JSON.parse(value);
      }
    } catch (error) {
      errors.push(`Failed to export ${key}: ${error}`);
    }
  }

  // Collect all manual localStorage keys
  for (const key of STORAGE_KEYS.manual) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) {
        // Try to parse as JSON, fall back to raw string
        try {
          data[key] = JSON.parse(value);
        } catch {
          data[key] = value;
        }
      }
    } catch (error) {
      errors.push(`Failed to export ${key}: ${error}`);
    }
  }

  if (errors.length > 0) {
    log.warn('Export completed with errors:', errors);
  }

  return {
    metadata: {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      appName: 'Ember',
    },
    data,
  };
}

/**
 * Export settings and trigger a file download
 */
export function downloadSettingsExport(): void {
  const exportData = exportSettings();
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  link.download = `ember-settings-${timestamp}.json`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  log.info('Settings exported successfully');
}

/**
 * Validate imported data structure
 */
function validateImportData(importData: unknown): importData is ExportData {
  if (typeof importData !== 'object' || importData === null) {
    return false;
  }

  const data = importData as Record<string, unknown>;

  // Check metadata
  if (!data.metadata || typeof data.metadata !== 'object') {
    return false;
  }

  const metadata = data.metadata as Record<string, unknown>;
  if (typeof metadata.version !== 'number') {
    return false;
  }

  // Check data object
  if (!data.data || typeof data.data !== 'object') {
    return false;
  }

  return true;
}

/**
 * Import settings from a parsed JSON object
 */
export function importSettings(importData: unknown, merge = false): ImportResult {
  const result: ImportResult = {
    success: false,
    importedKeys: [],
    errors: [],
  };

  // Validate structure
  if (!validateImportData(importData)) {
    result.errors.push('Invalid import file format');
    return result;
  }

  const { metadata, data } = importData;

  log.info(`Importing settings (format version: ${metadata.version})`);

  // Version migration logic can be added here in the future
  // if (metadata.version < EXPORT_VERSION) { ... }

  // Import all keys
  for (const [key, value] of Object.entries(data)) {
    try {
      // Skip if merging and key already exists (optional behavior)
      if (merge && localStorage.getItem(key) !== null) {
        continue;
      }

      // Serialize value for storage
      let storageValue: string;
      if (value === null || value === undefined) {
        continue; // Skip null/undefined values
      } else if (typeof value === 'string') {
        storageValue = value;
      } else {
        storageValue = JSON.stringify(value);
      }

      localStorage.setItem(key, storageValue);
      result.importedKeys.push(key);
    } catch (error) {
      result.errors.push(`Failed to import ${key}: ${error}`);
    }
  }

  result.success = result.errors.length === 0;

  if (result.errors.length > 0) {
    log.warn('Import completed with errors:', result.errors);
  } else {
    log.info('Settings imported successfully:', result.importedKeys);
  }

  return result;
}

/**
 * Read and parse an import file
 */
export async function readImportFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);
        resolve(data);
      } catch (error) {
        reject(new Error('Failed to parse import file: invalid JSON'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read import file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Get a summary of what will be imported
 */
export function getImportSummary(importData: unknown): {
  valid: boolean;
  version?: number;
  exportedAt?: string;
  keys: string[];
  error?: string;
} {
  if (!validateImportData(importData)) {
    return { valid: false, keys: [], error: 'Invalid import file format' };
  }

  const { metadata, data } = importData;

  return {
    valid: true,
    version: metadata.version,
    exportedAt: metadata.exportedAt,
    keys: Object.keys(data),
  };
}

export type { ExportData, ExportMetadata, ImportResult };
