export interface RuleParam {
  name: string;
  type: 'number';
  default: number;
  min?: number;
  max?: number;
  description: string;
}

export interface RuleDefinition {
  ruleId: string;
  displayName: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High' | 'Informational';
  enabledByDefault: boolean;
  queryTemplate: string;
  queryFrequency: string;
  queryPeriod: string;
  params: RuleParam[];
  defaults: Record<string, number>;
  resourceName: string;
  tags: { zapperRuleId: string; zapperVersion: string };
  entityMappings?: Array<{
    entityType: string;
    fieldMappings: Array<{ identifier: string; columnName: string }>;
  }>;
  tactics?: string[];
}

export const RULE_CATALOG: RuleDefinition[] = [
  {
    ruleId: 'zapper-pgp-generated',
    displayName: 'Zapper - PGP Key Generated',
    description: 'Detects when a PGP key is generated in the Zapper platform.',
    severity: 'Medium',
    enabledByDefault: true,
    queryTemplate: `ZapperSecurityEvents_CL
| where TimeGenerated > ago(30m)
| where EventType_s_s == "PGP_KEY_GENERATED"
| summarize Events=count(), User=any(UserPrincipalName_s_s), IP=any(SourceIP_s_s)
  by OrganizationName_s_s, bin(TimeGenerated, 15m)
| where Events >= 1`,
    queryFrequency: 'PT5M',
    queryPeriod: 'PT30M',
    params: [],
    defaults: {},
    resourceName: 'zapper-pgp-generated',
    tags: { zapperRuleId: 'zapper-pgp-generated', zapperVersion: '1.0.0' },
    entityMappings: [
      { entityType: 'Account', fieldMappings: [{ identifier: 'Name', columnName: 'User' }] },
      { entityType: 'IP', fieldMappings: [{ identifier: 'Address', columnName: 'IP' }] }
    ],
    tactics: ['InitialAccess']
  },
  {
    ruleId: 'zapper-mass-delete',
    displayName: 'Zapper - Mass Delete Detection',
    description: 'Detects when a user deletes a large number of files or directories in a short time.',
    severity: 'High',
    enabledByDefault: false,
    queryTemplate: `ZapperSecurityEvents_CL
| where TimeGenerated > ago({{lookbackMinutes}}m)
| where EventType_s_s in ("DELETE_FILE","DELETE_DIRECTORY")
| summarize
    DeletedItems=count(),
    SourceIPs=make_set(SourceIP_s_s, 5),
    SampleResources=make_set(ResourceName_s_s, 5)
  by OrganizationName_s_s, UserPrincipalName_s_s, bin(TimeGenerated, {{binMinutes}}m)
| where DeletedItems > {{threshold}}`,
    queryFrequency: 'PT5M',
    queryPeriod: 'PT30M',
    params: [
      { name: 'threshold', type: 'number', default: 1000, min: 1, description: 'Delete count threshold' },
      { name: 'lookbackMinutes', type: 'number', default: 5, min: 5, max: 1440, description: 'Lookback window in minutes' },
      { name: 'binMinutes', type: 'number', default: 1, min: 1, max: 60, description: 'Aggregation bin size in minutes' }
    ],
    defaults: { threshold: 1000, lookbackMinutes: 5, binMinutes: 1 },
    resourceName: 'zapper-mass-delete',
    tags: { zapperRuleId: 'zapper-mass-delete', zapperVersion: '1.0.0' },
    entityMappings: [
      { entityType: 'Account', fieldMappings: [{ identifier: 'Name', columnName: 'UserPrincipalName_s_s' }] }
    ],
    tactics: ['Impact']
  },
  {
    ruleId: 'zapper-brute-force-login',
    displayName: 'Zapper - Brute Force Login Attempt',
    description: 'Detects multiple failed authentication attempts from the same IP address.',
    severity: 'High',
    enabledByDefault: false,
    queryTemplate: `ZapperSecurityEvents_CL
| where TimeGenerated > ago({{lookbackMinutes}}m)
| where EventType_s_s == "LOGIN_FAILED"
| summarize
    FailedAttempts=count(),
    TargetUsers=make_set(UserPrincipalName_s_s, 10)
  by SourceIP_s_s, bin(TimeGenerated, {{binMinutes}}m)
| where FailedAttempts >= {{threshold}}`,
    queryFrequency: 'PT5M',
    queryPeriod: 'PT30M',
    params: [
      { name: 'threshold', type: 'number', default: 10, min: 3, description: 'Failed login attempt threshold' },
      { name: 'lookbackMinutes', type: 'number', default: 15, min: 5, max: 1440, description: 'Lookback window in minutes' },
      { name: 'binMinutes', type: 'number', default: 5, min: 1, max: 60, description: 'Aggregation bin size in minutes' }
    ],
    defaults: { threshold: 10, lookbackMinutes: 15, binMinutes: 5 },
    resourceName: 'zapper-brute-force-login',
    tags: { zapperRuleId: 'zapper-brute-force-login', zapperVersion: '1.0.0' },
    entityMappings: [
      { entityType: 'IP', fieldMappings: [{ identifier: 'Address', columnName: 'SourceIP_s_s' }] }
    ],
    tactics: ['CredentialAccess']
  },
  {
    ruleId: 'zapper-storage-account-deleted',
    displayName: 'Zapper - Storage Account Deleted',
    description: 'Detects when a storage account is deleted from the platform.',
    severity: 'High',
    enabledByDefault: true,
    queryTemplate: `ZapperSecurityEvents_CL
| where TimeGenerated > ago(30m)
| where EventType_s_s == "DELETE_ADLS_STORAGE"
| summarize Events=count(), Actor=any(UserPrincipalName_s_s), IP=any(SourceIP_s_s)
  by OrganizationName_s_s, ResourceName_s_s, bin(TimeGenerated, 15m)
| where Events >= 1`,
    queryFrequency: 'PT5M',
    queryPeriod: 'PT30M',
    params: [],
    defaults: {},
    resourceName: 'zapper-storage-account-deleted',
    tags: { zapperRuleId: 'zapper-storage-account-deleted', zapperVersion: '1.0.0' },
    entityMappings: [
      { entityType: 'Account', fieldMappings: [{ identifier: 'Name', columnName: 'Actor' }] },
      { entityType: 'IP', fieldMappings: [{ identifier: 'Address', columnName: 'IP' }] }
    ],
    tactics: ['Impact']
  },
  {
    ruleId: 'zapper-mass-download',
    displayName: 'Zapper - Mass File Download (Data Exfiltration)',
    description: 'Detects when a user downloads an unusually large number of files in a short period, a pattern often indicative of data exfiltration. An insider or compromised account may attempt to siphon off data by bulk-downloading files.',
    severity: 'High',
    enabledByDefault: false,
    queryTemplate: `ZapperSecurityEvents_CL
| where TimeGenerated > ago({{lookbackMinutes}}m)
| where EventType_s_s in ("DOWNLOAD_FILE", "DOWNLOAD_DIRECTORY")
| summarize DownloadCount=count(),
    SourceIPs=make_set(SourceIP_s_s, 5),
    SampleFiles=make_set(ResourceName_s_s, 5)
  by OrganizationName_s_s, UserPrincipalName_s_s, bin(TimeGenerated, {{binMinutes}}m)
| where DownloadCount > {{threshold}}`,
    queryFrequency: 'PT5M',
    queryPeriod: 'PT30M',
    params: [
      { name: 'threshold', type: 'number', default: 500, min: 1, description: 'Download count threshold' },
      { name: 'lookbackMinutes', type: 'number', default: 30, min: 5, max: 1440, description: 'Lookback window in minutes' },
      { name: 'binMinutes', type: 'number', default: 5, min: 1, max: 60, description: 'Aggregation bin size in minutes' }
    ],
    defaults: { threshold: 500, lookbackMinutes: 30, binMinutes: 5 },
    resourceName: 'zapper-mass-download',
    tags: { zapperRuleId: 'zapper-mass-download', zapperVersion: '1.0.0' },
    entityMappings: [
      { entityType: 'Account', fieldMappings: [{ identifier: 'Name', columnName: 'UserPrincipalName_s_s' }] },
      { entityType: 'IP', fieldMappings: [{ identifier: 'Address', columnName: 'SourceIPs' }] }
    ],
    tactics: ['Exfiltration']
  },
  {
    ruleId: 'zapper-organization-deleted',
    displayName: 'Zapper - Organization Deletion',
    description: 'Alerts whenever an entire organization or tenant is deleted from the platform. This is a critical admin-level event that could indicate a serious administrative mistake or a malicious act attempting to wipe traces.',
    severity: 'High',
    enabledByDefault: true,
    queryTemplate: `ZapperSecurityEvents_CL
| where TimeGenerated > ago(30m)
| where EventType_s_s == "DELETE_ORGANIZATION"
| summarize Events=count(), Actor=any(UserPrincipalName_s_s), IP=any(SourceIP_s_s)
  by OrganizationName_s_s, bin(TimeGenerated, 15m)
| where Events >= 1`,
    queryFrequency: 'PT5M',
    queryPeriod: 'PT30M',
    params: [],
    defaults: {},
    resourceName: 'zapper-organization-deleted',
    tags: { zapperRuleId: 'zapper-organization-deleted', zapperVersion: '1.0.0' },
    entityMappings: [
      { entityType: 'Account', fieldMappings: [{ identifier: 'Name', columnName: 'Actor' }] },
      { entityType: 'IP', fieldMappings: [{ identifier: 'Address', columnName: 'IP' }] }
    ],
    tactics: ['Impact']
  },
  {
    ruleId: 'zapper-user-deleted',
    displayName: 'Zapper - User Account Deletion',
    description: 'Flags the deletion of user accounts. An unusual burst of deletions could indicate malicious activity such as an attacker trying to erase traces or disable many users.',
    severity: 'High',
    enabledByDefault: true,
    queryTemplate: `ZapperSecurityEvents_CL
| where TimeGenerated > ago(5m)
| where EventType_s_s == "DELETE_USER"
| summarize DeletedUsers=make_set(ResourceName_s_s, 10), Actor=any(UserPrincipalName_s_s), IP=any(SourceIP_s_s)
  by OrganizationName_s_s, bin(TimeGenerated, 5m)`,
    queryFrequency: 'PT5M',
    queryPeriod: 'PT5M',
    params: [],
    defaults: {},
    resourceName: 'zapper-user-deleted',
    tags: { zapperRuleId: 'zapper-user-deleted', zapperVersion: '1.0.0' },
    entityMappings: [
      { entityType: 'Account', fieldMappings: [{ identifier: 'Name', columnName: 'Actor' }] },
      { entityType: 'IP', fieldMappings: [{ identifier: 'Address', columnName: 'IP' }] }
    ],
    tactics: ['Impact']
  },
  {
    ruleId: 'zapper-pgp-key-deleted',
    displayName: 'Zapper - PGP Key Deletion',
    description: 'Detects when a PGP key is deleted from the platform. Removing a PGP key could indicate an attempt to disrupt access to encrypted data or cover tracks.',
    severity: 'High',
    enabledByDefault: true,
    queryTemplate: `ZapperSecurityEvents_CL
| where TimeGenerated > ago(30m)
| where EventType_s_s == "PGP_KEY_DELETED"
| summarize Events=count(), Actor=any(UserPrincipalName_s_s), IP=any(SourceIP_s_s)
  by OrganizationName_s_s, ResourceName_s_s, bin(TimeGenerated, 15m)
| where Events >= 1`,
    queryFrequency: 'PT5M',
    queryPeriod: 'PT30M',
    params: [],
    defaults: {},
    resourceName: 'zapper-pgp-key-deleted',
    tags: { zapperRuleId: 'zapper-pgp-key-deleted', zapperVersion: '1.0.0' },
    entityMappings: [
      { entityType: 'Account', fieldMappings: [{ identifier: 'Name', columnName: 'Actor' }] },
      { entityType: 'IP', fieldMappings: [{ identifier: 'Address', columnName: 'IP' }] }
    ],
    tactics: ['Impact', 'DefenseEvasion']
  },
  {
    ruleId: 'zapper-role-permission-change',
    displayName: 'Zapper - Suspicious Role or Permission Change',
    description: 'Monitors changes to roles and permissions within the platform. Fires when there are modifications such as a new role being created or deleted, or permissions within a role being granted or revoked.',
    severity: 'High',
    enabledByDefault: true,
    queryTemplate: `ZapperSecurityEvents_CL
| where TimeGenerated > ago(10m)
| where EventType_s_s in ("CREATE_ROLE", "UPDATE_ROLE", "DELETE_ROLE", "ASSIGN_ROLE_PERMISSION", "REMOVE_ROLE_PERMISSION")
| summarize Actions=make_set(EventType_s_s, 10), TargetRole=any(ResourceName_s_s), Actor=any(UserPrincipalName_s_s), IP=any(SourceIP_s_s)
  by OrganizationName_s_s, bin(TimeGenerated, 10m)`,
    queryFrequency: 'PT5M',
    queryPeriod: 'PT10M',
    params: [],
    defaults: {},
    resourceName: 'zapper-role-permission-change',
    tags: { zapperRuleId: 'zapper-role-permission-change', zapperVersion: '1.0.0' },
    entityMappings: [
      { entityType: 'Account', fieldMappings: [{ identifier: 'Name', columnName: 'Actor' }] },
      { entityType: 'IP', fieldMappings: [{ identifier: 'Address', columnName: 'IP' }] }
    ],
    tactics: ['Persistence']
  },
  {
    ruleId: 'zapper-unusual-preview-activity',
    displayName: 'Zapper - Unusual File Preview Activity (Reconnaissance)',
    description: 'Detects potential reconnaissance behavior by flagging users who preview a high number of files in a short timeframe. Rapid file access without downloading can indicate someone snooping around data stores.',
    severity: 'Medium',
    enabledByDefault: false,
    queryTemplate: `ZapperSecurityEvents_CL
| where TimeGenerated > ago({{lookbackMinutes}}m)
| where EventType_s_s == "PREVIEW_FILE"
| summarize PreviewCount=count(), SampleFiles=make_set(ResourceName_s_s, 5)
  by OrganizationName_s_s, UserPrincipalName_s_s, bin(TimeGenerated, {{binMinutes}}m)
| where PreviewCount > {{threshold}}`,
    queryFrequency: 'PT5M',
    queryPeriod: 'PT15M',
    params: [
      { name: 'threshold', type: 'number', default: 50, min: 1, description: 'Preview count threshold' },
      { name: 'lookbackMinutes', type: 'number', default: 15, min: 5, max: 1440, description: 'Lookback window in minutes' },
      { name: 'binMinutes', type: 'number', default: 5, min: 1, max: 60, description: 'Aggregation bin size in minutes' }
    ],
    defaults: { threshold: 50, lookbackMinutes: 15, binMinutes: 5 },
    resourceName: 'zapper-unusual-preview-activity',
    tags: { zapperRuleId: 'zapper-unusual-preview-activity', zapperVersion: '1.0.0' },
    entityMappings: [
      { entityType: 'Account', fieldMappings: [{ identifier: 'Name', columnName: 'UserPrincipalName_s_s' }] }
    ],
    tactics: ['Discovery']
  }
];

export function applyTemplate(template: string, params: Record<string, number>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }
  return result;
}

export function validateParams(ruleDef: RuleDefinition, params: Record<string, number>): { valid: boolean; error?: string } {
  for (const paramDef of ruleDef.params) {
    const value = params[paramDef.name] ?? paramDef.default;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      return { valid: false, error: `${paramDef.name} must be a positive integer` };
    }
    if (paramDef.min !== undefined && value < paramDef.min) {
      return { valid: false, error: `${paramDef.name} must be >= ${paramDef.min}` };
    }
    if (paramDef.max !== undefined && value > paramDef.max) {
      return { valid: false, error: `${paramDef.name} must be <= ${paramDef.max}` };
    }
  }
  return { valid: true };
}

export function getRuleById(ruleId: string): RuleDefinition | undefined {
  return RULE_CATALOG.find(r => r.ruleId === ruleId);
}
