import { storage } from "../storage";
import type { OnboardingCSVRow, OnboardingValidationError } from "@shared/schema";

export interface ColumnMappingResult {
  detected: string[];
  required: string[];
  optional: string[];
  missing: string[];
  unknown: string[];
  isValid: boolean;
}

export interface RowValidationResult {
  row: number;
  isValid: boolean;
  errors: OnboardingValidationError[];
  warnings: OnboardingValidationError[];
}

export interface ValidationResult {
  isValid: boolean;
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  errors: OnboardingValidationError[];
  warnings: OnboardingValidationError[];
}

const REQUIRED_COLUMNS = ['OrgName', 'StorageAccount', 'Container', 'LoginName', 'Email', 'Role', 'SFTPUser'];
const OPTIONAL_COLUMNS = ['ResourceGroup', 'Location', 'AuthPasswordFlag', 'AuthSSHKeyFlag', 'SftpRead', 'SftpWrite', 'SftpList', 'SftpDelete', 'SftpCreate'];
const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

export class OnboardingValidator {
  validateColumnMapping(headers: string[]): ColumnMappingResult {
    const normalizedHeaders = headers.map(h => h.trim());
    const missing = REQUIRED_COLUMNS.filter(col => !normalizedHeaders.includes(col));
    const unknown = normalizedHeaders.filter(col => !ALL_COLUMNS.includes(col));
    
    return {
      detected: normalizedHeaders,
      required: REQUIRED_COLUMNS,
      optional: OPTIONAL_COLUMNS,
      missing,
      unknown,
      isValid: missing.length === 0,
    };
  }

  validateRow(row: OnboardingCSVRow, rowIndex: number): RowValidationResult {
    const errors: OnboardingValidationError[] = [];
    const warnings: OnboardingValidationError[] = [];

    // Required field checks
    if (!row.OrgName?.trim()) {
      errors.push({
        row: rowIndex,
        column: 'OrgName',
        code: 'E001',
        message: 'Organization name is required',
        severity: 'error',
      });
    } else if (row.OrgName.length > 100) {
      errors.push({
        row: rowIndex,
        column: 'OrgName',
        code: 'E001',
        message: 'Organization name must be 100 characters or less',
        severity: 'error',
      });
    }

    if (!row.StorageAccount?.trim()) {
      errors.push({
        row: rowIndex,
        column: 'StorageAccount',
        code: 'E001',
        message: 'Storage account is required',
        severity: 'error',
      });
    } else if (!/^[a-z0-9]{3,24}$/.test(row.StorageAccount)) {
      errors.push({
        row: rowIndex,
        column: 'StorageAccount',
        code: 'E001',
        message: 'Storage account name must be 3-24 lowercase letters/numbers',
        severity: 'error',
      });
    }

    if (!row.Container?.trim()) {
      errors.push({
        row: rowIndex,
        column: 'Container',
        code: 'E001',
        message: 'Container name is required',
        severity: 'error',
      });
    } else if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(row.Container)) {
      errors.push({
        row: rowIndex,
        column: 'Container',
        code: 'E001',
        message: 'Container name must be 3-63 lowercase letters, numbers, or hyphens',
        severity: 'error',
      });
    }

    if (!row.LoginName?.trim()) {
      errors.push({
        row: rowIndex,
        column: 'LoginName',
        code: 'E001',
        message: 'Login name is required',
        severity: 'error',
      });
    }

    if (!row.Email?.trim()) {
      errors.push({
        row: rowIndex,
        column: 'Email',
        code: 'E001',
        message: 'Email is required',
        severity: 'error',
      });
    } else if (!this.isValidEmail(row.Email)) {
      errors.push({
        row: rowIndex,
        column: 'Email',
        code: 'E002',
        message: `Invalid email format: '${row.Email}'`,
        severity: 'error',
      });
    }

    if (!row.Role?.trim()) {
      errors.push({
        row: rowIndex,
        column: 'Role',
        code: 'E001',
        message: 'Role is required',
        severity: 'error',
      });
    }

    if (!row.SFTPUser?.trim()) {
      errors.push({
        row: rowIndex,
        column: 'SFTPUser',
        code: 'E001',
        message: 'SFTP username is required',
        severity: 'error',
      });
    } else if (!/^[a-zA-Z0-9._-]{1,64}$/.test(row.SFTPUser)) {
      errors.push({
        row: rowIndex,
        column: 'SFTPUser',
        code: 'E001',
        message: 'SFTP username must be 1-64 alphanumeric characters, dots, underscores, or hyphens',
        severity: 'error',
      });
    }

    // Auth flag validation
    const hasPassword = row.AuthPasswordFlag?.toLowerCase() === 'true';
    const hasSSH = row.AuthSSHKeyFlag?.toLowerCase() === 'true';
    if (!hasPassword && !hasSSH) {
      warnings.push({
        row: rowIndex,
        column: 'AuthPasswordFlag',
        code: 'W001',
        message: 'Neither password nor SSH auth enabled - SSH will be enabled by default',
        severity: 'warning',
      });
    }

    return {
      row: rowIndex,
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateStorageOrgMapping(rows: OnboardingCSVRow[]): OnboardingValidationError[] {
    const errors: OnboardingValidationError[] = [];
    // Track storage keys and first row number for each org
    const orgStorageMap = new Map<string, { storageKeys: Set<string>, firstRow: number }>();

    rows.forEach((row, idx) => {
      const orgName = row.OrgName?.trim();
      const storageKey = `${row.StorageAccount}/${row.Container}`;
      
      if (orgName) {
        if (!orgStorageMap.has(orgName)) {
          orgStorageMap.set(orgName, { storageKeys: new Set(), firstRow: idx + 1 });
        }
        orgStorageMap.get(orgName)!.storageKeys.add(storageKey);
      }
    });

    orgStorageMap.forEach(({ storageKeys, firstRow }, orgName) => {
      if (storageKeys.size > 1) {
        const storages = Array.from(storageKeys).join(', ');
        errors.push({
          row: firstRow,
          column: 'OrgName',
          code: 'E007',
          message: `Organization '${orgName}' maps to multiple storage accounts: ${storages}. Each org must have exactly one storage.`,
          severity: 'error',
        });
      }
    });

    return errors;
  }

  validateStorageContainerUniqueness(rows: OnboardingCSVRow[]): OnboardingValidationError[] {
    const errors: OnboardingValidationError[] = [];
    // Track which orgs use each storage+container, and first row
    const storageContainerMap = new Map<string, { orgs: Set<string>, firstRow: number }>();

    rows.forEach((row, idx) => {
      const orgName = row.OrgName?.trim();
      const storageAccount = row.StorageAccount?.trim();
      const container = row.Container?.trim();
      
      if (storageAccount && container) {
        const key = `${storageAccount}/${container}`;
        if (!storageContainerMap.has(key)) {
          storageContainerMap.set(key, { orgs: new Set(), firstRow: idx + 1 });
        }
        if (orgName) {
          storageContainerMap.get(key)!.orgs.add(orgName);
        }
      }
    });

    storageContainerMap.forEach(({ orgs, firstRow }, storageKey) => {
      if (orgs.size > 1) {
        const orgList = Array.from(orgs).join(', ');
        errors.push({
          row: firstRow,
          column: 'StorageAccount',
          code: 'E008',
          message: `Storage container '${storageKey}' is assigned to multiple organizations: ${orgList}. Each storage+container can belong to only one organization.`,
          severity: 'error',
        });
      }
    });

    return errors;
  }

  validateUniqueEmails(rows: OnboardingCSVRow[]): OnboardingValidationError[] {
    const errors: OnboardingValidationError[] = [];
    // Key: org+email+role, Value: row numbers - same user can have multiple roles in same org
    const orgEmailRoleMap = new Map<string, number[]>();

    rows.forEach((row, idx) => {
      const email = row.Email?.trim().toLowerCase();
      const org = row.OrgName?.trim().toLowerCase();
      const role = row.Role?.trim().toLowerCase();
      if (email && org && role) {
        const key = `${org}|${email}|${role}`;
        if (!orgEmailRoleMap.has(key)) {
          orgEmailRoleMap.set(key, []);
        }
        orgEmailRoleMap.get(key)!.push(idx + 1);
      }
    });

    orgEmailRoleMap.forEach((rowNumbers, key) => {
      if (rowNumbers.length > 1) {
        const [org, email, role] = key.split('|');
        errors.push({
          row: rowNumbers[0],
          column: 'Email',
          code: 'E004',
          message: `Duplicate entry: email '${email}' with role '${role}' in organization '${org}' found in rows ${rowNumbers.join(', ')}`,
          severity: 'error',
        });
      }
    });

    return errors;
  }

  validateUniqueSftpUsers(rows: OnboardingCSVRow[]): OnboardingValidationError[] {
    const errors: OnboardingValidationError[] = [];
    // Key: org+storage+sftpUser, Value: row numbers - same SFTP user can be referenced across orgs
    const orgSftpMap = new Map<string, number[]>();

    rows.forEach((row, idx) => {
      const org = row.OrgName?.trim().toLowerCase();
      const storageAccount = row.StorageAccount?.trim().toLowerCase();
      const sftpUser = row.SFTPUser?.trim().toLowerCase();
      if (org && storageAccount && sftpUser) {
        const key = `${org}|${storageAccount}/${sftpUser}`;
        if (!orgSftpMap.has(key)) {
          orgSftpMap.set(key, []);
        }
        orgSftpMap.get(key)!.push(idx + 1);
      }
    });

    orgSftpMap.forEach((rowNumbers, key) => {
      if (rowNumbers.length > 1) {
        const [org, sftpKey] = key.split('|');
        errors.push({
          row: rowNumbers[0],
          column: 'SFTPUser',
          code: 'E005',
          message: `Duplicate SFTP user '${sftpKey}' in organization '${org}' found in rows ${rowNumbers.join(', ')}`,
          severity: 'error',
        });
      }
    });

    return errors;
  }

  async validateRolesExist(rows: OnboardingCSVRow[]): Promise<OnboardingValidationError[]> {
    const errors: OnboardingValidationError[] = [];
    const roleNames = [...new Set(rows.map(r => r.Role?.trim()).filter(Boolean))];
    
    for (const roleName of roleNames) {
      const role = await storage.getRoleByName(roleName);
      if (!role) {
        const affectedRows = rows
          .map((r, idx) => r.Role?.trim() === roleName ? idx + 1 : null)
          .filter(Boolean) as number[];
        
        errors.push({
          row: affectedRows[0],
          column: 'Role',
          code: 'E006',
          message: `Role '${roleName}' does not exist. Affected rows: ${affectedRows.join(', ')}`,
          severity: 'error',
        });
      }
    }

    return errors;
  }

  async validateNoEmailConflicts(rows: OnboardingCSVRow[]): Promise<OnboardingValidationError[]> {
    const errors: OnboardingValidationError[] = [];
    
    for (let i = 0; i < rows.length; i++) {
      const email = rows[i].Email?.trim();
      if (email) {
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser) {
          // This is a warning, not an error - we'll add role assignment to existing user
          // No error added here - this is allowed behavior
        }
      }
    }

    return errors;
  }

  async validateAll(rows: OnboardingCSVRow[]): Promise<ValidationResult> {
    const allErrors: OnboardingValidationError[] = [];
    const allWarnings: OnboardingValidationError[] = [];
    let validRows = 0;

    // Per-row validation
    for (let i = 0; i < rows.length; i++) {
      const result = this.validateRow(rows[i], i + 1);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
      if (result.isValid) validRows++;
    }

    // Cross-row validation
    allErrors.push(...this.validateStorageOrgMapping(rows));
    allErrors.push(...this.validateStorageContainerUniqueness(rows));
    allErrors.push(...this.validateUniqueEmails(rows));
    allErrors.push(...this.validateUniqueSftpUsers(rows));

    // Database validation
    allErrors.push(...await this.validateRolesExist(rows));

    const errorRows = new Set(allErrors.map(e => e.row)).size;
    const warningRows = new Set(allWarnings.map(w => w.row)).size;

    return {
      isValid: allErrors.length === 0,
      totalRows: rows.length,
      validRows: rows.length - errorRows,
      errorRows,
      warningRows,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }
}

export const onboardingValidator = new OnboardingValidator();
