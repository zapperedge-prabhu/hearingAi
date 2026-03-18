import { pgTable, text, serial, integer, boolean, timestamp, varchar, unique, index, jsonb } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  userType: text("user_type").notNull().default("internal"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  emailIdx: index("idx_users_email").on(table.email),
}));

// Roles table
export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  category: text("category").notNull().default('info'), // info, warning, critical, dangerous
  createdAt: timestamp("created_at").defaultNow(),
});

// Organizations table
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  geoFencingEnabled: boolean("geo_fencing_enabled").notNull().default(false),
  geoEnforcementMode: text("geo_enforcement_mode").notNull().default('strict'), // 'strict' or 'audit'
  allowedCountries: text("allowed_countries").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

// User Management Permissions - JSONB-based for scalability
export interface UserMgmtPermissions {
  [key: string]: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
  view: boolean;
  enableDisable: boolean;
}

export const DEFAULT_USER_MGMT_PERMISSIONS: UserMgmtPermissions = {
  add: true,
  edit: true,
  delete: true,
  view: true,
  enableDisable: true,
};

export const ALL_USER_MGMT_PERMISSIONS: UserMgmtPermissions = {
  add: true,
  edit: true,
  delete: true,
  view: true,
  enableDisable: true,
};

// Module-specific Permission Tables
export const permissionUserMgmt = pgTable("permission_user_mgmt", {
  id: serial("id").primaryKey(),
  permissions: jsonb("permissions").$type<UserMgmtPermissions>().notNull().default({}),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permissionRoleMgmt = pgTable("permission_role_mgmt", {
  id: serial("id").primaryKey(),
  add: boolean("add").notNull().default(false),
  edit: boolean("edit").notNull().default(false),
  delete: boolean("delete").notNull().default(false),
  view: boolean("view").notNull().default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permissionOrgMgmt = pgTable("permission_org_mgmt", {
  id: serial("id").primaryKey(),
  add: boolean("add").notNull().default(false),
  edit: boolean("edit").notNull().default(false),
  delete: boolean("delete").notNull().default(false),
  view: boolean("view").notNull().default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permissionStorageMgmt = pgTable("permission_storage_mgmt", {
  id: serial("id").primaryKey(),
  addStorageContainer: boolean("add_storage_container").notNull().default(false),
  addContainer: boolean("add_container").notNull().default(false),
  view: boolean("view").notNull().default(false),
  delete: boolean("delete").notNull().default(false),
  dataProtection: boolean("data_protection").notNull().default(false),
  dataLifecycle: boolean("data_lifecycle").notNull().default(false),
  inventoryView: boolean("inventory_view").notNull().default(false),
  inventoryConfigure: boolean("inventory_configure").notNull().default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export interface FileMgmtPermissions {
  [key: string]: boolean;
}

export const DEFAULT_FILE_MGMT_PERMISSIONS: FileMgmtPermissions = {
  uploadFile: false,
  uploadFolder: false,
  downloadFile: false,
  downloadFolder: false,
  viewFiles: false,
  createFolder: false,
  deleteFilesAndFolders: false,
  searchFiles: false,
  renameFile: false,
  rehydrate: false,
};

export const ALL_FILE_MGMT_PERMISSIONS: FileMgmtPermissions = {
  uploadFile: true,
  uploadFolder: true,
  downloadFile: true,
  downloadFolder: true,
  viewFiles: true,
  createFolder: true,
  deleteFilesAndFolders: true,
  searchFiles: true,
  renameFile: true,
  rehydrate: true,
};

export const permissionFileMgmt = pgTable("permission_file_mgmt", {
  id: serial("id").primaryKey(),
  permissions: jsonb("permissions").$type<FileMgmtPermissions>().notNull().default({}),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permissionActivityLogs = pgTable("permission_activity_logs", {
  id: serial("id").primaryKey(),
  view: boolean("view").notNull().default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permissionAiAgentMgmt = pgTable("permission_ai_agent_mgmt", {
  id: serial("id").primaryKey(),
  add: boolean("add").notNull().default(false),
  edit: boolean("edit").notNull().default(false),
  delete: boolean("delete").notNull().default(false),
  view: boolean("view").notNull().default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permissionPgpKeyMgmt = pgTable("permission_pgp_key_mgmt", {
  id: serial("id").primaryKey(),
  view: boolean("view").notNull().default(false),
  generate: boolean("generate").notNull().default(false),
  delete: boolean("delete").notNull().default(false),
  copy: boolean("copy").notNull().default(false),
  decrypt: boolean("decrypt").notNull().default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Help Center Permission JSON structure types
export interface HelpCenterChapterPermissions {
  [key: string]: boolean;
}

export interface HelpCenterPermissionData {
  chapterWiseHelp: HelpCenterChapterPermissions;
  api: HelpCenterChapterPermissions;
  envVariable: HelpCenterChapterPermissions;
  troubleshooting: HelpCenterChapterPermissions;
}

// Default permission values for new roles
export const DEFAULT_HELP_CENTER_CHAPTERS: HelpCenterChapterPermissions = {
  getting_started: true,
  user_management: true,
  organization_management: true,
  role_permission_management: true,
  file_management: true,
  storage_management: true,
  data_protection: true,
  ai_agent_management: true,
  activity_logging: true,
  data_lifecycle_management: true,
  sftp_local_users: true,
  pgp_key_management: true,
  content_understanding: true,
  document_translation: true,
  siem_sentinel_integration: true,
  foundry_ai_chat_playground: true,
  cmk_encryption: true,
  customer_onboarding: true,
  transfer_reports: true,
};

export const DEFAULT_HELP_CENTER_API: HelpCenterChapterPermissions = {
  api_integration_guide: true,
  customer_onboarding_api: true,
};

export const DEFAULT_HELP_CENTER_ENV: HelpCenterChapterPermissions = {
  configuration_settings: true,
  customer_onboarding_config: true,
};

export const DEFAULT_HELP_CENTER_TROUBLESHOOTING: HelpCenterChapterPermissions = {
  malware_scanning: true,
  storage_creation: true,
  onboarding_errors: true,
};

export const permissionHelpCenter = pgTable("permission_help_center", {
  id: serial("id").primaryKey(),
  chapterWiseHelp: jsonb("chapter_wise_help").$type<HelpCenterChapterPermissions>().notNull().default({}),
  api: jsonb("api").$type<HelpCenterChapterPermissions>().notNull().default({}),
  envVariable: jsonb("env_variable").$type<HelpCenterChapterPermissions>().notNull().default({}),
  troubleshooting: jsonb("troubleshooting").$type<HelpCenterChapterPermissions>().notNull().default({}),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permissionSiemMgmt = pgTable("permission_siem_mgmt", {
  id: serial("id").primaryKey(),
  install: boolean("install").notNull().default(false),
  delete: boolean("delete").notNull().default(false),
  enableDisable: boolean("enable_disable").notNull().default(false),
  view: boolean("view").notNull().default(false),
  incidentsView: boolean("incidents_view").notNull().default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permissionFoundryMgmt = pgTable("permission_foundry_mgmt", {
  id: serial("id").primaryKey(),
  add: boolean("add").notNull().default(false),
  edit: boolean("edit").notNull().default(false),
  delete: boolean("delete").notNull().default(false),
  view: boolean("view").notNull().default(false),
  tabWizard: boolean("tab_wizard").notNull().default(false),
  tabResources: boolean("tab_resources").notNull().default(false),
  tabFoundryAction: boolean("tab_foundry_action").notNull().default(false),
  tabChatPlayground: boolean("tab_chat_playground").notNull().default(false),
  tabResourceSets: boolean("tab_resource_sets").notNull().default(false),
  tabContentUnderstanding: boolean("tab_content_understanding").notNull().default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Content Understanding Permission Table - Controls access to Content Discovery / Content Understanding features
export const permissionContentUnderstanding = pgTable("permission_content_understanding", {
  id: serial("id").primaryKey(),
  view: boolean("view").notNull().default(false),             // View saved analysis results
  runAnalysis: boolean("run_analysis").notNull().default(false),  // Execute content analysis
  saveAnalysis: boolean("save_analysis").notNull().default(false), // Save analysis results
  deleteAnalysis: boolean("delete_analysis").notNull().default(false), // Delete saved analysis
  menuVisibility: boolean("menu_visibility").notNull().default(false), // Show in sidebar menu
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// HearingAI Permission Table - Controls access to HearingAI features (separate from Content Understanding)
export const permissionHearingAi = pgTable("permission_hearing_ai", {
  id: serial("id").primaryKey(),
  view: boolean("view").notNull().default(false),             // View saved analysis results
  runAnalysis: boolean("run_analysis").notNull().default(false),  // Execute analysis
  saveAnalysis: boolean("save_analysis").notNull().default(false), // Save analysis results
  deleteAnalysis: boolean("delete_analysis").notNull().default(false), // Delete saved analysis
  menuVisibility: boolean("menu_visibility").notNull().default(false), // Show in sidebar menu
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Document Translation Permission Table - Controls access to Document Translation features
export const permissionDocumentTranslation = pgTable("permission_document_translation", {
  id: serial("id").primaryKey(),
  view: boolean("view").notNull().default(false),             // View translation results
  runTranslation: boolean("run_translation").notNull().default(false),  // Execute document translation
  deleteTranslation: boolean("delete_translation").notNull().default(false), // Delete translated documents
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customer Onboarding Permission Table - Controls access to bulk customer onboarding features
export const permissionCustomerOnboarding = pgTable("permission_customer_onboarding", {
  id: serial("id").primaryKey(),
  view: boolean("view").notNull().default(false),             // View onboarding jobs
  upload: boolean("upload").notNull().default(false),         // Upload CSV files
  commit: boolean("commit").notNull().default(false),         // Commit/execute onboarding jobs
  delete: boolean("delete").notNull().default(false),         // Delete onboarding jobs
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Transfer Reports Permission Table - Controls access to file transfer reports
export const permissionTransferReports = pgTable("permission_transfer_reports", {
  id: serial("id").primaryKey(),
  view: boolean("view").notNull().default(false),             // View transfer reports list
  viewDetails: boolean("view_details").notNull().default(false), // Expand and view report details
  download: boolean("download").notNull().default(false),     // Download report files
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permissionEval = pgTable("permission_eval", {
  id: serial("id").primaryKey(),
  view: boolean("view").notNull().default(false),
  run: boolean("run").notNull().default(false),
  review: boolean("review").notNull().default(false),
  finalize: boolean("finalize").notNull().default(false),
  menuVisibility: boolean("menu_visibility").notNull().default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Modular Role-Permissions mapping table
export const rolePermissionsModular = pgTable("role_permissions_modular", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => roles.id),
  permissionUserMgmtId: integer("permission_user_mgmt_id").references(() => permissionUserMgmt.id),
  permissionRoleMgmtId: integer("permission_role_mgmt_id").references(() => permissionRoleMgmt.id),
  permissionOrgMgmtId: integer("permission_org_mgmt_id").references(() => permissionOrgMgmt.id),
  permissionStorageMgmtId: integer("permission_storage_mgmt_id").references(() => permissionStorageMgmt.id),
  permissionFileMgmtId: integer("permission_file_mgmt_id").references(() => permissionFileMgmt.id),
  permissionActivityLogsId: integer("permission_activity_logs_id").references(() => permissionActivityLogs.id),
  permissionAiAgentMgmtId: integer("permission_ai_agent_mgmt_id").references(() => permissionAiAgentMgmt.id),
  permissionPgpKeyMgmtId: integer("permission_pgp_key_mgmt_id").references(() => permissionPgpKeyMgmt.id),
  permissionHelpCenterId: integer("permission_help_center_id").references(() => permissionHelpCenter.id),
  permissionSiemMgmtId: integer("permission_siem_mgmt_id").references(() => permissionSiemMgmt.id),
  permissionFoundryMgmtId: integer("permission_foundry_mgmt_id").references(() => permissionFoundryMgmt.id),
  permissionContentUnderstandingId: integer("permission_content_understanding_id").references(() => permissionContentUnderstanding.id),
  permissionHearingAiId: integer("permission_hearing_ai_id").references(() => permissionHearingAi.id),
  permissionDocumentTranslationId: integer("permission_document_translation_id").references(() => permissionDocumentTranslation.id),
  permissionSftpMgmtId: integer("permission_sftp_mgmt_id").references(() => permissionSftpMgmt.id),
  permissionCustomerOnboardingId: integer("permission_customer_onboarding_id").references(() => permissionCustomerOnboarding.id),
  permissionTransferReportsId: integer("permission_transfer_reports_id").references(() => permissionTransferReports.id),
  permissionEvalId: integer("permission_eval_id").references(() => permissionEval.id),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  roleIdIdx: index("idx_role_permissions_modular_role_id").on(table.roleId),
}));

// User roles junction table
export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  roleId: integer("role_id").notNull(),
  organizationId: integer("organization_id").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Unique constraint: user can only have one instance of a specific role in a specific organization
  userRoleOrgUnique: unique("user_role_org_unique").on(table.userId, table.roleId, table.organizationId),
  userIdEnabledIdx: index("idx_user_roles_user_id_enabled").on(table.userId, table.isEnabled),
  orgIdEnabledIdx: index("idx_user_roles_org_id_enabled").on(table.organizationId, table.isEnabled),
}));

// User activities table - Enhanced for comprehensive audit logging
export const userActivities = pgTable("user_activities", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  email: text("email").notNull(),
  ipAddress: text("ip_address"),
  sessionId: text("session_id"),
  userAgent: text("user_agent"),
  
  // Activity details
  action: text("action").notNull(), // LOGIN, LOGOUT, CREATE_USER, DELETE_USER, DOWNLOAD_FILE, etc.
  actionCategory: text("action_category").notNull(), // AUTH, USER_MANAGEMENT, FILE_MANAGEMENT, STORAGE_MANAGEMENT
  resource: text("resource"), // The resource being acted upon (user ID, file name, etc.)
  resourceType: text("resource_type"), // USER, FILE, DIRECTORY, STORAGE_ACCOUNT, ROLE, etc.
  details: text("details"), // Additional context data as JSON string
  
  // Role and organization context for the action
  roleId: integer("role_id"),
  roleName: text("role_name"),
  organizationId: integer("organization_id"),
  organizationName: text("organization_name"),
  
  // Timestamps
  loginTime: timestamp("login_time"),
  logoutTime: timestamp("logout_time"),
  actionTime: timestamp("action_time").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orgCreatedIdx: index("idx_user_activities_org_id_created_at").on(table.organizationId, table.createdAt),
  sessionIdIdx: index("idx_user_activities_session_id").on(table.sessionId),
  userIdIdx: index("idx_user_activities_user_id").on(table.userId),
}));

// Permission Risk Categories table
export const permissionRiskCategories = pgTable("permission_risk_categories", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().unique(), // info, warning, critical, dangerous
  description: text("description").notNull(),
  color: text("color").notNull(), // blue, yellow, orange, red
  permissions: text("permissions").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPermissionRiskCategorySchema = createInsertSchema(permissionRiskCategories);
export type PermissionRiskCategory = typeof permissionRiskCategories.$inferSelect;
export type InsertPermissionRiskCategory = z.infer<typeof insertPermissionRiskCategorySchema>;

// Storage accounts table
export const storageAccounts = pgTable("storage_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").default("East US"),
  containerName: text("container_name").notNull(),
  resourceGroupName: text("resource_group_name"),
  organizationId: integer("organization_id").references(() => organizations.id),
  kind: text("kind").notNull().default("blob"), // 'blob' or 'adls'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orgIdIdx: index("idx_storage_accounts_org_id").on(table.organizationId),
}));

// Video Jobs table - for background polling and status tracking
// Note: video_jobs table removed - all async analysis consolidated into cu_jobs table via CuPollingService

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
  activities: many(userActivities),
}));

export const rolesRelations = relations(roles, ({ many, one }) => ({
  userRoles: many(userRoles),
  rolePermissionsModular: many(rolePermissionsModular),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  userRoles: many(userRoles),
  storageAccounts: many(storageAccounts),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
  organization: one(organizations, { fields: [userRoles.organizationId], references: [organizations.id] }),
}));

export const rolePermissionsModularRelations = relations(rolePermissionsModular, ({ one }) => ({
  role: one(roles, { fields: [rolePermissionsModular.roleId], references: [roles.id] }),
  userPermissions: one(permissionUserMgmt, { fields: [rolePermissionsModular.permissionUserMgmtId], references: [permissionUserMgmt.id] }),
  rolePermissions: one(permissionRoleMgmt, { fields: [rolePermissionsModular.permissionRoleMgmtId], references: [permissionRoleMgmt.id] }),
  orgPermissions: one(permissionOrgMgmt, { fields: [rolePermissionsModular.permissionOrgMgmtId], references: [permissionOrgMgmt.id] }),
  storagePermissions: one(permissionStorageMgmt, { fields: [rolePermissionsModular.permissionStorageMgmtId], references: [permissionStorageMgmt.id] }),
  filePermissions: one(permissionFileMgmt, { fields: [rolePermissionsModular.permissionFileMgmtId], references: [permissionFileMgmt.id] }),
  logsPermissions: one(permissionActivityLogs, { fields: [rolePermissionsModular.permissionActivityLogsId], references: [permissionActivityLogs.id] }),
  aiAgentPermissions: one(permissionAiAgentMgmt, { fields: [rolePermissionsModular.permissionAiAgentMgmtId], references: [permissionAiAgentMgmt.id] }),
  pgpKeyPermissions: one(permissionPgpKeyMgmt, { fields: [rolePermissionsModular.permissionPgpKeyMgmtId], references: [permissionPgpKeyMgmt.id] }),
  siemPermissions: one(permissionSiemMgmt, { fields: [rolePermissionsModular.permissionSiemMgmtId], references: [permissionSiemMgmt.id] }),
  foundryPermissions: one(permissionFoundryMgmt, { fields: [rolePermissionsModular.permissionFoundryMgmtId], references: [permissionFoundryMgmt.id] }),
  contentUnderstandingPermissions: one(permissionContentUnderstanding, { fields: [rolePermissionsModular.permissionContentUnderstandingId], references: [permissionContentUnderstanding.id] }),
  documentTranslationPermissions: one(permissionDocumentTranslation, { fields: [rolePermissionsModular.permissionDocumentTranslationId], references: [permissionDocumentTranslation.id] }),
  sftpPermissions: one(permissionSftpMgmt, { fields: [rolePermissionsModular.permissionSftpMgmtId], references: [permissionSftpMgmt.id] }),
  customerOnboardingPermissions: one(permissionCustomerOnboarding, { fields: [rolePermissionsModular.permissionCustomerOnboardingId], references: [permissionCustomerOnboarding.id] }),
  transferReportsPermissions: one(permissionTransferReports, { fields: [rolePermissionsModular.permissionTransferReportsId], references: [permissionTransferReports.id] }),
}));

export const aiAgents = pgTable("ai_agents", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 32 }).notNull(),
  apiEndpoint: varchar("api_endpoint", { length: 192 }).notNull(),
  apiKey: varchar("api_key", { length: 512 }).notNull(), // Will be encrypted
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  useIpForSas: boolean("use_ip_for_sas").notNull().default(false),
  allowedIpAddress: varchar("allowed_ip_address", { length: 45 }), // IPv4 format, nullable
  sasValiditySeconds: integer("sas_validity_seconds").notNull().default(900), // 15 minutes default
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueEndpointKey: unique().on(table.apiEndpoint, table.apiKey, table.organizationId),
  orgIdIdx: index("idx_ai_agents_org_id").on(table.organizationId),
}));

// Organization PGP Keys table - Multiple keys per organization (OWN + PARTNER keys)
export const orgPgpKeys = pgTable("org_pgp_keys", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  keyName: varchar("key_name", { length: 100 }).notNull(), // Human-readable key name
  publicKeyArmored: text("public_key_armored").notNull(),
  keyVaultSecretName: varchar("key_vault_secret_name", { length: 255 }), // Nullable for PARTNER keys or DB storage
  privateKeyData: text("private_key_data"), // Nullable - stores private key when ZAPPER_READ_PGP_MY_KB=false
  keyId: varchar("key_id", { length: 64 }), // PGP fingerprint or key ID
  keyType: varchar("key_type", { length: 20 }).notNull().default("OWN"), // 'OWN' or 'PARTNER'
  belongsTo: varchar("belongs_to", { length: 20 }).notNull().default("SELF"), // 'SELF' or 'PARTNER'
  source: varchar("source", { length: 20 }).notNull().default("GENERATED"), // 'GENERATED' or 'IMPORTED'
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orgIdIdx: index("idx_org_pgp_keys_org_id").on(table.organizationId),
  keyTypeIdx: index("idx_org_pgp_keys_key_type").on(table.keyType),
  belongsToIdx: index("idx_org_pgp_keys_belongs_to").on(table.belongsTo),
}));

export const storageAccountsRelations = relations(storageAccounts, ({ one }) => ({
  organization: one(organizations, { fields: [storageAccounts.organizationId], references: [organizations.id] }),
}));

export const aiAgentsRelations = relations(aiAgents, ({ one }) => ({
  organization: one(organizations, { fields: [aiAgents.organizationId], references: [organizations.id] }),
}));

export const orgPgpKeysRelations = relations(orgPgpKeys, ({ one }) => ({
  organization: one(organizations, { fields: [orgPgpKeys.organizationId], references: [organizations.id] }),
  createdByUser: one(users, { fields: [orgPgpKeys.createdByUserId], references: [users.id] }),
}));

// Foundry AI Resources table - Organization-scoped Azure AI Foundry resources
// One organization can have multiple Foundry resources, but each resource belongs to only one organization
// Status progression: draft -> hub_created -> project_created -> agent_created -> vector_store_created -> completed | failed
export const foundryResources = pgTable("foundry_resources", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id), // Each resource belongs to one org
  resourceName: varchar("resource_name", { length: 128 }).notNull(),
  resourceGroup: varchar("resource_group", { length: 128 }).notNull(),
  location: varchar("location", { length: 64 }).notNull(),
  hubName: varchar("hub_name", { length: 128 }), // Azure AI Hub name
  customSubdomain: varchar("custom_subdomain", { length: 128 }), // Subdomain for endpoint URL
  resourceId: text("resource_id"), // Azure Hub resource ID (ARM resource ID)
  projectId: text("project_id"), // Foundry project ID
  projectName: varchar("project_name", { length: 128 }),
  projectEndpoint: text("project_endpoint"),
  agentId: text("agent_id"), // Foundry agent ID
  agentName: varchar("agent_name", { length: 128 }),
  vectorStoreId: text("vector_store_id"),
  // Granular status tracking for multi-step provisioning
  // Values: draft, hub_created, project_created, agent_created, vector_store_created, completed, failed
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  // Track which step is currently being worked on (for resumption)
  currentStep: varchar("current_step", { length: 32 }), // hub, project, agent, vector_store
  // Error tracking for failed steps
  lastError: text("last_error"),
  // Timestamps for provisioning lifecycle
  provisioningStartedAt: timestamp("provisioning_started_at"),
  provisioningCompletedAt: timestamp("provisioning_completed_at"),
  // Whether this resource can be linked to multiple organizations (shared resource)
  sharedAcrossOrgs: boolean("shared_across_orgs").notNull().default(false),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orgIdIdx: index("idx_foundry_resources_org_id").on(table.organizationId),
  statusIdx: index("idx_foundry_resources_status").on(table.status),
  resourceNameIdx: index("idx_foundry_resources_name").on(table.resourceName),
  uniqueProjectAgent: index("idx_foundry_resources_project_agent").on(table.projectName, table.agentId),
}));

export const foundryResourcesRelations = relations(foundryResources, ({ one, many }) => ({
  organization: one(organizations, { fields: [foundryResources.organizationId], references: [organizations.id] }),
  createdByUser: one(users, { fields: [foundryResources.createdByUserId], references: [users.id] }),
  resourceSets: many(foundryResourceSets),
}));

// Foundry Resource Sets - Links a foundry resource to an organization as default config
// This is a lightweight mapping table - foundry_resources is the source of truth for Azure config
export const foundryResourceSets = pgTable("foundry_resource_sets", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  foundryResourceId: integer("foundry_resource_id").notNull().references(() => foundryResources.id),
  // Optional overrides - use these instead of the values from foundry_resources if specified
  defaultAgentId: varchar("default_agent_id", { length: 255 }),
  defaultAgentName: varchar("default_agent_name", { length: 255 }),
  defaultVectorStoreId: varchar("default_vector_store_id", { length: 255 }),
  defaultVectorStoreName: varchar("default_vector_store_name", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orgIdIdx: index("idx_foundry_resource_sets_org_id").on(table.organizationId),
  resourceIdIdx: index("idx_foundry_resource_sets_resource_id").on(table.foundryResourceId),
  uniqueOrgResource: index("idx_foundry_resource_sets_org_unique").on(table.organizationId),
}));

export const foundryResourceSetsRelations = relations(foundryResourceSets, ({ one }) => ({
  organization: one(organizations, { fields: [foundryResourceSets.organizationId], references: [organizations.id] }),
  foundryResource: one(foundryResources, { fields: [foundryResourceSets.foundryResourceId], references: [foundryResources.id] }),
}));

// SFTP Management Permission Table - Controls access to SFTP local user management
export const permissionSftpMgmt = pgTable("permission_sftp_mgmt", {
  id: serial("id").primaryKey(),
  view: boolean("view").notNull().default(false),
  create: boolean("create").notNull().default(false),
  update: boolean("update").notNull().default(false),
  disable: boolean("disable").notNull().default(false),
  delete: boolean("delete").notNull().default(false),
  mapUser: boolean("map_user").notNull().default(false),
  viewSelfAccess: boolean("view_self_access").notNull().default(false),
  rotateSshSelf: boolean("rotate_ssh_self").notNull().default(false),
  rotatePasswordSelf: boolean("rotate_password_self").notNull().default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// SFTP Local Users - Azure Storage local users managed through Zapper Edge
export const sftpLocalUsers = pgTable("sftp_local_users", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  subscriptionId: text("subscription_id").notNull(),
  resourceGroup: text("resource_group").notNull(),
  storageAccountName: text("storage_account_name").notNull(),
  containerName: text("container_name"),  // Nullable for backward compatibility with legacy SFTP users
  localUsername: text("local_username").notNull(),
  displayName: text("display_name"),
  status: text("status").notNull().default("ACTIVE"),
  sshEnabled: boolean("ssh_enabled").notNull().default(true),
  passwordEnabled: boolean("password_enabled").notNull().default(false),
  mappedUserId: integer("mapped_user_id").notNull().references(() => users.id),
  mappedEntraOid: text("mapped_entra_oid"),
  mappedEntraEmail: text("mapped_entra_email"),
  sshRotationPolicyDays: integer("ssh_rotation_policy_days").notNull().default(30),
  sshLastRotatedAt: timestamp("ssh_last_rotated_at"),
  sshKeyFingerprint: text("ssh_key_fingerprint"),
  passwordRotationPolicyDays: integer("password_rotation_policy_days").notNull().default(30),
  passwordLastRotatedAt: timestamp("password_last_rotated_at"),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedByUserId: integer("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueLocalUser: unique("unique_sftp_local_user").on(
    table.organizationId,
    table.localUsername
  ),
  uniqueMappedUser: unique("unique_sftp_mapped_user").on(
    table.organizationId,
    table.mappedUserId
  ),
  orgIdIdx: index("idx_sftp_local_users_org_id").on(table.organizationId),
  mappedUserIdx: index("idx_sftp_local_users_mapped_user").on(table.mappedUserId),
  storageAccountIdx: index("idx_sftp_local_users_storage_account").on(table.storageAccountName),
}));

// SFTP Local User Scopes - Container permissions for each local user
export const sftpLocalUserScopes = pgTable("sftp_local_user_scopes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  sftpLocalUserId: integer("sftp_local_user_id").notNull().references(() => sftpLocalUsers.id, { onDelete: 'cascade' }),
  containerName: text("container_name").notNull(),
  permissions: jsonb("permissions").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueScope: unique("unique_sftp_scope").on(table.sftpLocalUserId, table.containerName),
  localUserIdx: index("idx_sftp_scopes_local_user").on(table.sftpLocalUserId),
}));

// SFTP Rotation Events - Audit trail for credential rotations
export const sftpRotationEvents = pgTable("sftp_rotation_events", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  sftpLocalUserId: integer("sftp_local_user_id").notNull().references(() => sftpLocalUsers.id, { onDelete: 'cascade' }),
  actorUserId: integer("actor_user_id").notNull().references(() => users.id),
  actorEntraOid: text("actor_entra_oid"),
  actorEmail: text("actor_email").notNull(),
  rotationType: text("rotation_type").notNull(),
  action: text("action").notNull(),
  oldFingerprint: text("old_fingerprint"),
  newFingerprint: text("new_fingerprint"),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orgIdIdx: index("idx_sftp_rotation_org_id").on(table.organizationId),
  localUserIdx: index("idx_sftp_rotation_local_user").on(table.sftpLocalUserId),
}));

// SFTP Relations
export const sftpLocalUsersRelations = relations(sftpLocalUsers, ({ one, many }) => ({
  organization: one(organizations, { fields: [sftpLocalUsers.organizationId], references: [organizations.id] }),
  mappedUser: one(users, { fields: [sftpLocalUsers.mappedUserId], references: [users.id] }),
  createdBy: one(users, { fields: [sftpLocalUsers.createdByUserId], references: [users.id] }),
  scopes: many(sftpLocalUserScopes),
  rotationEvents: many(sftpRotationEvents),
}));

export const sftpLocalUserScopesRelations = relations(sftpLocalUserScopes, ({ one }) => ({
  sftpLocalUser: one(sftpLocalUsers, { fields: [sftpLocalUserScopes.sftpLocalUserId], references: [sftpLocalUsers.id] }),
}));

export const sftpRotationEventsRelations = relations(sftpRotationEvents, ({ one }) => ({
  sftpLocalUser: one(sftpLocalUsers, { fields: [sftpRotationEvents.sftpLocalUserId], references: [sftpLocalUsers.id] }),
  actor: one(users, { fields: [sftpRotationEvents.actorUserId], references: [users.id] }),
}));

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Role = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = typeof userRoles.$inferInsert;

export type RolePermissionModular = typeof rolePermissionsModular.$inferSelect;
export type InsertRolePermissionModular = typeof rolePermissionsModular.$inferInsert;

export type UserActivity = typeof userActivities.$inferSelect;
export type InsertUserActivity = typeof userActivities.$inferInsert;

export type StorageAccount = typeof storageAccounts.$inferSelect;
export type InsertStorageAccount = typeof storageAccounts.$inferInsert;

export type AiAgent = typeof aiAgents.$inferSelect;
export type InsertAiAgent = typeof aiAgents.$inferInsert;

export type OrgPgpKey = typeof orgPgpKeys.$inferSelect;
export type InsertOrgPgpKey = typeof orgPgpKeys.$inferInsert;

// Module Permission Types
export type PermissionUserMgmt = typeof permissionUserMgmt.$inferSelect;
export type InsertPermissionUserMgmt = typeof permissionUserMgmt.$inferInsert;

export type PermissionRoleMgmt = typeof permissionRoleMgmt.$inferSelect;
export type InsertPermissionRoleMgmt = typeof permissionRoleMgmt.$inferInsert;

export type PermissionOrgMgmt = typeof permissionOrgMgmt.$inferSelect;
export type InsertPermissionOrgMgmt = typeof permissionOrgMgmt.$inferInsert;

export type PermissionStorageMgmt = typeof permissionStorageMgmt.$inferSelect;
export type InsertPermissionStorageMgmt = typeof permissionStorageMgmt.$inferInsert;

export type PermissionFileMgmt = typeof permissionFileMgmt.$inferSelect;
export type InsertPermissionFileMgmt = typeof permissionFileMgmt.$inferInsert;

export type PermissionActivityLogs = typeof permissionActivityLogs.$inferSelect;
export type InsertPermissionActivityLogs = typeof permissionActivityLogs.$inferInsert;

export type PermissionAiAgentMgmt = typeof permissionAiAgentMgmt.$inferSelect;
export type InsertPermissionAiAgentMgmt = typeof permissionAiAgentMgmt.$inferInsert;

export type PermissionPgpKeyMgmt = typeof permissionPgpKeyMgmt.$inferSelect;
export type InsertPermissionPgpKeyMgmt = typeof permissionPgpKeyMgmt.$inferInsert;

export type PermissionHelpCenter = typeof permissionHelpCenter.$inferSelect;
export type InsertPermissionHelpCenter = typeof permissionHelpCenter.$inferInsert;

export type PermissionSiemMgmt = typeof permissionSiemMgmt.$inferSelect;
export type InsertPermissionSiemMgmt = typeof permissionSiemMgmt.$inferInsert;

export type PermissionFoundryMgmt = typeof permissionFoundryMgmt.$inferSelect;
export type InsertPermissionFoundryMgmt = typeof permissionFoundryMgmt.$inferInsert;

export type PermissionContentUnderstanding = typeof permissionContentUnderstanding.$inferSelect;
export type InsertPermissionContentUnderstanding = typeof permissionContentUnderstanding.$inferInsert;

export type PermissionDocumentTranslation = typeof permissionDocumentTranslation.$inferSelect;
export type InsertPermissionDocumentTranslation = typeof permissionDocumentTranslation.$inferInsert;

export type PermissionTransferReports = typeof permissionTransferReports.$inferSelect;
export type InsertPermissionTransferReports = typeof permissionTransferReports.$inferInsert;

export type PermissionCustomerOnboarding = typeof permissionCustomerOnboarding.$inferSelect;
export type InsertPermissionCustomerOnboarding = typeof permissionCustomerOnboarding.$inferInsert;

export type FoundryResource = typeof foundryResources.$inferSelect;
export type InsertFoundryResource = typeof foundryResources.$inferInsert;

export type FoundryResourceSet = typeof foundryResourceSets.$inferSelect;
export type InsertFoundryResourceSet = typeof foundryResourceSets.$inferInsert;

// Combined types for complex queries
export type UserWithRole = Omit<User, 'isEnabled'> & {
  roleName: string | null;
  organizationName: string | null;
  userRoleId: number | null;
  roleId: number | null;
  organizationId: number | null;
  isEnabled: boolean | null;
};

export type RoleWithPermissions = Role & {
  permissions?: {
    userManagement?: PermissionUserMgmt;
    roleManagement?: PermissionRoleMgmt;
    organization?: PermissionOrgMgmt;
    storageManagement?: PermissionStorageMgmt;
    fileManagement?: PermissionFileMgmt;
    activityLogs?: PermissionActivityLogs;
  };
};

export type ActivityWithUser = UserActivity & {
  userName: string;
  email: string;
};

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users);
export const insertRoleSchema = createInsertSchema(roles).extend({
  name: z.string().trim().min(3, "Role name must be at least 3 characters").max(64, "Role name must not exceed 64 characters")
});
export const insertOrganizationSchema = createInsertSchema(organizations);
export const insertUserRoleSchema = createInsertSchema(userRoles);
export const insertRolePermissionModularSchema = createInsertSchema(rolePermissionsModular);
export const insertUserActivitySchema = createInsertSchema(userActivities);
export const insertStorageAccountSchema = createInsertSchema(storageAccounts);

// Module permission insert schemas
const userMgmtPermissionsSchema = z.record(z.string(), z.boolean()).default({});
export const insertPermissionUserMgmtSchema = createInsertSchema(permissionUserMgmt, {
  permissions: userMgmtPermissionsSchema,
});
export const insertPermissionRoleMgmtSchema = createInsertSchema(permissionRoleMgmt);
export const insertPermissionOrgMgmtSchema = createInsertSchema(permissionOrgMgmt);
export const insertPermissionStorageMgmtSchema = createInsertSchema(permissionStorageMgmt);
const fileMgmtPermissionsSchema = z.record(z.string(), z.boolean()).default({});

export const insertPermissionFileMgmtSchema = createInsertSchema(permissionFileMgmt, {
  permissions: fileMgmtPermissionsSchema,
});
export const insertPermissionActivityLogsSchema = createInsertSchema(permissionActivityLogs);
export const insertPermissionAiAgentMgmtSchema = createInsertSchema(permissionAiAgentMgmt);
export const insertPermissionPgpKeyMgmtSchema = createInsertSchema(permissionPgpKeyMgmt);
// Help Center permission Zod schemas
const helpCenterChapterPermissionsSchema = z.record(z.string(), z.boolean()).default({});

export const insertPermissionHelpCenterSchema = createInsertSchema(permissionHelpCenter, {
  chapterWiseHelp: helpCenterChapterPermissionsSchema,
  api: helpCenterChapterPermissionsSchema,
  envVariable: helpCenterChapterPermissionsSchema,
  troubleshooting: helpCenterChapterPermissionsSchema,
});
export const insertPermissionSiemMgmtSchema = createInsertSchema(permissionSiemMgmt);
export const insertPermissionFoundryMgmtSchema = createInsertSchema(permissionFoundryMgmt);

// AI Agent validation schema with custom SAS configuration
export const insertAiAgentSchema = createInsertSchema(aiAgents, {
  name: z.string().trim().min(1, "AI agent name is required").max(32, "Name must not exceed 32 characters"),
  apiEndpoint: z.string().url("Must be a valid URL").max(192, "API endpoint must not exceed 192 characters"),
  apiKey: z.string().min(1, "API key is required").max(512, "API key must not exceed 512 characters"),
  organizationId: z.number().int().positive("Organization ID is required"),
  useIpForSas: z.boolean().default(false),
  allowedIpAddress: z.string()
    .regex(
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
      "Must be a valid IPv4 address (e.g., 192.168.1.1)"
    )
    .nullable()
    .optional(),
  sasValiditySeconds: z.number()
    .int("Must be a whole number")
    .min(1, "Minimum 1 second")
    .max(3600, "Maximum 3600 seconds (1 hour)")
    .default(900),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Organization PGP Key validation schema
export const insertOrgPgpKeySchema = createInsertSchema(orgPgpKeys, {
  organizationId: z.number().int().positive("Organization ID is required"),
  keyName: z.string().min(1, "Key name is required").max(100, "Key name must not exceed 100 characters"),
  publicKeyArmored: z.string().min(100, "Invalid PGP public key format"),
  keyVaultSecretName: z.string().optional().nullable(), // Nullable for PARTNER keys or DB storage
  privateKeyData: z.string().optional().nullable(), // Nullable - stores private key when ZAPPER_READ_PGP_MY_KB=false
  keyId: z.string().optional().nullable(),
  keyType: z.enum(["OWN", "PARTNER"]).default("OWN"),
  belongsTo: z.enum(["SELF", "PARTNER"]).default("SELF"),
  source: z.enum(["GENERATED", "IMPORTED"]).default("GENERATED"),
  isActive: z.boolean().default(true),
  createdByUserId: z.number().int().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Foundry Resource status enum - granular provisioning status
export const foundryResourceStatusEnum = z.enum([
  "draft",           // Initial record created, no Azure resources yet
  "hub_created",     // Hub created in Azure
  "project_created", // Project created in Azure
  "agent_created",   // Agent created in Azure
  "vector_store_created", // Vector store created in Azure
  "completed",       // All resources created successfully
  "failed"           // Provisioning failed at some step
]);
export type FoundryResourceStatus = z.infer<typeof foundryResourceStatusEnum>;

// Foundry Resource step enum - which step is currently being worked on
export const foundryResourceStepEnum = z.enum(["hub", "project", "agent", "vector_store"]);
export type FoundryResourceStep = z.infer<typeof foundryResourceStepEnum>;

// Foundry Resource validation schema - organization-scoped
export const insertFoundryResourceSchema = createInsertSchema(foundryResources, {
  organizationId: z.number().int().positive("Organization ID is required"),
  resourceName: z.string().min(1, "Resource name is required").max(128, "Resource name must not exceed 128 characters"),
  resourceGroup: z.string().min(1, "Resource group is required").max(128, "Resource group must not exceed 128 characters"),
  location: z.string().min(1, "Location is required").max(64, "Location must not exceed 64 characters"),
  hubName: z.string().max(128).optional().nullable(),
  customSubdomain: z.string().max(128).optional().nullable(),
  resourceId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  projectName: z.string().max(128).optional().nullable(),
  projectEndpoint: z.string().optional().nullable(),
  agentId: z.string().optional().nullable(),
  agentName: z.string().max(128).optional().nullable(),
  vectorStoreId: z.string().optional().nullable(),
  status: foundryResourceStatusEnum.default("draft"),
  currentStep: foundryResourceStepEnum.optional().nullable(),
  lastError: z.string().optional().nullable(),
  provisioningStartedAt: z.date().optional().nullable(),
  provisioningCompletedAt: z.date().optional().nullable(),
  createdByUserId: z.number().int().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Foundry Resource Set validation schema - now references foundry_resources
export const insertFoundryResourceSetSchema = createInsertSchema(foundryResourceSets, {
  name: z.string().min(1, "Name is required").max(255, "Name must not exceed 255 characters"),
  organizationId: z.number().int().positive("Organization ID is required"),
  foundryResourceId: z.number().int().positive("Foundry Resource ID is required"),
  defaultAgentId: z.string().max(255).optional().nullable(),
  defaultAgentName: z.string().max(255).optional().nullable(),
  defaultVectorStoreId: z.string().max(255).optional().nullable(),
  defaultVectorStoreName: z.string().max(255).optional().nullable(),
  status: z.enum(["active", "suspended", "deleted"]).default("active"),
  notes: z.string().optional().nullable(),
  createdBy: z.string().min(1, "Created by is required"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// SFTP Management Types
export type PermissionSftpMgmt = typeof permissionSftpMgmt.$inferSelect;
export type InsertPermissionSftpMgmt = typeof permissionSftpMgmt.$inferInsert;

export type SftpLocalUser = typeof sftpLocalUsers.$inferSelect;
export type InsertSftpLocalUser = typeof sftpLocalUsers.$inferInsert;

export type SftpLocalUserScope = typeof sftpLocalUserScopes.$inferSelect;
export type InsertSftpLocalUserScope = typeof sftpLocalUserScopes.$inferInsert;

export type SftpRotationEvent = typeof sftpRotationEvents.$inferSelect;
export type InsertSftpRotationEvent = typeof sftpRotationEvents.$inferInsert;

// SFTP Scope Permissions schema for JSON validation
export const sftpScopePermissionsSchema = z.object({
  read: z.boolean().default(true),
  write: z.boolean().default(false),
  list: z.boolean().default(true),
  delete: z.boolean().default(false),
});
export type SftpScopePermissions = z.infer<typeof sftpScopePermissionsSchema>;

// SFTP Local User validation schema
export const insertSftpLocalUserSchema = createInsertSchema(sftpLocalUsers, {
  organizationId: z.number().int().positive("Organization ID is required"),
  subscriptionId: z.string().min(1, "Subscription ID is required"),
  resourceGroup: z.string().min(1, "Resource group is required"),
  storageAccountName: z.string().min(3, "Storage account name is required").max(24, "Storage account name must not exceed 24 characters"),
  containerName: z.string().min(1, "Container name is required").max(63, "Container name must not exceed 63 characters"),
  localUsername: z.string().min(1, "Local username is required").max(64, "Local username must not exceed 64 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  displayName: z.string().max(100).optional().nullable(),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
  sshEnabled: z.boolean().default(true),
  passwordEnabled: z.boolean().default(false),
  mappedUserId: z.number().int().positive("Mapped user is required"),
  mappedEntraOid: z.string().optional().nullable(),
  mappedEntraEmail: z.string().email().optional().nullable(),
  sshRotationPolicyDays: z.number().int().min(1).max(365).default(30),
  passwordRotationPolicyDays: z.number().int().min(1).max(365).default(30),
  createdByUserId: z.number().int().optional().nullable(),
  updatedByUserId: z.number().int().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sshLastRotatedAt: true,
  sshKeyFingerprint: true,
  passwordLastRotatedAt: true,
});

// SFTP Local User Scope validation schema
export const insertSftpLocalUserScopeSchema = createInsertSchema(sftpLocalUserScopes, {
  organizationId: z.number().int().positive("Organization ID is required"),
  sftpLocalUserId: z.number().int().positive("SFTP Local User ID is required"),
  containerName: z.string().min(1, "Container name is required").max(63, "Container name must not exceed 63 characters"),
  permissions: sftpScopePermissionsSchema,
}).omit({
  id: true,
  createdAt: true,
});

// SFTP Rotation Event schema
export const insertSftpRotationEventSchema = createInsertSchema(sftpRotationEvents, {
  organizationId: z.number().int().positive("Organization ID is required"),
  sftpLocalUserId: z.number().int().positive("SFTP Local User ID is required"),
  actorUserId: z.number().int().positive("Actor user ID is required"),
  actorEmail: z.string().email("Valid email required"),
  rotationType: z.enum(["SSH", "PASSWORD"]),
  action: z.enum(["ROTATE_SELF", "ROTATE_ADMIN"]),
  status: z.enum(["SUCCESS", "FAILED"]),
}).omit({
  id: true,
  createdAt: true,
});

// SFTP Permission insert schema
export const insertPermissionSftpMgmtSchema = createInsertSchema(permissionSftpMgmt);

// Combined type for SFTP local user with scopes
export type SftpLocalUserWithScopes = SftpLocalUser & {
  scopes: SftpLocalUserScope[];
  mappedUserEmail?: string;
  mappedUserName?: string;
};

// ============================================
// CUSTOMER ONBOARDING TABLES
// ============================================

// Onboarding Jobs - Track bulk import jobs
export const onboardingJobs = pgTable("onboarding_jobs", {
  id: serial("id").primaryKey(),
  jobName: text("job_name").notNull(),
  status: text("status").notNull().default("pending"), // pending, validating, processing, completed, failed, partial_success
  totalRows: integer("total_rows").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  csvData: text("csv_data"),
  validationErrors: jsonb("validation_errors"),
  processingErrors: jsonb("processing_errors"),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  statusIdx: index("idx_onboarding_jobs_status").on(table.status),
  createdByIdx: index("idx_onboarding_jobs_created_by").on(table.createdByUserId),
}));

// Onboarding Job Rows - Individual row status tracking
export const onboardingJobRows = pgTable("onboarding_job_rows", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => onboardingJobs.id, { onDelete: 'cascade' }),
  rowNumber: integer("row_number").notNull(),
  rawData: jsonb("raw_data").notNull(),
  status: text("status").notNull().default("pending"), // pending, success, failed, skipped
  errorMessage: text("error_message"),
  errorCode: text("error_code"),
  createdOrganizationId: integer("created_organization_id"),
  createdUserId: integer("created_user_id"),
  createdUserRoleId: integer("created_user_role_id"),
  createdStorageAccountId: integer("created_storage_account_id"),
  createdSftpLocalUserId: integer("created_sftp_local_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
}, (table) => ({
  jobIdIdx: index("idx_onboarding_job_rows_job_id").on(table.jobId),
  statusIdx: index("idx_onboarding_job_rows_status").on(table.status),
}));

// Onboarding Relations
export const onboardingJobsRelations = relations(onboardingJobs, ({ one, many }) => ({
  createdBy: one(users, { fields: [onboardingJobs.createdByUserId], references: [users.id] }),
  rows: many(onboardingJobRows),
}));

export const onboardingJobRowsRelations = relations(onboardingJobRows, ({ one }) => ({
  job: one(onboardingJobs, { fields: [onboardingJobRows.jobId], references: [onboardingJobs.id] }),
}));

// Onboarding Types
export type OnboardingJob = typeof onboardingJobs.$inferSelect;
export type InsertOnboardingJob = typeof onboardingJobs.$inferInsert;

export type OnboardingJobRow = typeof onboardingJobRows.$inferSelect;
export type InsertOnboardingJobRow = typeof onboardingJobRows.$inferInsert;

// Onboarding Insert Schemas
export const insertOnboardingJobSchema = createInsertSchema(onboardingJobs, {
  jobName: z.string().min(1, "Job name is required").max(255),
  status: z.enum(["pending", "validating", "processing", "completed", "failed", "partial_success"]).default("pending"),
}).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertOnboardingJobRowSchema = createInsertSchema(onboardingJobRows, {
  jobId: z.number().int().positive("Job ID is required"),
  rowNumber: z.number().int().positive("Row number is required"),
  status: z.enum(["pending", "success", "failed", "skipped"]).default("pending"),
}).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

// CSV Row Data Type for Onboarding
export interface OnboardingCSVRow {
  OrgName: string;
  StorageAccount: string;
  Container: string;
  ResourceGroup?: string;
  Location?: string;
  LoginName: string;
  Email: string;
  Role: string;
  SFTPUser: string;
  AuthPasswordFlag?: string;
  AuthSSHKeyFlag?: string;
  SftpRead?: string;
  SftpWrite?: string;
  SftpList?: string;
  SftpDelete?: string;
  SftpCreate?: string;
}

// Validation Error Type
export interface OnboardingValidationError {
  row: number;
  column: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

// Job Row with parsed data
export type OnboardingJobRowWithData = OnboardingJobRow & {
  parsedData: OnboardingCSVRow;
};

// ============================================
// FILE TRANSFER REPORTS
// ============================================

// File Transfer Reports - Track upload/download operations
export const fileTransferReports = pgTable("file_transfer_reports", {
  id: serial("id").primaryKey(),
  actionId: varchar("action_id", { length: 100 }).notNull().unique(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  userId: integer("user_id").notNull().references(() => users.id),
  actionType: varchar("action_type", { length: 20 }).notNull(), // 'UPLOAD' | 'DOWNLOAD'
  totalFiles: integer("total_files").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  status: varchar("status", { length: 30 }).notNull().default("IN_PROGRESS"), // 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'IN_PROGRESS'
  reportBlobPath: varchar("report_blob_path", { length: 500 }),
  storageAccountName: varchar("storage_account_name", { length: 100 }),
  containerName: varchar("container_name", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  actionIdIdx: index("idx_file_transfer_reports_action_id").on(table.actionId),
  orgIdx: index("idx_file_transfer_reports_org").on(table.organizationId),
  userIdx: index("idx_file_transfer_reports_user").on(table.userId),
  statusIdx: index("idx_file_transfer_reports_status").on(table.status),
  createdAtIdx: index("idx_file_transfer_reports_created_at").on(table.createdAt),
}));

// File Transfer Reports Relations
export const fileTransferReportsRelations = relations(fileTransferReports, ({ one }) => ({
  organization: one(organizations, { fields: [fileTransferReports.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [fileTransferReports.userId], references: [users.id] }),
}));

// File Transfer Report Types
export type FileTransferReport = typeof fileTransferReports.$inferSelect;
export type InsertFileTransferReport = typeof fileTransferReports.$inferInsert;

// File Transfer Report Insert Schema
export const insertFileTransferReportSchema = createInsertSchema(fileTransferReports, {
  actionId: z.string().uuid("Action ID must be a valid UUID"),
  organizationId: z.number().int().positive("Organization ID is required"),
  userId: z.number().int().positive("User ID is required"),
  actionType: z.enum(["UPLOAD", "DOWNLOAD"]),
  status: z.enum(["SUCCESS", "PARTIAL_SUCCESS", "FAILED", "IN_PROGRESS"]).default("IN_PROGRESS"),
}).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

// Detailed Report File Structure (stored in Blob Storage as JSON)
export interface FileTransferReportDetail {
  actionId: string;
  actionType: "UPLOAD" | "DOWNLOAD";
  initiatedBy: {
    userId: number;
    email: string;
    name?: string;
  };
  startedAt: string;
  completedAt?: string;
  summary: {
    totalFiles: number;
    successful: number;
    failed: number;
  };
  files: Array<{
    fullPath: string;
    status: "SUCCESS" | "FAILED" | "PENDING";
    sizeBytes?: number;
    error?: string;
  }>;
}

// ============================================
// CONTENT UNDERSTANDING ASYNC JOBS
// ============================================

// CU Jobs - Track async Content Understanding video analysis jobs
export const cuJobs = pgTable("cu_jobs", {
  id: serial("id").primaryKey(),
  jobId: varchar("job_id", { length: 100 }).notNull().unique(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  userId: integer("user_id").notNull().references(() => users.id),
  sourceFilePath: varchar("source_file_path", { length: 1000 }).notNull(),
  storageAccountName: varchar("storage_account_name", { length: 100 }).notNull(),
  containerName: varchar("container_name", { length: 100 }).notNull(),
  foundryResourceName: varchar("foundry_resource_name", { length: 100 }).notNull(),
  azureOperationLocation: varchar("azure_operation_location", { length: 2000 }),
  status: varchar("status", { length: 50 }).notNull().default("submitted"),
  resultPath: varchar("result_path", { length: 1000 }),
  error: text("error"),
  pollAttempts: integer("poll_attempts").notNull().default(0),
  contentType: varchar("content_type", { length: 50 }).notNull().default("video"),
  analyzerId: varchar("analyzer_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  jobIdIdx: index("idx_cu_jobs_job_id").on(table.jobId),
  statusIdx: index("idx_cu_jobs_status").on(table.status),
  orgIdx: index("idx_cu_jobs_org").on(table.organizationId),
  userIdx: index("idx_cu_jobs_user").on(table.userId),
}));

// CU Jobs Relations
export const cuJobsRelations = relations(cuJobs, ({ one }) => ({
  organization: one(organizations, { fields: [cuJobs.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [cuJobs.userId], references: [users.id] }),
}));

// CU Job Types
export type CuJob = typeof cuJobs.$inferSelect;
export type InsertCuJob = typeof cuJobs.$inferInsert;

// CU Job Insert Schema
export const insertCuJobSchema = createInsertSchema(cuJobs, {
  jobId: z.string().uuid("Job ID must be a valid UUID"),
  organizationId: z.number().int().positive("Organization ID is required"),
  userId: z.number().int().positive("User ID is required"),
  sourceFilePath: z.string().min(1, "Source file path is required").max(1000),
  storageAccountName: z.string().min(3).max(100),
  containerName: z.string().min(1).max(100),
  foundryResourceName: z.string().min(1).max(100),
  status: z.enum(["submitted", "running", "succeeded", "failed", "cancelled"]).default("submitted"),
  contentType: z.enum(["video", "audio", "document", "image"]).default("video"),
}).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

// CU Job Status Response Type
export interface CuJobStatus {
  jobId: string;
  status: "submitted" | "running" | "succeeded" | "failed" | "cancelled";
  progress?: {
    pollAttempts: number;
    estimatedTimeRemaining?: number;
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  resultPath?: string;
}

// ========================================
// HearingAI Jobs Table
// ========================================
export const haiJobs = pgTable("hai_jobs", {
  id: serial("id").primaryKey(),
  jobId: varchar("job_id", { length: 100 }).notNull().unique(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  userId: integer("user_id").notNull().references(() => users.id),
  sourceFilePath: varchar("source_file_path", { length: 1000 }).notNull(),
  storageAccountName: varchar("storage_account_name", { length: 100 }).notNull(),
  containerName: varchar("container_name", { length: 100 }).notNull(),
  foundryResourceName: varchar("foundry_resource_name", { length: 100 }).notNull(),
  azureOperationLocation: varchar("azure_operation_location", { length: 2000 }),
  status: varchar("status", { length: 50 }).notNull().default("submitted"),
  resultPath: varchar("result_path", { length: 1000 }),
  error: text("error"),
  pollAttempts: integer("poll_attempts").notNull().default(0),
  contentType: varchar("content_type", { length: 50 }).notNull().default("audio"),
  analyzerId: varchar("analyzer_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  jobIdIdx: index("idx_hai_jobs_job_id").on(table.jobId),
  statusIdx: index("idx_hai_jobs_status").on(table.status),
  orgIdx: index("idx_hai_jobs_org").on(table.organizationId),
  userIdx: index("idx_hai_jobs_user").on(table.userId),
}));

// HAI Jobs Relations
export const haiJobsRelations = relations(haiJobs, ({ one }) => ({
  organization: one(organizations, { fields: [haiJobs.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [haiJobs.userId], references: [users.id] }),
}));

// HAI Job Types
export type HaiJob = typeof haiJobs.$inferSelect;
export type InsertHaiJob = typeof haiJobs.$inferInsert;

// HAI Job Insert Schema
export const insertHaiJobSchema = createInsertSchema(haiJobs, {
  jobId: z.string().uuid("Job ID must be a valid UUID"),
  organizationId: z.number().int().positive("Organization ID is required"),
  userId: z.number().int().positive("User ID is required"),
  sourceFilePath: z.string().min(1, "Source file path is required").max(1000),
  storageAccountName: z.string().min(3).max(100),
  containerName: z.string().min(1).max(100),
  foundryResourceName: z.string().min(1).max(100),
  status: z.enum(["submitted", "running", "succeeded", "failed", "cancelled"]).default("submitted"),
  contentType: z.enum(["video", "audio", "document", "image"]).default("audio"),
}).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

// HearingAI Permission Insert Schema
export const insertPermissionHearingAiSchema = createInsertSchema(permissionHearingAi).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPermissionHearingAi = typeof insertPermissionHearingAiSchema._type;

// ========================================
// Eval (Answer Sheet Evaluation) Tables
// ========================================

export const evalJobs = pgTable("eval_jobs", {
  id: serial("id").primaryKey(),
  jobId: varchar("job_id", { length: 100 }).notNull().unique(),
  batchId: varchar("batch_id", { length: 100 }),

  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  userId: integer("user_id").notNull().references(() => users.id),

  foundryResourceId: integer("foundry_resource_id").notNull().references(() => foundryResources.id),
  foundryResourceName: varchar("foundry_resource_name", { length: 128 }).notNull(),

  answerSheetPath: varchar("answer_sheet_path", { length: 1000 }).notNull(),
  questionPaperPath: varchar("question_paper_path", { length: 1000 }),
  questionPaperText: text("question_paper_text"),
  standardAnswerPath: varchar("standard_answer_path", { length: 1000 }),
  standardAnswerText: text("standard_answer_text"),

  status: varchar("status", { length: 32 }).notNull().default("queued"),
  reviewStatus: varchar("review_status", { length: 32 }).notNull().default("not_started"),
  progress: integer("progress").notNull().default(0),
  error: text("error"),

  // Result storage (Stores blob reference: { blobPath: string, resultNumber: number })
  resultJson: jsonb("result_json"),
  reviewedResultJson: jsonb("reviewed_result_json"),

  // Per-question review tracking: { "1": true, "3": true, ... }
  reviewedQuestions: jsonb("reviewed_questions"),

  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
}, (table) => ({
  orgIdx: index("idx_eval_jobs_org").on(table.organizationId),
  jobIdIdx: index("idx_eval_jobs_job_id").on(table.jobId),
  statusIdx: index("idx_eval_jobs_status").on(table.status),
}));

export const evalJobsRelations = relations(evalJobs, ({ one }) => ({
  organization: one(organizations, { fields: [evalJobs.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [evalJobs.userId], references: [users.id] }),
  foundryResource: one(foundryResources, { fields: [evalJobs.foundryResourceId], references: [foundryResources.id] }),
  reviewedByUser: one(users, { fields: [evalJobs.reviewedByUserId], references: [users.id] }),
}));

export type EvalJob = typeof evalJobs.$inferSelect;
export type InsertEvalJob = typeof evalJobs.$inferInsert;

export const batchAnalyses = pgTable("batch_analyses", {
  id: serial("id").primaryKey(),
  batchId: varchar("batch_id", { length: 100 }).notNull().unique(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  userId: integer("user_id").notNull().references(() => users.id),
  status: varchar("status", { length: 32 }).notNull().default("generating"),
  batchSize: integer("batch_size").notNull().default(0),
  completedCount: integer("completed_count").notNull().default(0),
  averageScore: integer("average_score"),
  analysisJson: jsonb("analysis_json"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type BatchAnalysis = typeof batchAnalyses.$inferSelect;
export type InsertBatchAnalysis = typeof batchAnalyses.$inferInsert;

export const evalManualOverrides = pgTable("eval_manual_overrides", {
  id: serial("id").primaryKey(),
  jobId: varchar("job_id", { length: 100 }).notNull(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  reviewerUserId: integer("reviewer_user_id").notNull().references(() => users.id),
  questionNum: varchar("question_num", { length: 32 }).notNull(),
  originalMarksAwarded: integer("original_marks_awarded"),
  newMarksAwarded: integer("new_marks_awarded").notNull(),
  newStatus: varchar("new_status", { length: 32 }),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  jobIdIdx: index("idx_eval_overrides_job_id").on(table.jobId),
  jobQuestionIdx: index("idx_eval_overrides_job_question").on(table.jobId, table.questionNum),
}));

export type EvalManualOverride = typeof evalManualOverrides.$inferSelect;