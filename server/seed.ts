import { db } from "./db";
import { 
  roles, organizations, users, userRoles, storageAccounts, aiAgents,
  permissionUserMgmt, permissionRoleMgmt, permissionOrgMgmt,
  permissionStorageMgmt, permissionFileMgmt, permissionActivityLogs,
  permissionAiAgentMgmt, permissionPgpKeyMgmt, permissionHelpCenter, permissionSiemMgmt, permissionFoundryMgmt, permissionContentUnderstanding, permissionDocumentTranslation, permissionSftpMgmt, permissionCustomerOnboarding, permissionTransferReports, rolePermissionsModular,
  type InsertRole, type InsertOrganization, type InsertUser, type InsertUserRole,
  type InsertStorageAccount, type InsertAiAgent,
  type InsertPermissionUserMgmt, type InsertPermissionRoleMgmt, 
  type InsertPermissionOrgMgmt, type InsertPermissionStorageMgmt,
  type InsertPermissionFileMgmt, type InsertPermissionActivityLogs,
  type InsertPermissionAiAgentMgmt, type InsertPermissionPgpKeyMgmt, type InsertPermissionHelpCenter, type InsertPermissionSiemMgmt, type InsertPermissionFoundryMgmt, type InsertPermissionContentUnderstanding, type InsertPermissionDocumentTranslation, type InsertPermissionSftpMgmt, type InsertPermissionCustomerOnboarding, type InsertPermissionTransferReports, type InsertRolePermissionModular,
  ALL_FILE_MGMT_PERMISSIONS, DEFAULT_FILE_MGMT_PERMISSIONS,
} from "@shared/schema";

// New seeding function using environment variables
export async function seedInitialDataFromEnv() {
  try {
    // Check if required environment variables are set
    const initialUser = process.env.ZAPPER_INITIAL_USER;
    const superOrgName = process.env.ZAPPER_INITIAL_SUPER_ORG_NAME;

    if (!initialUser || !superOrgName) {
      console.log("Skipping seeding: ZAPPER_INITIAL_USER or ZAPPER_INITIAL_SUPER_ORG_NAME not set");
      return;
    }

    // Check if data already exists
    const existingRoles = await db.select().from(roles);
    if (existingRoles.length > 0) {
      console.log("Database already seeded");
      return;
    }

    console.log("Seeding initial data from environment variables...");

    // Create Super Admin role
    const roleData: InsertRole = {
      name: "Super Admin",
      description: "Full system access with all permissions",
      category: "dangerous"
    } as InsertRole;

    const [createdRole] = await db.insert(roles).values([roleData]).returning();

    // Create the super organization
    const orgData: InsertOrganization = {
      name: superOrgName,
      description: "Super organization with full access"
    };

    const [createdOrg] = await db.insert(organizations).values([orgData]).returning();

    // Create the initial user - using name as email if it contains @, otherwise assume it's a name
    const isEmail = initialUser.includes('@');
    const userData: InsertUser = {
      name: isEmail ? initialUser.split('@')[0] : initialUser,
      email: isEmail ? initialUser : `${initialUser}@example.com`,
      isEnabled: true
    };

    const [createdUser] = await db.insert(users).values([userData]).returning();

    // Create permissions with full access for User Management, Role Management, and all other permissions
    
    // User Management Permissions - ALL permissions
    const userMgmtPermission: InsertPermissionUserMgmt = {
      add: true,
      edit: true,
      delete: true,
      view: true,
      enableDisable: true
    };
    const [createdUserMgmtPerm] = await db.insert(permissionUserMgmt).values([userMgmtPermission]).returning();

    // Role Management Permissions - ALL permissions  
    const roleMgmtPermission: InsertPermissionRoleMgmt = {
      add: true,
      edit: true,
      delete: true,
      view: true
    };
    const [createdRoleMgmtPerm] = await db.insert(permissionRoleMgmt).values([roleMgmtPermission]).returning();

    // Organization Management Permissions - ALL permissions
    const orgMgmtPermission: InsertPermissionOrgMgmt = {
      add: true,
      edit: true,
      delete: true,
      view: true
    };
    const [createdOrgMgmtPerm] = await db.insert(permissionOrgMgmt).values([orgMgmtPermission]).returning();

    // Storage Management Permissions - ALL permissions
    const storageMgmtPermission: InsertPermissionStorageMgmt = {
      addStorageContainer: true,
      addContainer: true,
      view: true,
      delete: true,
      dataProtection: true,
      dataLifecycle: true,
      inventoryView: true,
      inventoryConfigure: true
    };
    const [createdStorageMgmtPerm] = await db.insert(permissionStorageMgmt).values([storageMgmtPermission]).returning();

    // File Management Permissions - ALL permissions (JSONB-based)
    const fileMgmtPermission: InsertPermissionFileMgmt = {
      permissions: { ...ALL_FILE_MGMT_PERMISSIONS },
    };
    const [createdFileMgmtPerm] = await db.insert(permissionFileMgmt).values([fileMgmtPermission]).returning();

    // Activity Logs Permissions - ALL permissions
    const activityLogsPermission: InsertPermissionActivityLogs = {
      view: true
    };
    const [createdActivityLogsPerm] = await db.insert(permissionActivityLogs).values([activityLogsPermission]).returning();

    // AI Agent Management Permissions - ALL permissions
    const aiAgentMgmtPermission: InsertPermissionAiAgentMgmt = {
      add: true,
      edit: true,
      delete: true,
      view: true
    };
    const [createdAiAgentMgmtPerm] = await db.insert(permissionAiAgentMgmt).values([aiAgentMgmtPermission]).returning();

    // PGP Key Management Permissions - ALL permissions
    const pgpKeyMgmtPermission: InsertPermissionPgpKeyMgmt = {
      view: true,
      generate: true,
      delete: true,
      copy: true,
      decrypt:true
    };
    const [createdPgpKeyMgmtPerm] = await db.insert(permissionPgpKeyMgmt).values([pgpKeyMgmtPermission]).returning();

    // Help Center Permissions - ALL chapters and troubleshooting articles enabled for Super Admin (JSON structure)
    const helpCenterPermission: InsertPermissionHelpCenter = {
      chapterWiseHelp: {
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
      },
      api: {
        api_integration_guide: true,
      },
      envVariable: {
        configuration_settings: true,
      },
      troubleshooting: {
        malware_scanning: true,
        storage_creation: true,
      }
    };
    const [createdHelpCenterPerm] = await db.insert(permissionHelpCenter).values([helpCenterPermission]).returning();

    // SIEM Management Permissions - ALL permissions enabled for Super Admin
    const siemMgmtPermission: InsertPermissionSiemMgmt = {
      install: true,
      delete: true,
      enableDisable: true,
      view: true,
      incidentsView: true
    };
    const [createdSiemMgmtPerm] = await db.insert(permissionSiemMgmt).values([siemMgmtPermission]).returning();

    // Foundry AI Management Permissions - ALL permissions enabled for Super Admin
    const foundryMgmtPermission: InsertPermissionFoundryMgmt = {
      add: true,
      edit: true,
      delete: true,
      view: true,
      tabWizard: true,
      tabResources: true,
      tabFoundryAction: true,
      tabChatPlayground: true,
      tabResourceSets: true,
      tabContentUnderstanding: true
    };
    const [createdFoundryMgmtPerm] = await db.insert(permissionFoundryMgmt).values([foundryMgmtPermission]).returning();

    // Content Understanding Permissions - ALL permissions enabled for Super Admin
    const contentUnderstandingPermission: InsertPermissionContentUnderstanding = {
      view: true,
      runAnalysis: true,
      saveAnalysis: true,
      deleteAnalysis: true,
      menuVisibility: true
    };
    const [createdContentUnderstandingPerm] = await db.insert(permissionContentUnderstanding).values([contentUnderstandingPermission]).returning();

    // Document Translation Permissions - ALL permissions enabled for Super Admin
    const documentTranslationPermission: InsertPermissionDocumentTranslation = {
      view: true,
      runTranslation: true,
      deleteTranslation: true
    };
    const [createdDocumentTranslationPerm] = await db.insert(permissionDocumentTranslation).values([documentTranslationPermission]).returning();

    // SFTP Management Permissions - ALL permissions enabled for Super Admin
    const sftpMgmtPermission: InsertPermissionSftpMgmt = {
      view: true,
      create: true,
      update: true,
      disable: true,
      delete: true,
      mapUser: true,
      viewSelfAccess: true,
      rotateSshSelf: true,
      rotatePasswordSelf: true
    };
    const [createdSftpMgmtPerm] = await db.insert(permissionSftpMgmt).values([sftpMgmtPermission]).returning();

    // Customer Onboarding Permissions - ALL permissions enabled for Super Admin
    const customerOnboardingPermission: InsertPermissionCustomerOnboarding = {
      view: true,
      upload: true,
      commit: true,
      delete: true
    };
    const [createdCustomerOnboardingPerm] = await db.insert(permissionCustomerOnboarding).values([customerOnboardingPermission]).returning();

    // Transfer Reports Permissions - ALL permissions enabled for Super Admin
    const transferReportsPermission: InsertPermissionTransferReports = {
      view: true,
      viewDetails: true,
      download: true
    };
    const [createdTransferReportsPerm] = await db.insert(permissionTransferReports).values([transferReportsPermission]).returning();

    // Create role permission mapping - linking all permissions to the Super Admin role
    const rolePermissionMapping: InsertRolePermissionModular = {
      roleId: createdRole.id,
      permissionUserMgmtId: createdUserMgmtPerm.id,
      permissionRoleMgmtId: createdRoleMgmtPerm.id,
      permissionOrgMgmtId: createdOrgMgmtPerm.id,
      permissionStorageMgmtId: createdStorageMgmtPerm.id,
      permissionFileMgmtId: createdFileMgmtPerm.id,
      permissionActivityLogsId: createdActivityLogsPerm.id,
      permissionAiAgentMgmtId: createdAiAgentMgmtPerm.id,
      permissionPgpKeyMgmtId: createdPgpKeyMgmtPerm.id,
      permissionHelpCenterId: createdHelpCenterPerm.id,
      permissionSiemMgmtId: createdSiemMgmtPerm.id,
      permissionFoundryMgmtId: createdFoundryMgmtPerm.id,
      permissionContentUnderstandingId: createdContentUnderstandingPerm.id,
      permissionDocumentTranslationId: createdDocumentTranslationPerm.id,
      permissionSftpMgmtId: createdSftpMgmtPerm.id,
      permissionCustomerOnboardingId: createdCustomerOnboardingPerm.id,
      permissionTransferReportsId: createdTransferReportsPerm.id
    };

    await db.insert(rolePermissionsModular).values([rolePermissionMapping]);

    // Assign the user to the role in the organization
    const userRoleData: InsertUserRole = {
      userId: createdUser.id,
      roleId: createdRole.id,
      organizationId: createdOrg.id,
      isEnabled: true
    };

    await db.insert(userRoles).values([userRoleData]);

    console.log("✓ Initial data seeded successfully from environment variables");
    console.log(`✓ Created user: ${userData.name} (${userData.email})`);
    console.log(`✓ Created organization: ${orgData.name}`);
    console.log(`✓ Created role: ${roleData.name} with all permissions`);
    console.log(`✓ User assigned to Super Admin role in ${orgData.name}`);

  } catch (error) {
    console.error("Error seeding data from environment variables:", error);
    throw error;
  }
}

export async function seedInitialData() {
  try {
    // Check if data already exists
    const existingRoles = await db.select().from(roles);
    if (existingRoles.length > 0) {
      console.log("Database already seeded");
      return;
    }

    console.log("Seeding initial data...");

    // Create roles based on actual database data
    const rolesData: InsertRole[] = [
      { name: "Super Admin", description: "Full system access", category: "dangerous" },
      { name: "Auditor", description: "", category: "info" },
      { name: "File Downloader", description: "File downloader ", category: "info" },
      { name: "testrole", description: "", category: "info" },
    ];

    const createdRoles = await db.insert(roles).values(rolesData).returning();

    // Create organizations based on actual database data
    const orgsData: InsertOrganization[] = [
      { name: "Zentech Solutions Pvt. Ltd.", description: "Content creation department" },
      { name: "QuantumMesh Technologies", description: "QuantumMesh Technologies" },
      { name: "Skybridge Innovations", description: "Marketing department" },
      { name: "NovaEdge Systems", description: "Product development team" },
      { name: "BlueOrbit Digital Inc.", description: "BlueOrbit Digital Inc." },
    ];

    const createdOrgs = await db.insert(organizations).values(orgsData).returning();

    // Create users based on actual database data
    const usersData: InsertUser[] = [
      { name: "New Prabhu5", email: "prabhutest@prabhuss73gmail.onmicrosoft.com" },
      { name: "prabhu srivastava", email: "prabhuss73@gmail.com" },
    ];

    const createdUsers = await db.insert(users).values(usersData).returning();

    // Create permission records based on actual database data
    // User Management Permissions
    const userMgmtPermissions: InsertPermissionUserMgmt[] = [
      { add: true, edit: true, delete: true, view: true, enableDisable: true },  // Super Admin
      { add: false, edit: true, delete: false, view: true, enableDisable: false }, // Auditor
      { add: true, edit: true, delete: true, view: true, enableDisable: true },   // File Downloader
      { add: true, edit: true, delete: true, view: true, enableDisable: false },  // testrole
    ];
    const createdUserMgmtPerms = await db.insert(permissionUserMgmt).values(userMgmtPermissions).returning();

    // Role Management Permissions
    const roleMgmtPermissions: InsertPermissionRoleMgmt[] = [
      { add: true, edit: true, delete: true, view: true },  // Super Admin
      { add: true, edit: false, delete: false, view: false }, // Auditor
      { add: false, edit: false, delete: false, view: false }, // File Downloader
      { add: false, edit: false, delete: false, view: false }, // testrole
    ];
    const createdRoleMgmtPerms = await db.insert(permissionRoleMgmt).values(roleMgmtPermissions).returning();

    // Organization Management Permissions
    const orgMgmtPermissions: InsertPermissionOrgMgmt[] = [
      { add: true, edit: true, delete: true, view: true },  // Super Admin
      { add: false, edit: false, delete: false, view: false }, // Auditor
      { add: false, edit: false, delete: false, view: false }, // File Downloader
      { add: false, edit: false, delete: false, view: false }, // testrole
    ];
    const createdOrgMgmtPerms = await db.insert(permissionOrgMgmt).values(orgMgmtPermissions).returning();

    // Storage Management Permissions
    const storageMgmtPermissions: InsertPermissionStorageMgmt[] = [
      { addStorageContainer: true, addContainer: true, view: true, delete: true, dataProtection: true, dataLifecycle: true, inventoryView: true, inventoryConfigure: true },  // Super Admin
      { addStorageContainer: false, addContainer: false, view: false, delete: false, dataProtection: false, dataLifecycle: false, inventoryView: false, inventoryConfigure: false }, // Auditor
      { addStorageContainer: false, addContainer: false, view: false, delete: false, dataProtection: false, dataLifecycle: false, inventoryView: false, inventoryConfigure: false }, // File Downloader
      { addStorageContainer: false, addContainer: false, view: false, delete: false, dataProtection: false, dataLifecycle: false, inventoryView: false, inventoryConfigure: false }, // testrole
    ];
    const createdStorageMgmtPerms = await db.insert(permissionStorageMgmt).values(storageMgmtPermissions).returning();

    // File Management Permissions (JSONB-based)
    const fileMgmtPermissions: InsertPermissionFileMgmt[] = [
      { permissions: { ...ALL_FILE_MGMT_PERMISSIONS } },  // Super Admin
      { permissions: { ...DEFAULT_FILE_MGMT_PERMISSIONS } }, // Auditor
      { permissions: { ...DEFAULT_FILE_MGMT_PERMISSIONS } }, // File Downloader
      { permissions: { ...DEFAULT_FILE_MGMT_PERMISSIONS } }, // testrole
    ];
    const createdFileMgmtPerms = await db.insert(permissionFileMgmt).values(fileMgmtPermissions).returning();

    // Activity Logs Permissions
    const activityLogsPermissions: InsertPermissionActivityLogs[] = [
      { view: true },  // Super Admin
      { view: false }, // Auditor
      { view: false }, // File Downloader
      { view: false }, // testrole
    ];
    const createdActivityLogsPerms = await db.insert(permissionActivityLogs).values(activityLogsPermissions).returning();

    // AI Agent Management Permissions (based on actual database data)
    const aiAgentMgmtPermissions: InsertPermissionAiAgentMgmt[] = [
      { add: false, edit: false, delete: false, view: false }, // ID 1 - Super Admin base
      { add: false, edit: false, delete: false, view: true },  // ID 2 - Auditor
      { add: false, edit: false, delete: false, view: true },  // ID 3 - File Downloader
      { add: false, edit: false, delete: false, view: true },  // ID 4 - testrole
      { add: true, edit: true, delete: true, view: true },     // ID 5 - Enhanced permissions
    ];
    const createdAiAgentMgmtPerms = await db.insert(permissionAiAgentMgmt).values(aiAgentMgmtPermissions).returning();

    // Help Center Permissions - Role-based chapter access (JSON structure)
    const helpCenterPermissions: InsertPermissionHelpCenter[] = [
      // Super Admin - All chapters enabled
      { 
        chapterWiseHelp: {
          getting_started: true, user_management: true, organization_management: true,
          role_permission_management: true, file_management: true, storage_management: true,
          data_protection: true, ai_agent_management: true, activity_logging: true,
          data_lifecycle_management: true, sftp_local_users: true, pgp_key_management: true,
          content_understanding: true, document_translation: true, siem_sentinel_integration: true,
          foundry_ai_chat_playground: true, cmk_encryption: true,
        },
        api: { api_integration_guide: true },
        envVariable: { configuration_settings: true },
        troubleshooting: { malware_scanning: true, storage_creation: true }
      },
      // Auditor - Limited chapters (Getting Started, Activity Logging, Troubleshooting)
      { 
        chapterWiseHelp: {
          getting_started: true, user_management: false, organization_management: false,
          role_permission_management: false, file_management: false, storage_management: false,
          data_protection: false, ai_agent_management: false, activity_logging: true,
          data_lifecycle_management: false, sftp_local_users: false, pgp_key_management: false,
          content_understanding: false, document_translation: false, siem_sentinel_integration: false,
          foundry_ai_chat_playground: false, cmk_encryption: false,
        },
        api: { api_integration_guide: false },
        envVariable: { configuration_settings: false },
        troubleshooting: { malware_scanning: true, storage_creation: true }
      },
      // File Downloader - File-related chapters
      { 
        chapterWiseHelp: {
          getting_started: true, user_management: false, organization_management: false,
          role_permission_management: false, file_management: true, storage_management: false,
          data_protection: false, ai_agent_management: false, activity_logging: false,
          data_lifecycle_management: false, sftp_local_users: false, pgp_key_management: false,
          content_understanding: false, document_translation: false, siem_sentinel_integration: false,
          foundry_ai_chat_playground: false, cmk_encryption: false,
        },
        api: { api_integration_guide: true },
        envVariable: { configuration_settings: false },
        troubleshooting: { malware_scanning: true, storage_creation: true }
      },
      // testrole - Basic chapters
      { 
        chapterWiseHelp: {
          getting_started: true, user_management: false, organization_management: false,
          role_permission_management: false, file_management: true, storage_management: false,
          data_protection: false, ai_agent_management: false, activity_logging: false,
          data_lifecycle_management: false, sftp_local_users: false, pgp_key_management: false,
          content_understanding: false, document_translation: false, siem_sentinel_integration: false,
          foundry_ai_chat_playground: false, cmk_encryption: false,
        },
        api: { api_integration_guide: false },
        envVariable: { configuration_settings: false },
        troubleshooting: { malware_scanning: true, storage_creation: true }
      }
    ];
    const createdHelpCenterPerms = await db.insert(permissionHelpCenter).values(helpCenterPermissions).returning();

    // Create role permission mappings with AI agent and help center permissions
    const rolePermissionMappings: InsertRolePermissionModular[] = [
      // Super Admin (role index 0)
      { roleId: createdRoles[0].id, permissionUserMgmtId: createdUserMgmtPerms[0].id },
      { roleId: createdRoles[0].id, permissionRoleMgmtId: createdRoleMgmtPerms[0].id },
      { roleId: createdRoles[0].id, permissionOrgMgmtId: createdOrgMgmtPerms[0].id },
      { roleId: createdRoles[0].id, permissionStorageMgmtId: createdStorageMgmtPerms[0].id },
      { roleId: createdRoles[0].id, permissionFileMgmtId: createdFileMgmtPerms[0].id },
      { roleId: createdRoles[0].id, permissionActivityLogsId: createdActivityLogsPerms[0].id },
      { roleId: createdRoles[0].id, permissionAiAgentMgmtId: createdAiAgentMgmtPerms[4].id }, // Enhanced permissions
      { roleId: createdRoles[0].id, permissionHelpCenterId: createdHelpCenterPerms[0].id }, // All chapters
      
      // Auditor (role index 1)
      { roleId: createdRoles[1].id, permissionUserMgmtId: createdUserMgmtPerms[1].id },
      { roleId: createdRoles[1].id, permissionRoleMgmtId: createdRoleMgmtPerms[1].id },
      { roleId: createdRoles[1].id, permissionOrgMgmtId: createdOrgMgmtPerms[1].id },
      { roleId: createdRoles[1].id, permissionStorageMgmtId: createdStorageMgmtPerms[1].id },
      { roleId: createdRoles[1].id, permissionFileMgmtId: createdFileMgmtPerms[1].id },
      { roleId: createdRoles[1].id, permissionActivityLogsId: createdActivityLogsPerms[1].id },
      { roleId: createdRoles[1].id, permissionAiAgentMgmtId: createdAiAgentMgmtPerms[1].id }, // View only
      { roleId: createdRoles[1].id, permissionHelpCenterId: createdHelpCenterPerms[1].id }, // Limited chapters
      
      // File Downloader (role index 2)
      { roleId: createdRoles[2].id, permissionUserMgmtId: createdUserMgmtPerms[2].id },
      { roleId: createdRoles[2].id, permissionRoleMgmtId: createdRoleMgmtPerms[2].id },
      { roleId: createdRoles[2].id, permissionOrgMgmtId: createdOrgMgmtPerms[2].id },
      { roleId: createdRoles[2].id, permissionStorageMgmtId: createdStorageMgmtPerms[2].id },
      { roleId: createdRoles[2].id, permissionFileMgmtId: createdFileMgmtPerms[2].id },
      { roleId: createdRoles[2].id, permissionActivityLogsId: createdActivityLogsPerms[2].id },
      { roleId: createdRoles[2].id, permissionAiAgentMgmtId: createdAiAgentMgmtPerms[2].id }, // View only
      { roleId: createdRoles[2].id, permissionHelpCenterId: createdHelpCenterPerms[2].id }, // File-related chapters
      
      // testrole (role index 3)
      { roleId: createdRoles[3].id, permissionUserMgmtId: createdUserMgmtPerms[3].id },
      { roleId: createdRoles[3].id, permissionRoleMgmtId: createdRoleMgmtPerms[3].id },
      { roleId: createdRoles[3].id, permissionOrgMgmtId: createdOrgMgmtPerms[3].id },
      { roleId: createdRoles[3].id, permissionStorageMgmtId: createdStorageMgmtPerms[3].id },
      { roleId: createdRoles[3].id, permissionFileMgmtId: createdFileMgmtPerms[3].id },
      { roleId: createdRoles[3].id, permissionActivityLogsId: createdActivityLogsPerms[3].id },
      { roleId: createdRoles[3].id, permissionAiAgentMgmtId: createdAiAgentMgmtPerms[3].id }, // View only
      { roleId: createdRoles[3].id, permissionHelpCenterId: createdHelpCenterPerms[3].id }, // Basic chapters
    ];

    await db.insert(rolePermissionsModular).values(rolePermissionMappings);

    // Create user roles based on actual database data
    const userRolesData: InsertUserRole[] = [
      { userId: createdUsers[0].id, roleId: createdRoles[0].id, organizationId: createdOrgs[3].id, isEnabled: true },  // New Prabhu5 -> Super Admin in NovaEdge Systems
      { userId: createdUsers[1].id, roleId: createdRoles[0].id, organizationId: createdOrgs[2].id, isEnabled: true },  // prabhu srivastava -> Super Admin in Skybridge Innovations
      { userId: createdUsers[1].id, roleId: createdRoles[1].id, organizationId: createdOrgs[4].id, isEnabled: false }, // prabhu srivastava -> Auditor in BlueOrbit Digital Inc (disabled)
      { userId: createdUsers[1].id, roleId: createdRoles[1].id, organizationId: createdOrgs[2].id, isEnabled: false }, // prabhu srivastava -> Auditor in Skybridge Innovations (disabled)
      { userId: createdUsers[1].id, roleId: createdRoles[2].id, organizationId: createdOrgs[4].id, isEnabled: true },  // prabhu srivastava -> File Downloader in BlueOrbit Digital Inc
      { userId: createdUsers[1].id, roleId: createdRoles[2].id, organizationId: createdOrgs[1].id, isEnabled: true },  // prabhu srivastava -> File Downloader in QuantumMesh Technologies
      { userId: createdUsers[1].id, roleId: createdRoles[3].id, organizationId: createdOrgs[1].id, isEnabled: true },  // prabhu srivastava -> testrole in QuantumMesh Technologies
    ];

    await db.insert(userRoles).values(userRolesData);

    // Create storage accounts based on actual database data
    const storageAccountsData: InsertStorageAccount[] = [
      { 
        name: "storagetest12344", 
        containerName: "storageoneproudct", 
        location: "Central India", 
        organizationId: createdOrgs[2].id // Skybridge Innovations
      },
    ];

    await db.insert(storageAccounts).values(storageAccountsData);

    // Create AI agents based on actual database data (encrypted API keys will be handled by the encryption function)
    const aiAgentsData: InsertAiAgent[] = [
      {
        name: "PrabhuAgent",
        apiEndpoint: "https://ea0084dddddde-8530-4d9e-aecd-d548710c0271-00-pbt5nt3lnktw.riker.replit.dev/api/my-role-permissionsddd",
        apiKey: "test-api-key-1234", // This will be encrypted by the storage layer
        organizationId: createdOrgs[2].id // Skybridge Innovations
      },
      {
        name: "Srivastava",
        apiEndpoint: "https://ea0084de-8530-4d9e-aecd-d548710c0271-00-pbt5nt3lnktw.riker.replit.dev/api/my-role-permissionsddd",
        apiKey: "test-api-key-5678", // This will be encrypted by the storage layer
        organizationId: createdOrgs[4].id // BlueOrbit Digital Inc
      },
    ];

    await db.insert(aiAgents).values(aiAgentsData);

    console.log("✓ Initial data seeded successfully");
    console.log(`✓ Created ${createdRoles.length} roles`);
    console.log(`✓ Created ${createdOrgs.length} organizations`);
    console.log(`✓ Created ${createdUsers.length} users`);
    console.log(`✓ Created user roles and permission mappings`);
    console.log(`✓ Created storage accounts and AI agents`);

  } catch (error) {
    console.error("Error seeding data:", error);
    throw error;
  }
}