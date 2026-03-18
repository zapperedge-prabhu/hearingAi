import { parse } from 'csv-parse/sync';
import { db } from "../db";
import { storage } from "../storage";
import { onboardingValidator, type ValidationResult } from "./onboardingValidator";
import { 
  onboardingJobs, onboardingJobRows, sftpLocalUserScopes,
  type OnboardingJob, type InsertOnboardingJob,
  type OnboardingJobRow, type InsertOnboardingJobRow,
  type OnboardingCSVRow, type OnboardingValidationError
} from "@shared/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { azureSftpService } from "../azureSftpLocalUsersService";

// Preview limit for CSV data - configurable via environment variable
// Set to 0 or negative to show all rows
const ONBOARDING_PREVIEW_LIMIT = parseInt(process.env.ZAPPER_ONBOARDING_PREVIEW_LIMIT || '0', 10);

export interface ParsedCSVResult {
  headers: string[];
  rows: OnboardingCSVRow[];
  rawCSV: string;
}

export interface AggregatedCounts {
  uniqueOrganizations: number;
  uniqueUsers: number;
  uniqueStorageMappings: number;
  totalRoleAssignments: number;
  totalSftpUsers: number;
}

export interface UploadResult {
  jobId: number;
  status: string;
  totalRows: number;
  preview: OnboardingCSVRow[];
  columnMapping: {
    detected: string[];
    required: string[];
    optional: string[];
    missing: string[];
    unknown: string[];
    isValid: boolean;
  };
  validationResult: ValidationResult;
  aggregatedCounts: AggregatedCounts;
}

export interface SkippedEntry {
  row: number;
  type: 'organization' | 'user' | 'role' | 'storage' | 'sftp';
  name: string;
  reason: string;
}

export interface CommitResult {
  jobId: number;
  status: string;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  summary: {
    organizationsCreated: number;
    usersCreated: number;
    rolesAssigned: number;
    storageAccountsMapped: number;
    sftpUsersCreated: number;
  };
  skipped: {
    organizations: SkippedEntry[];
    users: SkippedEntry[];
    roles: SkippedEntry[];
    storage: SkippedEntry[];
    sftp: SkippedEntry[];
  };
  errors: Array<{ row: number; code: string; message: string }>;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  status?: string;
}

export class OnboardingService {
  async parseCSV(csvContent: string): Promise<ParsedCSVResult> {
    // First, parse to get headers using info option
    const recordsWithInfo = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      info: true,
    });

    // Extract headers from the first record's keys (csv-parse guarantees order)
    const records: OnboardingCSVRow[] = [];
    let headers: string[] = [];
    
    for (const record of recordsWithInfo) {
      if (headers.length === 0 && record.record) {
        headers = Object.keys(record.record);
      }
      if (record.record) {
        records.push(record.record as OnboardingCSVRow);
      }
    }

    // Fallback: if no records, parse headers-only
    if (headers.length === 0 && csvContent.trim()) {
      const headerOnlyParse = parse(csvContent, {
        columns: false,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        to: 1,
      });
      if (headerOnlyParse.length > 0) {
        headers = headerOnlyParse[0] as string[];
      }
    }

    return {
      headers,
      rows: records,
      rawCSV: csvContent,
    };
  }

  async uploadAndValidate(csvContent: string, userId: number): Promise<UploadResult> {
    const parsed = await this.parseCSV(csvContent);
    const columnMapping = onboardingValidator.validateColumnMapping(parsed.headers);
    
    if (!columnMapping.isValid) {
      throw new Error(`Missing required columns: ${columnMapping.missing.join(', ')}`);
    }

    const validationResult = await onboardingValidator.validateAll(parsed.rows);

    // Create job record
    const [job] = await db.insert(onboardingJobs).values({
      jobName: `Import ${new Date().toISOString().slice(0, 10)}`,
      status: 'validating',
      totalRows: parsed.rows.length,
      csvData: parsed.rawCSV,
      validationErrors: validationResult.errors as any,
      createdByUserId: userId,
    }).returning();

    // Create row records
    const rowInserts: InsertOnboardingJobRow[] = parsed.rows.map((row, idx) => ({
      jobId: job.id,
      rowNumber: idx + 1,
      rawData: row as any,
      status: 'pending',
    }));

    if (rowInserts.length > 0) {
      await db.insert(onboardingJobRows).values(rowInserts);
    }

    // Update job status based on validation
    const newStatus = validationResult.isValid ? 'validated' : 'validation_failed';
    await db.update(onboardingJobs)
      .set({ status: newStatus })
      .where(eq(onboardingJobs.id, job.id));

    // Apply preview limit: 0 or negative means show all rows
    const previewRows = ONBOARDING_PREVIEW_LIMIT > 0 
      ? parsed.rows.slice(0, ONBOARDING_PREVIEW_LIMIT) 
      : parsed.rows;

    // Compute aggregated counts from FULL dataset (not preview)
    const aggregatedCounts: AggregatedCounts = {
      uniqueOrganizations: new Set(parsed.rows.map(r => r.OrgName).filter(Boolean)).size,
      uniqueUsers: new Set(parsed.rows.map(r => r.Email).filter(Boolean)).size,
      uniqueStorageMappings: new Set(
        parsed.rows
          .filter(r => r.StorageAccount)
          .map(r => `${r.StorageAccount}/${r.Container || ''}`)
      ).size,
      totalRoleAssignments: parsed.rows.length,
      totalSftpUsers: parsed.rows.filter(r => r.SFTPUser).length,
    };

    return {
      jobId: job.id,
      status: newStatus,
      totalRows: parsed.rows.length,
      preview: previewRows,
      columnMapping,
      validationResult,
      aggregatedCounts,
    };
  }

  async getJob(jobId: number): Promise<OnboardingJob | undefined> {
    const [job] = await db.select()
      .from(onboardingJobs)
      .where(eq(onboardingJobs.id, jobId));
    return job;
  }

  async getJobs(userId?: number, options: PaginationOptions = {}): Promise<{ jobs: OnboardingJob[]; total: number }> {
    const { page = 1, limit = 10, status } = options;
    const offset = (page - 1) * limit;

    // Build where conditions - always filter by userId for ownership
    const conditions: any[] = [];
    if (userId) {
      conditions.push(eq(onboardingJobs.createdByUserId, userId));
    }
    if (status) {
      conditions.push(eq(onboardingJobs.status, status));
    }

    let query = db.select().from(onboardingJobs);
    let countQuery = db.select({ count: count() }).from(onboardingJobs);

    if (conditions.length > 0) {
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      query = query.where(whereClause) as typeof query;
      countQuery = countQuery.where(whereClause) as typeof countQuery;
    }

    const jobs = await query.orderBy(desc(onboardingJobs.createdAt)).limit(limit).offset(offset);
    const [{ count: total }] = await countQuery;

    return { jobs, total };
  }

  async getJobRows(jobId: number, options: PaginationOptions = {}): Promise<{ rows: OnboardingJobRow[]; total: number }> {
    const { page = 1, limit = 50, status } = options;
    const offset = (page - 1) * limit;

    let whereClause = eq(onboardingJobRows.jobId, jobId);
    if (status) {
      whereClause = and(whereClause, eq(onboardingJobRows.status, status))!;
    }

    const rows = await db.select()
      .from(onboardingJobRows)
      .where(whereClause)
      .orderBy(onboardingJobRows.rowNumber)
      .limit(limit)
      .offset(offset);

    const [{ count: total }] = await db.select({ count: count() })
      .from(onboardingJobRows)
      .where(whereClause);

    return { rows, total };
  }

  async deleteJob(jobId: number): Promise<boolean> {
    const result = await db.delete(onboardingJobs).where(eq(onboardingJobs.id, jobId));
    return (result.rowCount ?? 0) > 0;
  }

  async commitJob(jobId: number): Promise<CommitResult> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'validated') {
      throw new Error(`Cannot commit job with status: ${job.status}. Job must be validated first.`);
    }

    // Update job status to processing
    await db.update(onboardingJobs)
      .set({ status: 'processing' })
      .where(eq(onboardingJobs.id, jobId));

    const { rows } = await this.getJobRows(jobId, { limit: 10000 });
    
    const summary = {
      organizationsCreated: 0,
      usersCreated: 0,
      rolesAssigned: 0,
      storageAccountsMapped: 0,
      sftpUsersCreated: 0,
    };
    const skipped: CommitResult['skipped'] = {
      organizations: [],
      users: [],
      roles: [],
      storage: [],
      sftp: [],
    };
    const errors: Array<{ row: number; code: string; message: string }> = [];
    let successCount = 0;
    let errorCount = 0;

    // Process rows with progress tracking - update every 10 rows or 2 seconds
    const PROGRESS_UPDATE_INTERVAL = 10;
    let processedCount = 0;
    
    for (const row of rows) {
      try {
        const result = await this.processRow(row);
        summary.organizationsCreated += result.organizationCreated ? 1 : 0;
        summary.usersCreated += result.userCreated ? 1 : 0;
        summary.rolesAssigned += result.roleAssigned ? 1 : 0;
        summary.storageAccountsMapped += result.storageCreated ? 1 : 0;
        summary.sftpUsersCreated += result.sftpCreated ? 1 : 0;

        // Collect skipped entries
        for (const entry of result.skippedEntries) {
          skipped[entry.type === 'organization' ? 'organizations' : 
                  entry.type === 'user' ? 'users' :
                  entry.type === 'role' ? 'roles' :
                  entry.type === 'storage' ? 'storage' : 'sftp'].push(entry);
        }

        await db.update(onboardingJobRows)
          .set({
            status: 'success',
            processedAt: new Date(),
            createdOrganizationId: result.organizationId,
            createdUserId: result.userId,
            createdUserRoleId: result.userRoleId,
            createdStorageAccountId: result.storageAccountId,
            createdSftpLocalUserId: result.sftpLocalUserId,
          })
          .where(eq(onboardingJobRows.id, row.id));
        
        successCount++;
      } catch (error: any) {
        console.error(`[ONBOARDING] Row ${row.rowNumber} failed:`, error.message);
        
        await db.update(onboardingJobRows)
          .set({
            status: 'failed',
            errorMessage: error.message,
            errorCode: 'P000',
            processedAt: new Date(),
          })
          .where(eq(onboardingJobRows.id, row.id));

        errors.push({
          row: row.rowNumber,
          code: 'P000',
          message: error.message,
        });
        errorCount++;
      }
      
      processedCount++;
      
      // Update progress in database periodically
      if (processedCount % PROGRESS_UPDATE_INTERVAL === 0 || processedCount === rows.length) {
        await db.update(onboardingJobs)
          .set({
            successCount,
            errorCount,
          })
          .where(eq(onboardingJobs.id, jobId));
      }
    }

    const finalStatus = errorCount === 0 ? 'completed' : 
                        successCount === 0 ? 'failed' : 'partial_success';

    await db.update(onboardingJobs)
      .set({
        status: finalStatus,
        successCount,
        errorCount,
        processingErrors: errors as any,
        completedAt: new Date(),
      })
      .where(eq(onboardingJobs.id, jobId));

    const totalSkipped = skipped.organizations.length + skipped.users.length + 
                         skipped.roles.length + skipped.storage.length + skipped.sftp.length;

    return {
      jobId,
      status: finalStatus,
      successCount,
      errorCount,
      skippedCount: totalSkipped,
      summary,
      skipped,
      errors,
    };
  }

  private async processRow(row: OnboardingJobRow): Promise<{
    organizationCreated: boolean;
    userCreated: boolean;
    roleAssigned: boolean;
    storageCreated: boolean;
    sftpCreated: boolean;
    organizationId?: number;
    userId?: number;
    userRoleId?: number;
    storageAccountId?: number;
    sftpLocalUserId?: number;
    skippedEntries: SkippedEntry[];
  }> {
    const data = row.rawData as OnboardingCSVRow;
    const skippedEntries: SkippedEntry[] = [];
    const result = {
      organizationCreated: false,
      userCreated: false,
      roleAssigned: false,
      storageCreated: false,
      sftpCreated: false,
      organizationId: undefined as number | undefined,
      userId: undefined as number | undefined,
      userRoleId: undefined as number | undefined,
      storageAccountId: undefined as number | undefined,
      sftpLocalUserId: undefined as number | undefined,
      skippedEntries,
    };

    // Step 1: Get or Create Organization
    let organization = await storage.getOrganizationByName(data.OrgName.trim());
    if (!organization) {
      organization = await storage.createOrganization({
        name: data.OrgName.trim(),
        description: `Created via onboarding`,
      });
      result.organizationCreated = true;
    } else {
      skippedEntries.push({
        row: row.rowNumber,
        type: 'organization',
        name: data.OrgName.trim(),
        reason: 'Organization already exists',
      });
    }
    result.organizationId = organization.id;

    // Step 2: Get or Create User
    let user = await storage.getUserByEmail(data.Email.trim().toLowerCase());
    if (!user) {
      user = await storage.createUser({
        name: data.LoginName.trim(),
        email: data.Email.trim().toLowerCase(),
        isEnabled: true,
      });
      result.userCreated = true;
    } else {
      skippedEntries.push({
        row: row.rowNumber,
        type: 'user',
        name: data.Email.trim().toLowerCase(),
        reason: 'User already exists',
      });
    }
    result.userId = user.id;

    // Step 3: Get Role
    const role = await storage.getRoleByName(data.Role.trim());
    if (!role) {
      throw new Error(`Role '${data.Role}' not found`);
    }

    // Step 4: Assign Role to User in Organization
    const existingUserRoles = await storage.getUserRoles(user.id);
    const hasRole = existingUserRoles.some(
      ur => ur.roleId === role.id && ur.organizationId === organization!.id
    );
    
    if (!hasRole) {
      const userRole = await storage.createUserRole({
        userId: user.id,
        roleId: role.id,
        organizationId: organization.id,
        isEnabled: true,
      });
      result.roleAssigned = true;
      result.userRoleId = userRole.id;
    } else {
      skippedEntries.push({
        row: row.rowNumber,
        type: 'role',
        name: `${data.Email} - ${data.Role} in ${data.OrgName}`,
        reason: 'Role already assigned to user in this organization',
      });
    }

    // Step 5: Create/Get Storage Account Mapping
    const existingStorage = await storage.getStorageAccountsByOrganization(organization.id);
    let storageAccount = existingStorage.find(
      s => s.name === data.StorageAccount && s.containerName === data.Container
    );

    if (!storageAccount) {
      storageAccount = await storage.createStorageAccount({
        name: data.StorageAccount.trim(),
        containerName: data.Container.trim(),
        resourceGroupName: data.ResourceGroup?.trim() || process.env.ZAPPER_AZURE_RESOURCE_GROUP,
        location: data.Location?.trim() || 'East US',
        organizationId: organization.id,
        kind: 'adls',
      });
      result.storageCreated = true;
    } else {
      skippedEntries.push({
        row: row.rowNumber,
        type: 'storage',
        name: `${data.StorageAccount}/${data.Container}`,
        reason: 'Storage account already mapped to this organization',
      });
    }
    result.storageAccountId = storageAccount.id;

    // Step 6: Create SFTP Local User (if Azure is configured)
    const sshEnabled = data.AuthSSHKeyFlag?.toLowerCase() === 'true' || !data.AuthPasswordFlag;
    const passwordEnabled = data.AuthPasswordFlag?.toLowerCase() === 'true';

    try {
      const existingSftp = await storage.getSftpLocalUserByUsername(
        data.StorageAccount,
        data.SFTPUser,
        organization.id
      );

      if (!existingSftp) {
        // Create SFTP user in database (Azure creation is separate)
        const sftpUser = await storage.createSftpLocalUser({
          organizationId: organization.id,
          subscriptionId: process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || '',
          resourceGroup: data.ResourceGroup?.trim() || process.env.ZAPPER_AZURE_RESOURCE_GROUP || '',
          storageAccountName: data.StorageAccount.trim(),
          containerName: data.Container.trim(),
          localUsername: data.SFTPUser.trim(),
          displayName: data.LoginName.trim(),
          status: 'ACTIVE',
          sshEnabled,
          passwordEnabled,
          mappedUserId: user.id,
        });
        result.sftpCreated = true;
        result.sftpLocalUserId = sftpUser.id;

        // Step 7: Create SFTP Local User Scope (container permissions)
        // Parse scope permissions from CSV - defaults to false if not specified or empty
        const parseBooleanFlag = (value: string | undefined): boolean => {
          if (!value || value.trim() === '') return false;
          return value.trim().toLowerCase() === 'true';
        };

        const containerName = data.Container.trim();
        const sftpPermissions = {
          read: parseBooleanFlag(data.SftpRead),
          write: parseBooleanFlag(data.SftpWrite),
          list: parseBooleanFlag(data.SftpList),
          delete: parseBooleanFlag(data.SftpDelete),
          create: parseBooleanFlag(data.SftpCreate),
        };

        await db.insert(sftpLocalUserScopes).values({
          organizationId: organization.id,
          sftpLocalUserId: sftpUser.id,
          containerName,
          permissions: sftpPermissions,
        });
        console.log(`[ONBOARDING] Created SFTP scope for user ${sftpUser.id} on container ${containerName}`);
      } else {
        skippedEntries.push({
          row: row.rowNumber,
          type: 'sftp',
          name: `${data.StorageAccount}/${data.SFTPUser}`,
          reason: 'SFTP user already exists for this organization',
        });
      }
    } catch (error: any) {
      console.warn(`[ONBOARDING] SFTP user creation skipped: ${error.message}`);
      // Don't fail the whole row for SFTP issues - mark as created with warning
    }

    return result;
  }

  async retryFailedRows(jobId: number): Promise<CommitResult> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    // Reset failed rows to pending
    await db.update(onboardingJobRows)
      .set({ status: 'pending', errorMessage: null, errorCode: null })
      .where(and(
        eq(onboardingJobRows.jobId, jobId),
        eq(onboardingJobRows.status, 'failed')
      ));

    // Update job status
    await db.update(onboardingJobs)
      .set({ status: 'validated' })
      .where(eq(onboardingJobs.id, jobId));

    // Re-run commit
    return this.commitJob(jobId);
  }

  generateCSVTemplate(): string {
    const headers = [
      'OrgName',
      'StorageAccount', 
      'Container',
      'ResourceGroup',
      'Location',
      'LoginName',
      'Email',
      'Role',
      'SFTPUser',
      'AuthPasswordFlag',
      'AuthSSHKeyFlag',
      'SftpRead',
      'SftpWrite',
      'SftpList',
      'SftpDelete',
      'SftpCreate'
    ];
    
    const exampleRow = [
      'Example Organization',
      'examplestorage',
      'example-container',
      'rg-example',
      'eastus',
      'John Doe',
      'john@example.com',
      'Admin',
      'john.sftp',
      'true',
      'true',
      'true',
      'true',
      'true',
      'false',
      'false'
    ];

    return `${headers.join(',')}\n${exampleRow.join(',')}`;
  }
}

export const onboardingService = new OnboardingService();
