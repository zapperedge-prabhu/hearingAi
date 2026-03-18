/**
 * Help Center Chapter Mapping Utility
 * Maps chapter IDs (URL params) to permission field names in the database
 */

export const HELP_CENTER_CHAPTER_MAP: Record<string, string> = {
  '0': 'chapter0GettingStarted',
  '1': 'chapter1UserManagement',
  '2': 'chapter2OrganizationManagement',
  '3': 'chapter3RolePermissionManagement',
  '4': 'chapter4FileManagement',
  '5': 'chapter5StorageManagement',
  '6': 'chapter6DataProtection',
  '7': 'chapter7AiAgentManagement',
  '8': 'chapter8ActivityLogging',
  '9': 'chapter9ConfigurationSettings',
  '10': 'chapter10Troubleshooting',
  '11': 'chapter11ApiIntegrationGuide',
  '12': 'chapter12DataLifecycleManagement',
  '13': 'chapter13SftpLocalUsers',
  '14': 'chapter14PgpKeyManagement',
  '15': 'chapter15ContentUnderstanding',
  '16': 'chapter16DocumentTranslation',
  '17': 'chapter17SiemSentinelIntegration',
  '18': 'chapter18FoundryAiChatPlayground',
  '19': 'chapter19CustomerManagedKeyEncryption',
  '20': 'chapter20TransferReports'
};

export const HELP_CENTER_CHAPTER_NAMES: Record<string, string> = {
  '0': 'Getting Started',
  '1': 'User Management',
  '2': 'Organization Management',
  '3': 'Role & Permission Management',
  '4': 'File Management',
  '5': 'Storage Management',
  '6': 'Data Protection',
  '7': 'AI Agent Management',
  '8': 'Activity Logging',
  '9': 'Configuration Settings',
  '10': 'Troubleshooting',
  '11': 'API Integration Guide',
  '12': 'Data Lifecycle Management',
  '13': 'SFTP Local Users',
  '14': 'PGP Key Management',
  '15': 'Content Understanding',
  '16': 'Document Translation',
  '17': 'SIEM & Sentinel Integration',
  '18': 'Foundry AI & Chat Playground',
  '19': 'Customer-Managed Key Encryption',
  '20': 'Transfer Reports'
};

/**
 * Validates if a chapter ID is valid
 */
export function isValidChapterId(chapterId: string): boolean {
  return chapterId in HELP_CENTER_CHAPTER_MAP;
}

/**
 * Gets the permission field name for a chapter ID
 */
export function getPermissionFieldForChapter(chapterId: string): string | null {
  return HELP_CENTER_CHAPTER_MAP[chapterId] || null;
}

/**
 * Gets the chapter name for a chapter ID
 */
export function getChapterName(chapterId: string): string | null {
  return HELP_CENTER_CHAPTER_NAMES[chapterId] || null;
}
