import { 
  users, roles, organizations, userRoles, 
  userActivities, storageAccounts, aiAgents, rolePermissionsModular,
  orgPgpKeys, foundryResources, foundryResourceSets, cuJobs, haiJobs,
  permissionUserMgmt, permissionRoleMgmt, permissionOrgMgmt,
  permissionStorageMgmt, permissionFileMgmt, permissionActivityLogs,
  permissionAiAgentMgmt, permissionPgpKeyMgmt, permissionHelpCenter,
  permissionSiemMgmt, permissionFoundryMgmt, permissionContentUnderstanding, permissionHearingAi, permissionDocumentTranslation,
  permissionSftpMgmt, permissionCustomerOnboarding, permissionTransferReports, sftpLocalUsers, sftpLocalUserScopes, sftpRotationEvents,
  permissionRiskCategories, permissionEval,
  type User, type InsertUser, type Role, type InsertRole, 
  type Organization, type InsertOrganization,
  type UserRole, type InsertUserRole,
  type UserActivity, type InsertUserActivity, type StorageAccount, type InsertStorageAccount,
  type AiAgent, type InsertAiAgent,
  type OrgPgpKey, type InsertOrgPgpKey,
  type FoundryResource, type InsertFoundryResource,
  type FoundryResourceSet, type InsertFoundryResourceSet,
  type UserWithRole, type ActivityWithUser,
  type PermissionUserMgmt, type InsertPermissionUserMgmt,
  type PermissionRoleMgmt, type InsertPermissionRoleMgmt,
  type PermissionOrgMgmt, type InsertPermissionOrgMgmt,
  type PermissionStorageMgmt, type InsertPermissionStorageMgmt,
  type PermissionFileMgmt, type InsertPermissionFileMgmt,
  type PermissionActivityLogs, type InsertPermissionActivityLogs,
  type PermissionAiAgentMgmt, type InsertPermissionAiAgentMgmt,
  type PermissionPgpKeyMgmt, type InsertPermissionPgpKeyMgmt,
  type PermissionHelpCenter, type InsertPermissionHelpCenter,
  type PermissionSiemMgmt, type InsertPermissionSiemMgmt,
  type PermissionFoundryMgmt, type InsertPermissionFoundryMgmt,
  type PermissionContentUnderstanding, type InsertPermissionContentUnderstanding,
  type InsertPermissionHearingAi,
  type HaiJob, type InsertHaiJob,
  type PermissionDocumentTranslation, type InsertPermissionDocumentTranslation,
  type PermissionSftpMgmt, type InsertPermissionSftpMgmt,
  type RolePermissionModular, type InsertRolePermissionModular,
  type SftpLocalUser, type InsertSftpLocalUser,
  type SftpLocalUserScope, type InsertSftpLocalUserScope,
  type SftpRotationEvent, type InsertSftpRotationEvent,
  type SftpLocalUserWithScopes,
  type CuJob, type InsertCuJob,
  type FileMgmtPermissions, DEFAULT_FILE_MGMT_PERMISSIONS,
  type UserMgmtPermissions, DEFAULT_USER_MGMT_PERMISSIONS,
  type PermissionRiskCategory, type InsertPermissionRiskCategory,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, count, isNull, sql, inArray, ne, like, or } from "drizzle-orm";
import * as crypto from "crypto";

// Note: API keys are now stored in plain text for development purposes
// In production, implement proper encryption for sensitive data

export interface ActivityFilters {
  search?: string;
  action?: string;
  category?: string;
  userEmail?: string;
}

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  getUsersWithRoles(roleFilter?: string, orgFilter?: string): Promise<UserWithRole[]>;
  getUsersWithRolesForOrganizations(organizationIds: number[], roleFilter?: string, orgFilter?: string): Promise<UserWithRole[]>;
  getAllUsersWithRoles(roleFilter?: string, orgFilter?: string): Promise<UserWithRole[]>;

  // Roles
  getAllRoles(): Promise<Role[]>;
  getRolesForUser(userEmail: string): Promise<Role[]>;
  getRole(id: number): Promise<Role | undefined>;
  getRoleByName(name: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  createRoleWithPermissions(role: InsertRole, permissions: any): Promise<Role>;
  updateRole(id: number, role: Partial<InsertRole>): Promise<Role | undefined>;
  deleteRole(id: number): Promise<boolean>;

  // Organizations
  getAllOrganizations(): Promise<Organization[]>;
  getOrganizationsForUser(userEmail: string): Promise<Organization[]>;
  getOrganization(id: number): Promise<Organization | undefined>;
  getOrganizationByName(name: string): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  updateOrganization(id: number, org: Partial<InsertOrganization>): Promise<Organization | undefined>;
  deleteOrganization(id: number): Promise<boolean>;

  // User Roles
  createUserRole(userRole: InsertUserRole): Promise<UserRole>;
  deleteUserRole(userId: number, roleId: number, organizationId: number): Promise<boolean>;
  deleteUserRoleById(userRoleId: number): Promise<boolean>;
  getUserRole(userId: number): Promise<UserRole | undefined>;
  getUserRoles(userId: number): Promise<UserRole[]>;
  getUserRolesByEmail(email: string): Promise<(UserRole & { role: Role; organization: Organization })[]>;
  getUserOrganizationIds(email: string): Promise<number[]>;
  getOrganizationIdsWithActivityLogsPermission(email: string): Promise<number[]>;
  enableUserRole(userId: number, roleId: number, organizationId: number): Promise<boolean>;
  disableUserRole(userId: number, roleId: number, organizationId: number): Promise<boolean>;

  // User Activities
  createUserActivity(activity: InsertUserActivity): Promise<UserActivity>;
  getUserActivities(organizationId: number, limit?: number, offset?: number, filters?: ActivityFilters): Promise<ActivityWithUser[]>;
  getUserActivitiesForActor(userEmail: string, permittedOrgIds: number[], limit?: number, offset?: number, filters?: ActivityFilters): Promise<ActivityWithUser[]>;
  updateUserActivity(sessionId: string, data: Partial<InsertUserActivity>): Promise<UserActivity | undefined>;

  // Storage Accounts
  getAllStorageAccounts(kind?: 'blob' | 'adls'): Promise<StorageAccount[]>;
  getStorageAccountsForOrganizations(organizationIds: number[], kind?: 'blob' | 'adls'): Promise<StorageAccount[]>;
  getStorageAccountsByOrganization(organizationId: number, kind?: 'blob' | 'adls'): Promise<StorageAccount[]>;
  getStorageAccountByOrganization(organizationId: number): Promise<StorageAccount | undefined>;
  getStorageAccountByName(name: string): Promise<StorageAccount | undefined>;
  createStorageAccount(account: InsertStorageAccount): Promise<StorageAccount>;
  updateStorageAccount(id: number, account: Partial<InsertStorageAccount>): Promise<StorageAccount | undefined>;
  deleteStorageAccount(id: number): Promise<boolean>;

  // AI Agents
  getAllAiAgents(): Promise<AiAgent[]>;
  getAiAgentsForOrganizations(organizationIds: number[]): Promise<AiAgent[]>;
  getAiAgent(id: number): Promise<AiAgent | undefined>;
  createAiAgent(agent: InsertAiAgent): Promise<AiAgent>;
  updateAiAgent(id: number, agent: Partial<InsertAiAgent>): Promise<AiAgent | undefined>;
  deleteAiAgent(id: number): Promise<boolean>;

  // Dashboard Stats
  getDashboardStats(): Promise<{
    totalUsers: number;
    totalOrganizations: number;
    activeSessions: number;
    totalRoles: number;
  }>;

  // Check user permissions (simplified for now)
  checkUserPermission(userEmail: string, permissionName: string): Promise<boolean>;
  checkGranularFilePermission(userEmail: string, action: string, organizationId: number): Promise<boolean>;
  checkGranularUserPermission(userEmail: string, action: 'add' | 'edit' | 'delete' | 'view' | 'enableDisable', organizationId: number): Promise<boolean>;
  checkGranularOrganizationPermission(userEmail: string, action: 'add' | 'edit' | 'delete' | 'view'): Promise<boolean>;
  checkGranularRolePermission(userEmail: string, action: 'add' | 'edit' | 'delete' | 'view'): Promise<boolean>;
  checkGranularStoragePermission(userEmail: string, action: 'addStorageContainer' | 'addContainer' | 'view' | 'delete', organizationId: number): Promise<boolean>;
  checkUserPgpKeyPermission(userEmail: string, action: 'view' | 'generate' | 'delete' | 'copy' | 'decrypt'): Promise<boolean>;
  checkUserSiemPermission(userEmail: string, action: 'install' | 'delete' | 'enableDisable' | 'view' | 'incidentsView'): Promise<boolean>;
  checkUserFoundryPermission(userEmail: string, action: 'add' | 'edit' | 'delete' | 'view'): Promise<boolean>;
  checkUserContentUnderstandingPermission(userEmail: string, action: 'view' | 'runAnalysis' | 'saveAnalysis' | 'deleteAnalysis' | 'menuVisibility'): Promise<boolean>;
  checkUserHearingAiPermission(userEmail: string, action: 'view' | 'runAnalysis' | 'saveAnalysis' | 'deleteAnalysis' | 'menuVisibility'): Promise<boolean>;
  checkUserDocumentTranslationPermission(userEmail: string, action: 'view' | 'runTranslation' | 'deleteTranslation'): Promise<boolean>;
  checkUserEvalPermission(userEmail: string, action: 'view' | 'run' | 'review' | 'finalize' | 'menuVisibility'): Promise<boolean>;

  // Foundry AI Resources (organization-scoped - each resource belongs to one org)
  getFoundryResources(): Promise<FoundryResource[]>;
  getFoundryResourcesByOrganization(organizationId: number): Promise<FoundryResource[]>;
  getFoundryResourcesForOrganizations(organizationIds: number[]): Promise<FoundryResource[]>;
  getFoundryResource(id: number): Promise<FoundryResource | undefined>;
  getFoundryResourceByName(resourceName: string): Promise<FoundryResource | undefined>;
  createFoundryResource(resource: InsertFoundryResource): Promise<FoundryResource>;
  updateFoundryResource(id: number, resource: Partial<InsertFoundryResource>): Promise<FoundryResource | undefined>;
  deleteFoundryResource(id: number): Promise<boolean>;

  // Foundry Resource Sets (org-scoped chat configuration)
  getFoundryResourceSets(organizationId: number): Promise<FoundryResourceSet[]>;
  getFoundryResourceSetsForOrganizations(organizationIds: number[]): Promise<FoundryResourceSet[]>;
  getFoundryResourceSet(id: number): Promise<FoundryResourceSet | undefined>;
  getFoundryResourceSetByOrg(organizationId: number): Promise<FoundryResourceSet | undefined>;
  getFoundryResourceSetWithResourceByOrg(organizationId: number): Promise<{ resourceSet: FoundryResourceSet; foundryResource: FoundryResource } | undefined>;
  countOrganizationsLinkedToResource(foundryResourceId: number, excludeOrgId?: number): Promise<number>;
  createFoundryResourceSet(resourceSet: InsertFoundryResourceSet): Promise<FoundryResourceSet>;
  updateFoundryResourceSet(id: number, resourceSet: Partial<InsertFoundryResourceSet>): Promise<FoundryResourceSet | undefined>;
  deleteFoundryResourceSet(id: number): Promise<boolean>;

  // Role Permissions (Modular)
  getRoleModularPermissions(roleId: number): Promise<any>;
  updateRoleModularPermissions(roleId: number, permissions: any): Promise<void>;
  getUserRolePermissions(userEmail: string, roleId: number): Promise<any>;
  isRoleAssignedToUser(userEmail: string, roleId: number): Promise<boolean>;
  
  // Help Center Permissions (aggregates across ALL user's enabled organizations)
  getUserHelpCenterPermissions(userId: number): Promise<{
    chapterWiseHelp: Record<string, boolean>;
    api: Record<string, boolean>;
    envVariable: Record<string, boolean>;
    troubleshooting: Record<string, boolean>;
  }>;

  // Organization PGP Keys (Multiple keys per organization)
  getOrgPgpKeys(organizationId: number): Promise<OrgPgpKey[]>;
  getOrgPgpKey(organizationId: number): Promise<OrgPgpKey | undefined>; // Deprecated: for backward compatibility
  getOrgPgpKeyById(keyId: number): Promise<OrgPgpKey | undefined>;
  getOrgPgpKeysByType(organizationId: number, belongsTo: 'SELF' | 'PARTNER'): Promise<OrgPgpKey[]>;
  createOrgPgpKey(key: InsertOrgPgpKey): Promise<OrgPgpKey>;
  updateOrgPgpKey(keyId: number, data: Partial<InsertOrgPgpKey>): Promise<OrgPgpKey | undefined>;
  deleteOrgPgpKey(organizationId: number): Promise<boolean>; // Deprecated: for backward compatibility
  deleteOrgPgpKeyById(keyId: number): Promise<boolean>;

  // SFTP Local Users
  getSftpLocalUsers(organizationIds: number[]): Promise<SftpLocalUserWithScopes[]>;
  getSftpLocalUserById(id: number): Promise<SftpLocalUserWithScopes | undefined>;
  getSftpLocalUserByMapping(userId: number): Promise<SftpLocalUserWithScopes | undefined>;
  getSftpLocalUserByMappingInOrg(userId: number, organizationId: number): Promise<SftpLocalUserWithScopes | undefined>;
  getSftpLocalUserByMappedUserInOrg(organizationId: number, mappedUserId: number): Promise<SftpLocalUser | undefined>;
  getSftpLocalUserByUsername(storageAccountName: string, localUsername: string, organizationId: number): Promise<SftpLocalUser | undefined>;
  createSftpLocalUser(data: InsertSftpLocalUser): Promise<SftpLocalUser>;
  updateSftpLocalUser(id: number, data: Partial<InsertSftpLocalUser>): Promise<SftpLocalUser | undefined>;
  deleteSftpLocalUser(id: number): Promise<boolean>;

  // SFTP Local User Scopes
  getSftpLocalUserScopes(sftpLocalUserId: number): Promise<SftpLocalUserScope[]>;
  replaceSftpLocalUserScopes(sftpLocalUserId: number, organizationId: number, scopes: Omit<InsertSftpLocalUserScope, 'sftpLocalUserId' | 'organizationId'>[]): Promise<void>;

  // SFTP Rotation Events
  createSftpRotationEvent(data: InsertSftpRotationEvent): Promise<SftpRotationEvent>;
  getSftpRotationEvents(sftpLocalUserId: number, limit?: number): Promise<SftpRotationEvent[]>;

  // SFTP Permission checks
  checkUserSftpPermission(userEmail: string, action: 'view' | 'create' | 'update' | 'disable' | 'delete' | 'mapUser' | 'viewSelfAccess' | 'rotateSshSelf' | 'rotatePasswordSelf'): Promise<boolean>;
  
  // Customer Onboarding Permission checks
  checkUserCustomerOnboardingPermission(userEmail: string, action: 'view' | 'upload' | 'commit' | 'delete'): Promise<boolean>;

  // Content Understanding Async Jobs (Video Analysis)
  createCuJob(job: InsertCuJob): Promise<CuJob>;
  getCuJob(jobId: string): Promise<CuJob | undefined>;
  getCuJobsByUser(userId: number, limit?: number): Promise<CuJob[]>;
  getCuJobsByOrganization(organizationId: number, limit?: number): Promise<CuJob[]>;
  updateCuJob(jobId: string, data: Partial<InsertCuJob>): Promise<CuJob | undefined>;
  deleteCuJob(jobId: string): Promise<boolean>;
  getPendingCuJobs(): Promise<CuJob[]>;

  // HearingAI Async Jobs
  createHaiJob(job: InsertHaiJob): Promise<HaiJob>;
  getHaiJob(jobId: string): Promise<HaiJob | undefined>;
  getHaiJobsByUser(userId: number, limit?: number): Promise<HaiJob[]>;
  getHaiJobsByOrganization(organizationId: number, limit?: number): Promise<HaiJob[]>;
  updateHaiJob(jobId: string, data: Partial<InsertHaiJob>): Promise<HaiJob | undefined>;
  deleteHaiJob(jobId: string): Promise<boolean>;
  getPendingHaiJobs(): Promise<HaiJob[]>;

  // Permission Risk Categories
  getPermissionRiskCategories(): Promise<PermissionRiskCategory[]>;
  updatePermissionRiskCategory(id: number, data: Partial<InsertPermissionRiskCategory>): Promise<PermissionRiskCategory | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(user)
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }

  async deleteUser(id: number): Promise<boolean> {
    // Use transaction with row-level locking to prevent race conditions
    return await db.transaction(async (tx) => {
      // Lock all users for update to prevent concurrent deletions
      // This ensures only one delete operation can proceed at a time
      const allUsers = await tx
        .select({ id: users.id })
        .from(users)
        .for('update');
      
      // Check if this is the last user in the system
      if (allUsers.length <= 1) {
        throw new Error("Cannot delete the last user. The system requires at least one user to remain operational. Please create a new user before deleting this one.");
      }

      // Proceed with deletion
      const result = await tx.delete(users).where(eq(users.id, id));
      return result.rowCount !== null && result.rowCount > 0;
    });
  }

  async getUsersWithRoles(roleFilter?: string, orgFilter?: string): Promise<UserWithRole[]> {
    let query = db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        isEnabled: userRoles.isEnabled,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        roleName: roles.name,
        organizationName: organizations.name,
        userRoleId: userRoles.id,
        roleId: userRoles.roleId,
        organizationId: userRoles.organizationId,
        roleCategory: roles.category,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(organizations, eq(userRoles.organizationId, organizations.id));

    const whereConditions: any[] = [];
    
    if (roleFilter) {
      whereConditions.push(eq(roles.name, roleFilter));
    }

    if (orgFilter) {
      whereConditions.push(eq(organizations.name, orgFilter));
    }
    
    if (whereConditions.length > 0) {
      query = query.where(whereConditions.length === 1 ? whereConditions[0] : and(...whereConditions)) as typeof query;
    }

    const results = await query;
    return results;
  }

  async getUsersWithRolesForOrganizations(organizationIds: number[], roleFilter?: string, orgFilter?: string): Promise<UserWithRole[]> {
    if (organizationIds.length === 0) {
      return [];
    }

    const conditions = [inArray(userRoles.organizationId, organizationIds)];
    if (roleFilter && roleFilter !== "all") {
      conditions.push(eq(roles.name, roleFilter));
    }
    if (orgFilter && orgFilter !== "all") {
      conditions.push(eq(organizations.name, orgFilter));
    }

    let query = db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        userType: users.userType,
        isEnabled: userRoles.isEnabled,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        roleName: roles.name,
        organizationName: organizations.name,
        userRoleId: userRoles.id,
        roleId: userRoles.roleId,
        organizationId: userRoles.organizationId,
        roleCategory: roles.category,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(organizations, eq(userRoles.organizationId, organizations.id))
      .where(and(...conditions));

    const results = await query;
    return results;
  }

  async getAllUsersWithRoles(roleFilter?: string, orgFilter?: string): Promise<UserWithRole[]> {
    const baseQuery = db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        userType: users.userType,
        isEnabled: userRoles.isEnabled,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        roleName: roles.name,
        organizationName: organizations.name,
        userRoleId: userRoles.id,
        roleId: userRoles.roleId,
        organizationId: userRoles.organizationId,
        roleCategory: roles.category,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(organizations, eq(userRoles.organizationId, organizations.id));

    // Build where conditions
    const conditions = [];
    if (roleFilter && roleFilter !== "all") {
      conditions.push(eq(roles.name, roleFilter));
    }
    if (orgFilter && orgFilter !== "all") {
      conditions.push(eq(organizations.name, orgFilter));
    }

    // Apply where clause if we have conditions
    let query;
    if (conditions.length > 0) {
      query = baseQuery.where(and(...conditions));
    } else {
      query = baseQuery;
    }

    const results = await query;
    return results;
  }

  async getAllRoles(): Promise<Role[]> {
    return await db.select().from(roles);
  }

  async getRolesForUser(userEmail: string): Promise<Role[]> {
    // Fixed: Combined into single query (Problem #1) - was 2 separate queries
    const results = await db
      .selectDistinct({
        id: roles.id,
        name: roles.name,
        description: roles.description,
        category: roles.category,
        createdAt: roles.createdAt,
      })
      .from(roles)
      .innerJoin(userRoles, eq(roles.id, userRoles.roleId))
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(and(eq(users.email, userEmail), eq(userRoles.isEnabled, true)));

    return results;
  }

  async getRole(id: number): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role || undefined;
  }

  async getRoleByName(name: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.name, name));
    return role || undefined;
  }

  async createRole(role: InsertRole): Promise<Role> {
    const [newRole] = await db.insert(roles).values({ ...role, category: 'info' }).returning();
    return newRole;
  }

  async createRoleWithPermissions(role: InsertRole, permissions: any): Promise<Role> {
    // Compute the category based on permissions before creating
    const category = await this.computeRoleCategory(permissions);
    const [newRole] = await db.insert(roles).values({ ...role, category }).returning();
    
    // Create modular permissions for the new role
    await this.createModularPermissions(newRole.id, permissions);
    
    return newRole;
  }

  private async computeRoleCategory(permissions: any): Promise<string> {
    try {
      const riskCategories = await this.getPermissionRiskCategories();
      const activePermissionPaths: string[] = [];
      
      // Extract flattened dot-notation paths for active permissions
      const extractPermPaths = (obj: any, parentKey: string = '') => {
        if (!obj || typeof obj !== 'object') return;
        
        for (const [key, value] of Object.entries(obj)) {
          // Map frontend/UI naming to schema dot-notation naming
          const normalizedKey = key === 'userManagement' ? 'userMgmt' :
                                key === 'roleManagement' ? 'roleMgmt' :
                                key === 'organizations' ? 'orgMgmt' :
                                key === 'storage' ? 'storageMgmt' :
                                key === 'files' ? 'fileMgmt' :
                                key === 'activityLogs' ? 'activityLogs' :
                                key === 'aiAgentMgmt' ? 'aiAgentMgmt' :
                                key === 'pgpKeyMgmt' ? 'pgpKeyMgmt' :
                                key === 'siemManagement' ? 'siemMgmt' :
                                key === 'foundryMgmt' ? 'foundryMgmt' :
                                key === 'contentUnderstanding' ? 'contentUnderstanding' :
                                key === 'documentTranslation' ? 'documentTranslation' :
                                key === 'sftpMgmt' ? 'sftpMgmt' :
                                key === 'customerOnboarding' ? 'customerOnboarding' :
                                key === 'transferReports' ? 'transferReports' :
                                key;

          const currentPath = parentKey ? `${parentKey}.${normalizedKey}` : normalizedKey;
          
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Recurse for nested objects
            extractPermPaths(value, currentPath);
          } else if (value === true || value === 'Y' || value === 'R') {
            activePermissionPaths.push(currentPath);
          }
        }
      };
      
      extractPermPaths(permissions);
      console.log(`[RISK-COMPUTE] Active permission paths detected:`, activePermissionPaths);

      // Filter categories that have at least one matching active permission
      const activeRisks = riskCategories.filter(cat => 
        cat.permissions.some((p: string) => activePermissionPaths.includes(p))
      );

      if (activeRisks.length === 0) return 'info';

      // Prioritize: dangerous > critical > warning > info
      const priorityOrder = ['dangerous', 'critical', 'warning', 'info'];
      for (const catName of priorityOrder) {
        if (activeRisks.some(r => r.category === catName)) {
          console.log(`[RISK-COMPUTE] Risk category identified: ${catName}`);
          return catName;
        }
      }

      return 'info';
    } catch (error) {
      console.error("Error computing role category:", error);
      return 'info';
    }
  }

  async createDefaultModularPermissions(roleId: number): Promise<void> {
    // Create default permission records
    const userMgmtData: InsertPermissionUserMgmt = {
      permissions: DEFAULT_USER_MGMT_PERMISSIONS,
      createdBy: null,
      updatedBy: null,
    };

    const roleMgmtData: InsertPermissionRoleMgmt = {
      add: false,
      edit: false,
      delete: false,
      view: false,
      createdBy: null,
      updatedBy: null,
    };

    const orgMgmtData: InsertPermissionOrgMgmt = {
      add: false,
      edit: false,
      delete: false,
      view: false,
      createdBy: null,
      updatedBy: null,
    };

    const storageMgmtData: InsertPermissionStorageMgmt = {
      addStorageContainer: false,
      addContainer: false,
      view: false,
      delete: false,
      dataProtection: false,
      dataLifecycle: false,
      inventoryView: false,
      inventoryConfigure: false,
      createdBy: null,
      updatedBy: null,
    };

    const fileMgmtData: InsertPermissionFileMgmt = {
      permissions: { ...DEFAULT_FILE_MGMT_PERMISSIONS },
      createdBy: null,
      updatedBy: null,
    };

    const activityLogsData: InsertPermissionActivityLogs = {
      view: false,
      createdBy: null,
      updatedBy: null,
    };

    const pgpKeyMgmtData: InsertPermissionPgpKeyMgmt = {
      view: false,
      generate: false,
      delete: false,
      copy: false,
      decrypt: false,
      createdBy: null,
      updatedBy: null,
    };

    const siemMgmtData: InsertPermissionSiemMgmt = {
      install: false,
      delete: false,
      enableDisable: false,
      view: false,
    };

    const [userMgmt] = await db.insert(permissionUserMgmt).values(userMgmtData).returning();
    const [roleMgmt] = await db.insert(permissionRoleMgmt).values(roleMgmtData).returning();
    const [orgMgmt] = await db.insert(permissionOrgMgmt).values(orgMgmtData).returning();
    const [storageMgmt] = await db.insert(permissionStorageMgmt).values(storageMgmtData).returning();
    const [fileMgmt] = await db.insert(permissionFileMgmt).values(fileMgmtData).returning();
    const [activityLogs] = await db.insert(permissionActivityLogs).values(activityLogsData).returning();
    const [pgpKeyMgmt] = await db.insert(permissionPgpKeyMgmt).values(pgpKeyMgmtData).returning();
    const [siemMgmt] = await db.insert(permissionSiemMgmt).values(siemMgmtData).returning();

    // Link all permissions to the role
    const rolePermissionData: InsertRolePermissionModular = {
      roleId,
      permissionUserMgmtId: userMgmt.id,
      permissionRoleMgmtId: roleMgmt.id,
      permissionOrgMgmtId: orgMgmt.id,
      permissionStorageMgmtId: storageMgmt.id,
      permissionFileMgmtId: fileMgmt.id,
      permissionActivityLogsId: activityLogs.id,
      permissionPgpKeyMgmtId: pgpKeyMgmt.id,
      permissionSiemMgmtId: siemMgmt.id,
    };

    await db.insert(rolePermissionsModular).values(rolePermissionData);
  }

  async createModularPermissions(roleId: number, permissions: any): Promise<void> {
    console.log(`[CREATE-PERMS] Creating permissions for role ${roleId}`);
    console.log(`[CREATE-PERMS] Input permissions.files:`, JSON.stringify(permissions.files, null, 2));
    
    // Create permission records with provided values
    const userMgmtData: InsertPermissionUserMgmt = {
      permissions: {
        add: permissions.userManagement?.add || false,
        edit: permissions.userManagement?.edit || false,
        delete: permissions.userManagement?.delete || false,
        view: permissions.userManagement?.view || false,
        enableDisable: permissions.userManagement?.enableDisable || false,
      },
      createdBy: null,
      updatedBy: null,
    };

    const roleMgmtData: InsertPermissionRoleMgmt = {
      add: permissions.roleManagement?.add || false,
      edit: permissions.roleManagement?.edit || false,
      delete: permissions.roleManagement?.delete || false,
      view: permissions.roleManagement?.view || false,
      createdBy: null,
      updatedBy: null,
    };

    const orgMgmtData: InsertPermissionOrgMgmt = {
      add: permissions.organizations?.add || false,
      edit: permissions.organizations?.edit || false,
      delete: permissions.organizations?.delete || false,
      view: permissions.organizations?.view || false,
      createdBy: null,
      updatedBy: null,
    };

    const storageMgmtData: InsertPermissionStorageMgmt = {
      addStorageContainer: permissions.storage?.addStorageContainer || false,
      addContainer: permissions.storage?.addContainer || false,
      view: permissions.storage?.view || false,
      delete: permissions.storage?.delete || false,
      dataProtection: permissions.storage?.dataProtection || false,
      dataLifecycle: permissions.storage?.dataLifecycle || false,
      createdBy: null,
      updatedBy: null,
    };

    const fileMgmtPerms: FileMgmtPermissions = {
      ...DEFAULT_FILE_MGMT_PERMISSIONS,
    };
    if (permissions.files) {
      for (const key of Object.keys(DEFAULT_FILE_MGMT_PERMISSIONS)) {
        if (permissions.files[key] !== undefined) {
          fileMgmtPerms[key] = permissions.files[key] || false;
        }
      }
    }
    const fileMgmtData: InsertPermissionFileMgmt = {
      permissions: fileMgmtPerms,
      createdBy: null,
      updatedBy: null,
    };

    console.log(`[CREATE-PERMS] fileMgmtData prepared for insert:`, JSON.stringify(fileMgmtData, null, 2));

    const activityLogsData: InsertPermissionActivityLogs = {
      view: permissions.activityLogs?.view || false,
      createdBy: null,
      updatedBy: null,
    };

    const aiAgentMgmtData: InsertPermissionAiAgentMgmt = {
      add: permissions.aiAgentMgmt?.add || false,
      edit: permissions.aiAgentMgmt?.edit || false,
      delete: permissions.aiAgentMgmt?.delete || false,
      view: permissions.aiAgentMgmt?.view || false,
      createdBy: null,
      updatedBy: null,
    };

    const pgpKeyMgmtData: InsertPermissionPgpKeyMgmt = {
      view: permissions.pgpKeyMgmt?.view || false,
      generate: permissions.pgpKeyMgmt?.generate || false,
      delete: permissions.pgpKeyMgmt?.delete || false,
      copy: permissions.pgpKeyMgmt?.copy || false,
      decrypt: permissions.pgpKeyMgmt?.decrypt || false,
      createdBy: null,
      updatedBy: null,
    };

    const helpCenterData: InsertPermissionHelpCenter = {
      chapterWiseHelp: permissions.helpCenter?.chapterWiseHelp || {},
      api: permissions.helpCenter?.api || {},
      envVariable: permissions.helpCenter?.envVariable || {},
      troubleshooting: permissions.helpCenter?.troubleshooting || {},
      createdBy: null,
      updatedBy: null,
    };

    const siemMgmtData: InsertPermissionSiemMgmt = {
      install: permissions.siemManagement?.install || false,
      delete: permissions.siemManagement?.delete || false,
      enableDisable: permissions.siemManagement?.enableDisable || false,
      view: permissions.siemManagement?.view || false,
      incidentsView: permissions.siemManagement?.incidentsView || false,
    };

    const foundryMgmtData: InsertPermissionFoundryMgmt = {
      add: permissions.foundryMgmt?.add || false,
      edit: permissions.foundryMgmt?.edit || false,
      delete: permissions.foundryMgmt?.delete || false,
      view: permissions.foundryMgmt?.view || false,
      tabWizard: permissions.foundryMgmt?.tabWizard || false,
      tabResources: permissions.foundryMgmt?.tabResources || false,
      tabFoundryAction: permissions.foundryMgmt?.tabFoundryAction || false,
      tabChatPlayground: permissions.foundryMgmt?.tabChatPlayground || false,
      tabResourceSets: permissions.foundryMgmt?.tabResourceSets || false,
      tabContentUnderstanding: permissions.foundryMgmt?.tabContentUnderstanding || false,
    };

    const contentUnderstandingData: InsertPermissionContentUnderstanding = {
      view: permissions.contentUnderstanding?.view || false,
      runAnalysis: permissions.contentUnderstanding?.runAnalysis || false,
      saveAnalysis: permissions.contentUnderstanding?.saveAnalysis || false,
      deleteAnalysis: permissions.contentUnderstanding?.deleteAnalysis || false,
      menuVisibility: permissions.contentUnderstanding?.menuVisibility || false,
    };

    const hearingAiData: InsertPermissionHearingAi = {
      view: permissions.hearingAi?.view || false,
      runAnalysis: permissions.hearingAi?.runAnalysis || false,
      saveAnalysis: permissions.hearingAi?.saveAnalysis || false,
      deleteAnalysis: permissions.hearingAi?.deleteAnalysis || false,
      menuVisibility: permissions.hearingAi?.menuVisibility || false,
    };

    const documentTranslationData: InsertPermissionDocumentTranslation = {
      view: permissions.documentTranslation?.view || false,
      runTranslation: permissions.documentTranslation?.runTranslation || false,
      deleteTranslation: permissions.documentTranslation?.deleteTranslation || false,
    };

    const sftpMgmtData: InsertPermissionSftpMgmt = {
      view: permissions.sftpMgmt?.view || false,
      create: permissions.sftpMgmt?.create || false,
      update: permissions.sftpMgmt?.update || false,
      disable: permissions.sftpMgmt?.disable || false,
      delete: permissions.sftpMgmt?.delete || false,
      mapUser: permissions.sftpMgmt?.mapUser || false,
      viewSelfAccess: permissions.sftpMgmt?.viewSelfAccess || false,
      rotateSshSelf: permissions.sftpMgmt?.rotateSshSelf || false,
      rotatePasswordSelf: permissions.sftpMgmt?.rotatePasswordSelf || false,
    };

    const customerOnboardingData = {
      view: permissions.customerOnboarding?.view || false,
      upload: permissions.customerOnboarding?.upload || false,
      commit: permissions.customerOnboarding?.commit || false,
      delete: permissions.customerOnboarding?.delete || false,
    };

    const transferReportsData = {
      view: permissions.transferReports?.view || false,
      viewDetails: permissions.transferReports?.viewDetails || false,
      download: permissions.transferReports?.download || false,
    };

    const evalData = {
      view: permissions.eval?.view || false,
      run: permissions.eval?.run || false,
      review: permissions.eval?.review || false,
      finalize: permissions.eval?.finalize || false,
      menuVisibility: permissions.eval?.menuVisibility || false,
    };

    const [userMgmt] = await db.insert(permissionUserMgmt).values(userMgmtData).returning();
    const [roleMgmt] = await db.insert(permissionRoleMgmt).values(roleMgmtData).returning();
    const [orgMgmt] = await db.insert(permissionOrgMgmt).values(orgMgmtData).returning();
    const [storageMgmt] = await db.insert(permissionStorageMgmt).values(storageMgmtData).returning();
    const [fileMgmt] = await db.insert(permissionFileMgmt).values(fileMgmtData).returning();
    const [activityLogs] = await db.insert(permissionActivityLogs).values(activityLogsData).returning();
    const [aiAgentMgmt] = await db.insert(permissionAiAgentMgmt).values(aiAgentMgmtData).returning();
    const [pgpKeyMgmt] = await db.insert(permissionPgpKeyMgmt).values(pgpKeyMgmtData).returning();
    const [helpCenter] = await db.insert(permissionHelpCenter).values(helpCenterData).returning();
    const [siemMgmt] = await db.insert(permissionSiemMgmt).values(siemMgmtData).returning();
    const [foundryMgmt] = await db.insert(permissionFoundryMgmt).values(foundryMgmtData).returning();
    const [contentUnderstanding] = await db.insert(permissionContentUnderstanding).values(contentUnderstandingData).returning();
    const [hearingAiPerm] = await db.insert(permissionHearingAi).values(hearingAiData).returning();
    const [documentTranslation] = await db.insert(permissionDocumentTranslation).values(documentTranslationData).returning();
    const [sftpMgmt] = await db.insert(permissionSftpMgmt).values(sftpMgmtData).returning();
    const [customerOnboarding] = await db.insert(permissionCustomerOnboarding).values(customerOnboardingData).returning();
    const [transferReports] = await db.insert(permissionTransferReports).values(transferReportsData).returning();
    const [evalPerm] = await db.insert(permissionEval).values(evalData).returning();

    console.log(`[CREATE-PERMS] File permissions inserted into DB:`, JSON.stringify(fileMgmt, null, 2));
    console.log(`[CREATE-PERMS] Help center permissions inserted into DB:`, JSON.stringify(helpCenter, null, 2));
    console.log(`[CREATE-PERMS] Content Understanding permissions inserted into DB:`, JSON.stringify(contentUnderstanding, null, 2));
    console.log(`[CREATE-PERMS] Document Translation permissions inserted into DB:`, JSON.stringify(documentTranslation, null, 2));
    console.log(`[CREATE-PERMS] SFTP Management permissions inserted into DB:`, JSON.stringify(sftpMgmt, null, 2));
    console.log(`[CREATE-PERMS] Customer Onboarding permissions inserted into DB:`, JSON.stringify(customerOnboarding, null, 2));
    console.log(`[CREATE-PERMS] Transfer Reports permissions inserted into DB:`, JSON.stringify(transferReports, null, 2));

    // Link all permissions to the role
    const rolePermissionData: InsertRolePermissionModular = {
      roleId,
      permissionUserMgmtId: userMgmt.id,
      permissionRoleMgmtId: roleMgmt.id,
      permissionOrgMgmtId: orgMgmt.id,
      permissionStorageMgmtId: storageMgmt.id,
      permissionFileMgmtId: fileMgmt.id,
      permissionActivityLogsId: activityLogs.id,
      permissionAiAgentMgmtId: aiAgentMgmt.id,
      permissionPgpKeyMgmtId: pgpKeyMgmt.id,
      permissionHelpCenterId: helpCenter.id,
      permissionSiemMgmtId: siemMgmt.id,
      permissionFoundryMgmtId: foundryMgmt.id,
      permissionContentUnderstandingId: contentUnderstanding.id,
      permissionHearingAiId: hearingAiPerm.id,
      permissionDocumentTranslationId: documentTranslation.id,
      permissionSftpMgmtId: sftpMgmt.id,
      permissionCustomerOnboardingId: customerOnboarding.id,
      permissionTransferReportsId: transferReports.id,
      permissionEvalId: evalPerm.id,
    };

    await db.insert(rolePermissionsModular).values(rolePermissionData);
    console.log(`[CREATE-PERMS] ✅ Permissions linked to role ${roleId}, file_mgmt_id: ${fileMgmt.id}, help_center_id: ${helpCenter.id}`);
  }

  async updateRole(id: number, role: Partial<InsertRole>): Promise<Role | undefined> {
    const [updatedRole] = await db
      .update(roles)
      .set(role)
      .where(eq(roles.id, id))
      .returning();
    return updatedRole || undefined;
  }

  async deleteRole(id: number): Promise<boolean> {
    try {
      console.log(`Starting deletion process for role ID: ${id}`);
      
      // Start a transaction to handle cascading deletes
      await db.transaction(async (tx) => {
        console.log(`Checking if this is the last role in the system...`);
        
        // PROTECTION 1: Prevent deletion of the last role in the system
        // Lock all roles for update to prevent concurrent deletions
        const allRoles = await tx
          .select({ id: roles.id })
          .from(roles)
          .for('update');
        
        if (allRoles.length <= 1) {
          throw new Error("Cannot delete the last role. The system requires at least one role to remain operational. Please create a new role before deleting this one.");
        }
        
        console.log(`✅ System has ${allRoles.length} roles, deletion check passed`);
        console.log(`Checking if role is assigned to any enabled users...`);
        
        // PROTECTION 2: Prevent deletion of roles assigned to enabled users
        const usersWithRole = await tx
          .select({
            userId: users.id,
            userName: users.name,
            userEmail: users.email,
            isEnabled: userRoles.isEnabled
          })
          .from(userRoles)
          .innerJoin(users, eq(userRoles.userId, users.id))
          .where(and(
            eq(userRoles.roleId, id),
            eq(userRoles.isEnabled, true)
          ));
        
        if (usersWithRole.length > 0) {
          const userNames = usersWithRole.map(u => u.userName).join(', ');
          throw new Error(`Cannot delete role that is assigned to ${usersWithRole.length} enabled user(s): ${userNames}. Please disable or remove this role from all users before deleting.`);
        }
        
        console.log(`✅ Role is not assigned to any enabled users, deletion allowed`);
        console.log(`Getting role permissions for role ID: ${id}`);
        
        // First, get the role permissions to delete associated modular permissions
        const rolePermissions = await tx
          .select()
          .from(rolePermissionsModular)
          .where(eq(rolePermissionsModular.roleId, id));

        console.log(`Found ${rolePermissions.length} role permission entries`);

        if (rolePermissions.length > 0) {
          const rolePermission = rolePermissions[0];
          console.log(`Role permission details:`, rolePermission);
          
          // IMPORTANT: Delete the role permissions modular entry FIRST
          console.log(`Deleting role permissions modular entry for role ${id}`);
          await tx.delete(rolePermissionsModular).where(eq(rolePermissionsModular.roleId, id));
          
          // Now delete the individual permission records
          if (rolePermission.permissionUserMgmtId) {
            console.log(`Deleting user mgmt permission ID: ${rolePermission.permissionUserMgmtId}`);
            await tx.delete(permissionUserMgmt).where(eq(permissionUserMgmt.id, rolePermission.permissionUserMgmtId));
          }
          if (rolePermission.permissionRoleMgmtId) {
            console.log(`Deleting role mgmt permission ID: ${rolePermission.permissionRoleMgmtId}`);
            await tx.delete(permissionRoleMgmt).where(eq(permissionRoleMgmt.id, rolePermission.permissionRoleMgmtId));
          }
          if (rolePermission.permissionOrgMgmtId) {
            console.log(`Deleting org mgmt permission ID: ${rolePermission.permissionOrgMgmtId}`);
            await tx.delete(permissionOrgMgmt).where(eq(permissionOrgMgmt.id, rolePermission.permissionOrgMgmtId));
          }
          if (rolePermission.permissionStorageMgmtId) {
            console.log(`Deleting storage mgmt permission ID: ${rolePermission.permissionStorageMgmtId}`);
            await tx.delete(permissionStorageMgmt).where(eq(permissionStorageMgmt.id, rolePermission.permissionStorageMgmtId));
          }
          if (rolePermission.permissionFileMgmtId) {
            console.log(`Deleting file mgmt permission ID: ${rolePermission.permissionFileMgmtId}`);
            await tx.delete(permissionFileMgmt).where(eq(permissionFileMgmt.id, rolePermission.permissionFileMgmtId));
          }
          if (rolePermission.permissionActivityLogsId) {
            console.log(`Deleting activity logs permission ID: ${rolePermission.permissionActivityLogsId}`);
            await tx.delete(permissionActivityLogs).where(eq(permissionActivityLogs.id, rolePermission.permissionActivityLogsId));
          }
          if (rolePermission.permissionAiAgentMgmtId) {
            console.log(`Deleting AI agent mgmt permission ID: ${rolePermission.permissionAiAgentMgmtId}`);
            await tx.delete(permissionAiAgentMgmt).where(eq(permissionAiAgentMgmt.id, rolePermission.permissionAiAgentMgmtId));
          }
          if (rolePermission.permissionPgpKeyMgmtId) {
            console.log(`Deleting PGP key mgmt permission ID: ${rolePermission.permissionPgpKeyMgmtId}`);
            await tx.delete(permissionPgpKeyMgmt).where(eq(permissionPgpKeyMgmt.id, rolePermission.permissionPgpKeyMgmtId));
          }
        }

        // Delete any user roles associated with this role
        console.log(`Deleting user roles for role ID: ${id}`);
        await tx.delete(userRoles).where(eq(userRoles.roleId, id));

        // Finally, delete the role itself
        console.log(`Deleting role ID: ${id}`);
        await tx.delete(roles).where(eq(roles.id, id));
        
        console.log(`Successfully deleted role ID: ${id}`);
      });

      return true;
    } catch (error) {
      console.error("Role deletion error:", error);
      return false;
    }
  }

  async getAllOrganizations(): Promise<Organization[]> {
    return await db.select().from(organizations);
  }

  async getOrganizationsForUser(userEmail: string): Promise<Organization[]> {
    const results = await db
      .selectDistinct({
        id: organizations.id,
        name: organizations.name,
        description: organizations.description,
        createdAt: organizations.createdAt,
        geoFencingEnabled: organizations.geoFencingEnabled,
        geoEnforcementMode: organizations.geoEnforcementMode,
        allowedCountries: organizations.allowedCountries,
      })
      .from(organizations)
      .innerJoin(userRoles, eq(organizations.id, userRoles.organizationId))
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(and(eq(users.email, userEmail), eq(userRoles.isEnabled, true)));

    return results as Organization[];
  }

  async getOrganization(id: number): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, id));
    return organization || undefined;
  }

  async getOrganizationByName(name: string): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.name, name));
    return organization || undefined;
  }

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [newOrganization] = await db.insert(organizations).values(org).returning();
    return newOrganization;
  }

  async updateOrganization(id: number, org: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const [updatedOrganization] = await db
      .update(organizations)
      .set(org)
      .where(eq(organizations.id, id))
      .returning();
    return updatedOrganization || undefined;
  }

  async deleteOrganization(id: number): Promise<boolean> {
    // Use transaction with row-level locking to prevent race conditions
    return await db.transaction(async (tx) => {
      // Lock all organizations for update to prevent concurrent deletions
      // This ensures only one delete operation can proceed at a time
      const allOrgs = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .for('update');
      
      // Check if this is the last organization in the system
      if (allOrgs.length <= 1) {
        throw new Error("Cannot delete the last organization. The system requires at least one organization to remain operational. Please create a new organization before deleting this one.");
      }

      // Check if organization has associated users
      const usersInOrg = await tx
        .select({ count: count() })
        .from(userRoles)
        .where(eq(userRoles.organizationId, id));

      if (usersInOrg[0].count > 0) {
        throw new Error("Cannot delete organization that has associated users. Please remove all users from this organization first.");
      }

      // Proceed with deletion
      const result = await tx.delete(organizations).where(eq(organizations.id, id));
      return result.rowCount !== null && result.rowCount > 0;
    });
  }

  async createUserRole(userRole: InsertUserRole): Promise<UserRole> {
    const [existing] = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, userRole.userId),
          eq(userRoles.roleId, userRole.roleId),
          eq(userRoles.organizationId, userRole.organizationId)
        )
      );

    if (existing) {
      if (!existing.isEnabled) {
        const [updated] = await db
          .update(userRoles)
          .set({ isEnabled: true })
          .where(eq(userRoles.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    }

    const [newUserRole] = await db.insert(userRoles).values(userRole).returning();
    return newUserRole;
  }

  async deleteUserRole(userId: number, roleId: number, organizationId: number): Promise<boolean> {
    const result = await db
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, roleId),
          eq(userRoles.organizationId, organizationId)
        )
      );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async deleteUserRoleById(userRoleId: number): Promise<boolean> {
    const result = await db.delete(userRoles).where(eq(userRoles.id, userRoleId));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getUserRole(userId: number): Promise<UserRole | undefined> {
    const [userRole] = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, userId))
      .limit(1);
    return userRole || undefined;
  }

  async getUserRoles(userId: number): Promise<UserRole[]> {
    return await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
  }

  async getUserRolesByEmail(email: string): Promise<(UserRole & { role: Role; organization: Organization })[]> {
    const results = await db
      .select({
        id: userRoles.id,
        userId: userRoles.userId,
        roleId: userRoles.roleId,
        organizationId: userRoles.organizationId,
        isEnabled: userRoles.isEnabled,
        createdAt: userRoles.createdAt,
        role: roles,
        organization: organizations,
      })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(organizations, eq(userRoles.organizationId, organizations.id))
      .where(eq(users.email, email));

    return results;
  }

  async getUserOrganizationIds(email: string): Promise<number[]> {
    const results = await db
      .select({ organizationId: userRoles.organizationId })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(and(eq(users.email, email), eq(userRoles.isEnabled, true)));

    return results.map(r => r.organizationId);
  }

  async getOrganizationIdsWithActivityLogsPermission(email: string): Promise<number[]> {
    const results = await db
      .select({ organizationId: userRoles.organizationId })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(rolePermissionsModular, eq(roles.id, rolePermissionsModular.roleId))
      .innerJoin(permissionActivityLogs, eq(rolePermissionsModular.permissionActivityLogsId, permissionActivityLogs.id))
      .where(
        and(
          eq(users.email, email),
          eq(userRoles.isEnabled, true),
          eq(permissionActivityLogs.view, true)
        )
      );

    const uniqueOrgIds = Array.from(new Set(results.map(r => r.organizationId)));
    console.log(`🔒 [ACTIVITY_LOGS] User ${email} has permission for ${uniqueOrgIds.length} orgs: [${uniqueOrgIds.join(', ')}]`);
    return uniqueOrgIds;
  }

  // 🔒 Multi-tenant access control validation - enhanced for user management
  async validateUserOrganizationAccess(userEmail: string, organizationId: number): Promise<boolean> {
    try {
      // // Check if user has USER_MANAGEMENT permission (global access)
      // const hasUserMgmtPermission = await this.checkUserPermission(userEmail, 'USER_MANAGEMENT');
      // if (hasUserMgmtPermission) {
      //   console.log(`🔒 [TENANT] Global user management access granted for ${userEmail} → organization ${organizationId}`);
      //   return true;
      // }

      // Otherwise, check if user belongs to this organization
      const userOrgIds = await this.getUserOrganizationIds(userEmail);
      const hasAccess = userOrgIds.includes(organizationId);
      
      if (!hasAccess) {
        console.log(`🔒 [TENANT] Access denied: User ${userEmail} not authorized for organization ${organizationId}`);
        console.log(`🔒 [TENANT] User's organizations: [${userOrgIds.join(', ')}]`);
      } else {
        console.log(`🔒 [TENANT] Access granted: User ${userEmail} authorized for organization ${organizationId}`);
      }
      
      return hasAccess;
    } catch (error) {
      console.error(`🔒 [TENANT] Error validating organization access:`, error);
      return false;
    }
  }

  // 🔒 Validate user can manage another user - simplified for USER_MANAGEMENT permission holders
  async validateUserManagementAccess(requestingUserEmail: string, targetUserId: number): Promise<boolean> {
    try {
      // Get requesting user's info
      const requestingUser = await this.getUserByEmail(requestingUserEmail);
      if (!requestingUser) {
        console.log(`🔒 [USER_MGMT] Requesting user not found: ${requestingUserEmail}`);
        return false;
      }

      // Get target user's info
      const targetUser = await this.getUser(targetUserId);
      if (!targetUser) {
        console.log(`🔒 [USER_MGMT] Target user not found: ${targetUserId}`);
        return false;
      }

      // Allow users to manage their own account
      if (requestingUser.id === targetUserId) {
        console.log(`🔒 [USER_MGMT] Self-management allowed for user ${requestingUserEmail}`);
        return true;
      }

      // Check if requesting user has USER_MANAGEMENT permission
      const hasUserMgmtPermission = await this.checkUserPermission(requestingUserEmail, 'USER_MANAGEMENT');
      if (hasUserMgmtPermission) {
        console.log(`🔒 [USER_MGMT] Global user management access granted for ${requestingUserEmail} → ${targetUser.email}`);
        return true;
      }

      console.log(`🔒 [USER_MGMT] Access denied: ${requestingUserEmail} lacks USER_MANAGEMENT permission`);
      return false;
    } catch (error) {
      console.error(`🔒 [USER_MGMT] Error validating user management access:`, error);
      return false;
    }
  }

  async enableUserRole(userId: number, roleId: number, organizationId: number): Promise<boolean> {
    const result = await db
      .update(userRoles)
      .set({ isEnabled: true })
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, roleId),
          eq(userRoles.organizationId, organizationId)
        )
      );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async disableUserRole(userId: number, roleId: number, organizationId: number): Promise<boolean> {
    const result = await db
      .update(userRoles)
      .set({ isEnabled: false })
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, roleId),
          eq(userRoles.organizationId, organizationId)
        )
      );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async createUserActivity(activity: InsertUserActivity): Promise<UserActivity> {
    const [newActivity] = await db.insert(userActivities).values(activity).returning();
    return newActivity;
  }

  async getUserActivities(organizationId: number, limit: number = 50, offset: number = 0, filters?: ActivityFilters): Promise<ActivityWithUser[]> {
    const limitValue = Math.min(Math.max(limit, 1), 100);
    const offsetValue = Math.max(offset, 0);

    // Build filter conditions
    const conditions = [eq(userActivities.organizationId, organizationId)];
    
    if (filters?.action) {
      conditions.push(eq(userActivities.action, filters.action));
    }
    if (filters?.category) {
      conditions.push(eq(userActivities.actionCategory, filters.category));
    }
    if (filters?.userEmail) {
      conditions.push(eq(userActivities.email, filters.userEmail));
    }
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          like(userActivities.email, searchTerm),
          like(userActivities.userName, searchTerm),
          like(userActivities.action, searchTerm),
          like(userActivities.resource, searchTerm)
        )!
      );
    }

    const results = await db
      .select({
        id: userActivities.id,
        userId: userActivities.userId,
        userName: userActivities.userName,
        email: userActivities.email,
        ipAddress: userActivities.ipAddress,
        action: userActivities.action,
        actionCategory: userActivities.actionCategory,
        resource: userActivities.resource,
        resourceType: userActivities.resourceType,
        details: userActivities.details,
        actionTime: userActivities.actionTime,
        loginTime: userActivities.loginTime,
        logoutTime: userActivities.logoutTime,
        sessionId: userActivities.sessionId,
        userAgent: userActivities.userAgent,
        organizationId: userActivities.organizationId,
        organizationName: userActivities.organizationName,
      })
      .from(userActivities)
      .where(and(...conditions))
      .orderBy(desc(userActivities.actionTime))
      .limit(limitValue)
      .offset(offsetValue);
    
    return results as ActivityWithUser[];
  }

  async getUserActivitiesForActor(userEmail: string, permittedOrgIds: number[], limit: number = 50, offset: number = 0, filters?: ActivityFilters): Promise<ActivityWithUser[]> {
    if (permittedOrgIds.length === 0) {
      console.log(`🔒 [ACTIVITY_LOGS] No permitted orgs for user ${userEmail}, returning empty results`);
      return [];
    }
    
    const limitValue = Math.min(Math.max(limit, 1), 100);
    const offsetValue = Math.max(offset, 0);
    
    console.log(`🔒 [ACTIVITY_LOGS] Fetching activities for ${userEmail} in orgs [${permittedOrgIds.join(', ')}] with filters: ${JSON.stringify(filters)}`);
    
    // Build filter conditions
    const conditions = [
      eq(userActivities.email, userEmail),
      inArray(userActivities.organizationId, permittedOrgIds)
    ];
    
    if (filters?.action) {
      conditions.push(eq(userActivities.action, filters.action));
    }
    if (filters?.category) {
      conditions.push(eq(userActivities.actionCategory, filters.category));
    }
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          like(userActivities.email, searchTerm),
          like(userActivities.userName, searchTerm),
          like(userActivities.action, searchTerm),
          like(userActivities.resource, searchTerm)
        )!
      );
    }
    
    const results = await db
      .select({
        id: userActivities.id,
        userId: userActivities.userId,
        userName: userActivities.userName,
        email: userActivities.email,
        ipAddress: userActivities.ipAddress,
        action: userActivities.action,
        actionCategory: userActivities.actionCategory,
        resource: userActivities.resource,
        resourceType: userActivities.resourceType,
        details: userActivities.details,
        actionTime: userActivities.actionTime,
        loginTime: userActivities.loginTime,
        logoutTime: userActivities.logoutTime,
        sessionId: userActivities.sessionId,
        userAgent: userActivities.userAgent,
        organizationId: userActivities.organizationId,
        organizationName: userActivities.organizationName,
      })
      .from(userActivities)
      .where(and(...conditions))
      .orderBy(desc(userActivities.actionTime))
      .limit(limitValue)
      .offset(offsetValue);
    
    return results as ActivityWithUser[];
  }

  async updateUserActivity(sessionId: string, data: Partial<InsertUserActivity>): Promise<UserActivity | undefined> {
    const [updatedActivity] = await db
      .update(userActivities)
      .set(data)
      .where(eq(userActivities.sessionId, sessionId))
      .returning();
    return updatedActivity || undefined;
  }

  // Get role permissions from the new modular permission system
  async getRoleModularPermissions(roleId: number): Promise<any> {
    // SECURITY NOTE: Drizzle's sql`` tagged template literal automatically parameterizes
    // all ${} interpolated values, preventing SQL injection. The ${roleId} below is
    // safely bound as a parameter, not concatenated into the SQL string.
    // This is equivalent to using prepared statements with $1, $2, etc. placeholders.
    const result = await db.execute(sql`
      SELECT 
        rpm.id,
        pu.permissions as user_permissions,
        pr.add as role_add, pr.edit as role_edit, pr.delete as role_delete, pr.view as role_view,
        po.add as org_add, po.edit as org_edit, po.delete as org_delete, po.view as org_view,
        ps.add_storage_container as storage_add_storage_container, ps.add_container as storage_add_container, ps.view as storage_view, ps.delete as storage_delete, ps.data_protection as storage_data_protection, ps.data_lifecycle as storage_data_lifecycle, ps.inventory_view as storage_inventory_view, ps.inventory_configure as storage_inventory_configure,
        pf.permissions as file_permissions,
        pa.view as activity_view,
        pai.add as ai_agent_add, pai.edit as ai_agent_edit, pai.delete as ai_agent_delete, pai.view as ai_agent_view,
        ppgp.view as pgp_key_view, ppgp.generate as pgp_key_generate, ppgp.delete as pgp_key_delete, ppgp.copy as pgp_key_copy, ppgp.decrypt as pgp_key_decrypt,
        phc.chapter_wise_help as help_chapter_wise_help, phc.api as help_api, phc.env_variable as help_env_variable, phc.troubleshooting as help_troubleshooting,
        psiem.install as siem_install, psiem.delete as siem_delete, psiem.enable_disable as siem_enable_disable, psiem.view as siem_view, psiem.incidents_view as siem_incidents_view,
        pfo.add as foundry_add, pfo.edit as foundry_edit, pfo.delete as foundry_delete, pfo.view as foundry_view,
        pfo.tab_wizard as foundry_tab_wizard, pfo.tab_resources as foundry_tab_resources, pfo.tab_foundry_action as foundry_tab_foundry_action,
        pfo.tab_chat_playground as foundry_tab_chat_playground, pfo.tab_resource_sets as foundry_tab_resource_sets, pfo.tab_content_understanding as foundry_tab_content_understanding,
        pcu.view as cu_view, pcu.run_analysis as cu_run_analysis, pcu.save_analysis as cu_save_analysis, pcu.delete_analysis as cu_delete_analysis, pcu.menu_visibility as cu_menu_visibility,
        phai.view as hai_view, phai.run_analysis as hai_run_analysis, phai.save_analysis as hai_save_analysis, phai.delete_analysis as hai_delete_analysis, phai.menu_visibility as hai_menu_visibility,
        pdt.view as dt_view, pdt.run_translation as dt_run_translation, pdt.delete_translation as dt_delete_translation,
        psftp.view as sftp_view, psftp."create" as sftp_create, psftp."update" as sftp_update, psftp.disable as sftp_disable, psftp.delete as sftp_delete, psftp.map_user as sftp_map_user, psftp.view_self_access as sftp_view_self_access, psftp.rotate_ssh_self as sftp_rotate_ssh_self, psftp.rotate_password_self as sftp_rotate_password_self,
        pco.view as co_view, pco.upload as co_upload, pco.commit as co_commit, pco.delete as co_delete,
        ptr.view as tr_view, ptr.view_details as tr_view_details, ptr.download as tr_download,
        pev.view as ev_view, pev.run as ev_run, pev.review as ev_review, pev.finalize as ev_finalize, pev.menu_visibility as ev_menu_visibility
      FROM role_permissions_modular rpm
      LEFT JOIN permission_user_mgmt pu ON rpm.permission_user_mgmt_id = pu.id
      LEFT JOIN permission_role_mgmt pr ON rpm.permission_role_mgmt_id = pr.id
      LEFT JOIN permission_org_mgmt po ON rpm.permission_org_mgmt_id = po.id
      LEFT JOIN permission_storage_mgmt ps ON rpm.permission_storage_mgmt_id = ps.id
      LEFT JOIN permission_file_mgmt pf ON rpm.permission_file_mgmt_id = pf.id
      LEFT JOIN permission_activity_logs pa ON rpm.permission_activity_logs_id = pa.id
      LEFT JOIN permission_ai_agent_mgmt pai ON rpm.permission_ai_agent_mgmt_id = pai.id
      LEFT JOIN permission_pgp_key_mgmt ppgp ON rpm.permission_pgp_key_mgmt_id = ppgp.id
      LEFT JOIN permission_help_center phc ON rpm.permission_help_center_id = phc.id
      LEFT JOIN permission_siem_mgmt psiem ON rpm.permission_siem_mgmt_id = psiem.id
      LEFT JOIN permission_foundry_mgmt pfo ON rpm.permission_foundry_mgmt_id = pfo.id
      LEFT JOIN permission_content_understanding pcu ON rpm.permission_content_understanding_id = pcu.id
      LEFT JOIN permission_hearing_ai phai ON rpm.permission_hearing_ai_id = phai.id
      LEFT JOIN permission_document_translation pdt ON rpm.permission_document_translation_id = pdt.id
      LEFT JOIN permission_sftp_mgmt psftp ON rpm.permission_sftp_mgmt_id = psftp.id
      LEFT JOIN permission_customer_onboarding pco ON rpm.permission_customer_onboarding_id = pco.id
      LEFT JOIN permission_transfer_reports ptr ON rpm.permission_transfer_reports_id = ptr.id
      LEFT JOIN permission_eval pev ON rpm.permission_eval_id = pev.id
      WHERE rpm.role_id = ${roleId}
    `);
    
    const data = result.rows[0] || null;
    if (data) {
      console.log(`[GET-PERMS] Retrieved permissions for role ${roleId}:`);
      console.log(`[GET-PERMS] file_permissions=`, JSON.stringify(data.file_permissions));
    }
    return data;
  }

  // Update role permissions in the modular system
  async updateRoleModularPermissions(roleId: number, permissions: any): Promise<void> {
    // First, get the existing role permissions
    const existing = await this.getRoleModularPermissions(roleId);
    
    if (existing) {
      // SECURITY NOTE: All UPDATE statements below use Drizzle's sql`` template literal
      // which automatically parameterizes ${} values. The roleId and permission values
      // are safely bound as parameters, preventing SQL injection attacks.
      // Update existing permission records
      const userMgmtPermissions = JSON.stringify({
        add: permissions.userManagement.add || false,
        edit: permissions.userManagement.edit || false,
        delete: permissions.userManagement.delete || false,
        view: permissions.userManagement.view || false,
        enableDisable: permissions.userManagement.enableDisable || false,
      });
      await db.execute(sql`
        UPDATE permission_user_mgmt 
        SET permissions = ${userMgmtPermissions}::jsonb
        WHERE id = (
          SELECT permission_user_mgmt_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        )
      `);

      await db.execute(sql`
        UPDATE permission_role_mgmt 
        SET add = ${permissions.roleManagement.add}, 
            edit = ${permissions.roleManagement.edit}, 
            delete = ${permissions.roleManagement.delete}, 
            view = ${permissions.roleManagement.view}
        WHERE id = (
          SELECT permission_role_mgmt_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        )
      `);

      await db.execute(sql`
        UPDATE permission_org_mgmt 
        SET add = ${permissions.organizations.add}, 
            edit = ${permissions.organizations.edit}, 
            delete = ${permissions.organizations.delete}, 
            view = ${permissions.organizations.view}
        WHERE id = (
          SELECT permission_org_mgmt_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        )
      `);

      await db.execute(sql`
        UPDATE permission_storage_mgmt 
        SET add_storage_container = ${permissions.storage.addStorageContainer}, 
            add_container = ${permissions.storage.addContainer}, 
            view = ${permissions.storage.view}, 
            delete = ${permissions.storage.delete},
            data_protection = ${permissions.storage.dataProtection || false},
            data_lifecycle = ${permissions.storage.dataLifecycle || false},
            inventory_view = ${permissions.storage.inventoryView || false},
            inventory_configure = ${permissions.storage.inventoryConfigure || false}
        WHERE id = (
          SELECT permission_storage_mgmt_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        )
      `);

      const updatedFileMgmtPerms: FileMgmtPermissions = {
        ...DEFAULT_FILE_MGMT_PERMISSIONS,
      };
      if (permissions.files) {
        for (const key of Object.keys(DEFAULT_FILE_MGMT_PERMISSIONS)) {
          if (permissions.files[key] !== undefined) {
            updatedFileMgmtPerms[key] = permissions.files[key] || false;
          }
        }
      }
      await db.execute(sql`
        UPDATE permission_file_mgmt 
        SET permissions = ${JSON.stringify(updatedFileMgmtPerms)}::jsonb
        WHERE id = (
          SELECT permission_file_mgmt_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        )
      `);

      await db.execute(sql`
        UPDATE permission_activity_logs 
        SET view = ${permissions.activityLogs.view}
        WHERE id = (
          SELECT permission_activity_logs_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        )
      `);

      // Update AI Agent Management permissions if they exist
      if (permissions.aiAgentMgmt) {
        await db.execute(sql`
          UPDATE permission_ai_agent_mgmt 
          SET add = ${permissions.aiAgentMgmt.add}, 
              edit = ${permissions.aiAgentMgmt.edit}, 
              delete = ${permissions.aiAgentMgmt.delete}, 
              view = ${permissions.aiAgentMgmt.view}
          WHERE id = (
            SELECT permission_ai_agent_mgmt_id 
            FROM role_permissions_modular 
            WHERE role_id = ${roleId}
          )
        `);
      }

      // Update PGP Key Management permissions if they exist
      if (permissions.pgpKeyMgmt) {
        await db.execute(sql`
          UPDATE permission_pgp_key_mgmt 
          SET view = ${permissions.pgpKeyMgmt.view}, 
              generate = ${permissions.pgpKeyMgmt.generate}, 
              delete = ${permissions.pgpKeyMgmt.delete}, 
              copy = ${permissions.pgpKeyMgmt.copy},
              decrypt = ${permissions.pgpKeyMgmt.decrypt}
          WHERE id = (
            SELECT permission_pgp_key_mgmt_id 
            FROM role_permissions_modular 
            WHERE role_id = ${roleId}
          )
        `);
      }

      // Update Help Center permissions if they exist (JSON columns)
      if (permissions.helpCenter) {
        const chapterWiseHelp = JSON.stringify(permissions.helpCenter.chapterWiseHelp || {});
        const api = JSON.stringify(permissions.helpCenter.api || {});
        const envVariable = JSON.stringify(permissions.helpCenter.envVariable || {});
        const troubleshooting = JSON.stringify(permissions.helpCenter.troubleshooting || {});
        
        await db.execute(sql`
          UPDATE permission_help_center 
          SET chapter_wise_help = ${chapterWiseHelp}::jsonb, 
              api = ${api}::jsonb, 
              env_variable = ${envVariable}::jsonb, 
              troubleshooting = ${troubleshooting}::jsonb
          WHERE id = (
            SELECT permission_help_center_id 
            FROM role_permissions_modular 
            WHERE role_id = ${roleId}
          )
        `);
      }

      // Update SIEM Management permissions if they exist
      if (permissions.siemManagement) {
        await db.execute(sql`
          UPDATE permission_siem_mgmt 
          SET install = ${permissions.siemManagement.install || false}, 
              delete = ${permissions.siemManagement.delete || false}, 
              enable_disable = ${permissions.siemManagement.enableDisable || false}, 
              view = ${permissions.siemManagement.view || false},
              incidents_view = ${permissions.siemManagement.incidentsView || false}
          WHERE id = (
            SELECT permission_siem_mgmt_id 
            FROM role_permissions_modular 
            WHERE role_id = ${roleId}
          )
        `);
      }

      // Update Foundry AI Management permissions if they exist
      if (permissions.foundryMgmt) {
        await db.execute(sql`
          UPDATE permission_foundry_mgmt 
          SET add = ${permissions.foundryMgmt.add || false}, 
              edit = ${permissions.foundryMgmt.edit || false}, 
              delete = ${permissions.foundryMgmt.delete || false}, 
              view = ${permissions.foundryMgmt.view || false},
              tab_wizard = ${permissions.foundryMgmt.tabWizard || false},
              tab_resources = ${permissions.foundryMgmt.tabResources || false},
              tab_foundry_action = ${permissions.foundryMgmt.tabFoundryAction || false},
              tab_chat_playground = ${permissions.foundryMgmt.tabChatPlayground || false},
              tab_resource_sets = ${permissions.foundryMgmt.tabResourceSets || false},
              tab_content_understanding = ${permissions.foundryMgmt.tabContentUnderstanding || false}
          WHERE id = (
            SELECT permission_foundry_mgmt_id 
            FROM role_permissions_modular 
            WHERE role_id = ${roleId}
          )
        `);
      }

      // Update Content Understanding permissions - handle case where record doesn't exist (for roles created before this module)
      if (permissions.contentUnderstanding) {
        // Check if content understanding permission record exists for this role
        const existingCuPermResult = await db.execute(sql`
          SELECT permission_content_understanding_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        `);
        
        const existingCuPermId = existingCuPermResult.rows[0]?.permission_content_understanding_id;
        
        if (existingCuPermId) {
          // Update existing record
          await db.execute(sql`
            UPDATE permission_content_understanding 
            SET view = ${permissions.contentUnderstanding.view || false}, 
                run_analysis = ${permissions.contentUnderstanding.runAnalysis || false}, 
                save_analysis = ${permissions.contentUnderstanding.saveAnalysis || false}, 
                delete_analysis = ${permissions.contentUnderstanding.deleteAnalysis || false},
                menu_visibility = ${permissions.contentUnderstanding.menuVisibility || false}
            WHERE id = ${existingCuPermId}
          `);
        } else {
          // Create new record and link to role (for roles created before contentUnderstanding module was added)
          console.log(`[UPDATE-PERMS] Creating content understanding permissions for existing role ${roleId}`);
          const newCuPerm = await db.insert(permissionContentUnderstanding).values({
            view: permissions.contentUnderstanding.view || false,
            runAnalysis: permissions.contentUnderstanding.runAnalysis || false,
            saveAnalysis: permissions.contentUnderstanding.saveAnalysis || false,
            deleteAnalysis: permissions.contentUnderstanding.deleteAnalysis || false,
            menuVisibility: permissions.contentUnderstanding.menuVisibility || false,
          }).returning();
          
          // Link the new permission record to the role
          await db.execute(sql`
            UPDATE role_permissions_modular 
            SET permission_content_understanding_id = ${newCuPerm[0].id}
            WHERE role_id = ${roleId}
          `);
          console.log(`[UPDATE-PERMS] Linked content understanding permission ${newCuPerm[0].id} to role ${roleId}`);
        }
      }

      // Update HearingAI permissions - handle case where record doesn't exist (for roles created before this module)
      if (permissions.hearingAi) {
        const existingHaiPermResult = await db.execute(sql`
          SELECT permission_hearing_ai_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        `);
        
        const existingHaiPermId = existingHaiPermResult.rows[0]?.permission_hearing_ai_id;
        
        if (existingHaiPermId) {
          await db.execute(sql`
            UPDATE permission_hearing_ai 
            SET view = ${permissions.hearingAi.view || false}, 
                run_analysis = ${permissions.hearingAi.runAnalysis || false}, 
                save_analysis = ${permissions.hearingAi.saveAnalysis || false}, 
                delete_analysis = ${permissions.hearingAi.deleteAnalysis || false},
                menu_visibility = ${permissions.hearingAi.menuVisibility || false}
            WHERE id = ${existingHaiPermId}
          `);
        } else {
          console.log(`[UPDATE-PERMS] Creating hearing ai permissions for existing role ${roleId}`);
          const newHaiPerm = await db.insert(permissionHearingAi).values({
            view: permissions.hearingAi.view || false,
            runAnalysis: permissions.hearingAi.runAnalysis || false,
            saveAnalysis: permissions.hearingAi.saveAnalysis || false,
            deleteAnalysis: permissions.hearingAi.deleteAnalysis || false,
            menuVisibility: permissions.hearingAi.menuVisibility || false,
          }).returning();
          
          await db.execute(sql`
            UPDATE role_permissions_modular 
            SET permission_hearing_ai_id = ${newHaiPerm[0].id}
            WHERE role_id = ${roleId}
          `);
          console.log(`[UPDATE-PERMS] Linked hearing ai permission ${newHaiPerm[0].id} to role ${roleId}`);
        }
      }

      // Update Document Translation permissions - handle case where record doesn't exist (for roles created before this module)
      if (permissions.documentTranslation) {
        // Check if document translation permission record exists for this role
        const existingDtPermResult = await db.execute(sql`
          SELECT permission_document_translation_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        `);
        
        const existingDtPermId = existingDtPermResult.rows[0]?.permission_document_translation_id;
        
        if (existingDtPermId) {
          // Update existing record
          await db.execute(sql`
            UPDATE permission_document_translation 
            SET view = ${permissions.documentTranslation.view || false}, 
                run_translation = ${permissions.documentTranslation.runTranslation || false}, 
                delete_translation = ${permissions.documentTranslation.deleteTranslation || false}
            WHERE id = ${existingDtPermId}
          `);
        } else {
          // Create new record and link to role (for roles created before documentTranslation module was added)
          console.log(`[UPDATE-PERMS] Creating document translation permissions for existing role ${roleId}`);
          const newDtPerm = await db.insert(permissionDocumentTranslation).values({
            view: permissions.documentTranslation.view || false,
            runTranslation: permissions.documentTranslation.runTranslation || false,
            deleteTranslation: permissions.documentTranslation.deleteTranslation || false,
          }).returning();
          
          // Link the new permission record to the role
          await db.execute(sql`
            UPDATE role_permissions_modular 
            SET permission_document_translation_id = ${newDtPerm[0].id}
            WHERE role_id = ${roleId}
          `);
          console.log(`[UPDATE-PERMS] Linked document translation permission ${newDtPerm[0].id} to role ${roleId}`);
        }
      }

      // Update SFTP Management permissions - handle case where record doesn't exist (for roles created before this module)
      if (permissions.sftpMgmt) {
        // Check if SFTP permission record exists for this role
        const existingSftpPermResult = await db.execute(sql`
          SELECT permission_sftp_mgmt_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        `);
        
        const existingSftpPermId = existingSftpPermResult.rows[0]?.permission_sftp_mgmt_id;
        
        if (existingSftpPermId) {
          // Update existing record
          await db.execute(sql`
            UPDATE permission_sftp_mgmt 
            SET view = ${permissions.sftpMgmt.view || false}, 
                "create" = ${permissions.sftpMgmt.create || false}, 
                "update" = ${permissions.sftpMgmt.update || false},
                disable = ${permissions.sftpMgmt.disable || false},
                delete = ${permissions.sftpMgmt.delete || false},
                map_user = ${permissions.sftpMgmt.mapUser || false},
                view_self_access = ${permissions.sftpMgmt.viewSelfAccess || false},
                rotate_ssh_self = ${permissions.sftpMgmt.rotateSshSelf || false},
                rotate_password_self = ${permissions.sftpMgmt.rotatePasswordSelf || false}
            WHERE id = ${existingSftpPermId}
          `);
        } else {
          // Create new record and link to role (for roles created before SFTP module was added)
          console.log(`[UPDATE-PERMS] Creating SFTP permissions for existing role ${roleId}`);
          const newSftpPerm = await db.insert(permissionSftpMgmt).values({
            view: permissions.sftpMgmt.view || false,
            create: permissions.sftpMgmt.create || false,
            update: permissions.sftpMgmt.update || false,
            disable: permissions.sftpMgmt.disable || false,
            delete: permissions.sftpMgmt.delete || false,
            mapUser: permissions.sftpMgmt.mapUser || false,
            viewSelfAccess: permissions.sftpMgmt.viewSelfAccess || false,
            rotateSshSelf: permissions.sftpMgmt.rotateSshSelf || false,
            rotatePasswordSelf: permissions.sftpMgmt.rotatePasswordSelf || false,
          }).returning();
          
          // Link the new permission record to the role
          await db.execute(sql`
            UPDATE role_permissions_modular 
            SET permission_sftp_mgmt_id = ${newSftpPerm[0].id}
            WHERE role_id = ${roleId}
          `);
          console.log(`[UPDATE-PERMS] Linked SFTP permission ${newSftpPerm[0].id} to role ${roleId}`);
        }
      }

      // Handle Customer Onboarding permissions
      if (permissions.customerOnboarding) {
        // Check if customer onboarding permission record exists for this role
        const existingCoPermResult = await db.execute(sql`
          SELECT permission_customer_onboarding_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        `);
        
        const existingCoPermId = existingCoPermResult.rows[0]?.permission_customer_onboarding_id;
        
        if (existingCoPermId) {
          // Update existing record
          await db.execute(sql`
            UPDATE permission_customer_onboarding 
            SET view = ${permissions.customerOnboarding.view || false}, 
                upload = ${permissions.customerOnboarding.upload || false}, 
                commit = ${permissions.customerOnboarding.commit || false},
                delete = ${permissions.customerOnboarding.delete || false}
            WHERE id = ${existingCoPermId}
          `);
        } else {
          // Create new record and link to role (for roles created before Customer Onboarding module was added)
          console.log(`[UPDATE-PERMS] Creating Customer Onboarding permissions for existing role ${roleId}`);
          const newCoPerm = await db.insert(permissionCustomerOnboarding).values({
            view: permissions.customerOnboarding.view || false,
            upload: permissions.customerOnboarding.upload || false,
            commit: permissions.customerOnboarding.commit || false,
            delete: permissions.customerOnboarding.delete || false,
          }).returning();
          
          // Link the new permission record to the role
          await db.execute(sql`
            UPDATE role_permissions_modular 
            SET permission_customer_onboarding_id = ${newCoPerm[0].id}
            WHERE role_id = ${roleId}
          `);
          console.log(`[UPDATE-PERMS] Linked Customer Onboarding permission ${newCoPerm[0].id} to role ${roleId}`);
        }
      }

      // Handle Transfer Reports permissions
      if (permissions.transferReports) {
        // Check if transfer reports permission record exists for this role
        const existingTrPermResult = await db.execute(sql`
          SELECT permission_transfer_reports_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        `);
        
        const existingTrPermId = existingTrPermResult.rows[0]?.permission_transfer_reports_id;
        
        if (existingTrPermId) {
          // Update existing record
          await db.execute(sql`
            UPDATE permission_transfer_reports 
            SET view = ${permissions.transferReports.view || false}, 
                view_details = ${permissions.transferReports.viewDetails || false}, 
                download = ${permissions.transferReports.download || false}
            WHERE id = ${existingTrPermId}
          `);
        } else {
          // Create new record and link to role (for roles created before Transfer Reports module was added)
          console.log(`[UPDATE-PERMS] Creating Transfer Reports permissions for existing role ${roleId}`);
          const newTrPerm = await db.insert(permissionTransferReports).values({
            view: permissions.transferReports.view || false,
            viewDetails: permissions.transferReports.viewDetails || false,
            download: permissions.transferReports.download || false,
          }).returning();
          
          // Link the new permission record to the role
          await db.execute(sql`
            UPDATE role_permissions_modular 
            SET permission_transfer_reports_id = ${newTrPerm[0].id}
            WHERE role_id = ${roleId}
          `);
          console.log(`[UPDATE-PERMS] Linked Transfer Reports permission ${newTrPerm[0].id} to role ${roleId}`);
        }
      }

      if (permissions.eval) {
        const existingEvalPermResult = await db.execute(sql`
          SELECT permission_eval_id 
          FROM role_permissions_modular 
          WHERE role_id = ${roleId}
        `);
        
        const existingEvalPermId = existingEvalPermResult.rows[0]?.permission_eval_id;
        
        if (existingEvalPermId) {
          await db.execute(sql`
            UPDATE permission_eval 
            SET view = ${permissions.eval.view || false}, 
                run = ${permissions.eval.run || false}, 
                review = ${permissions.eval.review || false}, 
                finalize = ${permissions.eval.finalize || false},
                menu_visibility = ${permissions.eval.menuVisibility || false}
            WHERE id = ${existingEvalPermId}
          `);
        } else {
          console.log(`[UPDATE-PERMS] Creating Eval permissions for existing role ${roleId}`);
          const newEvalPerm = await db.insert(permissionEval).values({
            view: permissions.eval.view || false,
            run: permissions.eval.run || false,
            review: permissions.eval.review || false,
            finalize: permissions.eval.finalize || false,
            menuVisibility: permissions.eval.menuVisibility || false,
          }).returning();
          
          await db.execute(sql`
            UPDATE role_permissions_modular 
            SET permission_eval_id = ${newEvalPerm[0].id}
            WHERE role_id = ${roleId}
          `);
          console.log(`[UPDATE-PERMS] Linked Eval permission ${newEvalPerm[0].id} to role ${roleId}`);
        }
      }
    } else {
      // Create new permission records if they don't exist
      // This would be implemented for new roles
      console.log('Creating new modular permissions for role', roleId);
    }
  }

  /**
   * Gets aggregated Help Center permissions for a user across ALL their enabled roles
   * Uses JSON aggregation to merge permissions from multiple roles across ALL organizations
   * Help center content is global, so if user has permission in ANY org, they can access it
   * 
   * Returns a flattened structure with category prefixes for backward compatibility:
   * { chapterWiseHelp: {...}, api: {...}, envVariable: {...}, troubleshooting: {...} }
   */
  async getUserHelpCenterPermissions(userId: number): Promise<{
    chapterWiseHelp: Record<string, boolean>;
    api: Record<string, boolean>;
    envVariable: Record<string, boolean>;
    troubleshooting: Record<string, boolean>;
  }> {
    try {
      console.log(`🔒 [HELP-CENTER] Fetching aggregated permissions for user ${userId} across all organizations`);

      const result = await db.execute(sql`
        SELECT 
          phc.chapter_wise_help as "chapterWiseHelp",
          phc.api as "api",
          phc.env_variable as "envVariable",
          phc.troubleshooting as "troubleshooting"
        FROM user_roles ur
        JOIN role_permissions_modular rpm ON ur.role_id = rpm.role_id
        JOIN permission_help_center phc ON rpm.permission_help_center_id = phc.id
        WHERE ur.user_id = ${userId}
          AND ur.is_enabled = true
      `);

      // Aggregate permissions from all roles (OR logic - if any role grants access, user has access)
      const aggregated = {
        chapterWiseHelp: {} as Record<string, boolean>,
        api: {} as Record<string, boolean>,
        envVariable: {} as Record<string, boolean>,
        troubleshooting: {} as Record<string, boolean>,
      };

      for (const row of result.rows) {
        // Merge chapterWiseHelp permissions
        const chapterWiseHelp = (row.chapterWiseHelp || {}) as Record<string, boolean>;
        for (const [key, value] of Object.entries(chapterWiseHelp)) {
          if (value === true) aggregated.chapterWiseHelp[key] = true;
        }
        
        // Merge api permissions
        const api = (row.api || {}) as Record<string, boolean>;
        for (const [key, value] of Object.entries(api)) {
          if (value === true) aggregated.api[key] = true;
        }
        
        // Merge envVariable permissions
        const envVariable = (row.envVariable || {}) as Record<string, boolean>;
        for (const [key, value] of Object.entries(envVariable)) {
          if (value === true) aggregated.envVariable[key] = true;
        }
        
        // Merge troubleshooting permissions
        const troubleshooting = (row.troubleshooting || {}) as Record<string, boolean>;
        for (const [key, value] of Object.entries(troubleshooting)) {
          if (value === true) aggregated.troubleshooting[key] = true;
        }
      }

      console.log(`🔒 [HELP-CENTER] Aggregated permissions for user ${userId} across all orgs:`, aggregated);
      return aggregated;
    } catch (error) {
      console.error(`🔒 [HELP-CENTER] CRITICAL: Error fetching user help center permissions for user ${userId}:`, error);
      // Rethrow to surface errors instead of silently degrading to empty permissions
      throw new Error(`Failed to fetch help center permissions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAllStorageAccounts(kind?: 'blob' | 'adls'): Promise<(StorageAccount & { organizationName?: string })[]> {
    const baseQuery = db
      .select({
        id: storageAccounts.id,
        name: storageAccounts.name,
        location: storageAccounts.location,
        containerName: storageAccounts.containerName,
        resourceGroupName: storageAccounts.resourceGroupName,
        organizationId: storageAccounts.organizationId,
        kind: storageAccounts.kind,
        createdAt: storageAccounts.createdAt,
        organizationName: organizations.name,
      })
      .from(storageAccounts)
      .leftJoin(organizations, eq(storageAccounts.organizationId, organizations.id));

    const results = kind 
      ? await baseQuery.where(eq(storageAccounts.kind, kind))
      : await baseQuery;

    return results.map(result => ({
      ...result,
      organizationName: result.organizationName ?? undefined
    }));
  }

  async getStorageAccountsForOrganizations(organizationIds: number[], kind?: 'blob' | 'adls'): Promise<(StorageAccount & { organizationName?: string })[]> {
    if (organizationIds.length === 0) {
      return [];
    }

    const baseQuery = db
      .select({
        id: storageAccounts.id,
        name: storageAccounts.name,
        location: storageAccounts.location,
        containerName: storageAccounts.containerName,
        resourceGroupName: storageAccounts.resourceGroupName,
        organizationId: storageAccounts.organizationId,
        kind: storageAccounts.kind,
        createdAt: storageAccounts.createdAt,
        organizationName: organizations.name,
      })
      .from(storageAccounts)
      .leftJoin(organizations, eq(storageAccounts.organizationId, organizations.id));

    const results = kind 
      ? await baseQuery.where(and(inArray(storageAccounts.organizationId, organizationIds), eq(storageAccounts.kind, kind)))
      : await baseQuery.where(inArray(storageAccounts.organizationId, organizationIds));

    return results.map(result => ({
      ...result,
      organizationName: result.organizationName ?? undefined
    }));
  }

  async createStorageAccount(account: InsertStorageAccount): Promise<StorageAccount> {
    const [newAccount] = await db.insert(storageAccounts).values(account).returning();
    return newAccount;
  }

  async getStorageAccountsByOrganization(organizationId: number, kind?: 'blob' | 'adls'): Promise<StorageAccount[]> {
    const baseQuery = db
      .select()
      .from(storageAccounts);

    return kind 
      ? await baseQuery.where(and(eq(storageAccounts.organizationId, organizationId), eq(storageAccounts.kind, kind)))
      : await baseQuery.where(eq(storageAccounts.organizationId, organizationId));
  }

  async getStorageAccountByOrganization(organizationId: number): Promise<StorageAccount | undefined> {
    const [account] = await db
      .select()
      .from(storageAccounts)
      .where(eq(storageAccounts.organizationId, organizationId))
      .limit(1);
    return account || undefined;
  }

  async getStorageAccountByName(name: string): Promise<StorageAccount | undefined> {
    const [account] = await db
      .select()
      .from(storageAccounts)
      .where(eq(storageAccounts.name, name))
      .limit(1);
    return account || undefined;
  }

  async updateStorageAccount(id: number, account: Partial<InsertStorageAccount>): Promise<StorageAccount | undefined> {
    const [updated] = await db
      .update(storageAccounts)
      .set(account)
      .where(eq(storageAccounts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteStorageAccount(id: number): Promise<boolean> {
    const result = await db.delete(storageAccounts).where(eq(storageAccounts.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getDashboardStats(): Promise<{
    totalUsers: number;
    totalOrganizations: number;
    activeSessions: number;
    totalRoles: number;
  }> {
    const [userCount] = await db.select({ count: count() }).from(users);
    const [orgCount] = await db.select({ count: count() }).from(organizations);
    const [roleCount] = await db.select({ count: count() }).from(roles);
    
    // Count active sessions (sessions with login but no logout in last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [activeSessionCount] = await db
      .select({ count: count() })
      .from(userActivities)
      .where(
        and(
          eq(userActivities.action, 'LOGIN'),
          isNull(userActivities.logoutTime)
        )
      );

    return {
      totalUsers: userCount.count,
      totalOrganizations: orgCount.count,
      activeSessions: activeSessionCount.count,
      totalRoles: roleCount.count,
    };
  }

  async checkUserPermission(userEmail: string, permissionName: string): Promise<boolean> {
    try {
      // Get user and role information
      const user = await this.getUserByEmail(userEmail);
      if (!user) {
        console.log(`🔒 [AUTH] User not found: ${userEmail}`);
        return false;
      }

      // Get user's active roles across all organizations
      const userRoleResults = await db
        .select({
          roleId: userRoles.roleId,
          roleName: roles.name,
          organizationId: userRoles.organizationId
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(
          eq(userRoles.userId, user.id),
          eq(userRoles.isEnabled, true)
        ));

      if (!userRoleResults.length) {
        console.log(`🔒 [AUTH] No active roles found for user: ${userEmail}`);
        return false;
      }
      
       // Map permission names to specific checks
      const permissionMappings = {
        'FILE_MANAGEMENT': ['uploadFile', 'createFolder', 'deleteFilesAndFolders', 'viewFiles'],
        'USER_MANAGEMENT': ['add', 'edit', 'delete', 'view'],
        'ROLE_MANAGEMENT': ['add', 'edit', 'delete', 'view'],
        'ORG_MANAGEMENT': ['add', 'edit', 'delete', 'view'],
        'STORAGE_MANAGEMENT': ['addStorageContainer', 'view', 'delete'],
        'ACTIVITY_LOGS': ['view'],
        'AI_AGENT_MANAGEMENT': ['add', 'edit', 'delete', 'view'],
        'Manage Settings': [] // Legacy - will check admin roles
      };

       // Check specific modular permissions for each role
      for (const userRole of userRoleResults) {
        try {
          const permissions = await this.getUserRolePermissions(userEmail, userRole.roleId);
          
          // Check based on permission mapping
          const requiredActions = permissionMappings[permissionName as keyof typeof permissionMappings];
          if (!requiredActions) {
            console.log(`🔒 [AUTH] Unknown permission: ${permissionName}`);
            continue;
          }

          // Check if user has required permissions for this action
          let hasPermission = false;
          switch (permissionName) {
            case 'FILE_MANAGEMENT':
              hasPermission = permissions.fileMgmt?.uploadFile || permissions.fileMgmt?.viewFiles || false;
              break;
            case 'USER_MANAGEMENT':
              // 🔒 SECURITY RESTRICTION: Only "add" permission grants global access
              // All other permissions (edit, delete, view, enableDisable) are organization-scoped only
              // Reason: Allow global "add" for initial user setup, restrict other operations to org boundaries
              hasPermission = permissions.userMgmt?.add || false;
              break;
            case 'ROLE_MANAGEMENT':
              hasPermission = permissions.roleMgmt?.view || permissions.roleMgmt?.add || false;
              break;
            case 'ORG_MANAGEMENT':
              hasPermission = permissions.orgMgmt?.view || permissions.orgMgmt?.add || false;
              break;
            case 'STORAGE_MANAGEMENT':
              hasPermission = permissions.storageMgmt?.view || permissions.storageMgmt?.addStorageContainer || false;
              break;
            case 'ACTIVITY_LOGS':
              hasPermission = permissions.activityLogs?.view || false;
              break;
            case 'AI_AGENT_MANAGEMENT':
              hasPermission = permissions.aiAgentMgmt?.view || permissions.aiAgentMgmt?.add || false;
              break;
          }

          if (hasPermission) {
            console.log(`🔒 [AUTH] Permission granted for ${userEmail}: ${permissionName} via role ${userRole.roleName}`);
            return true;
          }
        } catch (permError) {
          console.error(`🔒 [AUTH] Error checking permissions for role ${userRole.roleId}:`, permError);
          continue;
        }
      }

      console.log(`🔒 [AUTH] Permission denied for ${userEmail}: ${permissionName}`);
      return false;
    } catch (error) {
      console.error(`🔒 [AUTH] Error in checkUserPermission:`, error);
      return false;
    }
  }

  async checkGranularFilePermission(
    userEmail: string, 
    action: string,
    organizationId: number
  ): Promise<boolean> {
    try {
      console.log(`🔍 [GRANULAR] Checking "${action}" permission for user: ${userEmail} in organization: ${organizationId}`);
      
      // Get user
      const user = await this.getUserByEmail(userEmail);
      if (!user) {
        console.log(`🔒 [GRANULAR] User not found: ${userEmail}`);
        return false;
      }

      // Get user's active roles ONLY in the specified organization (CRITICAL: prevents cross-org permission leakage)
      const userRoleResults = await db
        .select({
          roleId: userRoles.roleId,
          roleName: roles.name,
          organizationId: userRoles.organizationId
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(
          eq(userRoles.userId, user.id),
          eq(userRoles.organizationId, organizationId), // 🔒 SECURITY: Only check roles in THIS organization
          eq(userRoles.isEnabled, true)
        ));

      if (!userRoleResults.length) {
        console.log(`🔒 [GRANULAR] No active roles found for user: ${userEmail} in organization: ${organizationId}`);
        return false;
      }

      // Check specific file management permission for each role
      for (const userRole of userRoleResults) {
        try {
          const permissions = await this.getUserRolePermissions(userEmail, userRole.roleId);
          
          if (!permissions.fileMgmt) {
            continue;
          }

          // Check the specific action permission
          const hasPermission = permissions.fileMgmt[action] === true;

          if (hasPermission) {
            console.log(`🔒 [GRANULAR] Permission "${action}" granted for ${userEmail} via role ${userRole.roleName} in org ${organizationId}`);
            return true;
          }
        } catch (permError) {
          console.error(`🔒 [GRANULAR] Error checking permissions for role ${userRole.roleId}:`, permError);
          continue;
        }
      }

      console.log(`🔒 [GRANULAR] Permission "${action}" denied for ${userEmail} in organization ${organizationId}`);
      return false;
    } catch (error) {
      console.error(`🔒 [GRANULAR] Error in checkGranularFilePermission:`, error);
      return false;
    }
  }

  async checkGranularUserPermission(
    userEmail: string, 
    action: 'add' | 'edit' | 'delete' | 'view' | 'enableDisable',
    organizationId: number
  ): Promise<boolean> {
    try {
      console.log(`🔍 [GRANULAR-USER] Checking "${action}" permission for user: ${userEmail} in organization: ${organizationId}`);
      
      // Get user
      const user = await this.getUserByEmail(userEmail);
      if (!user) {
        console.log(`🔒 [GRANULAR-USER] User not found: ${userEmail}`);
        return false;
      }

      // Get user's active roles ONLY in the specified organization (CRITICAL: prevents cross-org permission leakage)
      const userRoleResults = await db
        .select({
          roleId: userRoles.roleId,
          roleName: roles.name,
          organizationId: userRoles.organizationId
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(
          and(
            eq(userRoles.userId, user.id),
            eq(userRoles.isEnabled, true),
            eq(userRoles.organizationId, organizationId)
          )
        );

      if (userRoleResults.length === 0) {
        console.log(`🔒 [GRANULAR-USER] User ${userEmail} has no active roles in organization ${organizationId}`);
        return false;
      }

      // Check each role for the specific permission
      for (const userRole of userRoleResults) {
        try {
          const permissions = await this.getRoleModularPermissions(userRole.roleId);
          
          if (!permissions) {
            console.log(`🔒 [GRANULAR-USER] No permissions found for role ${userRole.roleId}`);
            continue;
          }

          // getRoleModularPermissions returns user_permissions as JSONB object
          const userPerms = (typeof permissions.user_permissions === 'object' && permissions.user_permissions)
            ? permissions.user_permissions as any : {};
          const hasPermission = userPerms[action] === true;

          if (hasPermission) {
            console.log(`🔒 [GRANULAR-USER] Permission "${action}" granted for ${userEmail} via role ${userRole.roleName} in org ${organizationId}`);
            return true;
          }
        } catch (permError) {
          console.error(`🔒 [GRANULAR-USER] Error checking permissions for role ${userRole.roleId}:`, permError);
          continue;
        }
      }

      console.log(`🔒 [GRANULAR-USER] Permission "${action}" denied for ${userEmail} in organization ${organizationId}`);
      return false;
    } catch (error) {
      console.error(`🔒 [GRANULAR-USER] Error in checkGranularUserPermission:`, error);
      return false;
    }
  }

  async checkGranularOrganizationPermission(
    userEmail: string, 
    action: 'add' | 'edit' | 'delete' | 'view'
  ): Promise<boolean> {
    try {
      console.log(`🔒 [GRANULAR-ORG] Checking "${action}" permission for ${userEmail}`);

      // Get all roles for this user across ALL organizations
      const userRoleResults = await db
        .select({
          roleId: userRoles.roleId,
          organizationId: userRoles.organizationId,
          roleName: roles.name,
          enabled: userRoles.isEnabled,
        })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            eq(users.email, userEmail),
            eq(userRoles.isEnabled, true)
          )
        );

      if (userRoleResults.length === 0) {
        console.log(`🔒 [GRANULAR-ORG] No enabled roles found for ${userEmail}`);
        return false;
      }

      // Check each role for the specific permission
      for (const userRole of userRoleResults) {
        try {
          const permissions = await this.getRoleModularPermissions(userRole.roleId);
          
          if (!permissions) {
            console.log(`🔒 [GRANULAR-ORG] No permissions found for role ${userRole.roleId}`);
            continue;
          }

          // getRoleModularPermissions returns snake_case properties: org_add, org_edit, org_delete, org_view
          const permissionKey = `org_${action}` as 'org_add' | 'org_edit' | 'org_delete' | 'org_view';
          const hasPermission = permissions[permissionKey] === true;

          if (hasPermission) {
            console.log(`🔒 [GRANULAR-ORG] Permission "${action}" granted for ${userEmail} via role ${userRole.roleName}`);
            return true;
          }
        } catch (permError) {
          console.error(`🔒 [GRANULAR-ORG] Error checking permissions for role ${userRole.roleId}:`, permError);
          continue;
        }
      }

      console.log(`🔒 [GRANULAR-ORG] Permission "${action}" denied for ${userEmail}`);
      return false;
    } catch (error) {
      console.error(`🔒 [GRANULAR-ORG] Error in checkGranularOrganizationPermission:`, error);
      return false;
    }
  }

  async checkGranularRolePermission(
    userEmail: string, 
    action: 'add' | 'edit' | 'delete' | 'view'
  ): Promise<boolean> {
    try {
      console.log(`🔒 [GRANULAR-ROLE] Checking "${action}" permission for ${userEmail}`);

      // Get all roles for this user across ALL organizations
      const userRoleResults = await db
        .select({
          roleId: userRoles.roleId,
          organizationId: userRoles.organizationId,
          roleName: roles.name,
          enabled: userRoles.isEnabled,
        })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            eq(users.email, userEmail),
            eq(userRoles.isEnabled, true)
          )
        );

      if (userRoleResults.length === 0) {
        console.log(`🔒 [GRANULAR-ROLE] No enabled roles found for ${userEmail}`);
        return false;
      }

      // Check each role for the specific permission
      for (const userRole of userRoleResults) {
        try {
          const permissions = await this.getRoleModularPermissions(userRole.roleId);
          
          if (!permissions) {
            console.log(`🔒 [GRANULAR-ROLE] No permissions found for role ${userRole.roleId}`);
            continue;
          }

          // getRoleModularPermissions returns snake_case properties: role_add, role_edit, role_delete, role_view
          const permissionKey = `role_${action}` as 'role_add' | 'role_edit' | 'role_delete' | 'role_view';
          const hasPermission = permissions[permissionKey] === true;

          if (hasPermission) {
            console.log(`🔒 [GRANULAR-ROLE] Permission "${action}" granted for ${userEmail} via role ${userRole.roleName}`);
            return true;
          }
        } catch (permError) {
          console.error(`🔒 [GRANULAR-ROLE] Error checking permissions for role ${userRole.roleId}:`, permError);
          continue;
        }
      }

      console.log(`🔒 [GRANULAR-ROLE] Permission "${action}" denied for ${userEmail}`);
      return false;
    } catch (error) {
      console.error(`🔒 [GRANULAR-ROLE] Error in checkGranularRolePermission:`, error);
      return false;
    }
  }

  async checkGranularStoragePermission(
    userEmail: string, 
    action: 'addStorageContainer' | 'addContainer' | 'view' | 'delete',
    organizationId: number
  ): Promise<boolean> {
    try {
      console.log(`🔒 [GRANULAR-STORAGE] Checking "${action}" permission for ${userEmail} in organization ${organizationId}`);

      // Get user's active roles ONLY in the specified organization (CRITICAL: prevents cross-org permission leakage)
      const userRoleResults = await db
        .select({
          roleId: userRoles.roleId,
          organizationId: userRoles.organizationId,
          roleName: roles.name,
          enabled: userRoles.isEnabled,
        })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            eq(users.email, userEmail),
            eq(userRoles.organizationId, organizationId),
            eq(userRoles.isEnabled, true)
          )
        );

      if (userRoleResults.length === 0) {
        console.log(`🔒 [GRANULAR-STORAGE] No enabled roles found for ${userEmail} in organization ${organizationId}`);
        return false;
      }

      // Check each role for the specific permission
      for (const userRole of userRoleResults) {
        try {
          const permissions = await this.getRoleModularPermissions(userRole.roleId);
          
          if (!permissions) {
            console.log(`🔒 [GRANULAR-STORAGE] No permissions found for role ${userRole.roleId}`);
            continue;
          }

          // getRoleModularPermissions returns snake_case properties: storage_add_storage_container, storage_add_container, storage_view, storage_delete
          // Map camelCase actions to snake_case permission keys
          let permissionKey: string;
          if (action === 'addStorageContainer') {
            permissionKey = 'storage_add_storage_container';
          } else if (action === 'addContainer') {
            permissionKey = 'storage_add_container';
          } else {
            permissionKey = `storage_${action}`;
          }
          
          const hasPermission = permissions[permissionKey] === true;

          if (hasPermission) {
            console.log(`🔒 [GRANULAR-STORAGE] Permission "${action}" granted for ${userEmail} via role ${userRole.roleName} in org ${organizationId}`);
            return true;
          }
        } catch (permError) {
          console.error(`🔒 [GRANULAR-STORAGE] Error checking permissions for role ${userRole.roleId}:`, permError);
          continue;
        }
      }

      console.log(`🔒 [GRANULAR-STORAGE] Permission "${action}" denied for ${userEmail} in organization ${organizationId}`);
      return false;
    } catch (error) {
      console.error(`🔒 [GRANULAR-STORAGE] Error in checkGranularStoragePermission:`, error);
      return false;
    }
  }

  async getUserRolePermissions(userEmail: string, roleId: number): Promise<{
    userMgmt: { add: boolean; edit: boolean; delete: boolean; view: boolean; enableDisable: boolean } | null;
    roleMgmt: { add: boolean; edit: boolean; delete: boolean; view: boolean } | null;
    orgMgmt: { add: boolean; edit: boolean; delete: boolean; view: boolean } | null;
    storageMgmt: { addStorageContainer: boolean; addContainer: boolean; view: boolean; delete: boolean; dataProtection: boolean; dataLifecycle: boolean; inventoryView: boolean; inventoryConfigure: boolean } | null;
    fileMgmt: FileMgmtPermissions | null;
    activityLogs: { view: boolean } | null;
    aiAgentMgmt: { add: boolean; edit: boolean; delete: boolean; view: boolean } | null;
    pgpKeyMgmt: { view: boolean; generate: boolean; delete: boolean; copy: boolean; decrypt: boolean } | null;
    helpCenter: {
      chapterWiseHelp: Record<string, boolean>;
      api: Record<string, boolean>;
      envVariable: Record<string, boolean>;
      troubleshooting: Record<string, boolean>;
    } | null;
    siemMgmt: { install: boolean; delete: boolean; enableDisable: boolean; view: boolean; incidentsView: boolean } | null;
    foundryMgmt: { add: boolean; edit: boolean; delete: boolean; view: boolean; tabWizard: boolean; tabResources: boolean; tabFoundryAction: boolean; tabChatPlayground: boolean; tabResourceSets: boolean; tabContentUnderstanding: boolean } | null;
    contentUnderstanding: { view: boolean; runAnalysis: boolean; saveAnalysis: boolean; deleteAnalysis: boolean; menuVisibility: boolean } | null;
    hearingAi: { view: boolean; runAnalysis: boolean; saveAnalysis: boolean; deleteAnalysis: boolean; menuVisibility: boolean } | null;
    documentTranslation: { view: boolean; runTranslation: boolean; deleteTranslation: boolean } | null;
    sftpMgmt: { view: boolean; create: boolean; update: boolean; disable: boolean; delete: boolean; mapUser: boolean; viewSelfAccess: boolean; rotateSshSelf: boolean; rotatePasswordSelf: boolean } | null;
    customerOnboarding: { view: boolean; upload: boolean; commit: boolean; delete: boolean } | null;
    transferReports: { view: boolean; viewDetails: boolean; download: boolean } | null;
    eval: { view: boolean; run: boolean; review: boolean; finalize: boolean; menuVisibility: boolean } | null;
  }> {
    try {
      const rolePermissions = await db
        .select({
          id: rolePermissionsModular.id,
          permissionUserMgmtId: rolePermissionsModular.permissionUserMgmtId,
          permissionRoleMgmtId: rolePermissionsModular.permissionRoleMgmtId,
          permissionOrgMgmtId: rolePermissionsModular.permissionOrgMgmtId,
          permissionStorageMgmtId: rolePermissionsModular.permissionStorageMgmtId,
          permissionFileMgmtId: rolePermissionsModular.permissionFileMgmtId,
          permissionActivityLogsId: rolePermissionsModular.permissionActivityLogsId,
          permissionAiAgentMgmtId: rolePermissionsModular.permissionAiAgentMgmtId,
          permissionPgpKeyMgmtId: rolePermissionsModular.permissionPgpKeyMgmtId,
          permissionHelpCenterId: rolePermissionsModular.permissionHelpCenterId,
          permissionSiemMgmtId: rolePermissionsModular.permissionSiemMgmtId,
          permissionFoundryMgmtId: rolePermissionsModular.permissionFoundryMgmtId,
          permissionContentUnderstandingId: rolePermissionsModular.permissionContentUnderstandingId,
          permissionHearingAiId: rolePermissionsModular.permissionHearingAiId,
          permissionDocumentTranslationId: rolePermissionsModular.permissionDocumentTranslationId,
          permissionSftpMgmtId: rolePermissionsModular.permissionSftpMgmtId,
          permissionCustomerOnboardingId: rolePermissionsModular.permissionCustomerOnboardingId,
          permissionTransferReportsId: rolePermissionsModular.permissionTransferReportsId,
          permissionEvalId: rolePermissionsModular.permissionEvalId,
        })
        .from(rolePermissionsModular)
        .where(eq(rolePermissionsModular.roleId, roleId));

      console.log(`[DEBUG getUserRolePermissions] roleId=${roleId}, rolePermissions row count=${rolePermissions.length}`);
      if (rolePermissions.length > 0) {
        console.log(`[DEBUG getUserRolePermissions] permissionTransferReportsId=${rolePermissions[0].permissionTransferReportsId}, permissionCustomerOnboardingId=${rolePermissions[0].permissionCustomerOnboardingId}`);
      }

      if (!rolePermissions.length) {
        return {
          userMgmt: null,
          roleMgmt: null,
          orgMgmt: null,
          storageMgmt: null,
          fileMgmt: null,
          activityLogs: null,
          aiAgentMgmt: null,
          pgpKeyMgmt: null,
          helpCenter: null,
          siemMgmt: null,
          foundryMgmt: null,
          contentUnderstanding: null,
          hearingAi: null,
          documentTranslation: null,
          sftpMgmt: null,
          customerOnboarding: null,
          transferReports: null,
          eval: null,
        };
      }

      // Combine all permission IDs from multiple rows
      const permissions = {
        rolePermModularId: null as number | null,
        permissionUserMgmtId: null as number | null,
        permissionRoleMgmtId: null as number | null,
        permissionOrgMgmtId: null as number | null,
        permissionStorageMgmtId: null as number | null,
        permissionFileMgmtId: null as number | null,
        permissionActivityLogsId: null as number | null,
        permissionAiAgentMgmtId: null as number | null,
        permissionPgpKeyMgmtId: null as number | null,
        permissionHelpCenterId: null as number | null,
        permissionSiemMgmtId: null as number | null,
        permissionFoundryMgmtId: null as number | null,
        permissionContentUnderstandingId: null as number | null,
        permissionHearingAiId: null as number | null,
        permissionDocumentTranslationId: null as number | null,
        permissionSftpMgmtId: null as number | null,
        permissionCustomerOnboardingId: null as number | null,
        permissionTransferReportsId: null as number | null,
        permissionEvalId: null as number | null,
      };

      // Find the first non-null ID for each permission type
      for (const row of rolePermissions) {
        if (!permissions.rolePermModularId) {
          permissions.rolePermModularId = row.id;
        }
        if (row.permissionUserMgmtId && !permissions.permissionUserMgmtId) {
          permissions.permissionUserMgmtId = row.permissionUserMgmtId;
        }
        if (row.permissionRoleMgmtId && !permissions.permissionRoleMgmtId) {
          permissions.permissionRoleMgmtId = row.permissionRoleMgmtId;
        }
        if (row.permissionOrgMgmtId && !permissions.permissionOrgMgmtId) {
          permissions.permissionOrgMgmtId = row.permissionOrgMgmtId;
        }
        if (row.permissionStorageMgmtId && !permissions.permissionStorageMgmtId) {
          permissions.permissionStorageMgmtId = row.permissionStorageMgmtId;
        }
        if (row.permissionFileMgmtId && !permissions.permissionFileMgmtId) {
          permissions.permissionFileMgmtId = row.permissionFileMgmtId;
        }
        if (row.permissionActivityLogsId && !permissions.permissionActivityLogsId) {
          permissions.permissionActivityLogsId = row.permissionActivityLogsId;
        }
        if (row.permissionAiAgentMgmtId && !permissions.permissionAiAgentMgmtId) {
          permissions.permissionAiAgentMgmtId = row.permissionAiAgentMgmtId;
        }
        if (row.permissionPgpKeyMgmtId && !permissions.permissionPgpKeyMgmtId) {
          permissions.permissionPgpKeyMgmtId = row.permissionPgpKeyMgmtId;
        }
        if (row.permissionHelpCenterId && !permissions.permissionHelpCenterId) {
          permissions.permissionHelpCenterId = row.permissionHelpCenterId;
        }
        if (row.permissionSiemMgmtId && !permissions.permissionSiemMgmtId) {
          permissions.permissionSiemMgmtId = row.permissionSiemMgmtId;
        }
        if (row.permissionFoundryMgmtId && !permissions.permissionFoundryMgmtId) {
          permissions.permissionFoundryMgmtId = row.permissionFoundryMgmtId;
        }
        if (row.permissionContentUnderstandingId && !permissions.permissionContentUnderstandingId) {
          permissions.permissionContentUnderstandingId = row.permissionContentUnderstandingId;
        }
        if ((row as any).permissionHearingAiId && !permissions.permissionHearingAiId) {
          permissions.permissionHearingAiId = (row as any).permissionHearingAiId;
        }
        if (row.permissionDocumentTranslationId && !permissions.permissionDocumentTranslationId) {
          permissions.permissionDocumentTranslationId = row.permissionDocumentTranslationId;
        }
        if (row.permissionSftpMgmtId && !permissions.permissionSftpMgmtId) {
          permissions.permissionSftpMgmtId = row.permissionSftpMgmtId;
        }
        if (row.permissionCustomerOnboardingId && !permissions.permissionCustomerOnboardingId) {
          permissions.permissionCustomerOnboardingId = row.permissionCustomerOnboardingId;
        }
        if (row.permissionTransferReportsId && !permissions.permissionTransferReportsId) {
          permissions.permissionTransferReportsId = row.permissionTransferReportsId;
        }
        if (row.permissionEvalId && !permissions.permissionEvalId) {
          permissions.permissionEvalId = row.permissionEvalId;
        }
      }
      const result: any = {
        userMgmt: null,
        roleMgmt: null,
        orgMgmt: null,
        storageMgmt: null,
        fileMgmt: null,
        activityLogs: null,
        aiAgentMgmt: null,
        pgpKeyMgmt: null,
        helpCenter: null,
        siemMgmt: null,
        foundryMgmt: null,
        contentUnderstanding: null,
        hearingAi: null,
        documentTranslation: null,
        sftpMgmt: null,
        customerOnboarding: null,
        transferReports: null,
        eval: null,
      };

      // Fetch User Management permissions (JSONB-based)
      if (permissions.permissionUserMgmtId) {
        const [userMgmtPerm] = await db
          .select()
          .from(permissionUserMgmt)
          .where(eq(permissionUserMgmt.id, permissions.permissionUserMgmtId));
        
        if (userMgmtPerm) {
          const perms = userMgmtPerm.permissions as any || {};
          result.userMgmt = {
            add: perms.add || false,
            edit: perms.edit || false,
            delete: perms.delete || false,
            view: perms.view || false,
            enableDisable: perms.enableDisable || false,
          };
        }
      }

      // Fetch Role Management permissions
      if (permissions.permissionRoleMgmtId) {
        const [roleMgmtPerm] = await db
          .select()
          .from(permissionRoleMgmt)
          .where(eq(permissionRoleMgmt.id, permissions.permissionRoleMgmtId));
        
        if (roleMgmtPerm) {
          result.roleMgmt = {
            add: roleMgmtPerm.add,
            edit: roleMgmtPerm.edit,
            delete: roleMgmtPerm.delete,
            view: roleMgmtPerm.view,
          };
        }
      }

      // Fetch Organization Management permissions
      if (permissions.permissionOrgMgmtId) {
        const [orgMgmtPerm] = await db
          .select()
          .from(permissionOrgMgmt)
          .where(eq(permissionOrgMgmt.id, permissions.permissionOrgMgmtId));
        
        if (orgMgmtPerm) {
          result.orgMgmt = {
            add: orgMgmtPerm.add,
            edit: orgMgmtPerm.edit,
            delete: orgMgmtPerm.delete,
            view: orgMgmtPerm.view,
          };
        }
      }

      // Fetch Storage Management permissions
      if (permissions.permissionStorageMgmtId) {
        const [storageMgmtPerm] = await db
          .select()
          .from(permissionStorageMgmt)
          .where(eq(permissionStorageMgmt.id, permissions.permissionStorageMgmtId));
        
        if (storageMgmtPerm) {
          result.storageMgmt = {
            addStorageContainer: storageMgmtPerm.addStorageContainer,
            addContainer: storageMgmtPerm.addContainer,
            view: storageMgmtPerm.view,
            delete: storageMgmtPerm.delete,
            dataProtection: storageMgmtPerm.dataProtection,
            dataLifecycle: storageMgmtPerm.dataLifecycle,
            inventoryView: storageMgmtPerm.inventoryView,
            inventoryConfigure: storageMgmtPerm.inventoryConfigure,
          };
        }
      }

      // Fetch File Management permissions (JSONB-based)
      if (permissions.permissionFileMgmtId) {
        const [fileMgmtPerm] = await db
          .select()
          .from(permissionFileMgmt)
          .where(eq(permissionFileMgmt.id, permissions.permissionFileMgmtId));
        
        if (fileMgmtPerm) {
          result.fileMgmt = {
            ...DEFAULT_FILE_MGMT_PERMISSIONS,
            ...(fileMgmtPerm.permissions || {}),
          };
        }
      }

      // Fetch Activity Logs permissions
      if (permissions.permissionActivityLogsId) {
        const [activityLogsPerm] = await db
          .select()
          .from(permissionActivityLogs)
          .where(eq(permissionActivityLogs.id, permissions.permissionActivityLogsId));
        
        if (activityLogsPerm) {
          result.activityLogs = {
            view: activityLogsPerm.view,
          };
        }
      }

      // Fetch AI Agent Management permissions
      if (permissions.permissionAiAgentMgmtId) {
        const [aiAgentMgmtPerm] = await db
          .select()
          .from(permissionAiAgentMgmt)
          .where(eq(permissionAiAgentMgmt.id, permissions.permissionAiAgentMgmtId));
        
        if (aiAgentMgmtPerm) {
          result.aiAgentMgmt = {
            add: aiAgentMgmtPerm.add,
            edit: aiAgentMgmtPerm.edit,
            delete: aiAgentMgmtPerm.delete,
            view: aiAgentMgmtPerm.view,
          };
        }
      }

      // Fetch PGP Key Management permissions
      if (permissions.permissionPgpKeyMgmtId) {
        const [pgpKeyMgmtPerm] = await db
          .select()
          .from(permissionPgpKeyMgmt)
          .where(eq(permissionPgpKeyMgmt.id, permissions.permissionPgpKeyMgmtId));
        
        if (pgpKeyMgmtPerm) {
          result.pgpKeyMgmt = {
            view: pgpKeyMgmtPerm.view,
            generate: pgpKeyMgmtPerm.generate,
            delete: pgpKeyMgmtPerm.delete,
            copy: pgpKeyMgmtPerm.copy,
            decrypt: pgpKeyMgmtPerm.decrypt,
          };
        }
      }

      // Fetch Help Center permissions (JSON columns)
      if (permissions.permissionHelpCenterId) {
        const [helpCenterPerm] = await db
          .select()
          .from(permissionHelpCenter)
          .where(eq(permissionHelpCenter.id, permissions.permissionHelpCenterId));
        
        if (helpCenterPerm) {
          result.helpCenter = {
            chapterWiseHelp: (helpCenterPerm.chapterWiseHelp || {}) as Record<string, boolean>,
            api: (helpCenterPerm.api || {}) as Record<string, boolean>,
            envVariable: (helpCenterPerm.envVariable || {}) as Record<string, boolean>,
            troubleshooting: (helpCenterPerm.troubleshooting || {}) as Record<string, boolean>,
          };
        }
      }

      // Fetch SIEM Management permissions
      if (permissions.permissionSiemMgmtId) {
        const [siemMgmtPerm] = await db
          .select()
          .from(permissionSiemMgmt)
          .where(eq(permissionSiemMgmt.id, permissions.permissionSiemMgmtId));
        
        if (siemMgmtPerm) {
          result.siemMgmt = {
            install: siemMgmtPerm.install,
            delete: siemMgmtPerm.delete,
            enableDisable: siemMgmtPerm.enableDisable,
            view: siemMgmtPerm.view,
            incidentsView: siemMgmtPerm.incidentsView,
          };
        }
      }

      // Fetch Foundry Management permissions
      if (permissions.permissionFoundryMgmtId) {
        const [foundryMgmtPerm] = await db
          .select()
          .from(permissionFoundryMgmt)
          .where(eq(permissionFoundryMgmt.id, permissions.permissionFoundryMgmtId));
        
        if (foundryMgmtPerm) {
          result.foundryMgmt = {
            add: foundryMgmtPerm.add,
            edit: foundryMgmtPerm.edit,
            delete: foundryMgmtPerm.delete,
            view: foundryMgmtPerm.view,
            tabWizard: foundryMgmtPerm.tabWizard,
            tabResources: foundryMgmtPerm.tabResources,
            tabFoundryAction: foundryMgmtPerm.tabFoundryAction,
            tabChatPlayground: foundryMgmtPerm.tabChatPlayground,
            tabResourceSets: foundryMgmtPerm.tabResourceSets,
            tabContentUnderstanding: foundryMgmtPerm.tabContentUnderstanding,
          };
        }
      }

      // Fetch Content Understanding permissions
      if (permissions.permissionContentUnderstandingId) {
        const [contentUnderstandingPerm] = await db
          .select()
          .from(permissionContentUnderstanding)
          .where(eq(permissionContentUnderstanding.id, permissions.permissionContentUnderstandingId));
        
        if (contentUnderstandingPerm) {
          result.contentUnderstanding = {
            view: contentUnderstandingPerm.view,
            runAnalysis: contentUnderstandingPerm.runAnalysis,
            saveAnalysis: contentUnderstandingPerm.saveAnalysis,
            deleteAnalysis: contentUnderstandingPerm.deleteAnalysis,
            menuVisibility: contentUnderstandingPerm.menuVisibility,
          };
        }
      }

      // Fetch HearingAI permissions
      if (permissions.permissionHearingAiId) {
        const [hearingAiPerm] = await db
          .select()
          .from(permissionHearingAi)
          .where(eq(permissionHearingAi.id, permissions.permissionHearingAiId));
        
        if (hearingAiPerm) {
          result.hearingAi = {
            view: hearingAiPerm.view,
            runAnalysis: hearingAiPerm.runAnalysis,
            saveAnalysis: hearingAiPerm.saveAnalysis,
            deleteAnalysis: hearingAiPerm.deleteAnalysis,
            menuVisibility: hearingAiPerm.menuVisibility,
          };
        }
      }

      // Fetch Document Translation permissions
      if (permissions.permissionDocumentTranslationId) {
        const [documentTranslationPerm] = await db
          .select()
          .from(permissionDocumentTranslation)
          .where(eq(permissionDocumentTranslation.id, permissions.permissionDocumentTranslationId));
        
        if (documentTranslationPerm) {
          result.documentTranslation = {
            view: documentTranslationPerm.view,
            runTranslation: documentTranslationPerm.runTranslation,
            deleteTranslation: documentTranslationPerm.deleteTranslation,
          };
        }
      }

      // Fetch SFTP Management permissions
      if (permissions.permissionSftpMgmtId) {
        const [sftpMgmtPerm] = await db
          .select()
          .from(permissionSftpMgmt)
          .where(eq(permissionSftpMgmt.id, permissions.permissionSftpMgmtId));
        
        if (sftpMgmtPerm) {
          result.sftpMgmt = {
            view: sftpMgmtPerm.view,
            create: sftpMgmtPerm.create,
            update: sftpMgmtPerm.update,
            disable: sftpMgmtPerm.disable,
            delete: sftpMgmtPerm.delete,
            mapUser: sftpMgmtPerm.mapUser,
            viewSelfAccess: sftpMgmtPerm.viewSelfAccess,
            rotateSshSelf: sftpMgmtPerm.rotateSshSelf,
            rotatePasswordSelf: sftpMgmtPerm.rotatePasswordSelf,
          };
        }
      }

      // Fetch Customer Onboarding permissions
      if (permissions.permissionCustomerOnboardingId) {
        const [customerOnboardingPerm] = await db
          .select()
          .from(permissionCustomerOnboarding)
          .where(eq(permissionCustomerOnboarding.id, permissions.permissionCustomerOnboardingId));
        
        if (customerOnboardingPerm) {
          result.customerOnboarding = {
            view: customerOnboardingPerm.view,
            upload: customerOnboardingPerm.upload,
            commit: customerOnboardingPerm.commit,
            delete: customerOnboardingPerm.delete,
          };
        }
      }

      // Fetch Transfer Reports permissions
      if (permissions.permissionTransferReportsId) {
        const [transferReportsPerm] = await db
          .select()
          .from(permissionTransferReports)
          .where(eq(permissionTransferReports.id, permissions.permissionTransferReportsId));
        
        if (transferReportsPerm) {
          result.transferReports = {
            view: transferReportsPerm.view,
            viewDetails: transferReportsPerm.viewDetails,
            download: transferReportsPerm.download,
          };
        }
      }

      if (permissions.permissionEvalId) {
        const [evalPerm] = await db
          .select()
          .from(permissionEval)
          .where(eq(permissionEval.id, permissions.permissionEvalId));
        if (evalPerm) {
          result.eval = {
            view: evalPerm.view,
            run: evalPerm.run,
            review: evalPerm.review,
            finalize: evalPerm.finalize,
            menuVisibility: evalPerm.menuVisibility,
          };

          if (!evalPerm.view && !evalPerm.run && !evalPerm.review && !evalPerm.finalize && !evalPerm.menuVisibility) {
            const [roleInfo] = await db.select({ name: roles.name }).from(roles).where(eq(roles.id, roleId));
            if (roleInfo?.name?.toLowerCase().includes('super admin')) {
              result.eval = { view: true, run: true, review: true, finalize: true, menuVisibility: true };
              await db.update(permissionEval).set({
                view: true, run: true, review: true, finalize: true, menuVisibility: true,
              }).where(eq(permissionEval.id, permissions.permissionEvalId));
              console.log(`[AUTO-FIX] Upgraded eval permissions to all-true for Super Admin role ${roleId}`);
            }
          }
        }
      }

      if (!result.eval) {
        const [roleInfo] = await db.select({ name: roles.name }).from(roles).where(eq(roles.id, roleId));
        const isSuperAdmin = roleInfo?.name?.toLowerCase().includes('super admin');
        const defaultVal = isSuperAdmin ? true : false;
        result.eval = { view: defaultVal, run: defaultVal, review: defaultVal, finalize: defaultVal, menuVisibility: defaultVal };
        try {
          const [newEvalPerm] = await db.insert(permissionEval).values({
            view: defaultVal,
            run: defaultVal,
            review: defaultVal,
            finalize: defaultVal,
            menuVisibility: defaultVal,
          }).returning();
          if (newEvalPerm && permissions.rolePermModularId) {
            await db.execute(sql`
              UPDATE role_permissions_modular
              SET permission_eval_id = ${newEvalPerm.id}
              WHERE id = ${permissions.rolePermModularId}
            `);
            console.log(`[AUTO-FIX] Created missing eval permissions for role_permissions_modular id=${permissions.rolePermModularId}`);
          }
        } catch (autoFixErr) {
          console.error('[AUTO-FIX] Failed to create eval permissions:', autoFixErr);
        }
      }

      return result;
    } catch (error) {
      console.error('Error fetching user role permissions:', error);
      return {
        userMgmt: null,
        roleMgmt: null,
        orgMgmt: null,
        storageMgmt: null,
        fileMgmt: null,
        activityLogs: null,
        aiAgentMgmt: null,
        pgpKeyMgmt: null,
        helpCenter: null,
        siemMgmt: null,
        foundryMgmt: null,
        contentUnderstanding: null,
        hearingAi: null,
        documentTranslation: null,
        sftpMgmt: null,
        customerOnboarding: null,
        transferReports: null,
        eval: null,
      };
    }
  }

  async isRoleAssignedToUser(userEmail: string, roleId: number): Promise<boolean> {
    try {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.userId, users.id))
        .where(and(
          eq(users.email, userEmail),
          eq(userRoles.roleId, roleId),
          eq(userRoles.isEnabled, true)
        ));

      return (result[0]?.count ?? 0) > 0;
    } catch (error) {
      console.error('Error checking role assignment:', error);
      return false;
    }
  }

  // AI Agents Management
  async getAllAiAgents(): Promise<AiAgent[]> {
    const results = await db.select().from(aiAgents).orderBy(desc(aiAgents.createdAt));
    
    // Return agents with plain text API keys
    return results;
  }

  async getAiAgentsForOrganizations(organizationIds: number[]): Promise<AiAgent[]> {
    if (organizationIds.length === 0) {
      return [];
    }

    const results = await db
      .select()
      .from(aiAgents)
      .where(inArray(aiAgents.organizationId, organizationIds))
      .orderBy(desc(aiAgents.createdAt));
    
    // Return agents with plain text API keys
    return results;
  }

  async getAiAgent(id: number): Promise<AiAgent | undefined> {
    const [result] = await db.select().from(aiAgents).where(eq(aiAgents.id, id));
    
    if (result) {
      return result;
    }
    
    return undefined;
  }

  async createAiAgent(agent: InsertAiAgent): Promise<AiAgent> {
    // Check for duplicate endpoint+key combination
    const existingAgents = await db.select().from(aiAgents);
    
    // Check for duplicates by comparing plain text API keys
    for (const existing of existingAgents) {
      if (existing.apiEndpoint === agent.apiEndpoint && existing.apiKey === agent.apiKey) {
        throw new Error('An AI agent with this endpoint and API key combination already exists');
      }
    }
    
    // Store the API key in plain text
    const [result] = await db.insert(aiAgents).values(agent).returning();
    
    return result;
  }

  async updateAiAgent(id: number, agent: Partial<InsertAiAgent>): Promise<AiAgent | undefined> {
    // Store API key in plain text
    const updateData = { ...agent };
    
    const [result] = await db
      .update(aiAgents)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(aiAgents.id, id))
      .returning();
    
    if (result) {
      return result;
    }
    
    return undefined;
  }

  async deleteAiAgent(id: number): Promise<boolean> {
    const result = await db.delete(aiAgents).where(eq(aiAgents.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async checkUserAiAgentPermission(userEmail: string, action: 'view' | 'add' | 'edit' | 'delete'): Promise<boolean> {
    try {
      // Get all user's enabled roles
      const userRolesList = await db
        .select({
          roleId: userRoles.roleId,
          isEnabled: userRoles.isEnabled
        })
        .from(users)
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .where(and(
          eq(users.email, userEmail),
          eq(userRoles.isEnabled, true)
        ));

      if (!userRolesList.length) {
        return false;
      }

      // Check permissions across all enabled roles
      for (const userRole of userRolesList) {
        const rolePermissions = await this.getUserRolePermissions(userEmail, userRole.roleId);
        
        if (rolePermissions.aiAgentMgmt && rolePermissions.aiAgentMgmt[action] === true) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking AI agent permission:', error);
      return false;
    }
  }

  async checkUserPgpKeyPermission(userEmail: string, action: 'view' | 'generate' | 'delete' | 'copy' | 'decrypt'): Promise<boolean> {
    try {
      // Get all user's enabled roles
      const userRolesList = await db
        .select({
          roleId: userRoles.roleId,
          isEnabled: userRoles.isEnabled
        })
        .from(users)
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .where(and(
          eq(users.email, userEmail),
          eq(userRoles.isEnabled, true)
        ));

      if (!userRolesList.length) {
        return false;
      }

      // Check permissions across all enabled roles
      for (const userRole of userRolesList) {
        const rolePermissions = await this.getUserRolePermissions(userEmail, userRole.roleId);
        
        if (rolePermissions.pgpKeyMgmt && (rolePermissions.pgpKeyMgmt as Record<string, boolean>)[action] === true) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking PGP key permission:', error);
      return false;
    }
  }

  async checkUserSiemPermission(userEmail: string, action: 'install' | 'delete' | 'enableDisable' | 'view' | 'incidentsView'): Promise<boolean> {
    try {
      // Get all user's enabled roles
      const userRolesList = await db
        .select({
          roleId: userRoles.roleId,
          isEnabled: userRoles.isEnabled
        })
        .from(users)
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .where(and(
          eq(users.email, userEmail),
          eq(userRoles.isEnabled, true)
        ));

      if (!userRolesList.length) {
        return false;
      }

      // Check permissions across all enabled roles
      for (const userRole of userRolesList) {
        const rolePermissions = await this.getUserRolePermissions(userEmail, userRole.roleId);
        
        if (rolePermissions.siemMgmt && (rolePermissions.siemMgmt as Record<string, boolean>)[action] === true) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking SIEM permission:', error);
      return false;
    }
  }

  // Organization PGP Keys (Multiple keys per organization)
  async getOrgPgpKeys(organizationId: number): Promise<OrgPgpKey[]> {
    return await db
      .select()
      .from(orgPgpKeys)
      .where(eq(orgPgpKeys.organizationId, organizationId))
      .orderBy(orgPgpKeys.createdAt);
  }

  // Deprecated: for backward compatibility - returns first OWN key
  async getOrgPgpKey(organizationId: number): Promise<OrgPgpKey | undefined> {
    const [result] = await db
      .select()
      .from(orgPgpKeys)
      .where(and(
        eq(orgPgpKeys.organizationId, organizationId),
        eq(orgPgpKeys.belongsTo, 'SELF')
      ))
      .limit(1);
    return result || undefined;
  }

  async getOrgPgpKeyById(keyId: number): Promise<OrgPgpKey | undefined> {
    const [result] = await db
      .select()
      .from(orgPgpKeys)
      .where(eq(orgPgpKeys.id, keyId));
    return result || undefined;
  }

  async getOrgPgpKeysByType(organizationId: number, belongsTo: 'SELF' | 'PARTNER'): Promise<OrgPgpKey[]> {
    return await db
      .select()
      .from(orgPgpKeys)
      .where(and(
        eq(orgPgpKeys.organizationId, organizationId),
        eq(orgPgpKeys.belongsTo, belongsTo)
      ))
      .orderBy(orgPgpKeys.createdAt);
  }

  async createOrgPgpKey(key: InsertOrgPgpKey): Promise<OrgPgpKey> {
    const [result] = await db.insert(orgPgpKeys).values(key).returning();
    return result;
  }

  async updateOrgPgpKey(keyId: number, data: Partial<InsertOrgPgpKey>): Promise<OrgPgpKey | undefined> {
    const [result] = await db
      .update(orgPgpKeys)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(orgPgpKeys.id, keyId))
      .returning();
    return result || undefined;
  }

  // Deprecated: for backward compatibility - deletes all keys for org
  async deleteOrgPgpKey(organizationId: number): Promise<boolean> {
    const result = await db.delete(orgPgpKeys).where(eq(orgPgpKeys.organizationId, organizationId));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async deleteOrgPgpKeyById(keyId: number): Promise<boolean> {
    const result = await db.delete(orgPgpKeys).where(eq(orgPgpKeys.id, keyId));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Foundry AI Permission Check
  async checkUserFoundryPermission(userEmail: string, action: 'add' | 'edit' | 'delete' | 'view'): Promise<boolean> {
    try {
      const userRolesList = await db
        .select({
          roleId: userRoles.roleId,
          isEnabled: userRoles.isEnabled
        })
        .from(users)
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .where(and(
          eq(users.email, userEmail),
          eq(userRoles.isEnabled, true)
        ));

      if (!userRolesList.length) {
        return false;
      }

      for (const userRole of userRolesList) {
        const rolePermissions = await this.getUserRolePermissions(userEmail, userRole.roleId);
        
        if (rolePermissions.foundryMgmt && (rolePermissions.foundryMgmt as Record<string, boolean>)[action] === true) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking Foundry permission:', error);
      return false;
    }
  }

  // Content Understanding Permission Check
  async checkUserContentUnderstandingPermission(userEmail: string, action: 'view' | 'runAnalysis' | 'saveAnalysis' | 'deleteAnalysis' | 'menuVisibility'): Promise<boolean> {
    try {
      const userRolesList = await db
        .select({
          roleId: userRoles.roleId,
          isEnabled: userRoles.isEnabled
        })
        .from(users)
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .where(and(
          eq(users.email, userEmail),
          eq(userRoles.isEnabled, true)
        ));

      if (!userRolesList.length) {
        return false;
      }

      for (const userRole of userRolesList) {
        const rolePermissions = await this.getUserRolePermissions(userEmail, userRole.roleId);
        
        if (rolePermissions.contentUnderstanding && (rolePermissions.contentUnderstanding as Record<string, boolean>)[action] === true) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking Content Understanding permission:', error);
      return false;
    }
  }

  // HearingAI Permission Check
  async checkUserHearingAiPermission(userEmail: string, action: 'view' | 'runAnalysis' | 'saveAnalysis' | 'deleteAnalysis' | 'menuVisibility'): Promise<boolean> {
    try {
      const userRolesList = await db
        .select({
          roleId: userRoles.roleId,
          isEnabled: userRoles.isEnabled
        })
        .from(users)
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .where(and(
          eq(users.email, userEmail),
          eq(userRoles.isEnabled, true)
        ));

      if (!userRolesList.length) {
        return false;
      }

      for (const userRole of userRolesList) {
        const rolePermissions = await this.getUserRolePermissions(userEmail, userRole.roleId);
        
        if (rolePermissions.hearingAi && (rolePermissions.hearingAi as Record<string, boolean>)[action] === true) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking HearingAI permission:', error);
      return false;
    }
  }

  // Document Translation Permission Check
  async checkUserDocumentTranslationPermission(userEmail: string, action: 'view' | 'runTranslation' | 'deleteTranslation'): Promise<boolean> {
    try {
      const userRolesList = await db
        .select({
          roleId: userRoles.roleId,
          isEnabled: userRoles.isEnabled
        })
        .from(users)
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .where(and(
          eq(users.email, userEmail),
          eq(userRoles.isEnabled, true)
        ));

      if (!userRolesList.length) {
        return false;
      }

      for (const userRole of userRolesList) {
        const rolePermissions = await this.getUserRolePermissions(userEmail, userRole.roleId);
        
        if (rolePermissions.documentTranslation && (rolePermissions.documentTranslation as Record<string, boolean>)[action] === true) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking Document Translation permission:', error);
      return false;
    }
  }

  async checkUserEvalPermission(userEmail: string, action: 'view' | 'run' | 'review' | 'finalize' | 'menuVisibility'): Promise<boolean> {
    try {
      const userRolesList = await db
        .select({
          roleId: userRoles.roleId,
          isEnabled: userRoles.isEnabled
        })
        .from(users)
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .where(and(
          eq(users.email, userEmail),
          eq(userRoles.isEnabled, true)
        ));

      if (!userRolesList.length) {
        return false;
      }

      for (const userRole of userRolesList) {
        const rolePermissions = await this.getUserRolePermissions(userEmail, userRole.roleId);

        if (rolePermissions.eval && (rolePermissions.eval as Record<string, boolean>)[action] === true) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking Eval permission:', error);
      return false;
    }
  }

  // Foundry AI Resources CRUD - resources are organization-scoped
  // Get all foundry resources (admin view)
  async getFoundryResources(): Promise<FoundryResource[]> {
    return await db
      .select()
      .from(foundryResources)
      .orderBy(desc(foundryResources.createdAt));
  }

  // Get resources for a specific organization
  async getFoundryResourcesByOrganization(organizationId: number): Promise<FoundryResource[]> {
    return await db
      .select()
      .from(foundryResources)
      .where(eq(foundryResources.organizationId, organizationId))
      .orderBy(desc(foundryResources.createdAt));
  }

  // Get resources LINKED to organizations via foundry_resource_sets
  // This returns only resources that have an active resource set for the given organization(s)
  // NOT just resources that were created by those organizations
  async getFoundryResourcesForOrganizations(organizationIds: number[]): Promise<FoundryResource[]> {
    if (!organizationIds.length) return [];
    
    // Join with foundry_resource_sets to get only linked resources
    const results = await db
      .select({
        resource: foundryResources
      })
      .from(foundryResourceSets)
      .innerJoin(foundryResources, eq(foundryResourceSets.foundryResourceId, foundryResources.id))
      .where(inArray(foundryResourceSets.organizationId, organizationIds))
      .orderBy(desc(foundryResources.createdAt));
    
    // Extract the resource from each result and deduplicate
    const resourceMap = new Map<number, FoundryResource>();
    results.forEach(r => {
      if (!resourceMap.has(r.resource.id)) {
        resourceMap.set(r.resource.id, r.resource);
      }
    });
    
    return Array.from(resourceMap.values());
  }

  async getFoundryResource(id: number): Promise<FoundryResource | undefined> {
    const [result] = await db
      .select()
      .from(foundryResources)
      .where(eq(foundryResources.id, id));
    return result || undefined;
  }

  async getFoundryResourceByName(resourceName: string): Promise<FoundryResource | undefined> {
    const [result] = await db
      .select()
      .from(foundryResources)
      .where(eq(foundryResources.resourceName, resourceName));
    return result || undefined;
  }

  async createFoundryResource(resource: InsertFoundryResource): Promise<FoundryResource> {
    const [result] = await db.insert(foundryResources).values(resource).returning();
    return result;
  }

  async updateFoundryResource(id: number, resource: Partial<InsertFoundryResource>): Promise<FoundryResource | undefined> {
    const [result] = await db
      .update(foundryResources)
      .set({ ...resource, updatedAt: new Date() })
      .where(eq(foundryResources.id, id))
      .returning();
    return result || undefined;
  }

  async deleteFoundryResource(id: number): Promise<boolean> {
    const result = await db.delete(foundryResources).where(eq(foundryResources.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Foundry Resource Sets implementation
  async getFoundryResourceSets(organizationId: number): Promise<FoundryResourceSet[]> {
    return await db
      .select()
      .from(foundryResourceSets)
      .where(eq(foundryResourceSets.organizationId, organizationId))
      .orderBy(desc(foundryResourceSets.createdAt));
  }

  async getFoundryResourceSetsForOrganizations(organizationIds: number[]): Promise<FoundryResourceSet[]> {
    if (!organizationIds.length) return [];
    return await db
      .select()
      .from(foundryResourceSets)
      .where(inArray(foundryResourceSets.organizationId, organizationIds))
      .orderBy(desc(foundryResourceSets.createdAt));
  }

  async getFoundryResourceSet(id: number): Promise<FoundryResourceSet | undefined> {
    const [result] = await db
      .select()
      .from(foundryResourceSets)
      .where(eq(foundryResourceSets.id, id));
    return result || undefined;
  }

  async getFoundryResourceSetByOrg(organizationId: number): Promise<FoundryResourceSet | undefined> {
    const [result] = await db
      .select()
      .from(foundryResourceSets)
      .where(and(
        eq(foundryResourceSets.organizationId, organizationId),
        eq(foundryResourceSets.status, "active")
      ));
    return result || undefined;
  }

  // Count how many organizations are linked to a foundry resource (for max 2 org restriction)
  async countOrganizationsLinkedToResource(foundryResourceId: number, excludeOrgId?: number): Promise<number> {
    const conditions = [eq(foundryResourceSets.foundryResourceId, foundryResourceId)];
    if (excludeOrgId !== undefined) {
      conditions.push(ne(foundryResourceSets.organizationId, excludeOrgId));
    }
    const result = await db
      .select({ count: sql<number>`count(distinct ${foundryResourceSets.organizationId})` })
      .from(foundryResourceSets)
      .where(and(...conditions));
    return Number(result[0]?.count || 0);
  }

  // Get resource set with full foundry resource details (for Chat Playground)
  async getFoundryResourceSetWithResourceByOrg(organizationId: number): Promise<{
    resourceSet: FoundryResourceSet;
    foundryResource: FoundryResource;
  } | undefined> {
    const [result] = await db
      .select({
        resourceSet: foundryResourceSets,
        foundryResource: foundryResources,
      })
      .from(foundryResourceSets)
      .innerJoin(foundryResources, eq(foundryResourceSets.foundryResourceId, foundryResources.id))
      .where(and(
        eq(foundryResourceSets.organizationId, organizationId),
        eq(foundryResourceSets.status, "active")
      ));
    return result || undefined;
  }

  async createFoundryResourceSet(resourceSet: InsertFoundryResourceSet): Promise<FoundryResourceSet> {
    const [result] = await db.insert(foundryResourceSets).values(resourceSet).returning();
    return result;
  }

  async updateFoundryResourceSet(id: number, resourceSet: Partial<InsertFoundryResourceSet>): Promise<FoundryResourceSet | undefined> {
    const [result] = await db
      .update(foundryResourceSets)
      .set({ ...resourceSet, updatedAt: new Date() })
      .where(eq(foundryResourceSets.id, id))
      .returning();
    return result || undefined;
  }

  async deleteFoundryResourceSet(id: number): Promise<boolean> {
    const result = await db.delete(foundryResourceSets).where(eq(foundryResourceSets.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // SFTP Local Users Implementation
  async getSftpLocalUsers(organizationIds: number[]): Promise<SftpLocalUserWithScopes[]> {
    if (organizationIds.length === 0) return [];
    
    const localUsers = await db
      .select()
      .from(sftpLocalUsers)
      .leftJoin(users, eq(sftpLocalUsers.mappedUserId, users.id))
      .where(inArray(sftpLocalUsers.organizationId, organizationIds))
      .orderBy(desc(sftpLocalUsers.createdAt));
    
    const result: SftpLocalUserWithScopes[] = [];
    for (const row of localUsers) {
      const scopes = await db
        .select()
        .from(sftpLocalUserScopes)
        .where(eq(sftpLocalUserScopes.sftpLocalUserId, row.sftp_local_users.id));
      
      result.push({
        ...row.sftp_local_users,
        scopes,
        mappedUserEmail: row.users?.email,
        mappedUserName: row.users?.name,
      });
    }
    return result;
  }

  async getSftpLocalUserById(id: number): Promise<SftpLocalUserWithScopes | undefined> {
    const [row] = await db
      .select()
      .from(sftpLocalUsers)
      .leftJoin(users, eq(sftpLocalUsers.mappedUserId, users.id))
      .where(eq(sftpLocalUsers.id, id));
    
    if (!row) return undefined;
    
    const scopes = await db
      .select()
      .from(sftpLocalUserScopes)
      .where(eq(sftpLocalUserScopes.sftpLocalUserId, id));
    
    return {
      ...row.sftp_local_users,
      scopes,
      mappedUserEmail: row.users?.email,
      mappedUserName: row.users?.name,
    };
  }

  async getSftpLocalUserByMapping(userId: number): Promise<SftpLocalUserWithScopes | undefined> {
    const [row] = await db
      .select()
      .from(sftpLocalUsers)
      .leftJoin(users, eq(sftpLocalUsers.mappedUserId, users.id))
      .where(eq(sftpLocalUsers.mappedUserId, userId));
    
    if (!row) return undefined;
    
    const scopes = await db
      .select()
      .from(sftpLocalUserScopes)
      .where(eq(sftpLocalUserScopes.sftpLocalUserId, row.sftp_local_users.id));
    
    return {
      ...row.sftp_local_users,
      scopes,
      mappedUserEmail: row.users?.email,
      mappedUserName: row.users?.name,
    };
  }

  async getSftpLocalUserByMappingInOrg(userId: number, organizationId: number): Promise<SftpLocalUserWithScopes | undefined> {
    const [row] = await db
      .select()
      .from(sftpLocalUsers)
      .leftJoin(users, eq(sftpLocalUsers.mappedUserId, users.id))
      .where(and(
        eq(sftpLocalUsers.mappedUserId, userId),
        eq(sftpLocalUsers.organizationId, organizationId)
      ));
    
    if (!row) return undefined;
    
    const scopes = await db
      .select()
      .from(sftpLocalUserScopes)
      .where(eq(sftpLocalUserScopes.sftpLocalUserId, row.sftp_local_users.id));
    
    return {
      ...row.sftp_local_users,
      scopes,
      mappedUserEmail: row.users?.email,
      mappedUserName: row.users?.name,
    };
  }

  async getSftpLocalUserByMappedUserInOrg(organizationId: number, mappedUserId: number): Promise<SftpLocalUser | undefined> {
    const [user] = await db
      .select()
      .from(sftpLocalUsers)
      .where(and(
        eq(sftpLocalUsers.organizationId, organizationId),
        eq(sftpLocalUsers.mappedUserId, mappedUserId)
      ));
    return user || undefined;
  }

  async getSftpLocalUserByUsername(storageAccountName: string, localUsername: string, organizationId: number): Promise<SftpLocalUser | undefined> {
    const [user] = await db
      .select()
      .from(sftpLocalUsers)
      .where(and(
        eq(sftpLocalUsers.storageAccountName, storageAccountName),
        eq(sftpLocalUsers.localUsername, localUsername),
        eq(sftpLocalUsers.organizationId, organizationId)
      ));
    return user || undefined;
  }

  async createSftpLocalUser(data: InsertSftpLocalUser): Promise<SftpLocalUser> {
    const [newUser] = await db.insert(sftpLocalUsers).values(data).returning();
    return newUser;
  }

  async updateSftpLocalUser(id: number, data: Partial<InsertSftpLocalUser>): Promise<SftpLocalUser | undefined> {
    const [updated] = await db
      .update(sftpLocalUsers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sftpLocalUsers.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSftpLocalUser(id: number): Promise<boolean> {
    const result = await db.delete(sftpLocalUsers).where(eq(sftpLocalUsers.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getSftpLocalUserScopes(sftpLocalUserId: number): Promise<SftpLocalUserScope[]> {
    return await db
      .select()
      .from(sftpLocalUserScopes)
      .where(eq(sftpLocalUserScopes.sftpLocalUserId, sftpLocalUserId));
  }

  async replaceSftpLocalUserScopes(
    sftpLocalUserId: number,
    organizationId: number,
    scopes: Omit<InsertSftpLocalUserScope, 'sftpLocalUserId' | 'organizationId'>[]
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(sftpLocalUserScopes).where(eq(sftpLocalUserScopes.sftpLocalUserId, sftpLocalUserId));
      
      if (scopes.length > 0) {
        const scopesToInsert = scopes.map(s => ({
          ...s,
          sftpLocalUserId,
          organizationId,
        }));
        await tx.insert(sftpLocalUserScopes).values(scopesToInsert);
      }
    });
  }

  async createSftpRotationEvent(data: InsertSftpRotationEvent): Promise<SftpRotationEvent> {
    const [event] = await db.insert(sftpRotationEvents).values(data).returning();
    return event;
  }

  async getSftpRotationEvents(sftpLocalUserId: number, limit: number = 50): Promise<SftpRotationEvent[]> {
    return await db
      .select()
      .from(sftpRotationEvents)
      .where(eq(sftpRotationEvents.sftpLocalUserId, sftpLocalUserId))
      .orderBy(desc(sftpRotationEvents.createdAt))
      .limit(limit);
  }

  async checkUserSftpPermission(
    userEmail: string,
    action: 'view' | 'create' | 'update' | 'disable' | 'delete' | 'mapUser' | 'viewSelfAccess' | 'rotateSshSelf' | 'rotatePasswordSelf'
  ): Promise<boolean> {
    const userRolesData = await db
      .select({
        permissionSftpMgmtId: rolePermissionsModular.permissionSftpMgmtId,
      })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .innerJoin(rolePermissionsModular, eq(userRoles.roleId, rolePermissionsModular.roleId))
      .where(and(
        eq(users.email, userEmail),
        eq(userRoles.isEnabled, true)
      ));

    for (const role of userRolesData) {
      if (role.permissionSftpMgmtId) {
        const [perm] = await db
          .select()
          .from(permissionSftpMgmt)
          .where(eq(permissionSftpMgmt.id, role.permissionSftpMgmtId));
        
        if (perm) {
          const actionMap: Record<string, keyof typeof perm> = {
            view: 'view',
            create: 'create',
            update: 'update',
            disable: 'disable',
            delete: 'delete',
            mapUser: 'mapUser',
            viewSelfAccess: 'viewSelfAccess',
            rotateSshSelf: 'rotateSshSelf',
            rotatePasswordSelf: 'rotatePasswordSelf',
          };
          
          const permKey = actionMap[action];
          if (permKey && perm[permKey] === true) {
            return true;
          }
        }
      }
    }
    return false;
  }

  async checkUserCustomerOnboardingPermission(
    userEmail: string,
    action: 'view' | 'upload' | 'commit' | 'delete'
  ): Promise<boolean> {
    const userRolesData = await db
      .select({
        permissionCustomerOnboardingId: rolePermissionsModular.permissionCustomerOnboardingId,
      })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .innerJoin(rolePermissionsModular, eq(userRoles.roleId, rolePermissionsModular.roleId))
      .where(and(
        eq(users.email, userEmail),
        eq(userRoles.isEnabled, true)
      ));

    for (const role of userRolesData) {
      if (role.permissionCustomerOnboardingId) {
        const [perm] = await db
          .select()
          .from(permissionCustomerOnboarding)
          .where(eq(permissionCustomerOnboarding.id, role.permissionCustomerOnboardingId));
        
        if (perm) {
          const actionMap: Record<string, keyof typeof perm> = {
            view: 'view',
            upload: 'upload',
            commit: 'commit',
            delete: 'delete',
          };
          
          const permKey = actionMap[action];
          if (permKey && perm[permKey] === true) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // ============================================
  // Content Understanding Async Jobs (Video Analysis)
  // ============================================

  async createCuJob(job: InsertCuJob): Promise<CuJob> {
    const [newJob] = await db.insert(cuJobs).values(job).returning();
    return newJob;
  }

  async getCuJob(jobId: string): Promise<CuJob | undefined> {
    const [job] = await db.select().from(cuJobs).where(eq(cuJobs.jobId, jobId));
    return job || undefined;
  }

  async getCuJobsByUser(userId: number, limit: number = 50): Promise<CuJob[]> {
    return await db
      .select()
      .from(cuJobs)
      .where(eq(cuJobs.userId, userId))
      .orderBy(desc(cuJobs.createdAt))
      .limit(limit);
  }

  async getCuJobsByOrganization(organizationId: number, limit: number = 50): Promise<CuJob[]> {
    return await db
      .select()
      .from(cuJobs)
      .where(eq(cuJobs.organizationId, organizationId))
      .orderBy(desc(cuJobs.createdAt))
      .limit(limit);
  }

  async updateCuJob(jobId: string, data: Partial<InsertCuJob>): Promise<CuJob | undefined> {
    const [updatedJob] = await db
      .update(cuJobs)
      .set(data)
      .where(eq(cuJobs.jobId, jobId))
      .returning();
    return updatedJob || undefined;
  }

  async deleteCuJob(jobId: string): Promise<boolean> {
    const result = await db.delete(cuJobs).where(eq(cuJobs.jobId, jobId)).returning();
    return result.length > 0;
  }

  async getPendingCuJobs(): Promise<CuJob[]> {
    return await db
      .select()
      .from(cuJobs)
      .where(
        or(
          eq(cuJobs.status, 'submitted'),
          eq(cuJobs.status, 'running')
        )
      )
      .orderBy(cuJobs.createdAt);
  }

  // HearingAI Async Jobs
  async createHaiJob(job: InsertHaiJob): Promise<HaiJob> {
    const [newJob] = await db.insert(haiJobs).values(job).returning();
    return newJob;
  }

  async getHaiJob(jobId: string): Promise<HaiJob | undefined> {
    const [job] = await db.select().from(haiJobs).where(eq(haiJobs.jobId, jobId));
    return job || undefined;
  }

  async getHaiJobsByUser(userId: number, limit: number = 50): Promise<HaiJob[]> {
    return await db
      .select()
      .from(haiJobs)
      .where(eq(haiJobs.userId, userId))
      .orderBy(desc(haiJobs.createdAt))
      .limit(limit);
  }

  async getHaiJobsByOrganization(organizationId: number, limit: number = 50): Promise<HaiJob[]> {
    return await db
      .select()
      .from(haiJobs)
      .where(eq(haiJobs.organizationId, organizationId))
      .orderBy(desc(haiJobs.createdAt))
      .limit(limit);
  }

  async updateHaiJob(jobId: string, data: Partial<InsertHaiJob>): Promise<HaiJob | undefined> {
    const [updatedJob] = await db
      .update(haiJobs)
      .set(data)
      .where(eq(haiJobs.jobId, jobId))
      .returning();
    return updatedJob || undefined;
  }

  async deleteHaiJob(jobId: string): Promise<boolean> {
    const result = await db.delete(haiJobs).where(eq(haiJobs.jobId, jobId)).returning();
    return result.length > 0;
  }

  async getPendingHaiJobs(): Promise<HaiJob[]> {
    return await db
      .select()
      .from(haiJobs)
      .where(
        or(
          eq(haiJobs.status, 'submitted'),
          eq(haiJobs.status, 'running')
        )
      )
      .orderBy(haiJobs.createdAt);
  }

  // Permission Risk Categories
  async getPermissionRiskCategories(): Promise<PermissionRiskCategory[]> {
    return await db.select().from(permissionRiskCategories);
  }

  async updatePermissionRiskCategory(id: number, data: Partial<InsertPermissionRiskCategory>): Promise<PermissionRiskCategory | undefined> {
    const [updated] = await db
      .update(permissionRiskCategories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(permissionRiskCategories.id, id))
      .returning();
    return updated || undefined;
  }
}

export const storage = new DatabaseStorage();