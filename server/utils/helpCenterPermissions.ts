/**
 * Centralized Help Center Permission Mapping
 * 
 * This module provides a single source of truth for mapping chapter slugs
 * to permission fields, ensuring consistency across all help center endpoints.
 * 
 * Updated to work with JSON-based permission structure:
 * - chapterWiseHelp: User guide chapters
 * - api: API documentation chapters
 * - envVariable: Environment/configuration chapters
 * - troubleshooting: Troubleshooting articles
 */

export type HelpCenterCategory = 'chapterWiseHelp' | 'api' | 'envVariable' | 'troubleshooting';

export interface SlugPermissionMapping {
  category: HelpCenterCategory;
  key: string;
}

/**
 * Maps chapter slugs to their JSON category and key
 * Used by:
 * - server/routes/help.ts (detail and list endpoints)
 * - server/routes.ts (accessible-chapters endpoint)
 */
export const SLUG_TO_PERMISSION_MAP: Record<string, SlugPermissionMapping> = {
  // User Guide Chapters (chapterWiseHelp category)
  'login-session-basics': { category: 'chapterWiseHelp', key: 'getting_started' },
  'file-management': { category: 'chapterWiseHelp', key: 'file_management' },
  'user-management': { category: 'chapterWiseHelp', key: 'user_management' },
  'storage-management': { category: 'chapterWiseHelp', key: 'storage_management' },
  'partner-organizations': { category: 'chapterWiseHelp', key: 'organization_management' },
  'roles-permissions': { category: 'chapterWiseHelp', key: 'role_permission_management' },
  'data-protection': { category: 'chapterWiseHelp', key: 'data_protection' },
  'data-lifecycle-management': { category: 'chapterWiseHelp', key: 'data_lifecycle_management' },
  'ai-agents': { category: 'chapterWiseHelp', key: 'ai_agent_management' },
  'activity-logs-audit': { category: 'chapterWiseHelp', key: 'activity_logging' },
  'sftp-local-users': { category: 'chapterWiseHelp', key: 'sftp_local_users' },
  'pgp-key-management': { category: 'chapterWiseHelp', key: 'pgp_key_management' },
  'content-understanding': { category: 'chapterWiseHelp', key: 'content_understanding' },
  'document-translation': { category: 'chapterWiseHelp', key: 'document_translation' },
  'siem-sentinel-integration': { category: 'chapterWiseHelp', key: 'siem_sentinel_integration' },
  'foundry-ai-chat-playground': { category: 'chapterWiseHelp', key: 'foundry_ai_chat_playground' },
  'cmk-encryption': { category: 'chapterWiseHelp', key: 'cmk_encryption' },
  'customer-onboarding': { category: 'chapterWiseHelp', key: 'customer_onboarding' },
  'transfer-reports': { category: 'chapterWiseHelp', key: 'transfer_reports' },
  'answer-sheet-evaluation': { category: 'chapterWiseHelp', key: 'answer_sheet_evaluation' },
  
  // API Documentation (api category)
  'api-integration-guide': { category: 'api', key: 'api_integration_guide' },
  
  // Environment Variables (envVariable category)
  'environment-variables': { category: 'envVariable', key: 'configuration_settings' },
  
  // Troubleshooting (troubleshooting category)
  'malware-scanning-permission-error': { category: 'troubleshooting', key: 'malware_scanning' },
  'storage-creation-permission-error': { category: 'troubleshooting', key: 'storage_creation' },
  'eval-common-issues': { category: 'troubleshooting', key: 'eval_common_issues' },
};

/**
 * Legacy mapping for backward compatibility
 * Maps old flat permission field names to new JSON structure
 */
export const LEGACY_TO_NEW_MAP: Record<string, SlugPermissionMapping> = {
  'chapter0GettingStarted': { category: 'chapterWiseHelp', key: 'getting_started' },
  'chapter1UserManagement': { category: 'chapterWiseHelp', key: 'user_management' },
  'chapter2OrganizationManagement': { category: 'chapterWiseHelp', key: 'organization_management' },
  'chapter3RolePermissionManagement': { category: 'chapterWiseHelp', key: 'role_permission_management' },
  'chapter4FileManagement': { category: 'chapterWiseHelp', key: 'file_management' },
  'chapter5StorageManagement': { category: 'chapterWiseHelp', key: 'storage_management' },
  'chapter6DataProtection': { category: 'chapterWiseHelp', key: 'data_protection' },
  'chapter7AiAgentManagement': { category: 'chapterWiseHelp', key: 'ai_agent_management' },
  'chapter8ActivityLogging': { category: 'chapterWiseHelp', key: 'activity_logging' },
  'chapter9ConfigurationSettings': { category: 'envVariable', key: 'configuration_settings' },
  'chapter10Troubleshooting': { category: 'troubleshooting', key: 'malware_scanning' },
  'chapter11ApiIntegrationGuide': { category: 'api', key: 'api_integration_guide' },
  'chapter12DataLifecycleManagement': { category: 'chapterWiseHelp', key: 'data_lifecycle_management' },
  'chapter13SftpLocalUsers': { category: 'chapterWiseHelp', key: 'sftp_local_users' },
  'chapter14PgpKeyManagement': { category: 'chapterWiseHelp', key: 'pgp_key_management' },
  'chapter15ContentUnderstanding': { category: 'chapterWiseHelp', key: 'content_understanding' },
  'chapter16DocumentTranslation': { category: 'chapterWiseHelp', key: 'document_translation' },
  'chapter17SiemSentinelIntegration': { category: 'chapterWiseHelp', key: 'siem_sentinel_integration' },
  'chapter18FoundryAiChatPlayground': { category: 'chapterWiseHelp', key: 'foundry_ai_chat_playground' },
  'chapter19CustomerManagedKeyEncryption': { category: 'chapterWiseHelp', key: 'cmk_encryption' },
  'troubleshooting0MalwareScanning': { category: 'troubleshooting', key: 'malware_scanning' },
  'troubleshooting1StorageCreation': { category: 'troubleshooting', key: 'storage_creation' },
};

/**
 * Helper function to resolve permission by chapter slug
 * @param slug Chapter slug from URL
 * @returns Permission mapping or null if not found
 */
export function resolvePermissionBySlug(slug: string): SlugPermissionMapping | null {
  return SLUG_TO_PERMISSION_MAP[slug] || null;
}

/**
 * Check if user has permission for a chapter based on JSON permissions
 * @param permissions The help center permission data (JSON structure)
 * @param slug Chapter slug to check
 * @returns true if user has access
 */
export function hasChapterPermission(
  permissions: {
    chapterWiseHelp?: Record<string, boolean>;
    api?: Record<string, boolean>;
    envVariable?: Record<string, boolean>;
    troubleshooting?: Record<string, boolean>;
  },
  slug: string
): boolean {
  const mapping = SLUG_TO_PERMISSION_MAP[slug];
  if (!mapping) return false;
  
  const categoryPerms = permissions[mapping.category];
  if (!categoryPerms) return false;
  
  return categoryPerms[mapping.key] === true;
}

/**
 * Get all valid chapter slugs
 * Useful for validation and testing
 */
export function getAllValidSlugs(): string[] {
  return Object.keys(SLUG_TO_PERMISSION_MAP);
}

/**
 * Check if a slug is valid
 * @param slug Chapter slug to validate
 * @returns true if slug exists in mapping
 */
export function isValidSlug(slug: string): boolean {
  return slug in SLUG_TO_PERMISSION_MAP;
}

/**
 * Get all chapters in a specific category
 * @param category The permission category
 * @returns Array of {slug, key} pairs for that category
 */
export function getChaptersByCategory(category: HelpCenterCategory): Array<{slug: string, key: string}> {
  const result: Array<{slug: string, key: string}> = [];
  for (const [slug, mapping] of Object.entries(SLUG_TO_PERMISSION_MAP)) {
    if (mapping.category === category) {
      result.push({ slug, key: mapping.key });
    }
  }
  return result;
}
