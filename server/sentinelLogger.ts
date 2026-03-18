import crypto from 'crypto';

export interface SentinelLogEntry {
  TimeGenerated: string;
  EventType_s: string;
  EventCategory_s: string;
  Severity_s: string;
  UserPrincipalName_s: string;
  UserId_s: string;
  UserDisplayName_s: string;
  SourceIP_s: string;
  UserAgent_s: string;
  SessionId_s: string;
  Action_s: string;
  ActionCategory_s: string;
  ResourceId_s: string;
  ResourceType_s: string;
  ResourceName_s: string;
  OrganizationId_d: number;
  OrganizationName_s: string;
  RoleId_d: number;
  RoleName_s: string;
  Result_s: string;
  ResultReason_s: string;
  ThreatIndicators_s: string;
  AdditionalDetails_s: string;
  CorrelationId_s: string;
  ApplicationName_s: string;
  ApplicationVersion_s: string;
}

export interface SentinelActivityLogParams {
  action: string;
  actionCategory: string;
  email: string;
  userId: string;
  userName: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  resource?: string;
  resourceType?: string;
  organizationId?: number;
  organizationName?: string;
  roleId?: number;
  roleName?: string;
  result?: 'Success' | 'Failure' | 'PartialSuccess';
  resultReason?: string;
  threatIndicators?: string[];
  additionalDetails?: Record<string, any>;
}

const severityMap: Record<string, string> = {
  'DELETE_ORGANIZATION': 'Critical',
  'DELETE_STORAGE_ACCOUNT': 'Critical',
  'DELETE_ADLS_STORAGE': 'Critical',
  
  'DELETE_USER': 'High',
  'PGP_KEY_DELETED': 'High',
  'ASSIGN_ROLE_PERMISSION': 'High',
  'REMOVE_ROLE_PERMISSION': 'High',
  'CREATE_ROLE': 'High',
  'UPDATE_ROLE': 'High',
  'DELETE_ROLE': 'High',
  
  'LOGIN_FAILED': 'Medium',
  'FILE_DECRYPTED': 'Medium',
  'FILE_ENCRYPTED': 'Medium',
  'CREATE_USER': 'Medium',
  'CREATE_STORAGE_ACCOUNT': 'Medium',
  'CREATE_ADLS_STORAGE': 'Medium',
  'UPDATE_USER': 'Medium',
  'PGP_KEY_GENERATED': 'Medium',
  'PGP_KEY_IMPORTED': 'Medium',
  
  'DELETE_FILE': 'Low',
  'DELETE_DIRECTORY': 'Low',
  'UPLOAD_FILE': 'Low',
  'DOWNLOAD_FILE': 'Low',
  'CREATE_DIRECTORY': 'Low',
  'RENAME_FILE': 'Low',
  'RENAME_DIRECTORY': 'Low',
  
  'DELETE_SENTINEL_RULE': 'High',
  'INSTALL_SENTINEL_RULE': 'Medium',
  'ENABLE_SENTINEL_RULE': 'Low',
  'DISABLE_SENTINEL_RULE': 'Low',
  'VIEW_SENTINEL_RULES': 'Informational',
  
  'LOGIN': 'Informational',
  'LOGOUT': 'Informational',
  'VIEW_FILES': 'Informational',
  'PREVIEW_FILE': 'Informational',
  'VIEW_DASHBOARD': 'Informational',
  'VIEW_ACTIVITY_LOGS': 'Informational',
  'VIEW_USERS': 'Informational',
  'VIEW_ROLES': 'Informational',
  'VIEW_ORGANIZATIONS': 'Informational',
  'VIEW_STORAGE_ACCOUNTS': 'Informational',
};

export function getSeverity(action: string): string {
  return severityMap[action] || 'Informational';
}

export class SentinelLogger {
  private static workspaceId: string | null = null;
  private static sharedKey: string | null = null;
  private static logType: string = 'ZapperSecurityEvents';
  private static enabled: boolean = false;
  private static initialized: boolean = false;

  static initialize(): void {
    if (this.initialized) return;
    
    this.workspaceId = process.env.SENTINEL_WORKSPACE_ID || null;
    this.sharedKey = process.env.SENTINEL_SHARED_KEY || null;
    this.logType = process.env.SENTINEL_LOG_TYPE || 'ZapperSecurityEvents';
    this.enabled = process.env.SENTINEL_ENABLED === 'true' && !!(this.workspaceId && this.sharedKey);
    this.initialized = true;
    
    if (this.enabled) {
      console.log('🛡️ [SENTINEL] Azure Sentinel integration enabled');
      console.log(`🛡️ [SENTINEL] Workspace ID: ${this.workspaceId?.substring(0, 8)}...`);
      console.log(`🛡️ [SENTINEL] Log Type: ${this.logType}`);
    } else {
      if (process.env.SENTINEL_ENABLED === 'true') {
        console.warn('⚠️ [SENTINEL] Sentinel enabled but missing credentials (SENTINEL_WORKSPACE_ID or SENTINEL_SHARED_KEY)');
      } else {
        console.log('ℹ️ [SENTINEL] Azure Sentinel integration disabled');
      }
    }
  }

  static isEnabled(): boolean {
    if (!this.initialized) {
      this.initialize();
    }
    return this.enabled;
  }

  static async log(entry: Partial<SentinelLogEntry>): Promise<void> {
    if (!this.initialized) {
      this.initialize();
    }
    
    if (!this.enabled) return;

    this.sendToSentinel(entry).catch(err => {
      console.error('❌ [SENTINEL] Failed to send log:', err.message);
    });
  }

  static async logActivity(params: SentinelActivityLogParams): Promise<void> {
    const correlationId = crypto.randomUUID();
    
    const entry: SentinelLogEntry = {
      TimeGenerated: new Date().toISOString(),
      EventType_s: params.action,
      EventCategory_s: params.actionCategory,
      Severity_s: getSeverity(params.action),
      UserPrincipalName_s: params.email || '',
      UserId_s: params.userId || '',
      UserDisplayName_s: params.userName || '',
      SourceIP_s: params.ipAddress || '',
      UserAgent_s: params.userAgent || '',
      SessionId_s: params.sessionId || '',
      Action_s: params.action,
      ActionCategory_s: params.actionCategory,
      ResourceId_s: params.resource || '',
      ResourceType_s: params.resourceType || '',
      ResourceName_s: params.resource || '',
      OrganizationId_d: params.organizationId || 0,
      OrganizationName_s: params.organizationName || '',
      RoleId_d: params.roleId || 0,
      RoleName_s: params.roleName || '',
      Result_s: params.result || 'Success',
      ResultReason_s: params.resultReason || '',
      ThreatIndicators_s: JSON.stringify(params.threatIndicators || []),
      AdditionalDetails_s: JSON.stringify(params.additionalDetails || {}),
      CorrelationId_s: correlationId,
      ApplicationName_s: 'ZapperMFT',
      ApplicationVersion_s: process.env.npm_package_version || '1.0.0'
    };

    await this.log(entry);
  }

  private static async sendToSentinel(entry: Partial<SentinelLogEntry>): Promise<void> {
    if (!this.workspaceId || !this.sharedKey) {
      return;
    }

    const fullEntry: SentinelLogEntry = {
      TimeGenerated: new Date().toISOString(),
      EventType_s: '',
      EventCategory_s: '',
      Severity_s: 'Informational',
      UserPrincipalName_s: '',
      UserId_s: '',
      UserDisplayName_s: '',
      SourceIP_s: '',
      UserAgent_s: '',
      SessionId_s: '',
      Action_s: '',
      ActionCategory_s: '',
      ResourceId_s: '',
      ResourceType_s: '',
      ResourceName_s: '',
      OrganizationId_d: 0,
      OrganizationName_s: '',
      RoleId_d: 0,
      RoleName_s: '',
      Result_s: 'Success',
      ResultReason_s: '',
      ThreatIndicators_s: '[]',
      AdditionalDetails_s: '{}',
      CorrelationId_s: crypto.randomUUID(),
      ApplicationName_s: 'ZapperMFT',
      ApplicationVersion_s: process.env.npm_package_version || '1.0.0',
      ...entry
    };

    const body = JSON.stringify([fullEntry]);
    const date = new Date().toUTCString();
    const contentLength = Buffer.byteLength(body, 'utf8');
    
    const signature = this.buildSignature(date, contentLength, 'POST', 'application/json');
    
    const url = `https://${this.workspaceId}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Log-Type': this.logType,
          'x-ms-date': date,
          'Authorization': `SharedKey ${this.workspaceId}:${signature}`,
          'time-generated-field': 'TimeGenerated'
        },
        body
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sentinel API error: ${response.status} - ${errorText}`);
      }
      
      console.log(`🛡️ [SENTINEL] Log sent successfully: ${fullEntry.Action_s} by ${fullEntry.UserPrincipalName_s}`);
    } catch (error: unknown) {
      throw error;
    }
  }

  private static buildSignature(date: string, contentLength: number, method: string, contentType: string): string {
    if (!this.sharedKey) {
      throw new Error('Shared key not configured');
    }
    
    const stringToSign = `${method}\n${contentLength}\n${contentType}\nx-ms-date:${date}\n/api/logs`;
    const decodedKey = Buffer.from(this.sharedKey, 'base64');
    const hmac = crypto.createHmac('sha256', decodedKey);
    hmac.update(stringToSign, 'utf8');
    return hmac.digest('base64');
  }
}
