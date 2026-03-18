import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { db } from './db';
import { userRoles, roles } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { ActivityLogger, ActivityActions } from './activityLogger';

// 🔒 Multi-tenant access control middleware
export function organizationAccessRequired(req: Request, res: Response, next: NextFunction) {
  const middleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        console.log(`🔒 [MIDDLEWARE] No user email found in request`);
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Extract organizationId from request body, query parameters, or path parameters
      const organizationId = req.body?.organization_id || req.body?.organizationId || req.query?.organizationId || req.params?.organizationId || req.params?.orgId;
      
      console.log(`🔒 [MIDDLEWARE] Organization access check for user: ${userEmail}, orgId: ${organizationId}`);
      console.log(`🔒 [MIDDLEWARE] Request method: ${req.method}, path: ${req.path}`);
      console.log(`🔒 [MIDDLEWARE] Query params:`, req.query);
      console.log(`🔒 [MIDDLEWARE] Body params:`, req.body);
      
      if (!organizationId) {
        console.log(`🔒 [MIDDLEWARE] No organization ID found in request`);
        return res.status(400).json({ error: 'Organization ID is required' });
      }

      const orgId = parseInt(organizationId as string);
      if (isNaN(orgId)) {
        console.log(`🔒 [MIDDLEWARE] Invalid organization ID format: ${organizationId}`);
        return res.status(400).json({ error: 'Invalid organization ID format' });
      }

      // Validate user has access to this organization
      const hasAccess = await storage.validateUserOrganizationAccess(userEmail, orgId);
      if (!hasAccess) {
        console.log(`🔒 [MIDDLEWARE] Blocked unauthorized organization access: ${userEmail} → org ${orgId}`);
        
        try {
          const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() 
            || req.headers['x-real-ip']?.toString() 
            || req.socket?.remoteAddress 
            || 'unknown';
          const user = (req as any).user;
          const dbUser = await storage.getUserByEmail(userEmail);
          
          await ActivityLogger.logSecurityEvent(
            {
              userId: user?.oid || user?.id || dbUser?.id?.toString() || 'unknown',
              userName: user?.name || user?.displayName || dbUser?.name || 'Unknown User',
              email: userEmail,
              ipAddress: clientIp,
              userAgent: req.get('User-Agent') || 'Unknown',
            },
            ActivityActions.UNAUTHORIZED_ORG_ACCESS_ATTEMPT,
            `Attempted org: ${orgId}, Endpoint: ${req.method} ${req.path}`,
            { attemptedOrganizationId: orgId, endpoint: req.path, method: req.method }
          );
          console.log(`🔒 [MIDDLEWARE] Logged unauthorized access attempt: ${userEmail} → org ${orgId} from ${clientIp}`);
        } catch (logErr) {
          console.error(`🔒 [MIDDLEWARE] Failed to log unauthorized access attempt:`, logErr);
        }
        
        return res.status(403).json({ 
          error: 'Access denied: You are not authorized to access this organization\'s resources' 
        });
      }

      console.log(`🔒 [MIDDLEWARE] Organization access granted: ${userEmail} → org ${orgId}`);
      // Store validated org ID in request for later use
      (req as any).validatedOrganizationId = orgId;
      next();
    } catch (error) {
      console.error('🔒 [MIDDLEWARE] Organization access validation error:', error);
      res.status(500).json({ error: 'Access validation failed' });
    }
  };
  
  return middleware(req, res, next);
}

// 🔒 User management access control middleware
export async function userManagementAccessRequired(req: Request, res: Response, next: NextFunction) {
    try {
      const requestingUserEmail = (req as any).user?.email;
      if (!requestingUserEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Extract target user ID from request
      const targetUserId = req.body?.userId || req.params?.id || req.params?.userId || req.query?.userId;
      
      if (!targetUserId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const userId = parseInt(targetUserId as string);
      if (isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      // Validate user management access
      const hasAccess = await storage.validateUserManagementAccess(requestingUserEmail, userId);
      if (!hasAccess) {
        console.log(`🔒 [MIDDLEWARE] Blocked unauthorized user management: ${requestingUserEmail} → user ${userId}`);
        return res.status(403).json({ 
          error: 'Access denied: You are not authorized to manage this user' 
        });
      }

      // Store validated user ID in request for later use
      (req as any).validatedTargetUserId = userId;
      next();
    } catch (error) {
      console.error('🔒 [MIDDLEWARE] User management access validation error:', error);
      res.status(500).json({ error: 'User access validation failed' });
    }
}

// 🔒 Enhanced permission middleware with specific permission names
export function specificPermissionRequired(permissionName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log(`🔍 [MIDDLEWARE] Checking "${permissionName}" permission for user: ${userEmail}`);
      const hasPermission = await storage.checkUserPermission(userEmail, permissionName);
      if (!hasPermission) {
        console.log(`🔒 [MIDDLEWARE] Permission denied: ${userEmail} lacks "${permissionName}"`);
        return res.status(403).json({ 
          error: `Access denied: You do not have the required permission: ${permissionName}` 
        });
      }
      console.log(`✅ [MIDDLEWARE] Permission granted: ${userEmail} has "${permissionName}"`);  

      next();
    } catch (error) {
      console.error(`🔒 [MIDDLEWARE] Permission check error for "${permissionName}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 File read access middleware - Allows listing files if user has ANY file management permission
// Rationale: If you can delete/upload files, you need to see them first!
export function fileReadAccessRequired(req: Request, res: Response, next: NextFunction) {
  return (async () => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get organization ID from query params or body (must be validated by organizationAccessRequired middleware first)
      const organizationId = parseInt((req.query.organizationId || req.body?.organizationId) as string);
      if (!organizationId) {
        console.log(`🔒 [FILE-READ] No organization ID provided in request`);
        return res.status(400).json({ error: 'Organization ID is required' });
      }

      console.log(`🔍 [FILE-READ] Checking file read access for user: ${userEmail} in org: ${organizationId}`);
      
      const fileActions = ['viewFiles', 'downloadFile', 'downloadFolder', 'uploadFile', 'uploadFolder', 'deleteFilesAndFolders', 'createFolder', 'searchFiles', 'renameFile', 'rehydrate'];
      let hasReadAccess = false;
      for (const action of fileActions) {
        if (await storage.checkGranularFilePermission(userEmail, action, organizationId)) {
          hasReadAccess = true;
          break;
        }
      }
      
      if (!hasReadAccess) {
        console.log(`🔒 [FILE-READ] Permission denied: ${userEmail} lacks any file management permission in org ${organizationId}`);
        return res.status(403).json({ 
          error: 'Access denied: You do not have permission to access files in this organization' 
        });
      }
      
      console.log(`✅ [FILE-READ] File listing access granted: ${userEmail} in org ${organizationId}`);  

      next();
    } catch (error) {
      console.error(`🔒 [FILE-READ] Permission check error:`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  })();
}

// 🔒 Granular file management permission middleware - Checks specific file operation permissions FOR SPECIFIC ORGANIZATION
export function fileManagementPermissionRequired(action: 'downloadFile' | 'downloadFolder' | 'deleteFilesAndFolders' | 'uploadFile' | 'uploadFolder' | 'viewFiles' | 'createFolder' | 'searchFiles' | 'renameFile' | 'rehydrate') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get organization ID from query params or body (must be validated by organizationAccessRequired middleware first)
      const organizationId = parseInt((req.query.organizationId || req.body?.organizationId) as string);
      if (!organizationId) {
        console.log(`🔒 [FILE-PERM] No organization ID provided in request`);
        return res.status(400).json({ error: 'Organization ID is required' });
      }

      console.log(`🔍 [FILE-PERM] Checking "${action}" permission for user: ${userEmail} in org: ${organizationId}`);
      const hasPermission = await storage.checkGranularFilePermission(userEmail, action, organizationId);
      if (!hasPermission) {
        console.log(`🔒 [FILE-PERM] Permission denied: ${userEmail} lacks "${action}" in org ${organizationId}`);
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action.replace(/([A-Z])/g, ' $1').toLowerCase()} in this organization` 
        });
      }
      console.log(`✅ [FILE-PERM] Permission granted: ${userEmail} has "${action}" in org ${organizationId}`);  

      next();
    } catch (error) {
      console.error(`🔒 [FILE-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Granular user management permission middleware - Checks specific user operation permissions FOR SPECIFIC ORGANIZATION
export function userManagementPermissionRequired(action: 'add' | 'edit' | 'delete' | 'view' | 'enableDisable') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // 🌍 GLOBAL PERMISSION CHECK: ONLY 'add' action can have global access
      // 🔒 SECURITY RESTRICTION: edit, delete, view, enableDisable are organization-scoped ONLY
      // Reason: Allow global "add" for initial user setup, restrict other operations to org boundaries
      let hasGlobalUserMgmt = false;
      if (action === 'add') {
        hasGlobalUserMgmt = await storage.checkUserPermission(userEmail, 'USER_MANAGEMENT');
        if (hasGlobalUserMgmt) {
          console.log(`🌍 [USER-PERM] User ${userEmail} has GLOBAL "add" permission for USER_MANAGEMENT`);
        } else {
          console.log(`🔍 [USER-PERM] User ${userEmail} has NO global "add" permission, checking organization-scoped`);
        }
      } else {
        console.log(`🔒 [USER-PERM] Action "${action}" is organization-scoped only (no global access allowed)`);
      }

      // For 'view' action on GET /api/users, allow if global permission OR org-scoped permission
      if (action === 'view' && req.method === 'GET' && req.path === '/api/users') {
        if (hasGlobalUserMgmt) {
          console.log(`✅ [USER-PERM] GLOBAL view access granted for ${userEmail}`);
          return next();
        }

        console.log(`🔍 [USER-PERM] Checking "${action}" permission across organizations for user: ${userEmail}`);
        
        // Get all organizations user has access to
        const userOrganizations = await storage.getOrganizationsForUser(userEmail);
        if (userOrganizations.length === 0) {
          console.log(`🔒 [USER-PERM] Access denied: ${userEmail} has no organization access`);
          return res.status(403).json({ 
            error: 'Access denied: You do not have access to any organizations' 
          });
        }

        // Check if user has view permission in ANY organization
        let hasPermission = false;
        for (const org of userOrganizations) {
          const hasViewPerm = await storage.checkGranularUserPermission(userEmail, 'view', org.id);
          if (hasViewPerm) {
            console.log(`✅ [USER-PERM] Permission granted: ${userEmail} has "view" permission in org ${org.id}`);
            hasPermission = true;
            break;
          }
        }

        if (!hasPermission) {
          console.log(`🔒 [USER-PERM] Permission denied: ${userEmail} lacks "view" permission in any organization`);
          return res.status(403).json({ 
            error: 'Access denied: You do not have permission to view users' 
          });
        }

        return next();
      }

      // For other operations (add, edit, delete, enableDisable), determine and VALIDATE the organization ID
      let organizationId: number | undefined;

      // For operations targeting an EXISTING user (edit, delete, enableDisable)
      // ALWAYS validate the target user exists and get their organizations (even for global admins)
      if ((action === 'edit' || action === 'delete' || action === 'enableDisable') && req.params.id) {
        const targetUserId = parseInt(req.params.id as string);
        if (!targetUserId) {
          console.log(`🔒 [USER-PERM] Invalid user ID in request`);
          return res.status(400).json({ error: 'Invalid user ID' });
        }

        // ALWAYS look up the target user to verify they exist (security validation)
        const targetUser = await storage.getUser(targetUserId);
        if (!targetUser) {
          console.log(`🔒 [USER-PERM] Target user ${targetUserId} not found`);
          return res.status(404).json({ error: 'User not found' });
        }

        // ALWAYS get the target user's organization(s) to validate they exist
        const targetUserOrganizations = await storage.getOrganizationsForUser(targetUser.email);
        if (targetUserOrganizations.length === 0) {
          console.log(`🔒 [USER-PERM] Target user ${targetUserId} has no organization assignments`);
          return res.status(403).json({ error: 'Target user has no organization assignments' });
        }

        // If user has GLOBAL permission, allow operation with audit logging
        if (hasGlobalUserMgmt) {
          organizationId = targetUserOrganizations[0].id; // Use first org for logging
          console.log(`✅ [USER-PERM] GLOBAL permission: ${userEmail} can "${action}" user ${targetUser.email} (org: ${organizationId})`);
          return next(); // Allow global admin to proceed
        }

        // Otherwise, check if requesting user has permission in ANY of the target user's organizations
        let hasPermissionInTargetOrg = false;
        for (const targetOrg of targetUserOrganizations) {
          const hasPermission = await storage.checkGranularUserPermission(userEmail, action, targetOrg.id);
          if (hasPermission) {
            console.log(`✅ [USER-PERM] Org-scoped permission: ${userEmail} has "${action}" in target org ${targetOrg.id}`);
            hasPermissionInTargetOrg = true;
            organizationId = targetOrg.id; // Use this org for the operation
            break;
          }
        }

        if (!hasPermissionInTargetOrg) {
          console.log(`🔒 [USER-PERM] Permission denied: ${userEmail} lacks "${action}" permission in any of target user's organizations`);
          return res.status(403).json({ 
            error: `Access denied: You do not have permission to ${action.replace(/([A-Z])/g, ' $1').toLowerCase()} this user` 
          });
        }

        return next();
      } 
      // For DELETE and ENABLE/DISABLE user-role operations, organization ID is in path params
      else if ((action === 'delete' || action === 'enableDisable') && req.params.organizationId) {
        organizationId = parseInt(req.params.organizationId as string);
        if (!organizationId) {
          console.log(`🔒 [USER-PERM] Invalid organization ID in path params`);
          return res.status(400).json({ error: 'Invalid organization ID' });
        }

        // ALWAYS validate the organization exists (even for global admins)
        const targetOrg = await storage.getOrganization(organizationId);
        if (!targetOrg) {
          console.log(`🔒 [USER-PERM] Target organization ${organizationId} not found`);
          return res.status(404).json({ error: 'Organization not found' });
        }

        // If user has GLOBAL permission, allow operation with audit logging
        if (hasGlobalUserMgmt) {
          console.log(`✅ [USER-PERM] GLOBAL permission: ${userEmail} can "${action}" user-role in org ${organizationId}`);
          return next();
        }
      }
      // For ADD operations (creating new user), organization ID comes from request body
      else if (action === 'add' && req.body?.organization_id) {
        organizationId = parseInt(req.body.organization_id as string);
        if (!organizationId) {
          console.log(`🔒 [USER-PERM] Invalid organization ID in request body`);
          return res.status(400).json({ error: 'Invalid organization ID' });
        }

        // ALWAYS validate the target organization exists (even for global admins)
        const targetOrg = await storage.getOrganization(organizationId);
        if (!targetOrg) {
          console.log(`🔒 [USER-PERM] Target organization ${organizationId} not found`);
          return res.status(404).json({ error: 'Organization not found' });
        }

        // If user has GLOBAL permission, allow operation with audit logging
        if (hasGlobalUserMgmt) {
          console.log(`✅ [USER-PERM] GLOBAL permission: ${userEmail} can "${action}" user in org ${organizationId} (${targetOrg.name})`);
          return next();
        }
      }
      else {
        console.log(`🔒 [USER-PERM] Could not determine organization ID for "${action}" operation`);
        return res.status(400).json({ error: 'Organization ID is required' });
      }

      if (!organizationId) {
        console.log(`🔒 [USER-PERM] No organization ID provided in request for "${action}" operation`);
        return res.status(400).json({ error: 'Organization ID is required' });
      }

      // Organization-scoped permission check (only reached if NOT global admin)
      console.log(`🔍 [USER-PERM] Checking "${action}" permission for user: ${userEmail} in org: ${organizationId}`);
      const hasPermission = await storage.checkGranularUserPermission(userEmail, action, organizationId);
      if (!hasPermission) {
        console.log(`🔒 [USER-PERM] Permission denied: ${userEmail} lacks "${action}" in org ${organizationId}`);
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action.replace(/([A-Z])/g, ' $1').toLowerCase()} users in this organization` 
        });
      }
      console.log(`✅ [USER-PERM] Org-scoped permission granted: ${userEmail} has "${action}" in org ${organizationId}`);  

      next();
    } catch (error) {
      console.error(`🔒 [USER-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Organization management access middleware - Checks if user has ANY organization permission
export async function organizationManagementAccessRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const userEmail = (req as any).user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log(`🔍 [ORG-ACCESS] Checking if user has ANY organization permission: ${userEmail}`);
    
    // Check if user has ANY organization permission (view, add, edit, or delete)
    const actions: ('view' | 'add' | 'edit' | 'delete')[] = ['view', 'add', 'edit', 'delete'];
    let hasAnyPermission = false;
    
    for (const action of actions) {
      const hasPermission = await storage.checkGranularOrganizationPermission(userEmail, action);
      if (hasPermission) {
        console.log(`✅ [ORG-ACCESS] Permission granted: ${userEmail} has "${action}" permission`);
        hasAnyPermission = true;
        break;
      }
    }

    if (!hasAnyPermission) {
      console.log(`🔒 [ORG-ACCESS] Access denied: ${userEmail} has no organization permissions`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have permission to access organizations' 
      });
    }

    next();
  } catch (error) {
    console.error(`🔒 [ORG-ACCESS] Permission check error:`, error);
    res.status(500).json({ error: 'Permission validation failed' });
  }
}

// 🔒 Granular organization management permission middleware - Checks specific organization operation permissions
export function organizationManagementPermissionRequired(action: 'add' | 'edit' | 'delete' | 'view') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log(`🔍 [ORG-PERM] Checking "${action}" permission for user: ${userEmail}`);
      const hasPermission = await storage.checkGranularOrganizationPermission(userEmail, action);
      if (!hasPermission) {
        console.log(`🔒 [ORG-PERM] Permission denied: ${userEmail} lacks "${action}" permission`);
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action} organizations` 
        });
      }
      console.log(`✅ [ORG-PERM] Permission granted: ${userEmail} has "${action}" permission`);  

      next();
    } catch (error) {
      console.error(`🔒 [ORG-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Granular Role management permission middleware - Checks specific role operation permissions
export function roleManagementPermissionRequired(action: 'add' | 'edit' | 'delete' | 'view') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log(`🔍 [ROLE-PERM] Checking "${action}" permission for user: ${userEmail}`);
      const hasPermission = await storage.checkGranularRolePermission(userEmail, action);
      if (!hasPermission) {
        console.log(`🔒 [ROLE-PERM] Permission denied: ${userEmail} lacks "${action}" permission`);
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action} roles` 
        });
      }
      console.log(`✅ [ROLE-PERM] Permission granted: ${userEmail} has "${action}" permission`);  

      next();
    } catch (error) {
      console.error(`🔒 [ROLE-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Role management access middleware - Checks if user has ANY role permission
export async function roleManagementAccessRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const userEmail = (req as any).user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log(`🔍 [ROLE-ACCESS] Checking if user has ANY role permission: ${userEmail}`);
    
    // Check if user has ANY role permission (view, add, edit, or delete)
    const actions: ('view' | 'add' | 'edit' | 'delete')[] = ['view', 'add', 'edit', 'delete'];
    let hasAnyPermission = false;
    
    for (const action of actions) {
      const hasPermission = await storage.checkGranularRolePermission(userEmail, action);
      if (hasPermission) {
        console.log(`✅ [ROLE-ACCESS] Permission granted: ${userEmail} has "${action}" permission`);
        hasAnyPermission = true;
        break;
      }
    }

    if (!hasAnyPermission) {
      console.log(`🔒 [ROLE-ACCESS] Access denied: ${userEmail} has no role permissions`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have permission to access roles' 
      });
    }

    next();
  } catch (error) {
    console.error(`🔒 [ROLE-ACCESS] Permission check error:`, error);
    res.status(500).json({ error: 'Permission validation failed' });
  }
}

// 🔒 AI Agent management access middleware - Checks if user has ANY AI agent permission
export async function aiAgentManagementAccessRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const userEmail = (req as any).user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log(`🔍 [AI-AGENT-ACCESS] Checking if user has ANY AI agent permission: ${userEmail}`);
    
    // Check if user has ANY AI agent permission (view, add, edit, or delete)
    const actions: ('view' | 'add' | 'edit' | 'delete')[] = ['view', 'add', 'edit', 'delete'];
    let hasAnyPermission = false;
    
    for (const action of actions) {
      const hasPermission = await storage.checkUserAiAgentPermission(userEmail, action);
      if (hasPermission) {
        console.log(`✅ [AI-AGENT-ACCESS] Permission granted: ${userEmail} has "${action}" permission`);
        hasAnyPermission = true;
        break;
      }
    }

    if (!hasAnyPermission) {
      console.log(`🔒 [AI-AGENT-ACCESS] Access denied: ${userEmail} has no AI agent permissions`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have permission to access AI agents' 
      });
    }

    next();
  } catch (error) {
    console.error(`🔒 [AI-AGENT-ACCESS] Permission check error:`, error);
    res.status(500).json({ error: 'Permission validation failed' });
  }
}

// 🔒 Granular AI Agent management permission middleware - Checks specific AI agent operation permissions
export function aiAgentManagementPermissionRequired(action: 'add' | 'edit' | 'delete' | 'view') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log(`🔍 [AI-AGENT-PERM] Checking "${action}" permission for user: ${userEmail}`);
      const hasPermission = await storage.checkUserAiAgentPermission(userEmail, action);
      if (!hasPermission) {
        console.log(`🔒 [AI-AGENT-PERM] Permission denied: ${userEmail} lacks "${action}" permission`);
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action} AI agents` 
        });
      }
      console.log(`✅ [AI-AGENT-PERM] Permission granted: ${userEmail} has "${action}" permission`);  

      next();
    } catch (error) {
      console.error(`🔒 [AI-AGENT-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Granular PGP Key management permission middleware - Checks specific PGP key operation permissions
export function pgpKeyManagementPermissionRequired(action: 'view' | 'generate' | 'delete' | 'copy' | 'decrypt') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log(`🔍 [PGP-KEY-PERM] Checking "${action}" permission for user: ${userEmail}`);
      const hasPermission = await storage.checkUserPgpKeyPermission(userEmail, action);
      if (!hasPermission) {
        console.log(`🔒 [PGP-KEY-PERM] Permission denied: ${userEmail} lacks "${action}" permission`);
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action} PGP keys` 
        });
      }
      console.log(`✅ [PGP-KEY-PERM] Permission granted: ${userEmail} has "${action}" permission`);  

      next();
    } catch (error) {
      console.error(`🔒 [PGP-KEY-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Granular SIEM management permission middleware - Checks specific Sentinel rule operation permissions
export function siemManagementPermissionRequired(action: 'install' | 'delete' | 'enableDisable' | 'view' | 'incidentsView') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log(`🔍 [SIEM-PERM] Checking "${action}" permission for user: ${userEmail}`);
      const hasPermission = await storage.checkUserSiemPermission(userEmail, action);
      if (!hasPermission) {
        console.log(`🔒 [SIEM-PERM] Permission denied: ${userEmail} lacks "${action}" permission`);
        const errorMsg = action === 'incidentsView' 
          ? 'Access denied: You do not have permission to view SIEM incidents'
          : `Access denied: You do not have permission to ${action} SIEM rules`;
        return res.status(403).json({ 
          ok: false,
          error: 'FORBIDDEN',
          message: errorMsg
        });
      }
      console.log(`✅ [SIEM-PERM] Permission granted: ${userEmail} has "${action}" permission`);  

      next();
    } catch (error) {
      console.error(`🔒 [SIEM-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Foundry AI Management permission middleware - Checks granular Foundry AI permissions
export function foundryManagementPermissionRequired(action: 'add' | 'edit' | 'delete' | 'view') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log(`🔍 [FOUNDRY-PERM] Checking "${action}" permission for user: ${userEmail}`);
      const hasPermission = await storage.checkUserFoundryPermission(userEmail, action);
      if (!hasPermission) {
        console.log(`🔒 [FOUNDRY-PERM] Permission denied: ${userEmail} lacks "${action}" permission`);
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action} Foundry AI resources` 
        });
      }
      console.log(`✅ [FOUNDRY-PERM] Permission granted: ${userEmail} has "${action}" permission`);  

      next();
    } catch (error) {
      console.error(`🔒 [FOUNDRY-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Content Understanding permission middleware - Checks granular Content Understanding permissions
export function contentUnderstandingPermissionRequired(action: 'view' | 'runAnalysis' | 'saveAnalysis' | 'deleteAnalysis' | 'menuVisibility') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log(`🔍 [CU-PERM] Checking "${action}" permission for user: ${userEmail}`);
      const hasPermission = await storage.checkUserContentUnderstandingPermission(userEmail, action);
      if (!hasPermission) {
        console.log(`🔒 [CU-PERM] Permission denied: ${userEmail} lacks "${action}" permission`);
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action.replace(/([A-Z])/g, ' $1').toLowerCase()} in Content Understanding` 
        });
      }
      console.log(`✅ [CU-PERM] Permission granted: ${userEmail} has "${action}" permission`);  

      next();
    } catch (error) {
      console.error(`🔒 [CU-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Document Translation permission middleware - Checks granular Document Translation permissions
export function documentTranslationPermissionRequired(action: 'view' | 'runTranslation' | 'deleteTranslation') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log(`🔍 [DT-PERM] Checking "${action}" permission for user: ${userEmail}`);
      const hasPermission = await storage.checkUserDocumentTranslationPermission(userEmail, action);
      if (!hasPermission) {
        console.log(`🔒 [DT-PERM] Permission denied: ${userEmail} lacks "${action}" permission`);
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action.replace(/([A-Z])/g, ' $1').toLowerCase()} in Document Translation` 
        });
      }
      console.log(`✅ [DT-PERM] Permission granted: ${userEmail} has "${action}" permission`);  

      next();
    } catch (error) {
      console.error(`🔒 [DT-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

export function evalPermissionRequired(action: 'view' | 'run' | 'review' | 'finalize' | 'menuVisibility') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const hasPermission = await storage.checkUserEvalPermission(userEmail, action);
      if (!hasPermission) {
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action} in Eval` 
        });
      }
      next();
    } catch (error) {
      console.error(`[EVAL-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Content Understanding access middleware - Checks if user has menu visibility permission
export async function contentUnderstandingAccessRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const userEmail = (req as any).user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log(`🔍 [CU-ACCESS] Checking menu visibility access for user: ${userEmail}`);
    const hasMenuAccess = await storage.checkUserContentUnderstandingPermission(userEmail, 'menuVisibility');
    
    if (!hasMenuAccess) {
      console.log(`🔒 [CU-ACCESS] Access denied: ${userEmail} has no Content Understanding menu visibility`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have permission to access Content Understanding' 
      });
    }
    
    console.log(`✅ [CU-ACCESS] Access granted: ${userEmail} can access Content Understanding`);
    next();
  } catch (error) {
    console.error('🔒 [CU-ACCESS] Access validation error:', error);
    res.status(500).json({ error: 'Access validation failed' });
  }
}

// 🔒 Foundry AI Management access middleware - Checks if user has ANY Foundry permission
export async function foundryManagementAccessRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const userEmail = (req as any).user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasViewPermission = await storage.checkUserFoundryPermission(userEmail, 'view');
    const hasAddPermission = await storage.checkUserFoundryPermission(userEmail, 'add');
    const hasEditPermission = await storage.checkUserFoundryPermission(userEmail, 'edit');
    const hasDeletePermission = await storage.checkUserFoundryPermission(userEmail, 'delete');

    if (!hasViewPermission && !hasAddPermission && !hasEditPermission && !hasDeletePermission) {
      console.log(`🔒 [FOUNDRY-ACCESS] Access denied: ${userEmail} has no Foundry AI permissions`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have permission to access Foundry AI Management' 
      });
    }
    console.log(`✅ [FOUNDRY-ACCESS] Access granted: ${userEmail}`);

    next();
  } catch (error) {
    console.error('🔒 [FOUNDRY-ACCESS] Permission check error:', error);
    res.status(500).json({ error: 'Permission validation failed' });
  }
}

// 🔒 Storage management access middleware - Checks if user has ANY storage permission
export async function storageManagementAccessRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const userEmail = (req as any).user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log(`🔍 [STORAGE-ACCESS] Checking if user has ANY storage permission: ${userEmail}`);
    
    // Get all organizations user has access to
    const userOrganizations = await storage.getOrganizationsForUser(userEmail);
    if (userOrganizations.length === 0) {
      console.log(`🔒 [STORAGE-ACCESS] Access denied: ${userEmail} has no organization access`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have access to any organizations' 
      });
    }

    // Check if user has ANY storage permission in ANY of their organizations
    const actions: ('view' | 'addStorageContainer' | 'addContainer' | 'delete')[] = ['view', 'addStorageContainer', 'addContainer', 'delete'];
    let hasAnyPermission = false;
    
    for (const org of userOrganizations) {
      for (const action of actions) {
        const hasPermission = await storage.checkGranularStoragePermission(userEmail, action, org.id);
        if (hasPermission) {
          console.log(`✅ [STORAGE-ACCESS] Permission granted: ${userEmail} has "${action}" permission in org ${org.id}`);
          hasAnyPermission = true;
          break;
        }
      }
      if (hasAnyPermission) break;
    }

    if (!hasAnyPermission) {
      console.log(`🔒 [STORAGE-ACCESS] Access denied: ${userEmail} has no storage permissions`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have permission to access storage management' 
      });
    }

    next();
  } catch (error) {
    console.error(`🔒 [STORAGE-ACCESS] Permission check error:`, error);
    res.status(500).json({ error: 'Permission validation failed' });
  }
}

// 🔒 Granular storage management permission middleware - Checks specific storage operation permissions
export function storageManagementPermissionRequired(action: 'addStorageContainer' | 'addContainer' | 'view' | 'delete') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get organizationId from request - CRITICAL: Use authoritative source based on HTTP method to prevent cross-org attacks
      let organizationId: number | undefined;
      const httpMethod = req.method.toUpperCase();
      
      // For POST/PUT: Body is authoritative (prevents query param injection attacks)
      if (httpMethod === 'POST' || httpMethod === 'PUT' || httpMethod === 'PATCH') {
        if (req.body?.organizationId) {
          const orgId = parseInt(req.body.organizationId);
          if (!isNaN(orgId)) {
            organizationId = orgId;
          }
        }
      }
      // For DELETE/GET by ID: Look up the resource to get its organization (prevents tampering)
      else if ((httpMethod === 'DELETE' || httpMethod === 'GET') && req.params?.id) {
        const storageAccount = await storage.getStorageAccountByName(req.params.id) || 
                              await storage.getAllStorageAccounts().then(accounts => 
                                accounts.find(a => a.id === parseInt(req.params.id!))
                              );
        if (storageAccount && storageAccount.organizationId) {
          organizationId = storageAccount.organizationId;
        }
      }
      // For GET without ID: Query parameter is acceptable for filtering
      else if (httpMethod === 'GET' && req.query?.organizationId) {
        const orgId = parseInt(req.query.organizationId as string);
        if (!isNaN(orgId)) {
          organizationId = orgId;
        }
      }

      // If no specific organization, check across all user's organizations
      if (!organizationId) {
        const userOrganizations = await storage.getOrganizationsForUser(userEmail);
        let hasPermissionInAnyOrg = false;
        
        for (const org of userOrganizations) {
          const hasPermission = await storage.checkGranularStoragePermission(userEmail, action, org.id);
          if (hasPermission) {
            console.log(`✅ [STORAGE-PERM] Permission granted: ${userEmail} has "${action}" permission in org ${org.id}`);
            hasPermissionInAnyOrg = true;
            break;
          }
        }

        if (!hasPermissionInAnyOrg) {
          console.log(`🔒 [STORAGE-PERM] Permission denied: ${userEmail} lacks "${action}" permission in any organization`);
          return res.status(403).json({ 
            error: `Access denied: You do not have permission to ${action} storage accounts` 
          });
        }
      } else {
        // Check permission in specific organization
        console.log(`🔍 [STORAGE-PERM] Checking "${action}" permission for user: ${userEmail} in org ${organizationId}`);
        const hasPermission = await storage.checkGranularStoragePermission(userEmail, action, organizationId);
        if (!hasPermission) {
          console.log(`🔒 [STORAGE-PERM] Permission denied: ${userEmail} lacks "${action}" permission in org ${organizationId}`);
          return res.status(403).json({ 
            error: `Access denied: You do not have permission to ${action} storage accounts` 
          });
        }
        console.log(`✅ [STORAGE-PERM] Permission granted: ${userEmail} has "${action}" permission in org ${organizationId}`);
      }

      next();
    } catch (error) {
      console.error(`🔒 [STORAGE-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Data Protection permission middleware - Checks dataProtection permission
export async function dataProtectionPermissionRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const userEmail = (req as any).user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log(`🔍 [DATA-PROTECTION] Checking dataProtection permission for user: ${userEmail}`);

    // Get all user's roles across all organizations
    const userRolesList = await storage.getUserRolesByEmail(userEmail);
    if (userRolesList.length === 0) {
      console.log(`🔒 [DATA-PROTECTION] Access denied: ${userEmail} has no roles assigned`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have access to any organizations' 
      });
    }

    // Check if user has dataProtection permission in ANY of their enabled roles
    let hasPermission = false;
    for (const userRole of userRolesList) {
      // Only check enabled roles
      if (!userRole.isEnabled) {
        continue;
      }

      // Check the dataProtection permission using the actual role ID
      const rolePermissions = await storage.getUserRolePermissions(userEmail, userRole.roleId);
      if (rolePermissions?.storageMgmt?.dataProtection === true) {
        console.log(`✅ [DATA-PROTECTION] Permission granted: ${userEmail} has dataProtection permission via role ${userRole.role.name} (ID: ${userRole.roleId}) in org ${userRole.organizationId}`);
        hasPermission = true;
        break;
      }
    }

    if (!hasPermission) {
      console.log(`🔒 [DATA-PROTECTION] Permission denied: ${userEmail} lacks dataProtection permission`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have permission to manage data protection' 
      });
    }

    next();
  } catch (error) {
    console.error(`🔒 [DATA-PROTECTION] Permission check error:`, error);
    res.status(500).json({ error: 'Permission validation failed' });
  }
}

// 🔒 Data Lifecycle permission middleware - Checks dataLifecycle permission
export async function dataLifecyclePermissionRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const userEmail = (req as any).user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log(`🔍 [DATA-LIFECYCLE] Checking dataLifecycle permission for user: ${userEmail}`);

    // Get all user's roles across all organizations
    const userRolesList = await storage.getUserRolesByEmail(userEmail);
    if (userRolesList.length === 0) {
      console.log(`🔒 [DATA-LIFECYCLE] Access denied: ${userEmail} has no roles assigned`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have access to any organizations' 
      });
    }

    // Check if user has dataLifecycle permission in ANY of their enabled roles
    let hasPermission = false;
    for (const userRole of userRolesList) {
      // Only check enabled roles
      if (!userRole.isEnabled) {
        continue;
      }

      // Check the dataLifecycle permission using the actual role ID
      const rolePermissions = await storage.getUserRolePermissions(userEmail, userRole.roleId);
      if (rolePermissions?.storageMgmt?.dataLifecycle === true) {
        console.log(`✅ [DATA-LIFECYCLE] Permission granted: ${userEmail} has dataLifecycle permission via role ${userRole.role.name} (ID: ${userRole.roleId}) in org ${userRole.organizationId}`);
        hasPermission = true;
        break;
      }
    }

    if (!hasPermission) {
      console.log(`🔒 [DATA-LIFECYCLE] Permission denied: ${userEmail} lacks dataLifecycle permission`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have permission to manage data lifecycle' 
      });
    }

    next();
  } catch (error) {
    console.error(`🔒 [DATA-LIFECYCLE] Permission check error:`, error);
    res.status(500).json({ error: 'Permission validation failed' });
  }
}

// 🔒 Storage Container Access permission middleware - Checks if user has EITHER storageMgmt.view OR storageMgmt.dataLifecycle
// This middleware is used for endpoints that list or access storage containers
// It provides backward compatibility by accepting either permission type
export async function storageContainerAccessRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const userEmail = (req as any).user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log(`🔍 [STORAGE-CONTAINER-ACCESS] Checking storage container access for user: ${userEmail}`);

    // Get all user's roles across all organizations
    const userRolesList = await storage.getUserRolesByEmail(userEmail);
    if (userRolesList.length === 0) {
      console.log(`🔒 [STORAGE-CONTAINER-ACCESS] Access denied: ${userEmail} has no roles assigned`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have access to any organizations' 
      });
    }

    // Check if user has EITHER storageMgmt.view OR storageMgmt.dataLifecycle permission in ANY of their enabled roles
    let hasAccess = false;
    for (const userRole of userRolesList) {
      // Only check enabled roles
      if (!userRole.isEnabled) {
        continue;
      }

      // Check the permissions using the actual role ID
      const rolePermissions = await storage.getUserRolePermissions(userEmail, userRole.roleId);
      
      // User has access if they have EITHER view OR dataLifecycle permission
      if (rolePermissions?.storageMgmt?.view === true || 
          rolePermissions?.storageMgmt?.dataLifecycle === true) {
        console.log(`✅ [STORAGE-CONTAINER-ACCESS] Permission granted: ${userEmail} has storage container access via role ${userRole.role.name} (ID: ${userRole.roleId}) in org ${userRole.organizationId}`);
        hasAccess = true;
        break;
      }
    }

    if (!hasAccess) {
      console.log(`🔒 [STORAGE-CONTAINER-ACCESS] Permission denied: ${userEmail} lacks view or dataLifecycle permission`);
      return res.status(403).json({ 
        error: 'Access denied: You do not have permission to access storage containers' 
      });
    }

    next();
  } catch (error) {
    console.error(`🔒 [STORAGE-CONTAINER-ACCESS] Permission check error:`, error);
    res.status(500).json({ error: 'Permission validation failed' });
  }
}

// 🔒 Inventory permission middleware factory - Checks inventoryView or inventoryConfigure permissions
export function inventoryPermissionRequired(action: 'view' | 'configure') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log(`🔍 [INVENTORY-PERM] Checking "${action}" permission for user: ${userEmail}`);

      const userRolesList = await storage.getUserRolesByEmail(userEmail);
      if (!userRolesList || userRolesList.length === 0) {
        console.log(`🔒 [INVENTORY-PERM] Permission denied: ${userEmail} has no roles`);
        return res.status(403).json({ 
          error: 'Access denied: You do not have any roles assigned' 
        });
      }

      let hasPermission = false;
      for (const userRole of userRolesList) {
        if (!userRole.isEnabled) {
          console.log(`⏭️ [INVENTORY-PERM] Skipping disabled role: ${userRole.role.name}`);
          continue;
        }

        const rolePermissions = await storage.getUserRolePermissions(userEmail, userRole.roleId);
        const permKey = action === 'view' ? 'inventoryView' : 'inventoryConfigure';
        
        // Debug: Log the storage permissions being checked
        console.log(`🔍 [INVENTORY-PERM] Role "${userRole.role.name}" storageMgmt:`, JSON.stringify(rolePermissions?.storageMgmt));
        console.log(`🔍 [INVENTORY-PERM] Checking permKey="${permKey}", value=`, rolePermissions?.storageMgmt?.[permKey]);
        
        if (rolePermissions?.storageMgmt?.[permKey] === true) {
          console.log(`✅ [INVENTORY-PERM] Permission granted: ${userEmail} has "${action}" permission via role ${userRole.role.name}`);
          hasPermission = true;
          break;
        }
      }

      if (!hasPermission) {
        console.log(`🔒 [INVENTORY-PERM] Permission denied: ${userEmail} lacks "${action}" permission`);
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action === 'view' ? 'view' : 'configure'} blob inventory` 
        });
      }

      next();
    } catch (error) {
      console.error(`🔒 [INVENTORY-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 SFTP permission middleware factory - Checks sftpMgmt permission for various actions
export function sftpPermissionRequired(action: 'view' | 'create' | 'update' | 'disable' | 'delete' | 'mapUser' | 'viewSelfAccess' | 'rotateSshSelf' | 'rotatePasswordSelf') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log(`🔍 [SFTP-PERM] Checking "${action}" permission for user: ${userEmail}`);

      const hasPermission = await storage.checkUserSftpPermission(userEmail, action);
      if (!hasPermission) {
        console.log(`🔒 [SFTP-PERM] Permission denied: ${userEmail} lacks "${action}" permission`);
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action} SFTP local users` 
        });
      }

      console.log(`✅ [SFTP-PERM] Permission granted: ${userEmail} has "${action}" permission`);
      next();
    } catch (error) {
      console.error(`🔒 [SFTP-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Customer Onboarding permission check middleware
export function customerOnboardingPermissionRequired(action: 'view' | 'upload' | 'commit' | 'delete') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      console.log(`🔍 [ONBOARDING-PERM] Checking "${action}" permission for user: ${userEmail}`);

      const hasPermission = await storage.checkUserCustomerOnboardingPermission(userEmail, action);
      if (!hasPermission) {
        console.log(`🔒 [ONBOARDING-PERM] Permission denied: ${userEmail} lacks "${action}" permission`);
        return res.status(403).json({ 
          error: `Access denied: You do not have permission to ${action} customer onboarding` 
        });
      }

      console.log(`✅ [ONBOARDING-PERM] Permission granted: ${userEmail} has "${action}" permission`);
      next();
    } catch (error) {
      console.error(`🔒 [ONBOARDING-PERM] Permission check error for "${action}":`, error);
      res.status(500).json({ error: 'Permission validation failed' });
    }
  };
}

// 🔒 Admin role requirement middleware - DEPRECATED: Use specificPermissionRequired instead
// This middleware is kept for backward compatibility but should be replaced with permission-based checks
export function adminRoleRequired(req: Request, res: Response, next: NextFunction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = (req as any).user?.email;
      console.log(`🔍 [ADMIN] Permission-based admin check for user: ${userEmail}`);
      
      if (!userEmail) {
        console.log(`🔒 [ADMIN] No user email found in request`);
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Instead of checking hardcoded role names, check if user has any management permissions
      // This aligns with our database-driven permission system
      const managementPermissions = [
        'ORG_MANAGEMENT',
        'USER_MANAGEMENT', 
        'ROLE_MANAGEMENT',
        'STORAGE_MANAGEMENT'
      ];

      console.log(`🔍 [ADMIN] Checking for any management permissions: ${managementPermissions.join(', ')}`);
      
      let hasManagementAccess = false;
      for (const permission of managementPermissions) {
        const hasPermission = await storage.checkUserPermission(userEmail, permission);
        if (hasPermission) {
          console.log(`✅ [ADMIN] User has ${permission} permission`);
          hasManagementAccess = true;
          break;
        }
      }

      if (!hasManagementAccess) {
        console.log(`🔒 [ADMIN] Access denied - no management permissions for user: ${userEmail}`);
        return res.status(403).json({ 
          error: 'Access denied: Management privileges required' 
        });
      }

      console.log(`✅ [ADMIN] Management access granted for user: ${userEmail}`);
      next();
    } catch (error) {
      console.error('🔒 [MIDDLEWARE] Admin permission validation error:', error);
      res.status(500).json({ error: 'Admin access validation failed' });
    }
  };
}

// 🔒 Self-Scoped Email Validation Middleware
// Ensures users can only check their own email existence
// Prevents user enumeration attacks across the system
export function selfScopedEmailValidation(req: Request, res: Response, next: NextFunction) {
  try {
    const requestEmail = (req.query.email as string || "").toLowerCase().trim();
    const tokenEmail = (req.user?.email || (req as any).user?.preferred_username || "").toLowerCase().trim();
    
    // Both emails must be present
    if (!requestEmail || !tokenEmail) {
      console.warn(`[SELF-SCOPED-VALIDATION] Missing email information - request: ${requestEmail}, token: ${tokenEmail}`);
      return res.status(400).json({
        error: "Email validation failed",
        details: "Missing email in request or token"
      });
    }
    
    // Emails must match exactly (case-insensitive comparison already done)
    if (requestEmail !== tokenEmail) {
      console.warn(`[SELF-SCOPED-VALIDATION] User ${tokenEmail} attempted to check email ${requestEmail}`);
      return res.status(403).json({
        error: "Forbidden",
        details: "You can only check your own email existence"
      });
    }
    
    // Validation passed - proceed to endpoint
    next();
  } catch (error) {
    console.error("Self-scoped email validation error:", error);
    res.status(500).json({ error: "Validation error" });
  }
}

/**
 * DEPRECATED: Legacy Help Center permission middleware (ID-based)
 * 
 * This middleware has been replaced by slug-based permission checking
 * in server/routes/help.ts using the checkChapterPermission middleware.
 * 
 * The new implementation uses slugs instead of chapter IDs to avoid
 * ID conflicts between user guide and troubleshooting chapters.
 * 
 * This code is retained for reference only and should not be used.
 */