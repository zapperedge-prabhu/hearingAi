// Activity logging configuration based on environment variables
// Each activity type can be enabled/disabled individually for customer customization

export interface ActivityLogConfig {
  enabled: boolean;
  envVar: string;
}

// Helper function to check if an activity log is enabled
// Defaults to TRUE if not set (backward compatibility)
function isActivityLogEnabled(envVar: string): boolean {
  const value = process.env[envVar];
  // If not set, default to enabled for backward compatibility
  if (value === undefined || value === null || value === '') {
    console.log(`🔧 [ACTIVITY LOG CONFIG] ${envVar} not set - DEFAULTING TO ENABLED`);
    return true;
  }
  // Explicitly check for true/false values
  const enabled = value === 'true' || value === 'TRUE' || value === '1';
  console.log(`🔧 [ACTIVITY LOG CONFIG] ${envVar}=${value} - ${enabled ? 'ENABLED' : 'DISABLED'}`);
  return enabled;
}

// Activity log configuration mapping
export const activityLogConfig: Record<string, ActivityLogConfig> = {
  // AUTHENTICATION
  'LOGIN': { enabled: isActivityLogEnabled('ZAPPER_LOG_LOGIN'), envVar: 'ZAPPER_LOG_LOGIN' },
  'LOGOUT': { enabled: isActivityLogEnabled('ZAPPER_LOG_LOGOUT'), envVar: 'ZAPPER_LOG_LOGOUT' },
  'LOGIN_FAILED': { enabled: isActivityLogEnabled('ZAPPER_LOG_LOGIN_FAILED'), envVar: 'ZAPPER_LOG_LOGIN_FAILED' },

  // FILE MANAGEMENT
  'UPLOAD_FILE': { enabled: isActivityLogEnabled('ZAPPER_LOG_UPLOAD_FILE'), envVar: 'ZAPPER_LOG_UPLOAD_FILE' },
  'DOWNLOAD_FILE': { enabled: isActivityLogEnabled('ZAPPER_LOG_DOWNLOAD_FILE'), envVar: 'ZAPPER_LOG_DOWNLOAD_FILE' },
  'DELETE_FILE': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_FILE'), envVar: 'ZAPPER_LOG_DELETE_FILE' },
  'RENAME_FILE': { enabled: isActivityLogEnabled('ZAPPER_LOG_RENAME_FILE'), envVar: 'ZAPPER_LOG_RENAME_FILE' },
  'RENAME_DIRECTORY': { enabled: isActivityLogEnabled('ZAPPER_LOG_RENAME_DIRECTORY'), envVar: 'ZAPPER_LOG_RENAME_DIRECTORY' },
  'CREATE_DIRECTORY': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_DIRECTORY'), envVar: 'ZAPPER_LOG_CREATE_DIRECTORY' },
  'DELETE_DIRECTORY': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_DIRECTORY'), envVar: 'ZAPPER_LOG_DELETE_DIRECTORY' },
  'DOWNLOAD_DIRECTORY': { enabled: isActivityLogEnabled('ZAPPER_LOG_DOWNLOAD_DIRECTORY'), envVar: 'ZAPPER_LOG_DOWNLOAD_DIRECTORY' },
  'DOWNLOAD_DIRECTORY_ASYNC': { enabled: isActivityLogEnabled('ZAPPER_LOG_DOWNLOAD_DIRECTORY'), envVar: 'ZAPPER_LOG_DOWNLOAD_DIRECTORY' },
  'VIEW_FILES': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_FILES'), envVar: 'ZAPPER_LOG_VIEW_FILES' },
  'PREVIEW_FILE': { enabled: isActivityLogEnabled('ZAPPER_LOG_PREVIEW_FILE'), envVar: 'ZAPPER_LOG_PREVIEW_FILE' },
  'REHYDRATE_FILE': { enabled: isActivityLogEnabled('ZAPPER_LOG_REHYDRATE_FILE'), envVar: 'ZAPPER_LOG_REHYDRATE_FILE' },
  'SEARCH_FILES': { enabled: isActivityLogEnabled('ZAPPER_LOG_SEARCH_FILES'), envVar: 'ZAPPER_LOG_SEARCH_FILES' },

  // STORAGE MANAGEMENT
  'CREATE_STORAGE_ACCOUNT': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_STORAGE_ACCOUNT'), envVar: 'ZAPPER_LOG_CREATE_STORAGE_ACCOUNT' },
  'DELETE_STORAGE_ACCOUNT': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_STORAGE_ACCOUNT'), envVar: 'ZAPPER_LOG_DELETE_STORAGE_ACCOUNT' },
  'VIEW_STORAGE_ACCOUNTS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_STORAGE_ACCOUNTS'), envVar: 'ZAPPER_LOG_VIEW_STORAGE_ACCOUNTS' },
  'VIEW_ALL_STORAGE_ACCOUNTS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_STORAGE_ACCOUNTS'), envVar: 'ZAPPER_LOG_VIEW_STORAGE_ACCOUNTS' },
  'CREATE_ADLS_STORAGE': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_STORAGE_ACCOUNT'), envVar: 'ZAPPER_LOG_CREATE_STORAGE_ACCOUNT' },
  'DELETE_ADLS_STORAGE': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_STORAGE_ACCOUNT'), envVar: 'ZAPPER_LOG_DELETE_STORAGE_ACCOUNT' },
  'VIEW_ADLS_STORAGE_ACCOUNTS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_STORAGE_ACCOUNTS'), envVar: 'ZAPPER_LOG_VIEW_STORAGE_ACCOUNTS' },
  'CREATE_CONTAINER': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_CONTAINER'), envVar: 'ZAPPER_LOG_CREATE_CONTAINER' },
  'CONFIGURE_CORS': { enabled: isActivityLogEnabled('ZAPPER_LOG_CONFIGURE_CORS'), envVar: 'ZAPPER_LOG_CONFIGURE_CORS' },
  'CONFIGURE_DATA_PROTECTION': { enabled: isActivityLogEnabled('ZAPPER_LOG_CONFIGURE_DATA_PROTECTION'), envVar: 'ZAPPER_LOG_CONFIGURE_DATA_PROTECTION' },
  'CONFIGURE_DATA_PROTECTION_BULK': { enabled: isActivityLogEnabled('ZAPPER_LOG_CONFIGURE_DATA_PROTECTION'), envVar: 'ZAPPER_LOG_CONFIGURE_DATA_PROTECTION' },
  'VIEW_DATA_PROTECTION_STATUS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_DATA_PROTECTION_STATUS'), envVar: 'ZAPPER_LOG_VIEW_DATA_PROTECTION_STATUS' },
  'VIEW_DATA_PROTECTION_STATUS_ALL': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_DATA_PROTECTION_STATUS'), envVar: 'ZAPPER_LOG_VIEW_DATA_PROTECTION_STATUS' },
  'CONFIGURE_DATA_LIFECYCLE': { enabled: isActivityLogEnabled('ZAPPER_LOG_CONFIGURE_DATA_LIFECYCLE'), envVar: 'ZAPPER_LOG_CONFIGURE_DATA_LIFECYCLE' },
  'VIEW_DATA_LIFECYCLE_RULES': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_DATA_LIFECYCLE_RULES'), envVar: 'ZAPPER_LOG_VIEW_DATA_LIFECYCLE_RULES' },
  'DELETE_DATA_LIFECYCLE_RULE': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_DATA_LIFECYCLE_RULE'), envVar: 'ZAPPER_LOG_DELETE_DATA_LIFECYCLE_RULE' },
  'ENABLE_SFTP': { enabled: isActivityLogEnabled('ZAPPER_LOG_ENABLE_SFTP'), envVar: 'ZAPPER_LOG_ENABLE_SFTP' },
  'DISABLE_SFTP': { enabled: isActivityLogEnabled('ZAPPER_LOG_DISABLE_SFTP'), envVar: 'ZAPPER_LOG_DISABLE_SFTP' },
  'VIEW_SFTP_STATUS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_SFTP_STATUS'), envVar: 'ZAPPER_LOG_VIEW_SFTP_STATUS' },

  // USER MANAGEMENT
  'CREATE_USER': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_USER'), envVar: 'ZAPPER_LOG_CREATE_USER' },
  'UPDATE_USER': { enabled: isActivityLogEnabled('ZAPPER_LOG_UPDATE_USER'), envVar: 'ZAPPER_LOG_UPDATE_USER' },
  'DELETE_USER': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_USER'), envVar: 'ZAPPER_LOG_DELETE_USER' },
  'VIEW_USERS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_USERS'), envVar: 'ZAPPER_LOG_VIEW_USERS' },
  'ENABLE_USER_ROLE': { enabled: isActivityLogEnabled('ZAPPER_LOG_ENABLE_USER_ROLE'), envVar: 'ZAPPER_LOG_ENABLE_USER_ROLE' },
  'DISABLE_USER_ROLE': { enabled: isActivityLogEnabled('ZAPPER_LOG_DISABLE_USER_ROLE'), envVar: 'ZAPPER_LOG_DISABLE_USER_ROLE' },
  'DELETE_USER_ROLE': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_USER_ROLE'), envVar: 'ZAPPER_LOG_DELETE_USER_ROLE' },

  // ORGANIZATION MANAGEMENT
  'CREATE_ORGANIZATION': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_ORGANIZATION'), envVar: 'ZAPPER_LOG_CREATE_ORGANIZATION' },
  'UPDATE_ORGANIZATION': { enabled: isActivityLogEnabled('ZAPPER_LOG_UPDATE_ORGANIZATION'), envVar: 'ZAPPER_LOG_UPDATE_ORGANIZATION' },
  'DELETE_ORGANIZATION': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_ORGANIZATION'), envVar: 'ZAPPER_LOG_DELETE_ORGANIZATION' },
  'VIEW_ORGANIZATIONS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_ORGANIZATIONS'), envVar: 'ZAPPER_LOG_VIEW_ORGANIZATIONS' },

  // ROLE MANAGEMENT
  'CREATE_ROLE': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_ROLE'), envVar: 'ZAPPER_LOG_CREATE_ROLE' },
  'UPDATE_ROLE': { enabled: isActivityLogEnabled('ZAPPER_LOG_UPDATE_ROLE'), envVar: 'ZAPPER_LOG_UPDATE_ROLE' },
  'DELETE_ROLE': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_ROLE'), envVar: 'ZAPPER_LOG_DELETE_ROLE' },
  'VIEW_ROLES': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_ROLES'), envVar: 'ZAPPER_LOG_VIEW_ROLES' },

  // AI AGENT MANAGEMENT
  'CREATE_AI_AGENT': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_AI_AGENT'), envVar: 'ZAPPER_LOG_CREATE_AI_AGENT' },
  'UPDATE_AI_AGENT': { enabled: isActivityLogEnabled('ZAPPER_LOG_UPDATE_AI_AGENT'), envVar: 'ZAPPER_LOG_UPDATE_AI_AGENT' },
  'DELETE_AI_AGENT': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_AI_AGENT'), envVar: 'ZAPPER_LOG_DELETE_AI_AGENT' },
  'VIEW_AI_AGENTS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_AI_AGENTS'), envVar: 'ZAPPER_LOG_VIEW_AI_AGENTS' },
  'RUN_AI_AGENT': { enabled: isActivityLogEnabled('ZAPPER_LOG_RUN_AI_AGENT'), envVar: 'ZAPPER_LOG_RUN_AI_AGENT' },

  // PGP KEY MANAGEMENT
  'PGP_KEY_GENERATED': { enabled: isActivityLogEnabled('ZAPPER_LOG_PGP_KEY_GENERATE'), envVar: 'ZAPPER_LOG_PGP_KEY_GENERATE' },
  'PGP_KEY_IMPORTED': { enabled: isActivityLogEnabled('ZAPPER_LOG_PGP_KEY_IMPORT'), envVar: 'ZAPPER_LOG_PGP_KEY_IMPORT' },
  'PGP_KEY_DELETED': { enabled: isActivityLogEnabled('ZAPPER_LOG_PGP_KEY_DELETE'), envVar: 'ZAPPER_LOG_PGP_KEY_DELETE' },
  'VIEW_PGP_KEYS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_PGP_KEYS'), envVar: 'ZAPPER_LOG_VIEW_PGP_KEYS' },

  // PGP ENCRYPTION/DECRYPTION OPERATIONS
  'FILE_ENCRYPTED': { enabled: isActivityLogEnabled('ZAPPER_LOG_FILE_ENCRYPT'), envVar: 'ZAPPER_LOG_FILE_ENCRYPT' },
  'FILE_DECRYPTED': { enabled: isActivityLogEnabled('ZAPPER_LOG_FILE_DECRYPT'), envVar: 'ZAPPER_LOG_FILE_DECRYPT' },
  'FILE_DECRYPTED_TO_FOLDER': { enabled: isActivityLogEnabled('ZAPPER_LOG_FILE_DECRYPT'), envVar: 'ZAPPER_LOG_FILE_DECRYPT' },
  'FILE_DECRYPT_FAILED': { enabled: isActivityLogEnabled('ZAPPER_LOG_FILE_DECRYPT_FAILED'), envVar: 'ZAPPER_LOG_FILE_DECRYPT_FAILED' },
  'FILE_ENCRYPT_FAILED': { enabled: isActivityLogEnabled('ZAPPER_LOG_FILE_ENCRYPT_FAILED'), envVar: 'ZAPPER_LOG_FILE_ENCRYPT_FAILED' },

  // SIEM RULES MANAGEMENT
  'INSTALL_SENTINEL_RULE': { enabled: isActivityLogEnabled('ZAPPER_LOG_INSTALL_SENTINEL_RULE'), envVar: 'ZAPPER_LOG_INSTALL_SENTINEL_RULE' },
  'DELETE_SENTINEL_RULE': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_SENTINEL_RULE'), envVar: 'ZAPPER_LOG_DELETE_SENTINEL_RULE' },
  'ENABLE_SENTINEL_RULE': { enabled: isActivityLogEnabled('ZAPPER_LOG_ENABLE_SENTINEL_RULE'), envVar: 'ZAPPER_LOG_ENABLE_SENTINEL_RULE' },
  'DISABLE_SENTINEL_RULE': { enabled: isActivityLogEnabled('ZAPPER_LOG_DISABLE_SENTINEL_RULE'), envVar: 'ZAPPER_LOG_DISABLE_SENTINEL_RULE' },
  'VIEW_SENTINEL_RULES': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_SENTINEL_RULES'), envVar: 'ZAPPER_LOG_VIEW_SENTINEL_RULES' },

  // FOUNDRY AI MANAGEMENT
  'CREATE_FOUNDRY_RESOURCE': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_FOUNDRY_RESOURCE'), envVar: 'ZAPPER_LOG_CREATE_FOUNDRY_RESOURCE' },
  'UPDATE_FOUNDRY_RESOURCE': { enabled: isActivityLogEnabled('ZAPPER_LOG_UPDATE_FOUNDRY_RESOURCE'), envVar: 'ZAPPER_LOG_UPDATE_FOUNDRY_RESOURCE' },
  'DELETE_FOUNDRY_RESOURCE': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_FOUNDRY_RESOURCE'), envVar: 'ZAPPER_LOG_DELETE_FOUNDRY_RESOURCE' },
  'VIEW_FOUNDRY_RESOURCES': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_FOUNDRY_RESOURCES'), envVar: 'ZAPPER_LOG_VIEW_FOUNDRY_RESOURCES' },
  'CREATE_FOUNDRY_RESOURCE_SET': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_FOUNDRY_RESOURCE_SET'), envVar: 'ZAPPER_LOG_CREATE_FOUNDRY_RESOURCE_SET' },
  'UPDATE_FOUNDRY_RESOURCE_SET': { enabled: isActivityLogEnabled('ZAPPER_LOG_UPDATE_FOUNDRY_RESOURCE_SET'), envVar: 'ZAPPER_LOG_UPDATE_FOUNDRY_RESOURCE_SET' },
  'DELETE_FOUNDRY_RESOURCE_SET': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_FOUNDRY_RESOURCE_SET'), envVar: 'ZAPPER_LOG_DELETE_FOUNDRY_RESOURCE_SET' },
  'VIEW_FOUNDRY_RESOURCE_SETS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_FOUNDRY_RESOURCE_SETS'), envVar: 'ZAPPER_LOG_VIEW_FOUNDRY_RESOURCE_SETS' },
  'CREATE_FOUNDRY_HUB': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_FOUNDRY_HUB'), envVar: 'ZAPPER_LOG_CREATE_FOUNDRY_HUB' },
  'DELETE_FOUNDRY_HUB': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_FOUNDRY_HUB'), envVar: 'ZAPPER_LOG_DELETE_FOUNDRY_HUB' },
  'CREATE_FOUNDRY_PROJECT': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_FOUNDRY_PROJECT'), envVar: 'ZAPPER_LOG_CREATE_FOUNDRY_PROJECT' },
  'DELETE_FOUNDRY_PROJECT': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_FOUNDRY_PROJECT'), envVar: 'ZAPPER_LOG_DELETE_FOUNDRY_PROJECT' },
  'CREATE_FOUNDRY_DEPLOYMENT': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_FOUNDRY_DEPLOYMENT'), envVar: 'ZAPPER_LOG_CREATE_FOUNDRY_DEPLOYMENT' },
  'DELETE_FOUNDRY_DEPLOYMENT': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_FOUNDRY_DEPLOYMENT'), envVar: 'ZAPPER_LOG_DELETE_FOUNDRY_DEPLOYMENT' },
  'CREATE_FOUNDRY_AGENT': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_FOUNDRY_AGENT'), envVar: 'ZAPPER_LOG_CREATE_FOUNDRY_AGENT' },
  'UPDATE_FOUNDRY_AGENT': { enabled: isActivityLogEnabled('ZAPPER_LOG_UPDATE_FOUNDRY_AGENT'), envVar: 'ZAPPER_LOG_UPDATE_FOUNDRY_AGENT' },
  'DELETE_FOUNDRY_AGENT': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_FOUNDRY_AGENT'), envVar: 'ZAPPER_LOG_DELETE_FOUNDRY_AGENT' },
  'CREATE_FOUNDRY_VECTOR_STORE': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_FOUNDRY_VECTOR_STORE'), envVar: 'ZAPPER_LOG_CREATE_FOUNDRY_VECTOR_STORE' },
  'DELETE_FOUNDRY_VECTOR_STORE': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_FOUNDRY_VECTOR_STORE'), envVar: 'ZAPPER_LOG_DELETE_FOUNDRY_VECTOR_STORE' },
  'FOUNDRY_CHAT_THREAD_CREATED': { enabled: isActivityLogEnabled('ZAPPER_LOG_FOUNDRY_CHAT'), envVar: 'ZAPPER_LOG_FOUNDRY_CHAT' },
  'FOUNDRY_CHAT_MESSAGE': { enabled: isActivityLogEnabled('ZAPPER_LOG_FOUNDRY_CHAT'), envVar: 'ZAPPER_LOG_FOUNDRY_CHAT' },
  'FOUNDRY_FILE_IMPORT': { enabled: isActivityLogEnabled('ZAPPER_LOG_FOUNDRY_FILE_IMPORT'), envVar: 'ZAPPER_LOG_FOUNDRY_FILE_IMPORT' },

  // CONTENT UNDERSTANDING
  'RUN_CONTENT_ANALYSIS': { enabled: isActivityLogEnabled('ZAPPER_LOG_RUN_CONTENT_ANALYSIS'), envVar: 'ZAPPER_LOG_RUN_CONTENT_ANALYSIS' },
  'SAVE_CU_RESULT': { enabled: isActivityLogEnabled('ZAPPER_LOG_SAVE_CU_RESULT'), envVar: 'ZAPPER_LOG_SAVE_CU_RESULT' },
  'DELETE_CU_RESULT': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_CU_RESULT'), envVar: 'ZAPPER_LOG_DELETE_CU_RESULT' },
  'VIEW_CU_RESULTS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_CU_RESULTS'), envVar: 'ZAPPER_LOG_VIEW_CU_RESULTS' },
  'TRANSLATE_DOCUMENT': { enabled: isActivityLogEnabled('ZAPPER_LOG_TRANSLATE_DOCUMENT'), envVar: 'ZAPPER_LOG_TRANSLATE_DOCUMENT' },
  'DELETE_TRANSLATED_DOCUMENT': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_TRANSLATED_DOCUMENT'), envVar: 'ZAPPER_LOG_DELETE_TRANSLATED_DOCUMENT' },

  // SFTP LOCAL USER MANAGEMENT
  'CREATE_SFTP_LOCAL_USER': { enabled: isActivityLogEnabled('ZAPPER_LOG_CREATE_SFTP_LOCAL_USER'), envVar: 'ZAPPER_LOG_CREATE_SFTP_LOCAL_USER' },
  'UPDATE_SFTP_LOCAL_USER': { enabled: isActivityLogEnabled('ZAPPER_LOG_UPDATE_SFTP_LOCAL_USER'), envVar: 'ZAPPER_LOG_UPDATE_SFTP_LOCAL_USER' },
  'DELETE_SFTP_LOCAL_USER': { enabled: isActivityLogEnabled('ZAPPER_LOG_DELETE_SFTP_LOCAL_USER'), envVar: 'ZAPPER_LOG_DELETE_SFTP_LOCAL_USER' },
  'DISABLE_SFTP_LOCAL_USER': { enabled: isActivityLogEnabled('ZAPPER_LOG_DISABLE_SFTP_LOCAL_USER'), envVar: 'ZAPPER_LOG_DISABLE_SFTP_LOCAL_USER' },
  'VIEW_SFTP_LOCAL_USERS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_SFTP_LOCAL_USERS'), envVar: 'ZAPPER_LOG_VIEW_SFTP_LOCAL_USERS' },
  'ROTATE_SFTP_SSH_KEY': { enabled: isActivityLogEnabled('ZAPPER_LOG_ROTATE_SFTP_SSH_KEY'), envVar: 'ZAPPER_LOG_ROTATE_SFTP_SSH_KEY' },
  'ROTATE_SFTP_PASSWORD': { enabled: isActivityLogEnabled('ZAPPER_LOG_ROTATE_SFTP_PASSWORD'), envVar: 'ZAPPER_LOG_ROTATE_SFTP_PASSWORD' },
  'MAP_SFTP_USER': { enabled: isActivityLogEnabled('ZAPPER_LOG_MAP_SFTP_USER'), envVar: 'ZAPPER_LOG_MAP_SFTP_USER' },
  'VIEW_SFTP_SELF_ACCESS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_SFTP_SELF_ACCESS'), envVar: 'ZAPPER_LOG_VIEW_SFTP_SELF_ACCESS' },
  'DOWNLOAD_SFTP_CREDENTIALS': { enabled: isActivityLogEnabled('ZAPPER_LOG_DOWNLOAD_SFTP_CREDENTIALS'), envVar: 'ZAPPER_LOG_DOWNLOAD_SFTP_CREDENTIALS' },

  // CUSTOMER ONBOARDING
  'ONBOARDING_UPLOAD': { enabled: isActivityLogEnabled('ZAPPER_LOG_ONBOARDING_UPLOAD'), envVar: 'ZAPPER_LOG_ONBOARDING_UPLOAD' },
  'ONBOARDING_COMMIT': { enabled: isActivityLogEnabled('ZAPPER_LOG_ONBOARDING_COMMIT'), envVar: 'ZAPPER_LOG_ONBOARDING_COMMIT' },
  'ONBOARDING_COMMIT_SUCCESS': { enabled: isActivityLogEnabled('ZAPPER_LOG_ONBOARDING_COMMIT'), envVar: 'ZAPPER_LOG_ONBOARDING_COMMIT' },
  'ONBOARDING_COMMIT_PARTIAL': { enabled: isActivityLogEnabled('ZAPPER_LOG_ONBOARDING_COMMIT'), envVar: 'ZAPPER_LOG_ONBOARDING_COMMIT' },
  'ONBOARDING_COMMIT_FAILED': { enabled: isActivityLogEnabled('ZAPPER_LOG_ONBOARDING_COMMIT'), envVar: 'ZAPPER_LOG_ONBOARDING_COMMIT' },
  'ONBOARDING_RETRY': { enabled: isActivityLogEnabled('ZAPPER_LOG_ONBOARDING_RETRY'), envVar: 'ZAPPER_LOG_ONBOARDING_RETRY' },
  'ONBOARDING_DELETE_JOB': { enabled: isActivityLogEnabled('ZAPPER_LOG_ONBOARDING_DELETE'), envVar: 'ZAPPER_LOG_ONBOARDING_DELETE' },
  'ONBOARDING_VIEW_JOBS': { enabled: isActivityLogEnabled('ZAPPER_LOG_ONBOARDING_VIEW'), envVar: 'ZAPPER_LOG_ONBOARDING_VIEW' },

  // GEO-FENCING
  'GEO_ACCESS_ALLOWED': { enabled: isActivityLogEnabled('ZAPPER_LOG_GEO_ACCESS'), envVar: 'ZAPPER_LOG_GEO_ACCESS' },
  'GEO_ACCESS_ALLOWED_AUDIT': { enabled: isActivityLogEnabled('ZAPPER_LOG_GEO_ACCESS'), envVar: 'ZAPPER_LOG_GEO_ACCESS' },
  'GEO_ACCESS_BLOCKED': { enabled: isActivityLogEnabled('ZAPPER_LOG_GEO_ACCESS'), envVar: 'ZAPPER_LOG_GEO_ACCESS' },
  'UPDATE_GEO_FENCING': { enabled: isActivityLogEnabled('ZAPPER_LOG_UPDATE_GEO_FENCING'), envVar: 'ZAPPER_LOG_UPDATE_GEO_FENCING' },

  // INVENTORY
  'VIEW_INVENTORY': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_INVENTORY'), envVar: 'ZAPPER_LOG_VIEW_INVENTORY' },
  'CONFIGURE_INVENTORY': { enabled: isActivityLogEnabled('ZAPPER_LOG_CONFIGURE_INVENTORY'), envVar: 'ZAPPER_LOG_CONFIGURE_INVENTORY' },

  // EVAL MANAGEMENT
  'START_EVAL_JOB': { enabled: isActivityLogEnabled('ZAPPER_LOG_START_EVAL_JOB'), envVar: 'ZAPPER_LOG_START_EVAL_JOB' },
  'START_EVAL_BATCH': { enabled: isActivityLogEnabled('ZAPPER_LOG_START_EVAL_BATCH'), envVar: 'ZAPPER_LOG_START_EVAL_BATCH' },
  'VIEW_EVAL_JOBS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_EVAL_JOBS'), envVar: 'ZAPPER_LOG_VIEW_EVAL_JOBS' },
  'VIEW_EVAL_JOB': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_EVAL_JOB'), envVar: 'ZAPPER_LOG_VIEW_EVAL_JOB' },
  'REVIEW_EVAL_JOB': { enabled: isActivityLogEnabled('ZAPPER_LOG_REVIEW_EVAL_JOB'), envVar: 'ZAPPER_LOG_REVIEW_EVAL_JOB' },
  'FINALIZE_EVAL_JOB': { enabled: isActivityLogEnabled('ZAPPER_LOG_FINALIZE_EVAL_JOB'), envVar: 'ZAPPER_LOG_FINALIZE_EVAL_JOB' },
  'UPDATE_EVAL_QUESTION_REVIEWS': { enabled: isActivityLogEnabled('ZAPPER_LOG_UPDATE_EVAL_QUESTION_REVIEWS'), envVar: 'ZAPPER_LOG_UPDATE_EVAL_QUESTION_REVIEWS' },
  'VIEW_EVAL_REVIEW_HISTORY': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_EVAL_REVIEW_HISTORY'), envVar: 'ZAPPER_LOG_VIEW_EVAL_REVIEW_HISTORY' },
  'START_EVAL_BATCH_ANALYSIS': { enabled: isActivityLogEnabled('ZAPPER_LOG_START_EVAL_BATCH_ANALYSIS'), envVar: 'ZAPPER_LOG_START_EVAL_BATCH_ANALYSIS' },
  'VIEW_EVAL_BATCH_ANALYSIS': { enabled: isActivityLogEnabled('ZAPPER_LOG_VIEW_EVAL_BATCH_ANALYSIS'), envVar: 'ZAPPER_LOG_VIEW_EVAL_BATCH_ANALYSIS' },
};

// Function to check if a specific activity should be logged
export function shouldLogActivity(action: string): boolean {
  const config = activityLogConfig[action];
  if (!config) {
    // If not configured, default to logging (backward compatibility)
    console.warn(`⚠️ [ACTIVITY LOG] No configuration found for action: ${action}, defaulting to enabled`);
    return true;
  }
  const enabled = config.enabled;
  console.log(`✅ [ACTIVITY LOG CHECK] Action: ${action}, Enabled: ${enabled} (from ${config.envVar}=${process.env[config.envVar] || 'NOT_SET'})`);
  return enabled;
}

// Function to get all configured activity log environment variables for documentation
export function getAllActivityLogEnvVars(): string[] {
  const envVars = new Set<string>();
  Object.values(activityLogConfig).forEach(config => {
    envVars.add(config.envVar);
  });
  return Array.from(envVars).sort();
}
