import { DefaultAzureCredential } from "@azure/identity";
import { LogsQueryClient } from "@azure/monitor-query";
import { UserActivity } from "@shared/schema";

export interface ActivityFilters {
  search?: string;
  action?: string;
  category?: string;
  userEmail?: string;
}

export class AzureMonitorService {
  private static logsClient = new LogsQueryClient(new DefaultAzureCredential());
  private static workspaceId = process.env.SENTINEL_WORKSPACE_ID;

  private static sanitizeKqlValue(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '')
      .replace(/\r/g, '');
  }

  private static buildFilterClauses(filters?: ActivityFilters): string {
    if (!filters) return '';
    
    const clauses: string[] = [];
    
    if (filters.action) {
      const safeAction = this.sanitizeKqlValue(filters.action);
      clauses.push(`(column_ifexists("EventType_s_s", "") == "${safeAction}" or column_ifexists("Action_s_s", "") == "${safeAction}" or column_ifexists("EventType_s", "") == "${safeAction}" or column_ifexists("Action_s", "") == "${safeAction}")`);
    }
    
    if (filters.category) {
      const safeCategory = this.sanitizeKqlValue(filters.category);
      clauses.push(`(column_ifexists("EventCategory_s_s", "") == "${safeCategory}" or column_ifexists("ActionCategory_s_s", "") == "${safeCategory}" or column_ifexists("EventCategory_s", "") == "${safeCategory}" or column_ifexists("ActionCategory_s", "") == "${safeCategory}")`);
    }
    
    if (filters.userEmail) {
      const safeEmail = this.sanitizeKqlValue(filters.userEmail);
      clauses.push(`(column_ifexists("UserPrincipalName_s_s", "") == "${safeEmail}" or column_ifexists("UserPrincipalName_s", "") == "${safeEmail}")`);
    }
    
    if (filters.search) {
      const searchTerm = this.sanitizeKqlValue(filters.search);
      clauses.push(`(
        column_ifexists("UserPrincipalName_s_s", "") contains "${searchTerm}"
        or column_ifexists("UserDisplayName_s_s", "") contains "${searchTerm}"
        or column_ifexists("EventType_s_s", "") contains "${searchTerm}"
        or column_ifexists("Action_s_s", "") contains "${searchTerm}"
        or column_ifexists("ResourceName_s_s", "") contains "${searchTerm}"
        or column_ifexists("ResourceId_s_s", "") contains "${searchTerm}"
        or column_ifexists("UserPrincipalName_s", "") contains "${searchTerm}"
        or column_ifexists("UserDisplayName_s", "") contains "${searchTerm}"
        or column_ifexists("EventType_s", "") contains "${searchTerm}"
        or column_ifexists("Action_s", "") contains "${searchTerm}"
        or column_ifexists("ResourceName_s", "") contains "${searchTerm}"
        or column_ifexists("ResourceId_s", "") contains "${searchTerm}"
      )`);
    }
    
    return clauses.length > 0 ? ' and ' + clauses.join(' and ') : '';
  }

  static async getUserActivities(organizationId: number, limit: number = 50, offset: number = 0, filters?: ActivityFilters): Promise<{ activities: UserActivity[], totalCount: number }> {
    if (!this.workspaceId) {
      console.error("❌ [AZURE MONITOR] SENTINEL_WORKSPACE_ID not configured");
      return { activities: [], totalCount: 0 };
    }

    const filterClauses = this.buildFilterClauses(filters);

    const countQuery = `ZapperSecurityEvents_CL 
      | where (column_ifexists("OrganizationId_d_d", -1) == ${organizationId}
        or column_ifexists("OrganizationId_s_s", "") == "${organizationId}"
        or tolong(column_ifexists("OrganizationId_d_d", -1)) == ${organizationId}
        or tolong(column_ifexists("OrganizationId_s_s", "0")) == ${organizationId})${filterClauses}
      | summarize count()`;

    const dataQuery = `ZapperSecurityEvents_CL 
      | where (column_ifexists("OrganizationId_d_d", -1) == ${organizationId}
        or column_ifexists("OrganizationId_s_s", "") == "${organizationId}"
        or tolong(column_ifexists("OrganizationId_d_d", -1)) == ${organizationId}
        or tolong(column_ifexists("OrganizationId_s_s", "0")) == ${organizationId})${filterClauses}
      | order by TimeGenerated desc 
      | serialize
      | extend row_num = row_number()
      | where row_num > ${offset} and row_num <= ${offset + limit}`;

    const [activities, totalCountResult] = await Promise.all([
      this.executeQuery(dataQuery),
      this.executeQueryRaw(countQuery)
    ]);

    let totalCount = 0;
    if (totalCountResult && totalCountResult.length > 0) {
      totalCount = (totalCountResult[0] as any).count_ || 0;
    }

    return { activities, totalCount };
  }

  static async getUserActivitiesForActor(email: string, permittedOrgIds: number[], limit: number = 50, offset: number = 0, filters?: ActivityFilters): Promise<{ activities: UserActivity[], totalCount: number }> {
    if (!this.workspaceId) {
      console.error("❌ [AZURE MONITOR] SENTINEL_WORKSPACE_ID not configured");
      return { activities: [], totalCount: 0 };
    }

    if (permittedOrgIds.length === 0) {
      console.log(`ℹ️ [AZURE MONITOR] No permitted orgs for user ${email}, returning empty results`);
      return { activities: [], totalCount: 0 };
    }

    // For actor view, we show activities across all permitted organizations where the user is an actor.
    // We filter by organization IDs the user has access to.
    const orgIdFilter = permittedOrgIds.map(id => 
      `(column_ifexists("OrganizationId_d_d", -1) == ${id} or column_ifexists("OrganizationId_s_s", "") == "${id}" or tolong(column_ifexists("OrganizationId_d_d", -1)) == ${id} or tolong(column_ifexists("OrganizationId_s_s", "0")) == ${id})`
    ).join(' or ');

    const filterClauses = this.buildFilterClauses(filters);

    console.log(`🔍 [AZURE MONITOR] Fetching activities across orgs [${permittedOrgIds.join(', ')}] with filters: ${JSON.stringify(filters)}`);

    // We need to run two queries or one combined query to get both data and total count
    // Log Analytics doesn't have a simple way to get total count in one go with limit/offset
    // So we fetch the total count separately
    const countQuery = `ZapperSecurityEvents_CL 
      | where (${orgIdFilter})${filterClauses}
      | summarize count()`;

    const dataQuery = `ZapperSecurityEvents_CL 
      | where (${orgIdFilter})${filterClauses}
      | order by TimeGenerated desc 
      | serialize
      | extend row_num = row_number()
      | where row_num > ${offset} and row_num <= ${offset + limit}`;

    const [activities, totalCountResult] = await Promise.all([
      this.executeQuery(dataQuery),
      this.executeQueryRaw(countQuery)
    ]);

    let totalCount = 0;
    if (totalCountResult && totalCountResult.length > 0) {
      totalCount = (totalCountResult[0] as any).count_ || 0;
    }

    return { activities, totalCount };
  }

  private static async executeQueryRaw(query: string): Promise<any[]> {
    try {
      console.log(`🔍 [AZURE MONITOR] Executing raw query: ${query}`);
      const result = await this.logsClient.queryWorkspace(this.workspaceId!, query, {
        duration: "P30D"
      });

      if (result.status === "Success" && result.tables && result.tables.length > 0) {
        const table = result.tables[0];
        const rows = table.rows;
        const columns = table.columns;
        
        return rows.map(row => {
          const entry: any = {};
          columns.forEach((col, idx) => {
            entry[col.name] = row[idx];
          });
          return entry;
        });
      }
      return [];
    } catch (error) {
      console.error("❌ [AZURE MONITOR] Raw query failed:", error);
      return [];
    }
  }

  private static async executeQuery(query: string): Promise<UserActivity[]> {
    try {
      console.log(`🔍 [AZURE MONITOR] Executing Kusto query: ${query}`);
      const result = await this.logsClient.queryWorkspace(this.workspaceId!, query, {
        duration: "P30D" // Last 30 days by default
      });

      if (result.status === "Success") {
        const tables = result.tables;
        if (!tables || tables.length === 0) {
          console.log("ℹ️ [AZURE MONITOR] No tables returned from query");
          return [];
        }

        const table = tables[0];
        const rows = table.rows;
        const columns = table.columns;
        console.log(`ℹ️ [AZURE MONITOR] Query returned ${rows.length} rows`);

        return rows.map(row => {
          const entry: any = {};
          columns.forEach((col, idx) => {
            // Map Azure column names back to our schema fields
            // Custom fields in Log Analytics often have suffixes like _s (string), _d (double/number)
            // Handle double-suffix cases like _s_s or _d_d seen in some exports
            let key = col.name
              .replace("_s_s", "")
              .replace("_d_d", "")
              .replace("_s_g", "")
              .replace("_s", "")
              .replace("_d", "")
              .replace("_t", "");
            
            // Handle specific mapping cases
            if (key === "TimeGenerated") key = "actionTime";
            if (key === "UserPrincipalName") key = "email";
            if (key === "UserDisplayName") key = "userName";
            if (key === "EventType") key = "action";
            if (key === "EventCategory") key = "actionCategory";
            if (key === "SourceIP") key = "ipAddress";
            // Use original col.name to distinguish our custom ResourceId_s from Azure's built-in ResourceId.
            // Azure's built-in ResourceId (no _s suffix) is always null for custom logs and would overwrite
            // our ResourceId_s value if both map to the same key.
            if (col.name === "ResourceId_s" || col.name === "ResourceId_s_s") key = "resource";
            else if (col.name === "ResourceName_s" || col.name === "ResourceName_s_s") key = "resourceNameFallback";
            
            let value = row[idx];

            // Map Organization and Role fields for legacy/standard Sentinel data
            if (col.name === "OrganizationId_d_d" || col.name === "OrganizationId_s_s" || col.name === "OrganizationId_s" || col.name === "OrganizationId") {
              entry["organizationId"] = value;
            }
            if (col.name === "OrganizationName_s_s" || col.name === "OrganizationName_s" || col.name === "OrganizationName") {
              entry["organizationName"] = value;
            }
            if (col.name === "RoleId_d_d" || col.name === "RoleId_s_s" || col.name === "RoleId_s" || col.name === "RoleId") {
              entry["roleId"] = value;
            }
            if (col.name === "RoleName_s_s" || col.name === "RoleName_s" || col.name === "RoleName") {
              entry["roleName"] = value;
            }

            // Parse JSON strings for details field
            if (key === "details" && typeof value === "string") {
              try {
                value = JSON.parse(value);
              } catch (e) {
                // Keep as string if parsing fails
              }
            }

            entry[key] = value;
          });

          // Ensure basic fields required by UserActivity interface
          const email = entry.email || entry.UserPrincipalName || "";
          const action = entry.action || entry.EventType || "";
          const actionCategory = entry.actionCategory || entry.EventCategory || "";
          const userName = entry.userName || entry.UserDisplayName || "System";
          const resource = entry.resource || entry.ResourceId || entry.ResourceName || entry.resourceNameFallback || null;
          const ipAddress = entry.ipAddress || entry.SourceIP || null;

          return {
            id: entry.id || 0,
            userId: entry.userId || "",
            userName: userName,
            email: email,
            action: action,
            actionCategory: actionCategory,
            actionTime: entry.actionTime ? new Date(entry.actionTime) : new Date(),
            resource: resource,
            resourceType: entry.resourceType || null,
            details: entry.details || null,
            ipAddress: ipAddress,
            userAgent: entry.userAgent || null,
            sessionId: entry.sessionId || null,
            organizationId: entry.organizationId || null,
            organizationName: entry.organizationName || null,
            roleId: entry.roleId || null,
            roleName: entry.roleName || null,
            loginTime: entry.loginTime ? new Date(entry.loginTime) : null,
            logoutTime: entry.logoutTime ? new Date(entry.logoutTime) : null,
          } as UserActivity;
        });
      }
      return [];
    } catch (error) {
      console.error("❌ [AZURE MONITOR] Query failed:", error);
      return [];
    }
  }
}
