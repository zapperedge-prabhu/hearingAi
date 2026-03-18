import { DefaultAzureCredential } from "@azure/identity";
import { RuleDefinition, applyTemplate } from "./ruleCatalog";

// Response interfaces
export interface SentinelHealthResponse {
  ok: boolean;
  workspaceFound: boolean;
  sentinelOnboarded: boolean;
  workspaceId?: string;
  workspaceName?: string;
  onboardingId?: string;
  customerId?: string;
  error?: string;
  details?: {
    subscriptionId?: string;
    resourceGroup?: string;
    retentionDays?: number;
    sku?: string;
  };
}

export interface SentinelRuleResponse {
  ok: boolean;
  ruleId?: string;
  name?: string;
  displayName?: string;
  etag?: string;
  created?: boolean;
  errorCode?: 'RBAC_DENIED' | 'NOT_FOUND' | 'ARM_ERROR' | 'SENTINEL_DISABLED';
  error?: string;
  details?: any;
}

export interface SentinelRuleGetResponse {
  ok: boolean;
  exists: boolean;
  rule?: {
    id: string;
    name: string;
    displayName: string;
    enabled: boolean;
    severity: string;
    query: string;
    queryFrequency: string;
    queryPeriod: string;
    etag?: string;
  };
  errorCode?: 'RBAC_DENIED' | 'NOT_FOUND' | 'ARM_ERROR' | 'SENTINEL_DISABLED';
  error?: string;
}

export interface InstalledRule {
  id: string;
  name: string;
  displayName: string;
  description: string;
  enabled: boolean;
  severity: string;
  queryFrequency: string;
  queryPeriod: string;
  zapperRuleId?: string;
  zapperVersion?: string;
}

export interface ListInstalledRulesResponse {
  ok: boolean;
  rules?: InstalledRule[];
  errorCode?: 'RBAC_DENIED' | 'NOT_FOUND' | 'ARM_ERROR' | 'SENTINEL_DISABLED';
  error?: string;
}

export interface DeleteRuleResponse {
  ok: boolean;
  deleted?: boolean;
  errorCode?: 'RBAC_DENIED' | 'NOT_FOUND' | 'ARM_ERROR' | 'SENTINEL_DISABLED';
  error?: string;
}

export interface ToggleRuleResponse {
  ok: boolean;
  enabled?: boolean;
  ruleId?: string;
  errorCode?: 'RBAC_DENIED' | 'NOT_FOUND' | 'ARM_ERROR' | 'SENTINEL_DISABLED';
  error?: string;
}

export interface SentinelIncident {
  id: string;
  incidentNumber: number;
  title: string;
  severity: string;
  status: string;
  owner: string | null;
  provider: string;
  product: string;
  createdTimeUtc: string;
  lastUpdatedTimeUtc: string;
  alertsCount: number;
  entitiesCount: number;
  portalUrl: string | null;
  defenderXdrUrl: string | null;
}

export interface ListIncidentsResponse {
  ok: boolean;
  range?: string;
  items?: SentinelIncident[];
  nextCursor?: string | null;
  errorCode?: 'RBAC_DENIED' | 'NOT_FOUND' | 'ARM_ERROR' | 'SENTINEL_DISABLED' | 'SENTINEL_NOT_CONFIGURED';
  error?: string;
}

export interface IncidentDetails extends SentinelIncident {
  description: string | null;
  classification: string | null;
  classificationReason: string | null;
  classificationComment: string | null;
  labels: string[];
  entities: any[];
  alerts: any[];
}

export interface GetIncidentResponse {
  ok: boolean;
  incident?: IncidentDetails;
  errorCode?: 'RBAC_DENIED' | 'NOT_FOUND' | 'ARM_ERROR' | 'SENTINEL_DISABLED' | 'SENTINEL_NOT_CONFIGURED';
  error?: string;
}

interface ArmApiResult {
  ok: boolean;
  data?: any;
  error?: string;
  statusCode?: number;
}

// PGP Generated rule configuration
const PGP_GENERATED_RULE_CONFIG = {
  kind: "Scheduled",
  properties: {
    displayName: "Zapper - PGP Key Generated",
    description: "Detects when a PGP key is generated in the Zapper platform. This may indicate legitimate key management or potential security policy concerns.",
    severity: "Medium",
    enabled: true,
    query: `ZapperSecurityEvents_CL
| where TimeGenerated > ago(30m)
| where EventType_s_s == "PGP_KEY_GENERATED"
| summarize Events=count(), User=any(UserPrincipalName_s_s), IP=any(SourceIP_s_s)
  by OrganizationName_s_s, bin(TimeGenerated, 15m)
| where Events >= 1`,
    queryFrequency: "PT5M",
    queryPeriod: "PT30M",
    triggerOperator: "GreaterThan",
    triggerThreshold: 0,
    suppressionDuration: "PT5H",
    suppressionEnabled: false,
    tactics: ["InitialAccess"],
    techniques: [],
    incidentConfiguration: {
      createIncident: true,
      groupingConfiguration: {
        enabled: false,
        reopenClosedIncident: false,
        lookbackDuration: "PT5H",
        matchingMethod: "AllEntities"
      }
    },
    entityMappings: [
      {
        entityType: "Account",
        fieldMappings: [
          {
            identifier: "Name",
            columnName: "User"
          }
        ]
      },
      {
        entityType: "IP",
        fieldMappings: [
          {
            identifier: "Address",
            columnName: "IP"
          }
        ]
      }
    ]
  }
};

export class SentinelArmClient {
  private subscriptionId: string;
  private resourceGroup: string;
  private workspaceName: string;
  private credential: DefaultAzureCredential;
  private enabled: boolean;

  constructor() {
    this.subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID || '';
    this.resourceGroup = process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP || '';
    this.workspaceName = process.env.SENTINEL_WORKSPACE_NAME || '';
    this.enabled = process.env.SENTINEL_ENABLED === 'true';
    this.credential = new DefaultAzureCredential();
  }

  private async getArmToken(): Promise<string> {
    const tokenResponse = await this.credential.getToken("https://management.azure.com/.default");
    if (!tokenResponse?.token) {
      throw new Error("Failed to acquire ARM token");
    }
    return tokenResponse.token;
  }

  private async callArmApi(url: string, token: string): Promise<{ ok: boolean; data?: any; error?: string; statusCode?: number }> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          ok: false,
          error: data.error?.message || `HTTP ${response.status}`,
          statusCode: response.status,
          data,
        };
      }

      return { ok: true, data, statusCode: response.status };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  async checkHealth(): Promise<SentinelHealthResponse> {
    if (!this.enabled) {
      return {
        ok: false,
        workspaceFound: false,
        sentinelOnboarded: false,
        error: "Sentinel integration is not enabled (SENTINEL_ENABLED != 'true')",
      };
    }

    if (!this.subscriptionId || !this.resourceGroup || !this.workspaceName) {
      const missing = [];
      if (!this.subscriptionId) missing.push('ZAPPER_AZURE_SUBSCRIPTION_ID');
      if (!this.resourceGroup) missing.push('ZAPPER_AZURE_RESOURCE_GROUP');
      if (!this.workspaceName) missing.push('SENTINEL_WORKSPACE_NAME');
      
      return {
        ok: false,
        workspaceFound: false,
        sentinelOnboarded: false,
        error: `Missing required environment variables: ${missing.join(', ')}`,
      };
    }

    let token: string;
    try {
      token = await this.getArmToken();
    } catch (err: any) {
      return {
        ok: false,
        workspaceFound: false,
        sentinelOnboarded: false,
        error: `Failed to acquire ARM token: ${err.message}. Ensure Managed Identity has Reader access to the workspace.`,
      };
    }

    const workspaceUrl = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${this.workspaceName}?api-version=2022-10-01`;
    const workspaceResult = await this.callArmApi(workspaceUrl, token);

    if (!workspaceResult.ok) {
      return {
        ok: false,
        workspaceFound: false,
        sentinelOnboarded: false,
        error: `Log Analytics workspace not found: ${workspaceResult.error}`,
        details: {
          subscriptionId: this.subscriptionId,
          resourceGroup: this.resourceGroup,
        },
      };
    }

    const workspaceData = workspaceResult.data;
    const workspaceId = workspaceData.id;
    const customerId = workspaceData.properties?.customerId;
    const retentionDays = workspaceData.properties?.retentionInDays;
    const sku = workspaceData.properties?.sku?.name;

    const onboardingUrl = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${this.workspaceName}/providers/Microsoft.SecurityInsights/onboardingStates/default?api-version=2024-03-01`;
    const onboardingResult = await this.callArmApi(onboardingUrl, token);

    const sentinelOnboarded = onboardingResult.ok;
    const onboardingId = sentinelOnboarded ? onboardingResult.data?.id : undefined;

    return {
      ok: sentinelOnboarded,
      workspaceFound: true,
      sentinelOnboarded,
      workspaceId,
      workspaceName: this.workspaceName,
      customerId,
      onboardingId,
      error: sentinelOnboarded ? undefined : `Sentinel not onboarded: ${onboardingResult.error}`,
      details: {
        subscriptionId: this.subscriptionId,
        resourceGroup: this.resourceGroup,
        retentionDays,
        sku,
      },
    };
  }

  private async callArmApiPut(url: string, token: string, body: any, etag?: string): Promise<ArmApiResult> {
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      if (etag) {
        headers['If-Match'] = etag;
      }

      const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          ok: false,
          error: data.error?.message || `HTTP ${response.status}`,
          statusCode: response.status,
          data,
        };
      }

      return { ok: true, data, statusCode: response.status };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  private getAlertRuleUrl(ruleName: string): string {
    return `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${this.workspaceName}/providers/Microsoft.SecurityInsights/alertRules/${ruleName}?api-version=2024-03-01`;
  }

  private getAlertRulesListUrl(): string {
    return `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${this.workspaceName}/providers/Microsoft.SecurityInsights/alertRules?api-version=2024-03-01`;
  }

  private async callArmApiDelete(url: string, token: string): Promise<ArmApiResult> {
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 204 || response.status === 200) {
        return { ok: true, statusCode: response.status };
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          ok: false,
          error: data.error?.message || `HTTP ${response.status}`,
          statusCode: response.status,
          data,
        };
      }

      return { ok: true, data, statusCode: response.status };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  private mapArmErrorToCode(statusCode?: number, errorMessage?: string): 'RBAC_DENIED' | 'NOT_FOUND' | 'ARM_ERROR' {
    if (statusCode === 403 || errorMessage?.includes('AuthorizationFailed')) {
      return 'RBAC_DENIED';
    }
    if (statusCode === 404) {
      return 'NOT_FOUND';
    }
    return 'ARM_ERROR';
  }

  private checkPrerequisites(): { ok: true; token?: undefined } | { ok: false; response: SentinelRuleResponse } {
    if (!this.enabled) {
      return {
        ok: false,
        response: {
          ok: false,
          errorCode: 'SENTINEL_DISABLED',
          error: "Sentinel integration is not enabled (SENTINEL_ENABLED != 'true')",
        }
      };
    }

    if (!this.subscriptionId || !this.resourceGroup || !this.workspaceName) {
      const missing = [];
      if (!this.subscriptionId) missing.push('ZAPPER_AZURE_SUBSCRIPTION_ID');
      if (!this.resourceGroup) missing.push('ZAPPER_AZURE_RESOURCE_GROUP');
      if (!this.workspaceName) missing.push('SENTINEL_WORKSPACE_NAME');
      
      return {
        ok: false,
        response: {
          ok: false,
          errorCode: 'ARM_ERROR',
          error: `Missing required environment variables: ${missing.join(', ')}`,
        }
      };
    }

    return { ok: true };
  }

  async upsertPgpGeneratedRule(): Promise<SentinelRuleResponse> {
    const prereq = this.checkPrerequisites();
    if (!prereq.ok) {
      return prereq.response;
    }

    let token: string;
    try {
      token = await this.getArmToken();
    } catch (err: any) {
      return {
        ok: false,
        errorCode: 'ARM_ERROR',
        error: `Failed to acquire ARM token: ${err.message}. Ensure Managed Identity has Sentinel Contributor access.`,
      };
    }

    const ruleUrl = this.getAlertRuleUrl('zapper-pgp-generated');
    const result = await this.callArmApiPut(ruleUrl, token, PGP_GENERATED_RULE_CONFIG);

    if (!result.ok) {
      return {
        ok: false,
        errorCode: this.mapArmErrorToCode(result.statusCode, result.error),
        error: result.error || 'Unknown ARM error',
        details: result.data,
      };
    }

    const ruleData = result.data;
    return {
      ok: true,
      ruleId: ruleData.id,
      name: ruleData.name,
      displayName: ruleData.properties?.displayName,
      etag: ruleData.etag,
      created: result.statusCode === 201,
    };
  }

  async getPgpGeneratedRule(): Promise<SentinelRuleGetResponse> {
    const prereq = this.checkPrerequisites();
    if (!prereq.ok) {
      return {
        ok: false,
        exists: false,
        errorCode: prereq.response.errorCode,
        error: prereq.response.error,
      };
    }

    let token: string;
    try {
      token = await this.getArmToken();
    } catch (err: any) {
      return {
        ok: false,
        exists: false,
        errorCode: 'ARM_ERROR',
        error: `Failed to acquire ARM token: ${err.message}`,
      };
    }

    const ruleUrl = this.getAlertRuleUrl('zapper-pgp-generated');
    const result = await this.callArmApi(ruleUrl, token);

    if (!result.ok) {
      if (result.statusCode === 404) {
        return {
          ok: true,
          exists: false,
          rule: undefined,
        };
      }
      return {
        ok: false,
        exists: false,
        errorCode: this.mapArmErrorToCode(result.statusCode, result.error),
        error: result.error || 'Unknown ARM error',
      };
    }

    const ruleData = result.data;
    return {
      ok: true,
      exists: true,
      rule: {
        id: ruleData.id,
        name: ruleData.name,
        displayName: ruleData.properties?.displayName,
        enabled: ruleData.properties?.enabled,
        severity: ruleData.properties?.severity,
        query: ruleData.properties?.query,
        queryFrequency: ruleData.properties?.queryFrequency,
        queryPeriod: ruleData.properties?.queryPeriod,
        etag: ruleData.etag,
      },
    };
  }

  async upsertRuleFromCatalog(ruleDef: RuleDefinition, params: Record<string, number>): Promise<SentinelRuleResponse> {
    const prereq = this.checkPrerequisites();
    if (!prereq.ok) {
      return prereq.response;
    }

    let token: string;
    try {
      token = await this.getArmToken();
    } catch (err: any) {
      return {
        ok: false,
        errorCode: 'ARM_ERROR',
        error: `Failed to acquire ARM token: ${err.message}. Ensure Managed Identity has Sentinel Contributor access.`,
      };
    }

    const mergedParams = { ...ruleDef.defaults, ...params };
    const query = applyTemplate(ruleDef.queryTemplate, mergedParams);

    const ruleConfig = {
      kind: "Scheduled",
      properties: {
        displayName: ruleDef.displayName,
        description: ruleDef.description,
        severity: ruleDef.severity,
        enabled: true,
        query,
        queryFrequency: ruleDef.queryFrequency,
        queryPeriod: ruleDef.queryPeriod,
        triggerOperator: "GreaterThan",
        triggerThreshold: 0,
        suppressionDuration: "PT5H",
        suppressionEnabled: false,
        tactics: ruleDef.tactics || [],
        techniques: [],
        incidentConfiguration: {
          createIncident: true,
          groupingConfiguration: {
            enabled: false,
            reopenClosedIncident: false,
            lookbackDuration: "PT5H",
            matchingMethod: "AllEntities"
          }
        },
        entityMappings: ruleDef.entityMappings || [],
      }
    };

    const ruleUrl = this.getAlertRuleUrl(ruleDef.resourceName);
    const result = await this.callArmApiPut(ruleUrl, token, ruleConfig);

    if (!result.ok) {
      return {
        ok: false,
        errorCode: this.mapArmErrorToCode(result.statusCode, result.error),
        error: result.error || 'Unknown ARM error',
        details: result.data,
      };
    }

    const ruleData = result.data;
    return {
      ok: true,
      ruleId: ruleData.id,
      name: ruleData.name,
      displayName: ruleData.properties?.displayName,
      etag: ruleData.etag,
      created: result.statusCode === 201,
    };
  }

  async listInstalledRules(): Promise<ListInstalledRulesResponse> {
    const prereq = this.checkPrerequisites();
    if (!prereq.ok) {
      return {
        ok: false,
        errorCode: prereq.response.errorCode,
        error: prereq.response.error,
      };
    }

    let token: string;
    try {
      token = await this.getArmToken();
    } catch (err: any) {
      return {
        ok: false,
        errorCode: 'ARM_ERROR',
        error: `Failed to acquire ARM token: ${err.message}`,
      };
    }

    const listUrl = this.getAlertRulesListUrl();
    const result = await this.callArmApi(listUrl, token);

    if (!result.ok) {
      return {
        ok: false,
        errorCode: this.mapArmErrorToCode(result.statusCode, result.error),
        error: result.error || 'Unknown ARM error',
      };
    }

    const allRules = result.data?.value || [];
    const zapperRules = allRules
      .filter((rule: any) => rule.name?.startsWith('zapper-'))
      .map((rule: any) => ({
        id: rule.id,
        name: rule.name,
        displayName: rule.properties?.displayName || rule.name,
        description: rule.properties?.description || '',
        enabled: rule.properties?.enabled ?? false,
        severity: rule.properties?.severity || 'Medium',
        queryFrequency: rule.properties?.queryFrequency || '',
        queryPeriod: rule.properties?.queryPeriod || '',
        zapperRuleId: rule.properties?.customDetails?.zapperRuleId,
        zapperVersion: rule.properties?.customDetails?.zapperVersion,
      }));

    return {
      ok: true,
      rules: zapperRules,
    };
  }

  async deleteRule(ruleId: string): Promise<DeleteRuleResponse> {
    const prereq = this.checkPrerequisites();
    if (!prereq.ok) {
      return {
        ok: false,
        errorCode: prereq.response.errorCode,
        error: prereq.response.error,
      };
    }

    if (!ruleId.startsWith('zapper-')) {
      return {
        ok: false,
        errorCode: 'ARM_ERROR',
        error: 'Can only delete Zapper rules (rules starting with "zapper-")',
      };
    }

    let token: string;
    try {
      token = await this.getArmToken();
    } catch (err: any) {
      return {
        ok: false,
        errorCode: 'ARM_ERROR',
        error: `Failed to acquire ARM token: ${err.message}`,
      };
    }

    const ruleUrl = this.getAlertRuleUrl(ruleId);
    const result = await this.callArmApiDelete(ruleUrl, token);

    if (!result.ok) {
      return {
        ok: false,
        deleted: false,
        errorCode: this.mapArmErrorToCode(result.statusCode, result.error),
        error: result.error || 'Unknown ARM error',
      };
    }

    return {
      ok: true,
      deleted: true,
    };
  }

  async toggleRuleEnabled(ruleId: string, enabled: boolean): Promise<ToggleRuleResponse> {
    const prereq = this.checkPrerequisites();
    if (!prereq.ok) {
      return {
        ok: false,
        errorCode: prereq.response.errorCode,
        error: prereq.response.error,
      };
    }

    if (!ruleId.startsWith('zapper-')) {
      return {
        ok: false,
        errorCode: 'ARM_ERROR',
        error: 'Can only modify Zapper rules (rules starting with "zapper-")',
      };
    }

    let token: string;
    try {
      token = await this.getArmToken();
    } catch (err: any) {
      return {
        ok: false,
        errorCode: 'ARM_ERROR',
        error: `Failed to acquire ARM token: ${err.message}`,
      };
    }

    const ruleUrl = this.getAlertRuleUrl(ruleId);
    const getResult = await this.callArmApi(ruleUrl, token);

    if (!getResult.ok) {
      return {
        ok: false,
        errorCode: this.mapArmErrorToCode(getResult.statusCode, getResult.error),
        error: getResult.error || 'Failed to fetch rule',
      };
    }

    const existingRule = getResult.data;
    const etag = existingRule.etag;

    // Construct a compliant PUT body with only kind and properties (no read-only fields)
    const updatedProperties = { ...existingRule.properties, enabled };
    const updateBody = {
      kind: existingRule.kind,
      properties: updatedProperties,
    };

    const putResult = await this.callArmApiPut(ruleUrl, token, updateBody, etag);

    if (!putResult.ok) {
      return {
        ok: false,
        errorCode: this.mapArmErrorToCode(putResult.statusCode, putResult.error),
        error: putResult.error || 'Failed to update rule',
      };
    }

    return {
      ok: true,
      enabled,
      ruleId: putResult.data?.name || ruleId,
    };
  }

  private getIncidentsListUrl(): string {
    return `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${this.workspaceName}/providers/Microsoft.SecurityInsights/incidents?api-version=2024-03-01`;
  }

  private getIncidentUrl(incidentId: string): string {
    return `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${this.workspaceName}/providers/Microsoft.SecurityInsights/incidents/${incidentId}?api-version=2024-03-01`;
  }

  private getIncidentAlertsUrl(incidentId: string): string {
    return `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${this.workspaceName}/providers/Microsoft.SecurityInsights/incidents/${incidentId}/alerts?api-version=2024-03-01`;
  }

  private getIncidentEntitiesUrl(incidentId: string): string {
    return `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${this.workspaceName}/providers/Microsoft.SecurityInsights/incidents/${incidentId}/entities?api-version=2024-03-01`;
  }

  private getRangeInHours(range: string): number {
    switch (range) {
      case '24h': return 24;
      case '48h': return 48;
      case '72h': return 72;
      case '7d': return 24 * 7;
      case '14d': return 24 * 14;
      case '30d': return 24 * 30;
      default: return 24;
    }
  }

  private buildPortalUrl(incidentId: string): string {
    return `https://portal.azure.com/#blade/Microsoft_Azure_Security_Insights/MainMenuBlade/Incidents/id/${encodeURIComponent(incidentId)}`;
  }

  private buildDefenderXdrUrl(incidentNumber: number): string | null {
    return `https://security.microsoft.com/incidents/${incidentNumber}`;
  }

  async listIncidents(options: {
    range: string;
    status?: string;
    severity?: string;
    search?: string;
    pageSize?: number;
    cursor?: string;
  }): Promise<ListIncidentsResponse> {
    const prereq = this.checkPrerequisites();
    if (!prereq.ok) {
      return {
        ok: false,
        errorCode: prereq.response.errorCode === 'SENTINEL_DISABLED' ? 'SENTINEL_NOT_CONFIGURED' : prereq.response.errorCode,
        error: prereq.response.error,
      };
    }

    let token: string;
    try {
      token = await this.getArmToken();
    } catch (err: any) {
      return {
        ok: false,
        errorCode: 'ARM_ERROR',
        error: `Failed to acquire ARM token: ${err.message}`,
      };
    }

    const rangeHours = this.getRangeInHours(options.range);
    const cutoffTime = new Date(Date.now() - rangeHours * 60 * 60 * 1000).toISOString();

    let url = this.getIncidentsListUrl();
    const filterParts: string[] = [];
    filterParts.push(`properties/createdTimeUtc ge ${cutoffTime}`);
    
    if (options.status) {
      filterParts.push(`properties/status eq '${options.status}'`);
    }
    if (options.severity) {
      filterParts.push(`properties/severity eq '${options.severity}'`);
    }

    if (filterParts.length > 0) {
      url += `&$filter=${encodeURIComponent(filterParts.join(' and '))}`;
    }

    const top = Math.min(options.pageSize || 25, 100);
    url += `&$top=${top}`;

    if (options.cursor) {
      url += `&$skipToken=${encodeURIComponent(options.cursor)}`;
    }

    url += `&$orderby=properties/createdTimeUtc desc`;

    const result = await this.callArmApi(url, token);

    if (!result.ok) {
      return {
        ok: false,
        errorCode: this.mapArmErrorToCode(result.statusCode, result.error),
        error: result.error || 'Unknown ARM error',
      };
    }

    const allIncidents = result.data?.value || [];
    
    let filteredIncidents = allIncidents;
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filteredIncidents = allIncidents.filter((inc: any) => 
        inc.properties?.title?.toLowerCase().includes(searchLower)
      );
    }

    const items: SentinelIncident[] = filteredIncidents.map((inc: any) => ({
      id: inc.name,
      incidentNumber: inc.properties?.incidentNumber || 0,
      title: inc.properties?.title || 'Untitled',
      severity: inc.properties?.severity || 'Medium',
      status: inc.properties?.status || 'New',
      owner: inc.properties?.owner?.assignedTo || null,
      provider: 'Microsoft Sentinel',
      product: inc.properties?.additionalData?.alertProductNames?.[0] || 'Microsoft Sentinel',
      createdTimeUtc: inc.properties?.createdTimeUtc || '',
      lastUpdatedTimeUtc: inc.properties?.lastModifiedTimeUtc || '',
      alertsCount: inc.properties?.additionalData?.alertsCount || 0,
      entitiesCount: inc.properties?.relatedAnalyticRuleIds?.length || 0,
      portalUrl: this.buildPortalUrl(inc.id),
      defenderXdrUrl: this.buildDefenderXdrUrl(inc.properties?.incidentNumber),
    }));

    const nextLink = result.data?.nextLink;
    let nextCursor: string | null = null;
    if (nextLink) {
      const skipTokenMatch = nextLink.match(/\$skipToken=([^&]+)/);
      if (skipTokenMatch) {
        nextCursor = decodeURIComponent(skipTokenMatch[1]);
      }
    }

    return {
      ok: true,
      range: options.range,
      items,
      nextCursor,
    };
  }

  async getIncident(incidentId: string): Promise<GetIncidentResponse> {
    const prereq = this.checkPrerequisites();
    if (!prereq.ok) {
      return {
        ok: false,
        errorCode: prereq.response.errorCode === 'SENTINEL_DISABLED' ? 'SENTINEL_NOT_CONFIGURED' : prereq.response.errorCode,
        error: prereq.response.error,
      };
    }

    let token: string;
    try {
      token = await this.getArmToken();
    } catch (err: any) {
      return {
        ok: false,
        errorCode: 'ARM_ERROR',
        error: `Failed to acquire ARM token: ${err.message}`,
      };
    }

    const incidentUrl = this.getIncidentUrl(incidentId);
    const result = await this.callArmApi(incidentUrl, token);

    if (!result.ok) {
      return {
        ok: false,
        errorCode: this.mapArmErrorToCode(result.statusCode, result.error),
        error: result.error || 'Unknown ARM error',
      };
    }

    const inc = result.data;

    let entities: any[] = [];
    try {
      const entitiesResult = await this.callArmApiPost(this.getIncidentEntitiesUrl(incidentId), token, {});
      if (entitiesResult.ok && entitiesResult.data?.entities) {
        entities = entitiesResult.data.entities.map((e: any) => ({
          kind: e.kind,
          properties: e.properties,
        }));
      }
    } catch (err) {
      console.log('Failed to fetch entities:', err);
    }

    let alerts: any[] = [];
    try {
      const alertsResult = await this.callArmApiPost(this.getIncidentAlertsUrl(incidentId), token, {});
      if (alertsResult.ok && alertsResult.data?.value) {
        alerts = alertsResult.data.value.map((a: any) => ({
          id: a.id,
          name: a.name,
          alertDisplayName: a.properties?.alertDisplayName,
          severity: a.properties?.severity,
          status: a.properties?.status,
          timeGenerated: a.properties?.timeGenerated,
        }));
      }
    } catch (err) {
      console.log('Failed to fetch alerts:', err);
    }

    const incident: IncidentDetails = {
      id: inc.name,
      incidentNumber: inc.properties?.incidentNumber || 0,
      title: inc.properties?.title || 'Untitled',
      severity: inc.properties?.severity || 'Medium',
      status: inc.properties?.status || 'New',
      owner: inc.properties?.owner?.assignedTo || null,
      provider: 'Microsoft Sentinel',
      product: inc.properties?.additionalData?.alertProductNames?.[0] || 'Microsoft Sentinel',
      createdTimeUtc: inc.properties?.createdTimeUtc || '',
      lastUpdatedTimeUtc: inc.properties?.lastModifiedTimeUtc || '',
      alertsCount: inc.properties?.additionalData?.alertsCount || 0,
      entitiesCount: entities.length,
      portalUrl: this.buildPortalUrl(inc.id),
      defenderXdrUrl: this.buildDefenderXdrUrl(inc.properties?.incidentNumber),
      description: inc.properties?.description || null,
      classification: inc.properties?.classification || null,
      classificationReason: inc.properties?.classificationReason || null,
      classificationComment: inc.properties?.classificationComment || null,
      labels: (inc.properties?.labels || []).map((l: any) => l.labelName),
      entities,
      alerts,
    };

    return {
      ok: true,
      incident,
    };
  }

  private async callArmApiPost(url: string, token: string, body: any): Promise<ArmApiResult> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          ok: false,
          error: data.error?.message || `HTTP ${response.status}`,
          statusCode: response.status,
          data,
        };
      }

      return { ok: true, data, statusCode: response.status };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}

let sentinelArmClientInstance: SentinelArmClient | null = null;

export function getSentinelArmClient(): SentinelArmClient {
  if (!sentinelArmClientInstance) {
    sentinelArmClientInstance = new SentinelArmClient();
  }
  return sentinelArmClientInstance;
}
