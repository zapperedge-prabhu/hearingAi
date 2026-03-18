import { storage } from "./storage";
import { InsertUserActivity } from "@shared/schema";
import { SentinelLogger } from "./sentinelLogger";

// Activity action types
export const ActivityActions = {
  // Authentication
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  
  // User Management
  CREATE_USER: 'CREATE_USER',
  UPDATE_USER: 'UPDATE_USER',
  DELETE_USER: 'DELETE_USER',
  VIEW_USERS: 'VIEW_USERS',
  
  // Role Management
  CREATE_ROLE: 'CREATE_ROLE',
  UPDATE_ROLE: 'UPDATE_ROLE',
  DELETE_ROLE: 'DELETE_ROLE',
  VIEW_ROLES: 'VIEW_ROLES',
  ASSIGN_ROLE_PERMISSION: 'ASSIGN_ROLE_PERMISSION',
  REMOVE_ROLE_PERMISSION: 'REMOVE_ROLE_PERMISSION',
  
  // Organization Management
  CREATE_ORGANIZATION: 'CREATE_ORGANIZATION',
  UPDATE_ORGANIZATION: 'UPDATE_ORGANIZATION',
  DELETE_ORGANIZATION: 'DELETE_ORGANIZATION',
  VIEW_ORGANIZATIONS: 'VIEW_ORGANIZATIONS',
  
  // File Management
  UPLOAD_FILE: 'UPLOAD_FILE',
  DOWNLOAD_FILE: 'DOWNLOAD_FILE',
  DOWNLOAD_DIRECTORY: 'DOWNLOAD_DIRECTORY',
  DELETE_FILE: 'DELETE_FILE',
  DELETE_DIRECTORY: 'DELETE_DIRECTORY',
  CREATE_DIRECTORY: 'CREATE_DIRECTORY',
  VIEW_FILES: 'VIEW_FILES',
  PREVIEW_FILE: 'PREVIEW_FILE',
  REHYDRATE_FILE: 'REHYDRATE_FILE',
  FILE_ENCRYPTED: 'FILE_ENCRYPTED',
  FILE_DECRYPTED: 'FILE_DECRYPTED',
  
  // Storage Management
  CREATE_STORAGE_ACCOUNT: 'CREATE_STORAGE_ACCOUNT',
  CREATE_CONTAINER: 'CREATE_CONTAINER',
  DELETE_STORAGE_ACCOUNT: 'DELETE_STORAGE_ACCOUNT',
  VIEW_STORAGE_ACCOUNTS: 'VIEW_STORAGE_ACCOUNTS',
  
  // PGP Key Management
  PGP_KEY_GENERATED: 'PGP_KEY_GENERATED',
  PGP_KEY_IMPORTED: 'PGP_KEY_IMPORTED',
  PGP_KEY_DELETED: 'PGP_KEY_DELETED',
  
  // System
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  VIEW_ACTIVITY_LOGS: 'VIEW_ACTIVITY_LOGS',
  
  // SIEM Rules Management
  INSTALL_SENTINEL_RULE: 'INSTALL_SENTINEL_RULE',
  DELETE_SENTINEL_RULE: 'DELETE_SENTINEL_RULE',
  ENABLE_SENTINEL_RULE: 'ENABLE_SENTINEL_RULE',
  DISABLE_SENTINEL_RULE: 'DISABLE_SENTINEL_RULE',
  VIEW_SENTINEL_RULES: 'VIEW_SENTINEL_RULES',
  
  // Foundry AI Management
  CREATE_FOUNDRY_RESOURCE: 'CREATE_FOUNDRY_RESOURCE',
  UPDATE_FOUNDRY_RESOURCE: 'UPDATE_FOUNDRY_RESOURCE',
  DELETE_FOUNDRY_RESOURCE: 'DELETE_FOUNDRY_RESOURCE',
  VIEW_FOUNDRY_RESOURCES: 'VIEW_FOUNDRY_RESOURCES',
  CREATE_FOUNDRY_RESOURCE_SET: 'CREATE_FOUNDRY_RESOURCE_SET',
  UPDATE_FOUNDRY_RESOURCE_SET: 'UPDATE_FOUNDRY_RESOURCE_SET',
  DELETE_FOUNDRY_RESOURCE_SET: 'DELETE_FOUNDRY_RESOURCE_SET',
  VIEW_FOUNDRY_RESOURCE_SETS: 'VIEW_FOUNDRY_RESOURCE_SETS',
  CREATE_FOUNDRY_HUB: 'CREATE_FOUNDRY_HUB',
  DELETE_FOUNDRY_HUB: 'DELETE_FOUNDRY_HUB',
  CREATE_FOUNDRY_PROJECT: 'CREATE_FOUNDRY_PROJECT',
  DELETE_FOUNDRY_PROJECT: 'DELETE_FOUNDRY_PROJECT',
  CREATE_FOUNDRY_DEPLOYMENT: 'CREATE_FOUNDRY_DEPLOYMENT',
  DELETE_FOUNDRY_DEPLOYMENT: 'DELETE_FOUNDRY_DEPLOYMENT',
  CREATE_FOUNDRY_AGENT: 'CREATE_FOUNDRY_AGENT',
  UPDATE_FOUNDRY_AGENT: 'UPDATE_FOUNDRY_AGENT',
  DELETE_FOUNDRY_AGENT: 'DELETE_FOUNDRY_AGENT',
  CREATE_FOUNDRY_VECTOR_STORE: 'CREATE_FOUNDRY_VECTOR_STORE',
  DELETE_FOUNDRY_VECTOR_STORE: 'DELETE_FOUNDRY_VECTOR_STORE',
  FOUNDRY_CHAT_THREAD_CREATED: 'FOUNDRY_CHAT_THREAD_CREATED',
  FOUNDRY_CHAT_MESSAGE: 'FOUNDRY_CHAT_MESSAGE',
  FOUNDRY_FILE_IMPORT: 'FOUNDRY_FILE_IMPORT',

  // Content Understanding
  RUN_CONTENT_ANALYSIS: 'RUN_CONTENT_ANALYSIS',
  SAVE_CU_RESULT: 'SAVE_CU_RESULT',
  DELETE_CU_RESULT: 'DELETE_CU_RESULT',
  VIEW_CU_RESULTS: 'VIEW_CU_RESULTS',
  TRANSLATE_DOCUMENT: 'TRANSLATE_DOCUMENT',
  DELETE_TRANSLATED_DOCUMENT: 'DELETE_TRANSLATED_DOCUMENT',

  // Customer Onboarding
  ONBOARDING_UPLOAD: 'ONBOARDING_UPLOAD',
  ONBOARDING_COMMIT: 'ONBOARDING_COMMIT',
  ONBOARDING_COMMIT_SUCCESS: 'ONBOARDING_COMMIT_SUCCESS',
  ONBOARDING_COMMIT_PARTIAL: 'ONBOARDING_COMMIT_PARTIAL',
  ONBOARDING_COMMIT_FAILED: 'ONBOARDING_COMMIT_FAILED',
  ONBOARDING_RETRY: 'ONBOARDING_RETRY',
  ONBOARDING_DELETE_JOB: 'ONBOARDING_DELETE_JOB',
  ONBOARDING_VIEW_JOBS: 'ONBOARDING_VIEW_JOBS',

  // Security
  UNAUTHORIZED_ORG_ACCESS_ATTEMPT: 'UNAUTHORIZED_ORG_ACCESS_ATTEMPT',

  // Geo-Fencing
  GEO_ACCESS_ALLOWED: 'GEO_ACCESS_ALLOWED',
  GEO_ACCESS_ALLOWED_AUDIT: 'GEO_ACCESS_ALLOWED_AUDIT',
  GEO_ACCESS_BLOCKED: 'GEO_ACCESS_BLOCKED',
  UPDATE_GEO_FENCING: 'UPDATE_GEO_FENCING',

  // Inventory
  VIEW_INVENTORY: 'VIEW_INVENTORY',
  CONFIGURE_INVENTORY: 'CONFIGURE_INVENTORY',

  // Eval (Exam Evaluation / Grading)
  START_EVAL_JOB: 'START_EVAL_JOB',
  START_EVAL_BATCH: 'START_EVAL_BATCH',
  VIEW_EVAL_JOBS: 'VIEW_EVAL_JOBS',
  VIEW_EVAL_JOB: 'VIEW_EVAL_JOB',
  REVIEW_EVAL_JOB: 'REVIEW_EVAL_JOB',
  FINALIZE_EVAL_JOB: 'FINALIZE_EVAL_JOB',
  UPDATE_EVAL_QUESTION_REVIEWS: 'UPDATE_EVAL_QUESTION_REVIEWS',
  VIEW_EVAL_REVIEW_HISTORY: 'VIEW_EVAL_REVIEW_HISTORY',
  START_EVAL_BATCH_ANALYSIS: 'START_EVAL_BATCH_ANALYSIS',
  VIEW_EVAL_BATCH_ANALYSIS: 'VIEW_EVAL_BATCH_ANALYSIS',
} as const;

// Activity categories
export const ActivityCategories = {
  AUTH: 'AUTH',
  USER_MANAGEMENT: 'USER_MANAGEMENT',
  ROLE_MANAGEMENT: 'ROLE_MANAGEMENT',
  ORGANIZATION_MANAGEMENT: 'ORGANIZATION_MANAGEMENT',
  FILE_MANAGEMENT: 'FILE_MANAGEMENT',
  STORAGE_MANAGEMENT: 'STORAGE_MANAGEMENT',
  SECURITY: 'SECURITY',
  SIEM_MANAGEMENT: 'SIEM_MANAGEMENT',
  FOUNDRY_AI_MANAGEMENT: 'FOUNDRY_AI_MANAGEMENT',
  CONTENT_UNDERSTANDING: 'CONTENT_UNDERSTANDING',
  CUSTOMER_ONBOARDING: 'CUSTOMER_ONBOARDING',
  GEO_FENCING: 'GEO_FENCING',
  EVAL_MANAGEMENT: 'EVAL_MANAGEMENT',
  SYSTEM: 'SYSTEM',
} as const;

// Resource types
export const ResourceTypes = {
  USER: 'USER',
  ROLE: 'ROLE',
  ORGANIZATION: 'ORGANIZATION',
  FILE: 'FILE',
  DIRECTORY: 'DIRECTORY',
  STORAGE_ACCOUNT: 'STORAGE_ACCOUNT',
  CONTAINER: 'CONTAINER',
  PERMISSION: 'PERMISSION',
  SESSION: 'SESSION',
  PGP_KEY: 'PGP_KEY',
  SENTINEL_RULE: 'SENTINEL_RULE',
  FOUNDRY_RESOURCE: 'FOUNDRY_RESOURCE',
  FOUNDRY_RESOURCE_SET: 'FOUNDRY_RESOURCE_SET',
  FOUNDRY_HUB: 'FOUNDRY_HUB',
  FOUNDRY_PROJECT: 'FOUNDRY_PROJECT',
  FOUNDRY_DEPLOYMENT: 'FOUNDRY_DEPLOYMENT',
  FOUNDRY_AGENT: 'FOUNDRY_AGENT',
  FOUNDRY_VECTOR_STORE: 'FOUNDRY_VECTOR_STORE',
  FOUNDRY_CHAT_THREAD: 'FOUNDRY_CHAT_THREAD',
  FOUNDRY_FILE: 'FOUNDRY_FILE',
  FOUNDRY_VECTOR_STORE_FILE: 'FOUNDRY_VECTOR_STORE_FILE',
  CU_RESULT: 'CU_RESULT',
  ONBOARDING_JOB: 'ONBOARDING_JOB',
  EVAL_JOB: 'EVAL_JOB',
  EVAL_BATCH: 'EVAL_BATCH',
} as const;

export type ActivityAction = typeof ActivityActions[keyof typeof ActivityActions];
export type ActivityCategory = typeof ActivityCategories[keyof typeof ActivityCategories];
export type ResourceType = typeof ResourceTypes[keyof typeof ResourceTypes];

interface ActivityLogData {
  userId: string;
  userName: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  action: ActivityAction;
  actionCategory: ActivityCategory;
  resource?: string;
  resourceType?: ResourceType;
  details?: Record<string, any>;
  actionTime?: Date;
  loginTime?: Date;
  logoutTime?: Date;
  roleId?: number;
  roleName?: string;
  organizationId?: number;
  organizationName?: string;
}

export class ActivityLogger {
  static async log(data: ActivityLogData): Promise<void> {
    try {
      console.log(`📝 [ACTIVITY LOGGER] === START LOGGING ATTEMPT ===`);
      console.log(`📝 [ACTIVITY LOGGER] Action: ${data.action}`);
      console.log(`📝 [ACTIVITY LOGGER] User: ${data.email}`);
      console.log(`📝 [ACTIVITY LOGGER] Resource: ${data.resource || 'N/A'}`);
      console.log(`📝 [ACTIVITY LOGGER] Resource Type: ${data.resourceType || 'N/A'}`);
      
      // Check if this activity should be logged based on environment variables
      // Security events are ALWAYS logged regardless of env toggle
      const isSecurityEvent = data.actionCategory === ActivityCategories.SECURITY;
      if (!isSecurityEvent) {
        const { shouldLogActivity } = await import("./config/activityLogConfig");
        if (!shouldLogActivity(data.action)) {
          console.log(`⛔ [ACTIVITY LOG] Skipping ${data.action} - logging disabled via environment variable`);
          return;
        }
      }

      // Determine if DB logging is enabled (ZAPPER_ACTIVITY_LOG_STORE !== 'FALSE')
      const dbLoggingEnabled = process.env.ZAPPER_ACTIVITY_LOG_STORE !== 'FALSE';

      if (dbLoggingEnabled) {
        console.log(`✅ [ACTIVITY LOGGER] DB Logging is ENABLED - proceeding with database insert`);
        const activityData: InsertUserActivity = {
          userId: data.userId,
          userName: data.userName,
          email: data.email,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
          sessionId: data.sessionId || null,
          action: data.action,
          actionCategory: data.actionCategory,
          resource: data.resource || null,
          resourceType: data.resourceType || null,
          details: data.details ? JSON.stringify(data.details) : null,
          roleId: data.roleId || null,
          roleName: data.roleName || null,
          organizationId: data.organizationId || null,
          organizationName: data.organizationName || null,

          loginTime: data.loginTime || null,
          logoutTime: data.logoutTime || null,
        };

        console.log(`💾 [ACTIVITY LOGGER] Calling storage.createUserActivity...`);
        await storage.createUserActivity(activityData);
        console.log(`✅ [ACTIVITY LOG] DB Write SUCCESS! ${data.email} performed ${data.action}`);
      } else {
        console.log(`💾 [ACTIVITY LOGGER] Skipping DB insert (ZAPPER_ACTIVITY_LOG_STORE=FALSE)`);
      }

      // Always send to Sentinel if enabled (SentinelLogger will internally check SENTINEL_ENABLED)
      SentinelLogger.logActivity({
        action: data.action,
        actionCategory: data.actionCategory,
        email: data.email,
        userId: data.userId,
        userName: data.userName,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        sessionId: data.sessionId,
        resource: data.resource,
        resourceType: data.resourceType,
        organizationId: data.organizationId,
        organizationName: data.organizationName,
        roleId: data.roleId,
        roleName: data.roleName,
        result: 'Success',
        additionalDetails: data.details
      });

      console.log(`📝 [ACTIVITY LOGGER] === END LOGGING (SUCCESS) ===`);
    } catch (error: unknown) {
      console.error('❌ [ACTIVITY LOGGER] === LOGGING FAILED ===');
      console.error('❌ [ACTIVITY LOGGER] Error details:', error);
      console.error('❌ [ACTIVITY LOGGER] Error type:', error?.constructor?.name);
      console.error('❌ [ACTIVITY LOGGER] Error message:', (error as Error)?.message);
      console.error('❌ [ACTIVITY LOGGER] Stack trace:', (error as Error)?.stack);
      console.error('📝 [ACTIVITY LOGGER] === END LOGGING (FAILED) ===');
      // Don't throw error to avoid breaking the main operation
    }
  }

  // Convenience methods for common activities
  static async logLogin(userData: { userId: string; userName: string; email: string; ipAddress?: string; userAgent?: string; sessionId?: string }) {
    await this.log({
      ...userData,
      action: ActivityActions.LOGIN,
      actionCategory: ActivityCategories.AUTH,
      resourceType: ResourceTypes.SESSION,
      loginTime: new Date(),
    });
  }

  static async logLogout(userData: { userId: string; userName: string; email: string; ipAddress?: string; sessionId?: string }) {
    await this.log({
      ...userData,
      action: ActivityActions.LOGOUT,
      actionCategory: ActivityCategories.AUTH,
      resourceType: ResourceTypes.SESSION,
      logoutTime: new Date(),
    });
  }

  static async logUserAction(userData: { userId: string; userName: string; email: string; ipAddress?: string }, action: ActivityAction, targetUserId?: string, details?: Record<string, any>) {
    await this.log({
      ...userData,
      action,
      actionCategory: ActivityCategories.USER_MANAGEMENT,
      resource: targetUserId,
      resourceType: ResourceTypes.USER,
      details,
    });
  }

  static async logFileAction(userData: { userId: string; userName: string; email: string; ipAddress?: string }, action: ActivityAction, filePath: string, fileType: 'FILE' | 'DIRECTORY', details?: Record<string, any>) {
    await this.log({
      ...userData,
      action,
      actionCategory: ActivityCategories.FILE_MANAGEMENT,
      resource: filePath,
      resourceType: fileType === 'FILE' ? ResourceTypes.FILE : ResourceTypes.DIRECTORY,
      details,
    });
  }

  static async logStorageAction(userData: { userId: string; userName: string; email: string; ipAddress?: string }, action: ActivityAction, storageAccountName?: string, details?: Record<string, any>) {
    await this.log({
      ...userData,
      action,
      actionCategory: ActivityCategories.STORAGE_MANAGEMENT,
      resource: storageAccountName,
      resourceType: ResourceTypes.STORAGE_ACCOUNT,
      details,
    });
  }

  static async logRoleAction(userData: { userId: string; userName: string; email: string; ipAddress?: string }, action: ActivityAction, roleId?: string, details?: Record<string, any>) {
    await this.log({
      ...userData,
      action,
      actionCategory: ActivityCategories.ROLE_MANAGEMENT,
      resource: roleId,
      resourceType: ResourceTypes.ROLE,
      details,
    });
  }

  static async logSystemAction(userData: { userId: string; userName: string; email: string; ipAddress?: string }, action: ActivityAction, details?: Record<string, any>) {
    await this.log({
      ...userData,
      action,
      actionCategory: ActivityCategories.SYSTEM,
      details,
    });
  }

  static async logSecurityEvent(userData: { userId: string; userName: string; email: string; ipAddress?: string; userAgent?: string }, action: ActivityAction, resource?: string, details?: Record<string, any>) {
    await this.log({
      ...userData,
      action,
      actionCategory: ActivityCategories.SECURITY,
      resource,
      resourceType: ResourceTypes.ORGANIZATION,
      details,
    });
  }
}