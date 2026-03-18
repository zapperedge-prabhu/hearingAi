import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/ui/spinner";
import { Plus, Edit, Trash2, Users, Settings, Building, Database, File, Activity, Bot, Loader2, Lock, AlertCircle, BookOpen, Shield, Cpu, FileText, Scan, Languages, Key, Server, ClipboardCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useRolePermissions } from "@/hooks/use-role-permissions";

interface Role {
  id: number;
  name: string;
  description?: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

interface ModulePermissions {
  userManagement: {
    add: boolean;
    edit: boolean;
    delete: boolean;
    view: boolean;
    enableDisable: boolean;
  };
  roleManagement: {
    add: boolean;
    edit: boolean;
    delete: boolean;
    view: boolean;
  };
  organizations: {
    add: boolean;
    edit: boolean;
    delete: boolean;
    view: boolean;
  };
  storage: {
    addStorageContainer: boolean;
    addContainer: boolean;
    view: boolean;
    delete: boolean;
    dataProtection: boolean;
    dataLifecycle: boolean;
    inventoryView: boolean;
    inventoryConfigure: boolean;
  };
  files: {
    uploadFile: boolean;
    uploadFolder: boolean;
    downloadFile: boolean;
    downloadFolder: boolean;
    viewFiles: boolean;
    createFolder: boolean;
    deleteFilesAndFolders: boolean;
    searchFiles: boolean;
    renameFile: boolean;
    rehydrate: boolean;
    [key: string]: boolean;
  };
  activityLogs: {
    view: boolean;
  };
  aiAgentMgmt: {
    add: boolean;
    edit: boolean;
    delete: boolean;
    view: boolean;
  };
  pgpKeyMgmt: {
    view: boolean;
    generate: boolean;
    delete: boolean;
    copy: boolean;
    decrypt: boolean;
  };
  siemManagement: {
    install: boolean;
    delete: boolean;
    enableDisable: boolean;
    view: boolean;
    incidentsView: boolean;
  };
  foundryMgmt: {
    add: boolean;
    edit: boolean;
    delete: boolean;
    view: boolean;
    tabWizard: boolean;
    tabResources: boolean;
    tabFoundryAction: boolean;
    tabChatPlayground: boolean;
    tabResourceSets: boolean;
    tabContentUnderstanding: boolean;
  };
  contentUnderstanding: {
    view: boolean;
    runAnalysis: boolean;
    saveAnalysis: boolean;
    deleteAnalysis: boolean;
    menuVisibility: boolean;
  };
  eval: {
    view: boolean;
    run: boolean;
    review: boolean;
    finalize: boolean;
    menuVisibility: boolean;
  };
  documentTranslation: {
    view: boolean;
    runTranslation: boolean;
    deleteTranslation: boolean;
  };
  sftpMgmt: {
    view: boolean;
    create: boolean;
    update: boolean;
    disable: boolean;
    delete: boolean;
    mapUser: boolean;
    viewSelfAccess: boolean;
    rotateSshSelf: boolean;
    rotatePasswordSelf: boolean;
  };
  customerOnboarding: {
    view: boolean;
    upload: boolean;
    commit: boolean;
    delete: boolean;
  };
  transferReports: {
    view: boolean;
    viewDetails: boolean;
    download: boolean;
  };
  helpCenter: {
    chapterWiseHelp: Record<string, boolean>;
    api: Record<string, boolean>;
    envVariable: Record<string, boolean>;
    troubleshooting: Record<string, boolean>;
  };
}

interface OldModulePermissions {
  userManagement: {
    add: boolean;
    edit: boolean;
    delete: boolean;
    view: boolean;
    none: boolean;
  };
  roleManagement: {
    add: boolean;
    edit: boolean;
    delete: boolean;
    view: boolean;
    none: boolean;
  };
  organization: {
    add: boolean;
    edit: boolean;
    delete: boolean;
    view: boolean;
    none: boolean;
  };
  storageManagement: {
    addStorageContainer: boolean;
    addContainer: boolean;
    view: boolean;
    delete: boolean;
    none: boolean;
  };
  fileManagement: {
    uploadFile: boolean;
    uploadFolder: boolean;
    downloadFile: boolean;
    downloadFolder: boolean;
    viewFiles: boolean;
    createFolder: boolean;
    deleteFilesAndFolders: boolean;
    searchFiles: boolean;
    renameFile: boolean;
    rehydrate: boolean;
    none: boolean;
  };
  activityLogs: {
    view: boolean;
    none: boolean;
  };
}

interface RoleWithPermissions extends Role {
  permissions: ModulePermissions;
}

export default function RolesPermissions() {
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithPermissions | null>(null);
  const [deletingRoleId, setDeletingRoleId] = useState<number | null>(null);
  const [loadingRoleId, setLoadingRoleId] = useState<number | null>(null);
  
  // Get current user's role permissions
  const { data: rolePermissions, isLoading: permissionsLoading } = useRolePermissions();

  // Check if user has role management permissions (from any role)
  const hasViewPermission = Boolean(rolePermissions?.roleMgmt?.view);
  const hasAddPermission = Boolean(rolePermissions?.roleMgmt?.add);
  const hasEditPermission = Boolean(rolePermissions?.roleMgmt?.edit);
  const hasDeletePermission = Boolean(rolePermissions?.roleMgmt?.delete);
  const hasAnyPermission = hasViewPermission || hasAddPermission || hasEditPermission || hasDeletePermission;
  const [newRole, setNewRole] = useState({ name: "", description: "" });
  const [permissions, setPermissions] = useState<ModulePermissions>({
    userManagement: { add: false, edit: false, delete: false, view: false, enableDisable: false },
    roleManagement: { add: false, edit: false, delete: false, view: false },
    organizations: { add: false, edit: false, delete: false, view: false },
    storage: { addStorageContainer: false, addContainer: false, view: false, delete: false, dataProtection: false, dataLifecycle: false, inventoryView: false, inventoryConfigure: false },
    files: { 
      uploadFile: false, 
      uploadFolder: false, 
      downloadFile: false, 
      downloadFolder: false, 
      viewFiles: false, 
      createFolder: false, 
      deleteFilesAndFolders: false,
      searchFiles: false,
      renameFile: false,
      rehydrate: false
    },
    activityLogs: { view: false },
    aiAgentMgmt: { add: false, edit: false, delete: false, view: false },
    pgpKeyMgmt: { view: false, generate: false, delete: false, copy: false, decrypt: false },
    siemManagement: { install: false, delete: false, enableDisable: false, view: false, incidentsView: false },
    foundryMgmt: { add: false, edit: false, delete: false, view: false, tabWizard: false, tabResources: false, tabFoundryAction: false, tabChatPlayground: false, tabResourceSets: false, tabContentUnderstanding: false },
    contentUnderstanding: { view: false, runAnalysis: false, saveAnalysis: false, deleteAnalysis: false, menuVisibility: false },
    eval: { view: false, run: false, review: false, finalize: false, menuVisibility: false },
    documentTranslation: { view: false, runTranslation: false, deleteTranslation: false },
    sftpMgmt: { view: false, create: false, update: false, disable: false, delete: false, mapUser: false, viewSelfAccess: false, rotateSshSelf: false, rotatePasswordSelf: false },
    customerOnboarding: { view: false, upload: false, commit: false, delete: false },
    transferReports: { view: false, viewDetails: false, download: false },
    helpCenter: {
      chapterWiseHelp: {},
      api: {},
      envVariable: {},
      troubleshooting: {}
    }
  });
  const [editPermissions, setEditPermissions] = useState<ModulePermissions>({
    userManagement: { add: false, edit: false, delete: false, view: false, enableDisable: false },
    roleManagement: { add: false, edit: false, delete: false, view: false },
    organizations: { add: false, edit: false, delete: false, view: false },
    storage: { addStorageContainer: false, addContainer: false, view: false, delete: false, dataProtection: false, dataLifecycle: false, inventoryView: false, inventoryConfigure: false },
    files: { 
      uploadFile: false, 
      uploadFolder: false, 
      downloadFile: false, 
      downloadFolder: false, 
      viewFiles: false, 
      createFolder: false, 
      deleteFilesAndFolders: false,
      searchFiles: false,
      renameFile: false,
      rehydrate: false
    },
    activityLogs: { view: false },
    aiAgentMgmt: { add: false, edit: false, delete: false, view: false },
    pgpKeyMgmt: { view: false, generate: false, delete: false, copy: false, decrypt: false },
    siemManagement: { install: false, delete: false, enableDisable: false, view: false, incidentsView: false },
    foundryMgmt: { add: false, edit: false, delete: false, view: false, tabWizard: false, tabResources: false, tabFoundryAction: false, tabChatPlayground: false, tabResourceSets: false, tabContentUnderstanding: false },
    contentUnderstanding: { view: false, runAnalysis: false, saveAnalysis: false, deleteAnalysis: false, menuVisibility: false },
    eval: { view: false, run: false, review: false, finalize: false, menuVisibility: false },
    documentTranslation: { view: false, runTranslation: false, deleteTranslation: false },
    sftpMgmt: { view: false, create: false, update: false, disable: false, delete: false, mapUser: false, viewSelfAccess: false, rotateSshSelf: false, rotatePasswordSelf: false },
    customerOnboarding: { view: false, upload: false, commit: false, delete: false },
    transferReports: { view: false, viewDetails: false, download: false },
    helpCenter: {
      chapterWiseHelp: {},
      api: {},
      envVariable: {},
      troubleshooting: {}
    }
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const getRoleBadgeColor = (roleName: string, roleCategory?: string) => {
    // Priority 1: Use explicit category if available
    const normalizedCategory = roleCategory?.toLowerCase().trim();
    if (normalizedCategory === 'dangerous') {
      return 'bg-[#DC2626] text-white hover:bg-[#B91C1C] border-[#B91C1C] shadow-[0_2px_4px_rgba(220,38,38,0.4)] ring-1 ring-red-400/50 font-bold';
    }
    if (normalizedCategory === 'critical') {
      return 'bg-[#EA580C] text-white hover:bg-[#C2410C] border-[#C2410C] shadow-sm';
    }
    if (normalizedCategory === 'warning') {
      return 'bg-[#CA8A04] text-white hover:bg-[#A16207] border-[#A16207] shadow-sm';
    }
    if (normalizedCategory === 'info') {
      return 'bg-[#2563EB] text-white hover:bg-[#1D4ED8] border-[#1D4ED8] shadow-sm';
    }

    // Priority 2: Hardcoded fallback for Super Admin only if category is missing
    if (roleName.trim().toLowerCase() === 'super admin') {
      return 'bg-[#DC2626] text-white hover:bg-[#B91C1C] border-[#B91C1C] shadow-[0_2px_4px_rgba(220,38,38,0.4)] ring-1 ring-red-400/50 font-bold';
    }
    
    switch (roleName.toLowerCase()) {
      case 'org admin':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'compliance auditor':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'file uploader':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'file viewer':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
      case 'ai analyst':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const { data: roles, isLoading } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  // Reset functions for form cleanup
  const resetAddRoleForm = () => {
    setNewRole({ name: "", description: "" });
    setPermissions({
      userManagement: { add: false, edit: false, delete: false, view: false, enableDisable: false },
      roleManagement: { add: false, edit: false, delete: false, view: false },
      organizations: { add: false, edit: false, delete: false, view: false },
      storage: { addStorageContainer: false, addContainer: false, view: false, delete: false, dataProtection: false, dataLifecycle: false, inventoryView: false, inventoryConfigure: false },
      files: { 
        uploadFile: false, 
        uploadFolder: false, 
        downloadFile: false, 
        downloadFolder: false, 
        viewFiles: false, 
        createFolder: false, 
        deleteFilesAndFolders: false,
        searchFiles: false,
        renameFile: false,
        rehydrate: false
      },
      activityLogs: { view: false },
      aiAgentMgmt: { add: false, edit: false, delete: false, view: false },
      pgpKeyMgmt: { view: false, generate: false, delete: false, copy: false, decrypt: false },
      siemManagement: { install: false, delete: false, enableDisable: false, view: false, incidentsView: false },
      foundryMgmt: { add: false, edit: false, delete: false, view: false, tabWizard: false, tabResources: false, tabFoundryAction: false, tabChatPlayground: false, tabResourceSets: false, tabContentUnderstanding: false },
      contentUnderstanding: { view: false, runAnalysis: false, saveAnalysis: false, deleteAnalysis: false, menuVisibility: false },
      eval: { view: false, run: false, review: false, finalize: false, menuVisibility: false },
      documentTranslation: { view: false, runTranslation: false, deleteTranslation: false },
      sftpMgmt: { view: false, create: false, update: false, disable: false, delete: false, mapUser: false, viewSelfAccess: false, rotateSshSelf: false, rotatePasswordSelf: false },
      customerOnboarding: { view: false, upload: false, commit: false, delete: false },
      transferReports: { view: false, viewDetails: false, download: false },
      helpCenter: {
        chapterWiseHelp: {},
        api: {},
        envVariable: {},
        troubleshooting: {}
      }
    });
  };

  const resetEditRoleForm = () => {
    setEditingRole(null);
    setEditPermissions({
      userManagement: { add: false, edit: false, delete: false, view: false, enableDisable: false },
      roleManagement: { add: false, edit: false, delete: false, view: false },
      organizations: { add: false, edit: false, delete: false, view: false },
      storage: { addStorageContainer: false, addContainer: false, view: false, delete: false, dataProtection: false, dataLifecycle: false, inventoryView: false, inventoryConfigure: false },
      files: { 
        uploadFile: false, 
        uploadFolder: false, 
        downloadFile: false, 
        downloadFolder: false, 
        viewFiles: false, 
        createFolder: false, 
        deleteFilesAndFolders: false,
        searchFiles: false,
        renameFile: false,
        rehydrate: false
      },
      activityLogs: { view: false },
      aiAgentMgmt: { add: false, edit: false, delete: false, view: false },
      pgpKeyMgmt: { view: false, generate: false, delete: false, copy: false, decrypt: false },
      siemManagement: { install: false, delete: false, enableDisable: false, view: false, incidentsView: false },
      foundryMgmt: { add: false, edit: false, delete: false, view: false, tabWizard: false, tabResources: false, tabFoundryAction: false, tabChatPlayground: false, tabResourceSets: false, tabContentUnderstanding: false },
      contentUnderstanding: { view: false, runAnalysis: false, saveAnalysis: false, deleteAnalysis: false, menuVisibility: false },
      eval: { view: false, run: false, review: false, finalize: false, menuVisibility: false },
      documentTranslation: { view: false, runTranslation: false, deleteTranslation: false },
      sftpMgmt: { view: false, create: false, update: false, disable: false, delete: false, mapUser: false, viewSelfAccess: false, rotateSshSelf: false, rotatePasswordSelf: false },
      customerOnboarding: { view: false, upload: false, commit: false, delete: false },
      transferReports: { view: false, viewDetails: false, download: false },
      helpCenter: {
        chapterWiseHelp: {},
        api: {},
        envVariable: {},
        troubleshooting: {}
      }
    });
  };

  // Handlers for dialog open/close with form reset
  const handleAddRoleDialogChange = (open: boolean) => {
    setIsAddRoleOpen(open);
    if (!open) {
      resetAddRoleForm();
    }
  };

  const handleEditRoleDialogChange = (open: boolean) => {
    setIsEditRoleOpen(open);
    if (!open) {
      resetEditRoleForm();
    }
  };

  const createRoleMutation = useMutation({
    mutationFn: async (roleData: { name: string; description: string; permissions: ModulePermissions }) => {
      return await apiRequest("POST", "/api/roles", roleData);
    },
    onSuccess: () => {
      // Invalidate role queries for immediate UI update
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({ title: "Success", description: "Role created successfully" });
      setIsAddRoleOpen(false);
      resetAddRoleForm();
    },
    onError: (error: any) => {
      let errorMessage = "Failed to create role";
      
      // Parse error message to extract user-friendly text
      if (error.message) {
        try {
          // Check if error.message contains JSON
          const jsonMatch = error.message.match(/\{.*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.error || parsed.message || errorMessage;
          } else {
            errorMessage = error.message;
          }
        } catch {
          errorMessage = error.message;
        }
      }
      
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });



  const handlePermissionChange = (module: keyof ModulePermissions, permission: string, value: boolean, isEdit = false) => {
    if (isEdit) {
      setEditPermissions(prev => ({
        ...prev,
        [module]: {
          ...prev[module],
          [permission]: value
        }
      }));
    } else {
      setPermissions(prev => ({
        ...prev,
        [module]: {
          ...prev[module],
          [permission]: value
        }
      }));
    }
  };

  const updatePermission = (module: keyof ModulePermissions, permission: string, checked: boolean | string, isEdit = false) => {
    handlePermissionChange(module, permission, checked === true || checked === "true", isEdit);
  };

  // Helper function to check if any core permission is selected (excludes pgpKeyMgmt and helpCenter)
  const hasAnyCorePermissionSelected = (perms: ModulePermissions): boolean => {
    const coreModules = ['userManagement', 'roleManagement', 'organizations', 'storage', 'files', 'activityLogs', 'aiAgentMgmt'] as const;
    for (const module of coreModules) {
      const modulePerms = perms[module];
      if (modulePerms && Object.values(modulePerms).some(value => value === true)) {
        return true;
      }
    }
    return false;
  };

  const handleCreateRole = () => {
    const trimmedName = newRole.name.trim();
    
    if (!trimmedName) {
      toast({ title: "Error", description: "Role name is required", variant: "destructive" });
      return;
    }
    
    if (trimmedName.length < 3) {
      toast({ title: "Error", description: "Role name must be at least 3 characters", variant: "destructive" });
      return;
    }
    
    if (trimmedName.length > 64) {
      toast({ title: "Error", description: "Role name must not exceed 64 characters", variant: "destructive" });
      return;
    }
    
    // Validate that at least one file management permission is selected
    const hasFilePermission = Object.values(permissions.files).some(value => value === true);
    if (!hasFilePermission) {
      toast({ 
        title: "Error", 
        description: "At least one file management permission must be selected", 
        variant: "destructive" 
      });
      return;
    }
    
    createRoleMutation.mutate({
      name: trimmedName,
      description: newRole.description,
      permissions
    });
  };

  const handleEditRole = async (role: Role) => {
    try {
      // Show loading state
      setLoadingRoleId(role.id);
      
      // Fetch role with permissions from the API using proper authentication
      const response = await apiRequest("GET", `/api/roles/${role.id}`);
      const roleData = await response.json();
      
      // Default permissions structure
      const defaultPermissions = {
        userManagement: { add: false, edit: false, delete: false, view: false, enableDisable: false },
        roleManagement: { add: false, edit: false, delete: false, view: false },
        organizations: { add: false, edit: false, delete: false, view: false },
        storage: { addStorageContainer: false, addContainer: false, view: false, delete: false, dataProtection: false, dataLifecycle: false, inventoryView: false, inventoryConfigure: false },
        files: { 
          uploadFile: false, 
          uploadFolder: false, 
          downloadFile: false, 
          downloadFolder: false, 
          viewFiles: false, 
          createFolder: false, 
          deleteFilesAndFolders: false,
          searchFiles: false,
          renameFile: false,
          rehydrate: false
        },
        activityLogs: { view: false },
        aiAgentMgmt: { add: false, edit: false, delete: false, view: false },
        pgpKeyMgmt: { view: false, generate: false, delete: false, copy: false, decrypt: false },
        siemManagement: { install: false, delete: false, enableDisable: false, view: false, incidentsView: false },
        foundryMgmt: { add: false, edit: false, delete: false, view: false, tabWizard: false, tabResources: false, tabFoundryAction: false, tabChatPlayground: false, tabResourceSets: false, tabContentUnderstanding: false },
        contentUnderstanding: { view: false, runAnalysis: false, saveAnalysis: false, deleteAnalysis: false, menuVisibility: false },
        eval: { view: false, run: false, review: false, finalize: false, menuVisibility: false },
        documentTranslation: { view: false, runTranslation: false, deleteTranslation: false },
        sftpMgmt: { view: false, create: false, update: false, disable: false, delete: false, mapUser: false, viewSelfAccess: false, rotateSshSelf: false, rotatePasswordSelf: false },
        customerOnboarding: { view: false, upload: false, commit: false, delete: false },
        transferReports: { view: false, viewDetails: false, download: false },
        helpCenter: {
          chapterWiseHelp: {},
          api: {},
          envVariable: {},
          troubleshooting: {}
        }
      };
      
      // Deep merge permissions: spread defaults first, then overlay API data for each module
      const apiPermissions = roleData.permissions || {};
      const mergedPermissions: ModulePermissions = {
        userManagement: { ...defaultPermissions.userManagement, ...apiPermissions.userManagement },
        roleManagement: { ...defaultPermissions.roleManagement, ...apiPermissions.roleManagement },
        organizations: { ...defaultPermissions.organizations, ...apiPermissions.organizations },
        storage: { ...defaultPermissions.storage, ...apiPermissions.storage },
        files: { ...defaultPermissions.files, ...apiPermissions.files },
        activityLogs: { ...defaultPermissions.activityLogs, ...apiPermissions.activityLogs },
        aiAgentMgmt: { ...defaultPermissions.aiAgentMgmt, ...apiPermissions.aiAgentMgmt },
        pgpKeyMgmt: { ...defaultPermissions.pgpKeyMgmt, ...apiPermissions.pgpKeyMgmt },
        sftpMgmt: { ...defaultPermissions.sftpMgmt, ...apiPermissions.sftpMgmt },
        customerOnboarding: { ...defaultPermissions.customerOnboarding, ...apiPermissions.customerOnboarding },
        transferReports: { ...defaultPermissions.transferReports, ...apiPermissions.transferReports },
        siemManagement: { ...defaultPermissions.siemManagement, ...apiPermissions.siemMgmt },
        foundryMgmt: { ...defaultPermissions.foundryMgmt, ...apiPermissions.foundryMgmt },
        contentUnderstanding: { ...defaultPermissions.contentUnderstanding, ...apiPermissions.contentUnderstanding },
        eval: { ...defaultPermissions.eval, ...apiPermissions.eval },
        documentTranslation: { ...defaultPermissions.documentTranslation, ...apiPermissions.documentTranslation },
        helpCenter: { ...defaultPermissions.helpCenter, ...apiPermissions.helpCenter }
      };
      
      // Convert the API response to the expected format
      const roleWithPermissions: RoleWithPermissions = {
        id: roleData.id,
        name: roleData.name,
        description: roleData.description,
        category: roleData.category,
        createdAt: roleData.createdAt,
        updatedAt: roleData.updatedAt,
        permissions: mergedPermissions
      };
      
      // Set the edit permissions state with the merged permissions
      setEditPermissions(mergedPermissions);
      setEditingRole(roleWithPermissions);
      setIsEditRoleOpen(true);
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to load role details", variant: "destructive" });
    } finally {
      // Clear loading state
      setLoadingRoleId(null);
    }
  }

  const updateRoleMutation = useMutation({
    mutationFn: async (roleData: { id: number; name: string; description?: string; permissions: ModulePermissions }) => {
      return await apiRequest("PUT", `/api/roles/${roleData.id}`, roleData);
    },
    onSuccess: (_, variables) => {
      // Invalidate all role-related queries for immediate UI update
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-role-permissions"] });
      setIsEditRoleOpen(false);
      resetEditRoleForm();
      toast({ title: "Success", description: "Role updated successfully" });
    },
    onError: (error: any) => {
      let errorMessage = "Failed to update role";
      
      // Parse error message to extract user-friendly text
      if (error.message) {
        try {
          const jsonMatch = error.message.match(/\{.*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.error || parsed.message || errorMessage;
          } else {
            errorMessage = error.message;
          }
        } catch {
          errorMessage = error.message;
        }
      }
      
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: number) => {
      return await apiRequest("DELETE", `/api/roles/${roleId}`);
    },
    onSuccess: (_, roleId) => {
      // Invalidate all role-related queries for immediate UI update
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles", roleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-role-permissions"] });
      setDeletingRoleId(null);
      toast({ title: "Success", description: "Role deleted successfully" });
    },
    onError: (error: any) => {
      setDeletingRoleId(null);
      
      let errorMessage = "Failed to delete role";
      
      // Parse error message to extract user-friendly text
      if (error.message) {
        try {
          const jsonMatch = error.message.match(/\{.*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.error || parsed.message || errorMessage;
          } else {
            errorMessage = error.message;
          }
        } catch {
          errorMessage = error.message;
        }
      }
      
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });

  const handleUpdateRole = () => {
    if (!editingRole) {
      return;
    }
    
    const trimmedName = editingRole.name.trim();
    
    if (!trimmedName) {
      toast({ title: "Error", description: "Role name is required", variant: "destructive" });
      return;
    }
    
    if (trimmedName.length < 3) {
      toast({ title: "Error", description: "Role name must be at least 3 characters", variant: "destructive" });
      return;
    }
    
    if (trimmedName.length > 64) {
      toast({ title: "Error", description: "Role name must not exceed 64 characters", variant: "destructive" });
      return;
    }
    
    // Validate that at least one file management permission is selected
    const hasFilePermission = Object.values(editingRole.permissions.files).some(value => value === true);
    if (!hasFilePermission) {
      toast({ 
        title: "Error", 
        description: "At least one file management permission must be selected", 
        variant: "destructive" 
      });
      return;
    }
    
    updateRoleMutation.mutate({
      id: editingRole.id,
      name: trimmedName,
      description: editingRole.description,
      permissions: editingRole.permissions
    });
  };

  const handleDeleteRole = (role: Role) => {
    if (confirm(`Are you sure you want to delete the role "${role.name}"?`)) {
      setDeletingRoleId(role.id);
      deleteRoleMutation.mutate(role.id);
    }
  };



  // Show loading while permissions are being fetched
  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Show access denied if user has no role management permissions
  if (!hasAnyPermission) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Roles & Permissions</h1>
            <p className="text-muted-foreground">Manage system roles and their module-specific permissions</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Lock className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">Access Denied</h3>
              <p className="text-muted-foreground max-w-md">
                You don't have permission to access role management. Please contact your administrator to request access.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold">Roles & Permissions</h1>
          <p className="text-muted-foreground">Manage system roles and their module-specific permissions</p>
        </div>
        <LoadingSpinner message="Loading roles and permissions..." size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Roles & Permissions</h1>
          <p className="text-muted-foreground">Manage system roles and their module-specific permissions</p>
        </div>
        {/* Show Add Role button only if current user has add permission in role management */}
        {hasAddPermission && (
          <Dialog open={isAddRoleOpen} onOpenChange={handleAddRoleDialogChange}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Role
              </Button>
            </DialogTrigger>
          <DialogContent 
            className="max-w-4xl max-h-[90vh] overflow-y-auto"
            showClose={!createRoleMutation.isPending}
            onPointerDownOutside={(e) => {
              e.preventDefault();
              toast({
                title: "Dialog Protection",
                description: createRoleMutation.isPending
                  ? "Please wait for the role creation to complete. You cannot close this window during creation."
                  : "Please use the X button to close this dialog to avoid losing your work.",
                variant: "default",
              });
            }}
            onEscapeKeyDown={(e) => {
              e.preventDefault();
              toast({
                title: "Dialog Protection",
                description: createRoleMutation.isPending
                  ? "Please wait for the role creation to complete. You cannot close this window during creation."
                  : "Please use the X button to close this dialog to avoid losing your work.",
                variant: "default",
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Create New Role</DialogTitle>
              <DialogDescription>
                Define a new role with specific permissions for each module
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Role Details */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="role-name">Role Name</Label>
                  <Input
                    id="role-name"
                    value={newRole.name}
                    onChange={(e) => setNewRole(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Organization Admin"
                    maxLength={64}
                    data-testid="input-role-name"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {newRole.name.trim().length}/64 characters (minimum 3)
                  </div>
                </div>
                <div>
                  <Label htmlFor="role-description">Description</Label>
                  <Textarea
                    id="role-description"
                    value={newRole.description}
                    maxLength={140}
                    onChange={(e) => setNewRole(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what this role can do... (max 140 characters)"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {newRole.description.length}/140 characters
                  </div>
                </div>
              </div>

              {/* Permissions */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Module Permissions</h3>
                <Tabs defaultValue="user-management" className="w-full" orientation="vertical">
                  <div className="flex gap-4">
                    {/* Sidebar Navigation */}
                    <TabsList className="flex flex-col h-auto w-48 shrink-0 bg-muted/50 p-2 rounded-lg">
                      <TabsTrigger value="user-management" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Users className="w-4 h-4 shrink-0" />
                        Users
                      </TabsTrigger>
                      <TabsTrigger value="role-management" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Settings className="w-4 h-4 shrink-0" />
                        Roles
                      </TabsTrigger>
                      <TabsTrigger value="organization" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Building className="w-4 h-4 shrink-0" />
                        Organisation
                      </TabsTrigger>
                      <TabsTrigger value="storage" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Database className="w-4 h-4 shrink-0" />
                        Storage
                      </TabsTrigger>
                      <TabsTrigger value="files" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <File className="w-4 h-4 shrink-0" />
                        File Management
                      </TabsTrigger>
                      <TabsTrigger value="ai-agents" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Bot className="w-4 h-4 shrink-0" />
                        AI Agents
                      </TabsTrigger>
                      {hasAnyCorePermissionSelected(permissions) && (
                        <TabsTrigger value="pgp-key-mgmt" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                          <Lock className="w-4 h-4 shrink-0" />
                          PGP Keys
                        </TabsTrigger>
                      )}
                      <TabsTrigger value="siem-rules" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Shield className="w-4 h-4 shrink-0" />
                        SIEM Rules
                      </TabsTrigger>
                      <TabsTrigger value="foundry-ai" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Cpu className="w-4 h-4 shrink-0" />
                        Foundry AI
                      </TabsTrigger>
                      <TabsTrigger value="content-understanding" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Scan className="w-4 h-4 shrink-0" />
                        Content Understanding
                      </TabsTrigger>
                      <TabsTrigger value="document-translation" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Languages className="w-4 h-4 shrink-0" />
                        Document Translation
                      </TabsTrigger>
                      <TabsTrigger value="eval" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <ClipboardCheck className="w-4 h-4 shrink-0" />
                        Eval
                      </TabsTrigger>
                      <TabsTrigger value="sftp-mgmt" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Server className="w-4 h-4 shrink-0" />
                        SFTP Management
                      </TabsTrigger>
                      <TabsTrigger value="customer-onboarding" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Users className="w-4 h-4 shrink-0" />
                        Customer Onboarding
                      </TabsTrigger>
                      <TabsTrigger value="transfer-reports" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <FileText className="w-4 h-4 shrink-0" />
                        Transfer Reports
                      </TabsTrigger>
                      <TabsTrigger value="logs" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Activity className="w-4 h-4 shrink-0" />
                        Logs
                      </TabsTrigger>
                      <TabsTrigger value="help-center" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <BookOpen className="w-4 h-4 shrink-0" />
                        Help Center
                      </TabsTrigger>
                    </TabsList>
                    
                    {/* Content Area */}
                    <div className="flex-1 min-w-0">

                  <TabsContent value="user-management">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <Users className="w-5 h-5" />
                          <CardTitle className="text-lg">User Management</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="userManagement-add"
                              checked={permissions.userManagement?.add || false}
                              onCheckedChange={(checked) => updatePermission("userManagement", "add", checked)}
                            />
                            <Label htmlFor="userManagement-add" className="text-sm">Add Users</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="userManagement-edit"
                              checked={permissions.userManagement?.edit || false}
                              onCheckedChange={(checked) => updatePermission("userManagement", "edit", checked)}
                            />
                            <Label htmlFor="userManagement-edit" className="text-sm">Edit Users</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="userManagement-delete"
                              checked={permissions.userManagement?.delete || false}
                              onCheckedChange={(checked) => updatePermission("userManagement", "delete", checked)}
                            />
                            <Label htmlFor="userManagement-delete" className="text-sm">Delete Users</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="userManagement-view"
                              checked={permissions.userManagement?.view || false}
                              onCheckedChange={(checked) => updatePermission("userManagement", "view", checked)}
                            />
                            <Label htmlFor="userManagement-view" className="text-sm">View Users</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="userManagement-enableDisable"
                              checked={permissions.userManagement?.enableDisable || false}
                              onCheckedChange={(checked) => updatePermission("userManagement", "enableDisable", checked)}
                            />
                            <Label htmlFor="userManagement-enableDisable" className="text-sm">Enable/Disable Users</Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="role-management">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <Settings className="w-5 h-5" />
                          <CardTitle className="text-lg">Role Management</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="roleManagement-add"
                              checked={permissions.roleManagement?.add || false}
                              onCheckedChange={(checked) => updatePermission("roleManagement", "add", checked)}
                            />
                            <Label htmlFor="roleManagement-add" className="text-sm">Add Roles</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="roleManagement-edit"
                              checked={permissions.roleManagement?.edit || false}
                              onCheckedChange={(checked) => updatePermission("roleManagement", "edit", checked)}
                            />
                            <Label htmlFor="roleManagement-edit" className="text-sm">Edit Roles</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="roleManagement-delete"
                              checked={permissions.roleManagement?.delete || false}
                              onCheckedChange={(checked) => updatePermission("roleManagement", "delete", checked)}
                            />
                            <Label htmlFor="roleManagement-delete" className="text-sm">Delete Roles</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="roleManagement-view"
                              checked={permissions.roleManagement?.view || false}
                              onCheckedChange={(checked) => updatePermission("roleManagement", "view", checked)}
                            />
                            <Label htmlFor="roleManagement-view" className="text-sm">View Roles</Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="organization">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <Building className="w-5 h-5" />
                          <CardTitle className="text-lg">Partner Organization Management</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="organizations-add"
                              checked={permissions.organizations?.add || false}
                              onCheckedChange={(checked) => updatePermission("organizations", "add", checked)}
                            />
                            <Label htmlFor="organizations-add" className="text-sm">Add Partner Organizations</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="organizations-edit"
                              checked={permissions.organizations?.edit || false}
                              onCheckedChange={(checked) => updatePermission("organizations", "edit", checked)}
                            />
                            <Label htmlFor="organizations-edit" className="text-sm">Edit Partner Organizations</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="organizations-delete"
                              checked={permissions.organizations?.delete || false}
                              onCheckedChange={(checked) => updatePermission("organizations", "delete", checked)}
                            />
                            <Label htmlFor="organizations-delete" className="text-sm">Delete Partner Organizations</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="organizations-view"
                              checked={permissions.organizations?.view || false}
                              onCheckedChange={(checked) => updatePermission("organizations", "view", checked)}
                            />
                            <Label htmlFor="organizations-view" className="text-sm">View Partner Organizations</Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="storage">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <Database className="w-5 h-5" />
                          <CardTitle className="text-lg">Storage Management</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="storage-addStorageContainer"
                              checked={permissions.storage?.addStorageContainer || false}
                              onCheckedChange={(checked) => updatePermission("storage", "addStorageContainer", checked)}
                            />
                            <Label htmlFor="storage-addStorageContainer" className="text-sm">Add Storage Account</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="storage-addContainer"
                              checked={permissions.storage?.addContainer || false}
                              onCheckedChange={(checked) => updatePermission("storage", "addContainer", checked)}
                            />
                            <Label htmlFor="storage-addContainer" className="text-sm">Add Container</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="storage-view"
                              checked={permissions.storage?.view || false}
                              onCheckedChange={(checked) => updatePermission("storage", "view", checked)}
                            />
                            <Label htmlFor="storage-view" className="text-sm">View Storage</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="storage-delete"
                              checked={permissions.storage?.delete || false}
                              onCheckedChange={(checked) => updatePermission("storage", "delete", checked)}
                            />
                            <Label htmlFor="storage-delete" className="text-sm">Delete Storage</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="storage-dataProtection"
                              checked={permissions.storage?.dataProtection || false}
                              onCheckedChange={(checked) => updatePermission("storage", "dataProtection", checked)}
                            />
                            <Label htmlFor="storage-dataProtection" className="text-sm">Data Protection</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="storage-dataLifecycle"
                              checked={permissions.storage?.dataLifecycle || false}
                              onCheckedChange={(checked) => updatePermission("storage", "dataLifecycle", checked)}
                            />
                            <Label htmlFor="storage-dataLifecycle" className="text-sm">Data Lifecycle</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="storage-inventoryView"
                              checked={permissions.storage?.inventoryView || false}
                              onCheckedChange={(checked) => updatePermission("storage", "inventoryView", checked)}
                            />
                            <Label htmlFor="storage-inventoryView" className="text-sm">View Inventory</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="storage-inventoryConfigure"
                              checked={permissions.storage?.inventoryConfigure || false}
                              onCheckedChange={(checked) => updatePermission("storage", "inventoryConfigure", checked)}
                            />
                            <Label htmlFor="storage-inventoryConfigure" className="text-sm">Configure Inventory</Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="files">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <File className="w-5 h-5" />
                          <CardTitle className="text-lg">File Management</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="files-uploadFile"
                              checked={permissions.files?.uploadFile || false}
                              onCheckedChange={(checked) => {
                                updatePermission("files", "uploadFile", checked);
                                updatePermission("files", "uploadFolder", checked);
                              }}
                            />
                            <Label htmlFor="files-uploadFile" className="text-sm">Upload Files/Folder</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="files-downloadFile"
                              checked={permissions.files?.downloadFile || false}
                              onCheckedChange={(checked) => updatePermission("files", "downloadFile", checked)}
                            />
                            <Label htmlFor="files-downloadFile" className="text-sm">Download File</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="files-downloadFolder"
                              checked={permissions.files?.downloadFolder || false}
                              onCheckedChange={(checked) => updatePermission("files", "downloadFolder", checked)}
                            />
                            <Label htmlFor="files-downloadFolder" className="text-sm">Download Folder</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="files-viewFiles"
                              checked={permissions.files?.viewFiles || false}
                              onCheckedChange={(checked) => updatePermission("files", "viewFiles", checked)}
                            />
                            <Label htmlFor="files-viewFiles" className="text-sm">Pre-View Files</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="files-createFolder"
                              checked={permissions.files?.createFolder || false}
                              onCheckedChange={(checked) => updatePermission("files", "createFolder", checked)}
                            />
                            <Label htmlFor="files-createFolder" className="text-sm">Create Folder</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="files-deleteFilesAndFolders"
                              checked={permissions.files?.deleteFilesAndFolders || false}
                              onCheckedChange={(checked) => updatePermission("files", "deleteFilesAndFolders", checked)}
                            />
                            <Label htmlFor="files-deleteFilesAndFolders" className="text-sm">Delete Files/Folders</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="files-searchFiles"
                              checked={permissions.files?.searchFiles || false}
                              onCheckedChange={(checked) => updatePermission("files", "searchFiles", checked)}
                            />
                            <Label htmlFor="files-searchFiles" className="text-sm">Search Files</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="files-renameFile"
                              checked={permissions.files?.renameFile || false}
                              onCheckedChange={(checked) => updatePermission("files", "renameFile", checked)}
                            />
                            <Label htmlFor="files-renameFile" className="text-sm">Rename Files/Folders</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="files-rehydrate"
                              checked={permissions.files?.rehydrate || false}
                              onCheckedChange={(checked) => updatePermission("files", "rehydrate", checked)}
                            />
                            <Label htmlFor="files-rehydrate" className="text-sm">Rehydrate Archived Files</Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="ai-agents">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <Bot className="w-5 h-5" />
                          <CardTitle className="text-lg">AI Agent Management</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="aiAgentMgmt-add"
                              checked={permissions.aiAgentMgmt?.add || false}
                              onCheckedChange={(checked) => updatePermission("aiAgentMgmt", "add", checked)}
                            />
                            <Label htmlFor="aiAgentMgmt-add" className="text-sm">Add AI Agents</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="aiAgentMgmt-edit"
                              checked={permissions.aiAgentMgmt?.edit || false}
                              onCheckedChange={(checked) => updatePermission("aiAgentMgmt", "edit", checked)}
                            />
                            <Label htmlFor="aiAgentMgmt-edit" className="text-sm">Edit AI Agents</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="aiAgentMgmt-delete"
                              checked={permissions.aiAgentMgmt?.delete || false}
                              onCheckedChange={(checked) => updatePermission("aiAgentMgmt", "delete", checked)}
                            />
                            <Label htmlFor="aiAgentMgmt-delete" className="text-sm">Delete AI Agents</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="aiAgentMgmt-view"
                              checked={permissions.aiAgentMgmt?.view || false}
                              onCheckedChange={(checked) => updatePermission("aiAgentMgmt", "view", checked)}
                            />
                            <Label htmlFor="aiAgentMgmt-view" className="text-sm">View AI Agents</Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="pgp-key-mgmt">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <Lock className="w-5 h-5" />
                          <CardTitle className="text-lg">PGP Key Management</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="pgpKeyMgmt-view"
                              checked={permissions.pgpKeyMgmt?.view || false}
                              onCheckedChange={(checked) => updatePermission("pgpKeyMgmt", "view", checked)}
                            />
                            <Label htmlFor="pgpKeyMgmt-view" className="text-sm">View PGP Keys</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="pgpKeyMgmt-generate"
                              checked={permissions.pgpKeyMgmt?.generate || false}
                              onCheckedChange={(checked) => updatePermission("pgpKeyMgmt", "generate", checked)}
                            />
                            <Label htmlFor="pgpKeyMgmt-generate" className="text-sm">Generate PGP Keys</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="pgpKeyMgmt-delete"
                              checked={permissions.pgpKeyMgmt?.delete || false}
                              onCheckedChange={(checked) => updatePermission("pgpKeyMgmt", "delete", checked)}
                            />
                            <Label htmlFor="pgpKeyMgmt-delete" className="text-sm">Delete PGP Keys</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="pgpKeyMgmt-copy"
                              checked={permissions.pgpKeyMgmt?.copy || false}
                              onCheckedChange={(checked) => updatePermission("pgpKeyMgmt", "copy", checked)}
                            />
                            <Label htmlFor="pgpKeyMgmt-copy" className="text-sm">Copy PGP Keys</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="pgpKeyMgmt-decrypt"
                              checked={permissions.pgpKeyMgmt?.decrypt || false}
                              onCheckedChange={(checked) => updatePermission("pgpKeyMgmt", "decrypt", checked)}
                            />
                            <Label htmlFor="pgpKeyMgmt-decrypt" className="text-sm">Decrypt Files</Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="siem-rules">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <Shield className="w-5 h-5" />
                          <CardTitle className="text-lg">SIEM Rules Management</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="siemManagement-view"
                              checked={permissions.siemManagement?.view || false}
                              onCheckedChange={(checked) => updatePermission("siemManagement", "view", checked)}
                            />
                            <Label htmlFor="siemManagement-view" className="text-sm">View SIEM Rules</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="siemManagement-install"
                              checked={permissions.siemManagement?.install || false}
                              onCheckedChange={(checked) => updatePermission("siemManagement", "install", checked)}
                            />
                            <Label htmlFor="siemManagement-install" className="text-sm">Install SIEM Rules</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="siemManagement-delete"
                              checked={permissions.siemManagement?.delete || false}
                              onCheckedChange={(checked) => updatePermission("siemManagement", "delete", checked)}
                            />
                            <Label htmlFor="siemManagement-delete" className="text-sm">Delete SIEM Rules</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="siemManagement-enableDisable"
                              checked={permissions.siemManagement?.enableDisable || false}
                              onCheckedChange={(checked) => updatePermission("siemManagement", "enableDisable", checked)}
                            />
                            <Label htmlFor="siemManagement-enableDisable" className="text-sm">Enable/Disable SIEM Rules</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="siemManagement-incidentsView"
                              checked={permissions.siemManagement?.incidentsView || false}
                              onCheckedChange={(checked) => updatePermission("siemManagement", "incidentsView", checked)}
                            />
                            <Label htmlFor="siemManagement-incidentsView" className="text-sm">View SIEM Incidents</Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="foundry-ai">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <Cpu className="w-5 h-5" />
                          <CardTitle className="text-lg">Foundry AI Management</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium mb-3">Resource Permissions</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="foundryMgmt-view"
                                  checked={permissions.foundryMgmt?.view || false}
                                  onCheckedChange={(checked) => updatePermission("foundryMgmt", "view", checked)}
                                />
                                <Label htmlFor="foundryMgmt-view" className="text-sm">View Foundry Resources</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="foundryMgmt-add"
                                  checked={permissions.foundryMgmt?.add || false}
                                  onCheckedChange={(checked) => updatePermission("foundryMgmt", "add", checked)}
                                />
                                <Label htmlFor="foundryMgmt-add" className="text-sm">Create Foundry Resources</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="foundryMgmt-edit"
                                  checked={permissions.foundryMgmt?.edit || false}
                                  onCheckedChange={(checked) => updatePermission("foundryMgmt", "edit", checked)}
                                />
                                <Label htmlFor="foundryMgmt-edit" className="text-sm">Edit Foundry Resources</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="foundryMgmt-delete"
                                  checked={permissions.foundryMgmt?.delete || false}
                                  onCheckedChange={(checked) => updatePermission("foundryMgmt", "delete", checked)}
                                />
                                <Label htmlFor="foundryMgmt-delete" className="text-sm">Delete Foundry Resources</Label>
                              </div>
                            </div>
                          </div>
                          <Separator />
                          <div>
                            <h4 className="text-sm font-medium mb-3">Tab Visibility</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="foundryMgmt-tabWizard"
                                  checked={permissions.foundryMgmt?.tabWizard || false}
                                  onCheckedChange={(checked) => updatePermission("foundryMgmt", "tabWizard", checked)}
                                />
                                <Label htmlFor="foundryMgmt-tabWizard" className="text-sm">Wizard Tab</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="foundryMgmt-tabResources"
                                  checked={permissions.foundryMgmt?.tabResources || false}
                                  onCheckedChange={(checked) => updatePermission("foundryMgmt", "tabResources", checked)}
                                />
                                <Label htmlFor="foundryMgmt-tabResources" className="text-sm">Resources Tab</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="foundryMgmt-tabFoundryAction"
                                  checked={permissions.foundryMgmt?.tabFoundryAction || false}
                                  onCheckedChange={(checked) => updatePermission("foundryMgmt", "tabFoundryAction", checked)}
                                />
                                <Label htmlFor="foundryMgmt-tabFoundryAction" className="text-sm">Foundry Action Tab</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="foundryMgmt-tabChatPlayground"
                                  checked={permissions.foundryMgmt?.tabChatPlayground || false}
                                  onCheckedChange={(checked) => updatePermission("foundryMgmt", "tabChatPlayground", checked)}
                                />
                                <Label htmlFor="foundryMgmt-tabChatPlayground" className="text-sm">Chat Playground Tab</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="foundryMgmt-tabResourceSets"
                                  checked={permissions.foundryMgmt?.tabResourceSets || false}
                                  onCheckedChange={(checked) => updatePermission("foundryMgmt", "tabResourceSets", checked)}
                                />
                                <Label htmlFor="foundryMgmt-tabResourceSets" className="text-sm">Resource Sets Tab</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="foundryMgmt-tabContentUnderstanding"
                                  checked={permissions.foundryMgmt?.tabContentUnderstanding || false}
                                  onCheckedChange={(checked) => updatePermission("foundryMgmt", "tabContentUnderstanding", checked)}
                                />
                                <Label htmlFor="foundryMgmt-tabContentUnderstanding" className="text-sm">Content Understanding Tab</Label>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="content-understanding">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-5 h-5" />
                          <CardTitle className="text-lg">Content Understanding</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium mb-3">Analysis Permissions</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="contentUnderstanding-view"
                                  checked={permissions.contentUnderstanding?.view || false}
                                  onCheckedChange={(checked) => updatePermission("contentUnderstanding", "view", checked)}
                                />
                                <Label htmlFor="contentUnderstanding-view" className="text-sm">View Analysis Results</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="contentUnderstanding-runAnalysis"
                                  checked={permissions.contentUnderstanding?.runAnalysis || false}
                                  onCheckedChange={(checked) => updatePermission("contentUnderstanding", "runAnalysis", checked)}
                                />
                                <Label htmlFor="contentUnderstanding-runAnalysis" className="text-sm">Run Analysis</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="contentUnderstanding-saveAnalysis"
                                  checked={permissions.contentUnderstanding?.saveAnalysis || false}
                                  onCheckedChange={(checked) => updatePermission("contentUnderstanding", "saveAnalysis", checked)}
                                />
                                <Label htmlFor="contentUnderstanding-saveAnalysis" className="text-sm">Save Analysis Results</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="contentUnderstanding-deleteAnalysis"
                                  checked={permissions.contentUnderstanding?.deleteAnalysis || false}
                                  onCheckedChange={(checked) => updatePermission("contentUnderstanding", "deleteAnalysis", checked)}
                                />
                                <Label htmlFor="contentUnderstanding-deleteAnalysis" className="text-sm">Delete Analysis Results</Label>
                              </div>
                            </div>
                          </div>
                          <Separator />
                          <div>
                            <h4 className="text-sm font-medium mb-3">Menu Visibility</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="contentUnderstanding-menuVisibility"
                                  checked={permissions.contentUnderstanding?.menuVisibility || false}
                                  onCheckedChange={(checked) => updatePermission("contentUnderstanding", "menuVisibility", checked)}
                                />
                                <Label htmlFor="contentUnderstanding-menuVisibility" className="text-sm">Show in Sidebar Menu</Label>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="document-translation">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <Languages className="w-5 h-5" />
                          <CardTitle className="text-lg">Document Translation</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium mb-3">Translation Permissions</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="documentTranslation-view"
                                checked={permissions.documentTranslation?.view || false}
                                onCheckedChange={(checked) => updatePermission("documentTranslation", "view", checked)}
                              />
                              <Label htmlFor="documentTranslation-view" className="text-sm">View Translation Results</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="documentTranslation-runTranslation"
                                checked={permissions.documentTranslation?.runTranslation || false}
                                onCheckedChange={(checked) => updatePermission("documentTranslation", "runTranslation", checked)}
                              />
                              <Label htmlFor="documentTranslation-runTranslation" className="text-sm">Run Translation</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="documentTranslation-deleteTranslation"
                                checked={permissions.documentTranslation?.deleteTranslation || false}
                                onCheckedChange={(checked) => updatePermission("documentTranslation", "deleteTranslation", checked)}
                              />
                              <Label htmlFor="documentTranslation-deleteTranslation" className="text-sm">Delete Translation Results</Label>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="eval">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <ClipboardCheck className="w-5 h-5" />
                          <CardTitle className="text-lg">Answer Sheet Evaluation</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium mb-3">Eval Permissions</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="eval-view"
                                  checked={permissions.eval?.view || false}
                                  onCheckedChange={(checked) => updatePermission("eval", "view", checked)}
                                />
                                <Label htmlFor="eval-view" className="text-sm">View Eval Jobs</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="eval-run"
                                  checked={permissions.eval?.run || false}
                                  onCheckedChange={(checked) => updatePermission("eval", "run", checked)}
                                />
                                <Label htmlFor="eval-run" className="text-sm">Run Evaluations</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="eval-review"
                                  checked={permissions.eval?.review || false}
                                  onCheckedChange={(checked) => updatePermission("eval", "review", checked)}
                                />
                                <Label htmlFor="eval-review" className="text-sm">Review & Override Marks</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="eval-finalize"
                                  checked={permissions.eval?.finalize || false}
                                  onCheckedChange={(checked) => updatePermission("eval", "finalize", checked)}
                                />
                                <Label htmlFor="eval-finalize" className="text-sm">Finalize Reviews</Label>
                              </div>
                            </div>
                          </div>
                          <Separator />
                          <div>
                            <h4 className="text-sm font-medium mb-3">Menu Visibility</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="eval-menuVisibility"
                                  checked={permissions.eval?.menuVisibility || false}
                                  onCheckedChange={(checked) => updatePermission("eval", "menuVisibility", checked)}
                                />
                                <Label htmlFor="eval-menuVisibility" className="text-sm">Show in Sidebar Menu</Label>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="sftp-mgmt">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <Server className="w-5 h-5" />
                          <CardTitle className="text-lg">SFTP Management</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium mb-3">Admin Permissions</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="sftpMgmt-view"
                                checked={permissions.sftpMgmt?.view || false}
                                onCheckedChange={(checked) => updatePermission("sftpMgmt", "view", checked)}
                              />
                              <Label htmlFor="sftpMgmt-view" className="text-sm">View SFTP Users</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="sftpMgmt-create"
                                checked={permissions.sftpMgmt?.create || false}
                                onCheckedChange={(checked) => updatePermission("sftpMgmt", "create", checked)}
                              />
                              <Label htmlFor="sftpMgmt-create" className="text-sm">Create SFTP Users</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="sftpMgmt-update"
                                checked={permissions.sftpMgmt?.update || false}
                                onCheckedChange={(checked) => updatePermission("sftpMgmt", "update", checked)}
                              />
                              <Label htmlFor="sftpMgmt-update" className="text-sm">Update SFTP Users</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="sftpMgmt-disable"
                                checked={permissions.sftpMgmt?.disable || false}
                                onCheckedChange={(checked) => updatePermission("sftpMgmt", "disable", checked)}
                              />
                              <Label htmlFor="sftpMgmt-disable" className="text-sm">Disable SFTP Users</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="sftpMgmt-delete"
                                checked={permissions.sftpMgmt?.delete || false}
                                onCheckedChange={(checked) => updatePermission("sftpMgmt", "delete", checked)}
                              />
                              <Label htmlFor="sftpMgmt-delete" className="text-sm">Delete SFTP Users</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="sftpMgmt-mapUser"
                                checked={permissions.sftpMgmt?.mapUser || false}
                                onCheckedChange={(checked) => updatePermission("sftpMgmt", "mapUser", checked)}
                              />
                              <Label htmlFor="sftpMgmt-mapUser" className="text-sm">Map Users to SFTP</Label>
                            </div>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-3">Self-Service Permissions</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="sftpMgmt-viewSelfAccess"
                                checked={permissions.sftpMgmt?.viewSelfAccess || false}
                                onCheckedChange={(checked) => updatePermission("sftpMgmt", "viewSelfAccess", checked)}
                              />
                              <Label htmlFor="sftpMgmt-viewSelfAccess" className="text-sm">View Own SFTP Access</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="sftpMgmt-rotateSshSelf"
                                checked={permissions.sftpMgmt?.rotateSshSelf || false}
                                onCheckedChange={(checked) => updatePermission("sftpMgmt", "rotateSshSelf", checked)}
                              />
                              <Label htmlFor="sftpMgmt-rotateSshSelf" className="text-sm">Rotate Own SSH Key</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="sftpMgmt-rotatePasswordSelf"
                                checked={permissions.sftpMgmt?.rotatePasswordSelf || false}
                                onCheckedChange={(checked) => updatePermission("sftpMgmt", "rotatePasswordSelf", checked)}
                              />
                              <Label htmlFor="sftpMgmt-rotatePasswordSelf" className="text-sm">Rotate Own Password</Label>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="customer-onboarding">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <Users className="w-5 h-5" />
                          <CardTitle className="text-lg">Customer Onboarding</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="customerOnboarding-view"
                              checked={permissions.customerOnboarding?.view || false}
                              onCheckedChange={(checked) => updatePermission("customerOnboarding", "view", checked)}
                            />
                            <Label htmlFor="customerOnboarding-view" className="text-sm">View Onboarding Jobs</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="customerOnboarding-upload"
                              checked={permissions.customerOnboarding?.upload || false}
                              onCheckedChange={(checked) => updatePermission("customerOnboarding", "upload", checked)}
                            />
                            <Label htmlFor="customerOnboarding-upload" className="text-sm">Upload CSV Files</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="customerOnboarding-commit"
                              checked={permissions.customerOnboarding?.commit || false}
                              onCheckedChange={(checked) => updatePermission("customerOnboarding", "commit", checked)}
                            />
                            <Label htmlFor="customerOnboarding-commit" className="text-sm">Commit Onboarding</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="customerOnboarding-delete"
                              checked={permissions.customerOnboarding?.delete || false}
                              onCheckedChange={(checked) => updatePermission("customerOnboarding", "delete", checked)}
                            />
                            <Label htmlFor="customerOnboarding-delete" className="text-sm">Delete Jobs</Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="transfer-reports">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-5 h-5" />
                          <CardTitle className="text-lg">Transfer Reports</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="transferReports-view"
                              checked={permissions.transferReports?.view || false}
                              onCheckedChange={(checked) => updatePermission("transferReports", "view", checked)}
                            />
                            <Label htmlFor="transferReports-view" className="text-sm">View Reports</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="transferReports-viewDetails"
                              checked={permissions.transferReports?.viewDetails || false}
                              onCheckedChange={(checked) => updatePermission("transferReports", "viewDetails", checked)}
                            />
                            <Label htmlFor="transferReports-viewDetails" className="text-sm">View Report Details</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="transferReports-download"
                              checked={permissions.transferReports?.download || false}
                              onCheckedChange={(checked) => updatePermission("transferReports", "download", checked)}
                            />
                            <Label htmlFor="transferReports-download" className="text-sm">Download Reports</Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="logs">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <Activity className="w-5 h-5" />
                          <CardTitle className="text-lg">Activity Logs</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="activityLogs-view"
                              checked={permissions.activityLogs?.view || false}
                              onCheckedChange={(checked) => updatePermission("activityLogs", "view", checked)}
                            />
                            <Label htmlFor="activityLogs-view" className="text-sm">View Activity Logs</Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="help-center">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-2">
                          <BookOpen className="w-5 h-5" />
                          <CardTitle className="text-lg">Help Center Access</CardTitle>
                        </div>
                        <CardDescription>
                          Control which help documentation chapters this role can access
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div>
                          <h4 className="font-medium mb-3">User Guide Chapters</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { key: 'getting_started', label: 'Getting Started' },
                              { key: 'user_management', label: 'User Management' },
                              { key: 'organization_management', label: 'Organization Management' },
                              { key: 'role_permission_management', label: 'Role & Permission Management' },
                              { key: 'file_management', label: 'File Management' },
                              { key: 'storage_management', label: 'Storage Management' },
                              { key: 'data_protection', label: 'Data Protection' },
                              { key: 'ai_agent_management', label: 'AI Agent Management' },
                              { key: 'activity_logging', label: 'Activity Logging' },
                              { key: 'data_lifecycle_management', label: 'Data Lifecycle Management' },
                              { key: 'sftp_local_users', label: 'SFTP Local Users' },
                              { key: 'pgp_key_management', label: 'PGP Key Management' },
                              { key: 'content_understanding', label: 'Content Understanding' },
                              { key: 'document_translation', label: 'Document Translation' },
                              { key: 'siem_sentinel_integration', label: 'SIEM & Sentinel Integration' },
                              { key: 'foundry_ai_chat_playground', label: 'Foundry AI & Chat Playground' },
                              { key: 'cmk_encryption', label: 'Customer-Managed Key Encryption' },
                              { key: 'customer_onboarding', label: 'Customer Onboarding' },
                              { key: 'transfer_reports', label: 'Transfer Reports' },
                              { key: 'answer_sheet_evaluation', label: 'Answer Sheet Evaluation' },
                            ].map(({ key, label }) => (
                              <div key={key} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`helpCenter-chapterWiseHelp-${key}`}
                                  checked={permissions.helpCenter?.chapterWiseHelp?.[key] || false}
                                  onCheckedChange={(checked) => {
                                    setPermissions(prev => ({
                                      ...prev,
                                      helpCenter: {
                                        ...prev.helpCenter,
                                        chapterWiseHelp: {
                                          ...prev.helpCenter.chapterWiseHelp,
                                          [key]: checked === true
                                        }
                                      }
                                    }));
                                  }}
                                />
                                <Label htmlFor={`helpCenter-chapterWiseHelp-${key}`} className="text-sm">{label}</Label>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium mb-3">API Documentation</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="helpCenter-api-api_integration_guide"
                                checked={permissions.helpCenter?.api?.api_integration_guide || false}
                                onCheckedChange={(checked) => {
                                  setPermissions(prev => ({
                                    ...prev,
                                    helpCenter: {
                                      ...prev.helpCenter,
                                      api: { ...prev.helpCenter.api, api_integration_guide: checked === true }
                                    }
                                  }));
                                }}
                              />
                              <Label htmlFor="helpCenter-api-api_integration_guide" className="text-sm">API Integration Guide</Label>
                            </div>
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium mb-3">Environment Variables</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="helpCenter-envVariable-configuration_settings"
                                checked={permissions.helpCenter?.envVariable?.configuration_settings || false}
                                onCheckedChange={(checked) => {
                                  setPermissions(prev => ({
                                    ...prev,
                                    helpCenter: {
                                      ...prev.helpCenter,
                                      envVariable: { ...prev.helpCenter.envVariable, configuration_settings: checked === true }
                                    }
                                  }));
                                }}
                              />
                              <Label htmlFor="helpCenter-envVariable-configuration_settings" className="text-sm">Configuration Settings</Label>
                            </div>
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium mb-3">Troubleshooting</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="helpCenter-troubleshooting-malware_scanning"
                                checked={permissions.helpCenter?.troubleshooting?.malware_scanning || false}
                                onCheckedChange={(checked) => {
                                  setPermissions(prev => ({
                                    ...prev,
                                    helpCenter: {
                                      ...prev.helpCenter,
                                      troubleshooting: { ...prev.helpCenter.troubleshooting, malware_scanning: checked === true }
                                    }
                                  }));
                                }}
                              />
                              <Label htmlFor="helpCenter-troubleshooting-malware_scanning" className="text-sm">Malware Scanning</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="helpCenter-troubleshooting-storage_creation"
                                checked={permissions.helpCenter?.troubleshooting?.storage_creation || false}
                                onCheckedChange={(checked) => {
                                  setPermissions(prev => ({
                                    ...prev,
                                    helpCenter: {
                                      ...prev.helpCenter,
                                      troubleshooting: { ...prev.helpCenter.troubleshooting, storage_creation: checked === true }
                                    }
                                  }));
                                }}
                              />
                              <Label htmlFor="helpCenter-troubleshooting-storage_creation" className="text-sm">Storage Creation</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="helpCenter-troubleshooting-eval_common_issues"
                                checked={permissions.helpCenter?.troubleshooting?.eval_common_issues || false}
                                onCheckedChange={(checked) => {
                                  setPermissions(prev => ({
                                    ...prev,
                                    helpCenter: {
                                      ...prev.helpCenter,
                                      troubleshooting: { ...prev.helpCenter.troubleshooting, eval_common_issues: checked === true }
                                    }
                                  }));
                                }}
                              />
                              <Label htmlFor="helpCenter-troubleshooting-eval_common_issues" className="text-sm">Answer Sheet Evaluation</Label>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                    </div>
                  </div>
                </Tabs>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => {
                  setIsAddRoleOpen(false);
                  resetAddRoleForm();
                }} data-testid="button-cancel-add-role">
                  Cancel
                </Button>
                <Button onClick={handleCreateRole} disabled={createRoleMutation.isPending} data-testid="button-create-role">
                  {createRoleMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {createRoleMutation.isPending ? "Creating..." : "Create Role"}
                </Button>
              </div>
            </div>
          </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Roles Table */}
      <Card>
        <CardHeader>
          <CardTitle>System Roles</CardTitle>
          <CardDescription>
            All roles in the system with their creation dates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-350px)] min-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles?.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    <Badge className={getRoleBadgeColor(role.name, role.category)}>
                      {role.name}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-600">{role.description || "No description"}</TableCell>
                  <TableCell>{new Date(role.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      {/* Show edit button only if current user has edit permission in role management */}
                      {hasEditPermission && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleEditRole(role)}
                          disabled={loadingRoleId === role.id}
                          data-testid={`button-edit-role-${role.id}`}
                        >
                          {loadingRoleId === role.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Edit className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                      {/* Show delete button only if current user has delete permission in role management */}
                      {hasDeletePermission && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-600 hover:text-red-700" 
                          onClick={() => handleDeleteRole(role)}
                          disabled={deletingRoleId === role.id}
                          data-testid={`button-delete-role-${role.id}`}
                        >
                          {deletingRoleId === role.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Edit Role Dialog */}
      <Dialog open={isEditRoleOpen} onOpenChange={handleEditRoleDialogChange}>
        <DialogContent 
          className="max-w-4xl max-h-[90vh] overflow-y-auto"
          showClose={!updateRoleMutation.isPending}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: updateRoleMutation.isPending
                ? "Please wait for the role update to complete. You cannot close this window during update."
                : "Please use the X button to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: updateRoleMutation.isPending
                ? "Please wait for the role update to complete. You cannot close this window during update."
                : "Please use the X button to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit Role: {editingRole?.name}</DialogTitle>
            <DialogDescription>
              Modify role permissions for each module
            </DialogDescription>
          </DialogHeader>
          
          {editingRole && (
            <div className="space-y-6">
              {/* Role Details */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-role-name">Role Name</Label>
                  <Input
                    id="edit-role-name"
                    value={editingRole.name}
                    onChange={(e) => setEditingRole(prev => prev ? { ...prev, name: e.target.value } : null)}
                    maxLength={64}
                    data-testid="input-edit-role-name"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {editingRole.name.trim().length}/64 characters (minimum 3)
                  </div>
                </div>
                <div>
                  <Label htmlFor="edit-role-description">Description</Label>
                  <Textarea
                    id="edit-role-description"
                    value={editingRole.description || ""}
                    maxLength={140}
                    onChange={(e) => setEditingRole(prev => prev ? { ...prev, description: e.target.value } : null)}
                    placeholder="Enter role description (max 140 characters)"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {(editingRole.description || "").length}/140 characters
                  </div>
                </div>
              </div>

              {/* Module Permissions Tabs */}
              <Tabs defaultValue="userManagement" className="w-full" orientation="vertical">
                <div className="flex gap-4">
                  {/* Sidebar Navigation */}
                  <TabsList className="flex flex-col h-auto w-48 shrink-0 bg-muted/50 p-2 rounded-lg">
                    <TabsTrigger value="userManagement" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Users className="w-4 h-4 shrink-0" />
                      Users
                    </TabsTrigger>
                    <TabsTrigger value="roleManagement" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Settings className="w-4 h-4 shrink-0" />
                      Roles
                    </TabsTrigger>
                    <TabsTrigger value="organizations" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Building className="w-4 h-4 shrink-0" />
                      Organisation
                    </TabsTrigger>
                    <TabsTrigger value="storage" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Database className="w-4 h-4 shrink-0" />
                      Storage
                    </TabsTrigger>
                    <TabsTrigger value="files" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <File className="w-4 h-4 shrink-0" />
                      File Management
                    </TabsTrigger>
                    <TabsTrigger value="aiAgents" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Bot className="w-4 h-4 shrink-0" />
                      AI Agents
                    </TabsTrigger>
                    {hasAnyCorePermissionSelected(editingRole.permissions) && (
                      <TabsTrigger value="pgpKeyMgmt" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Lock className="w-4 h-4 shrink-0" />
                        PGP Keys
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="siemManagement" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Shield className="w-4 h-4 shrink-0" />
                      SIEM Rules
                    </TabsTrigger>
                    <TabsTrigger value="foundryMgmt" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Cpu className="w-4 h-4 shrink-0" />
                      Foundry AI
                    </TabsTrigger>
                    <TabsTrigger value="contentUnderstanding" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Scan className="w-4 h-4 shrink-0" />
                      Content Understanding
                    </TabsTrigger>
                    <TabsTrigger value="documentTranslation" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Languages className="w-4 h-4 shrink-0" />
                      Document Translation
                    </TabsTrigger>
                    <TabsTrigger value="eval" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <ClipboardCheck className="w-4 h-4 shrink-0" />
                      Eval
                    </TabsTrigger>
                    <TabsTrigger value="sftpMgmt" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Server className="w-4 h-4 shrink-0" />
                      SFTP Management
                    </TabsTrigger>
                    <TabsTrigger value="customerOnboarding" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Users className="w-4 h-4 shrink-0" />
                      Customer Onboarding
                    </TabsTrigger>
                    <TabsTrigger value="transferReports" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <FileText className="w-4 h-4 shrink-0" />
                      Transfer Reports
                    </TabsTrigger>
                    <TabsTrigger value="activityLogs" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Activity className="w-4 h-4 shrink-0" />
                      Logs
                    </TabsTrigger>
                    <TabsTrigger value="helpCenter" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <BookOpen className="w-4 h-4 shrink-0" />
                      Help Center
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Content Area */}
                  <div className="flex-1 min-w-0">
                <TabsContent value="userManagement" className="space-y-4 mt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.userManagement.add}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              userManagement: {
                                ...prev.permissions.userManagement,
                                add: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Add Users</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.userManagement.edit}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              userManagement: {
                                ...prev.permissions.userManagement,
                                edit: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Edit Users</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.userManagement.delete}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              userManagement: {
                                ...prev.permissions.userManagement,
                                delete: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Delete Users</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.userManagement.view}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              userManagement: {
                                ...prev.permissions.userManagement,
                                view: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View Users</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.userManagement.enableDisable}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              userManagement: {
                                ...prev.permissions.userManagement,
                                enableDisable: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Enable/Disable Users</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="roleManagement" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.roleManagement.add}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              roleManagement: {
                                ...prev.permissions.roleManagement,
                                add: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Add Roles</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.roleManagement.edit}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              roleManagement: {
                                ...prev.permissions.roleManagement,
                                edit: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Edit Roles</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.roleManagement.delete}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              roleManagement: {
                                ...prev.permissions.roleManagement,
                                delete: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Delete Roles</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.roleManagement.view}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              roleManagement: {
                                ...prev.permissions.roleManagement,
                                view: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View Roles</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="organizations" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.organizations.add}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              organizations: {
                                ...prev.permissions.organizations,
                                add: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Add Partner Organizations</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.organizations.edit}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              organizations: {
                                ...prev.permissions.organizations,
                                edit: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Edit Partner Organizations</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.organizations.delete}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              organizations: {
                                ...prev.permissions.organizations,
                                delete: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Delete Partner Organizations</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.organizations.view}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              organizations: {
                                ...prev.permissions.organizations,
                                view: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View Partner Organizations</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="storage" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.storage.addStorageContainer}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              storage: {
                                ...prev.permissions.storage,
                                addStorageContainer: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Add Storage Account</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.storage.addContainer}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              storage: {
                                ...prev.permissions.storage,
                                addContainer: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Add Container</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.storage.view}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              storage: {
                                ...prev.permissions.storage,
                                view: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View Storage</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.storage.delete}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              storage: {
                                ...prev.permissions.storage,
                                delete: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Delete Storage</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.storage.dataProtection}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              storage: {
                                ...prev.permissions.storage,
                                dataProtection: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Data Protection</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.storage.dataLifecycle}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              storage: {
                                ...prev.permissions.storage,
                                dataLifecycle: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Data Lifecycle</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.storage.inventoryView}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              storage: {
                                ...prev.permissions.storage,
                                inventoryView: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View Inventory</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.storage.inventoryConfigure}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              storage: {
                                ...prev.permissions.storage,
                                inventoryConfigure: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Configure Inventory</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="files" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.files.uploadFile}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              files: {
                                ...prev.permissions.files,
                                uploadFile: checked === true,
                                uploadFolder: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Upload Files/Folder</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.files.downloadFile}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              files: {
                                ...prev.permissions.files,
                                downloadFile: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Download File</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.files.downloadFolder}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              files: {
                                ...prev.permissions.files,
                                downloadFolder: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Download Folder</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.files.viewFiles}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              files: {
                                ...prev.permissions.files,
                                viewFiles: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Pre-View Files</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.files.createFolder}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              files: {
                                ...prev.permissions.files,
                                createFolder: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Create Folder</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.files.deleteFilesAndFolders}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              files: {
                                ...prev.permissions.files,
                                deleteFilesAndFolders: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Delete Files/Folders</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.files.searchFiles || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              files: {
                                ...prev.permissions.files,
                                searchFiles: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Search Files</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.files.renameFile || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              files: {
                                ...prev.permissions.files,
                                renameFile: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Rename Files/Folders</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.files.rehydrate || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              files: {
                                ...prev.permissions.files,
                                rehydrate: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Rehydrate Archived Files</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="aiAgents" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.aiAgentMgmt?.add || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              aiAgentMgmt: {
                                ...prev.permissions.aiAgentMgmt,
                                add: checked === true,
                                edit: prev.permissions.aiAgentMgmt?.edit || false,
                                delete: prev.permissions.aiAgentMgmt?.delete || false,
                                view: prev.permissions.aiAgentMgmt?.view || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Add AI Agents</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.aiAgentMgmt?.edit || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              aiAgentMgmt: {
                                ...prev.permissions.aiAgentMgmt,
                                add: prev.permissions.aiAgentMgmt?.add || false,
                                edit: checked === true,
                                delete: prev.permissions.aiAgentMgmt?.delete || false,
                                view: prev.permissions.aiAgentMgmt?.view || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Edit AI Agents</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.aiAgentMgmt?.delete || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              aiAgentMgmt: {
                                ...prev.permissions.aiAgentMgmt,
                                add: prev.permissions.aiAgentMgmt?.add || false,
                                edit: prev.permissions.aiAgentMgmt?.edit || false,
                                delete: checked === true,
                                view: prev.permissions.aiAgentMgmt?.view || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Delete AI Agents</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.aiAgentMgmt?.view || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              aiAgentMgmt: {
                                ...prev.permissions.aiAgentMgmt,
                                add: prev.permissions.aiAgentMgmt?.add || false,
                                edit: prev.permissions.aiAgentMgmt?.edit || false,
                                delete: prev.permissions.aiAgentMgmt?.delete || false,
                                view: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View AI Agents</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="pgpKeyMgmt" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.pgpKeyMgmt?.view || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              pgpKeyMgmt: {
                                ...prev.permissions.pgpKeyMgmt,
                                view: checked === true,
                                generate: prev.permissions.pgpKeyMgmt?.generate || false,
                                delete: prev.permissions.pgpKeyMgmt?.delete || false,
                                copy: prev.permissions.pgpKeyMgmt?.copy || false,
                                decrypt: prev.permissions.pgpKeyMgmt?.decrypt || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View PGP Keys</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.pgpKeyMgmt?.generate || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              pgpKeyMgmt: {
                                ...prev.permissions.pgpKeyMgmt,
                                view: prev.permissions.pgpKeyMgmt?.view || false,
                                generate: checked === true,
                                delete: prev.permissions.pgpKeyMgmt?.delete || false,
                                copy: prev.permissions.pgpKeyMgmt?.copy || false,
                                decrypt: prev.permissions.pgpKeyMgmt?.decrypt || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Generate PGP Keys</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.pgpKeyMgmt?.delete || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              pgpKeyMgmt: {
                                ...prev.permissions.pgpKeyMgmt,
                                view: prev.permissions.pgpKeyMgmt?.view || false,
                                generate: prev.permissions.pgpKeyMgmt?.generate || false,
                                delete: checked === true,
                                copy: prev.permissions.pgpKeyMgmt?.copy || false,
                                decrypt: prev.permissions.pgpKeyMgmt?.decrypt || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Delete PGP Keys</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.pgpKeyMgmt?.copy || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              pgpKeyMgmt: {
                                ...prev.permissions.pgpKeyMgmt,
                                view: prev.permissions.pgpKeyMgmt?.view || false,
                                generate: prev.permissions.pgpKeyMgmt?.generate || false,
                                delete: prev.permissions.pgpKeyMgmt?.delete || false,
                                copy: checked === true,
                                decrypt: prev.permissions.pgpKeyMgmt?.decrypt || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Copy PGP Keys</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.pgpKeyMgmt?.decrypt || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              pgpKeyMgmt: {
                                ...prev.permissions.pgpKeyMgmt,
                                view: prev.permissions.pgpKeyMgmt?.view || false,
                                generate: prev.permissions.pgpKeyMgmt?.generate || false,
                                delete: prev.permissions.pgpKeyMgmt?.delete || false,
                                copy: prev.permissions.pgpKeyMgmt?.copy || false,
                                decrypt: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Decrypt Files</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="siemManagement" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.siemManagement?.view || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              siemManagement: {
                                ...prev.permissions.siemManagement,
                                view: checked === true,
                                install: prev.permissions.siemManagement?.install || false,
                                delete: prev.permissions.siemManagement?.delete || false,
                                enableDisable: prev.permissions.siemManagement?.enableDisable || false,
                                incidentsView: prev.permissions.siemManagement?.incidentsView || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View SIEM Rules</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.siemManagement?.install || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              siemManagement: {
                                ...prev.permissions.siemManagement,
                                view: prev.permissions.siemManagement?.view || false,
                                install: checked === true,
                                delete: prev.permissions.siemManagement?.delete || false,
                                enableDisable: prev.permissions.siemManagement?.enableDisable || false,
                                incidentsView: prev.permissions.siemManagement?.incidentsView || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Install SIEM Rules</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.siemManagement?.delete || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              siemManagement: {
                                ...prev.permissions.siemManagement,
                                view: prev.permissions.siemManagement?.view || false,
                                install: prev.permissions.siemManagement?.install || false,
                                delete: checked === true,
                                enableDisable: prev.permissions.siemManagement?.enableDisable || false,
                                incidentsView: prev.permissions.siemManagement?.incidentsView || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Delete SIEM Rules</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.siemManagement?.enableDisable || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              siemManagement: {
                                ...prev.permissions.siemManagement,
                                view: prev.permissions.siemManagement?.view || false,
                                install: prev.permissions.siemManagement?.install || false,
                                delete: prev.permissions.siemManagement?.delete || false,
                                enableDisable: checked === true,
                                incidentsView: prev.permissions.siemManagement?.incidentsView || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Enable/Disable SIEM Rules</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.siemManagement?.incidentsView || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              siemManagement: {
                                ...prev.permissions.siemManagement,
                                view: prev.permissions.siemManagement?.view || false,
                                install: prev.permissions.siemManagement?.install || false,
                                delete: prev.permissions.siemManagement?.delete || false,
                                enableDisable: prev.permissions.siemManagement?.enableDisable || false,
                                incidentsView: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View SIEM Incidents</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="foundryMgmt" className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-3">Resource Permissions</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.foundryMgmt?.view || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  foundryMgmt: {
                                    ...prev.permissions.foundryMgmt,
                                    view: checked === true,
                                    add: prev.permissions.foundryMgmt?.add || false,
                                    edit: prev.permissions.foundryMgmt?.edit || false,
                                    delete: prev.permissions.foundryMgmt?.delete || false,
                                    tabWizard: prev.permissions.foundryMgmt?.tabWizard || false,
                                    tabResources: prev.permissions.foundryMgmt?.tabResources || false,
                                    tabFoundryAction: prev.permissions.foundryMgmt?.tabFoundryAction || false,
                                    tabChatPlayground: prev.permissions.foundryMgmt?.tabChatPlayground || false,
                                    tabResourceSets: prev.permissions.foundryMgmt?.tabResourceSets || false,
                                    tabContentUnderstanding: prev.permissions.foundryMgmt?.tabContentUnderstanding || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>View Foundry Resources</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.foundryMgmt?.add || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  foundryMgmt: {
                                    ...prev.permissions.foundryMgmt,
                                    view: prev.permissions.foundryMgmt?.view || false,
                                    add: checked === true,
                                    edit: prev.permissions.foundryMgmt?.edit || false,
                                    delete: prev.permissions.foundryMgmt?.delete || false,
                                    tabWizard: prev.permissions.foundryMgmt?.tabWizard || false,
                                    tabResources: prev.permissions.foundryMgmt?.tabResources || false,
                                    tabFoundryAction: prev.permissions.foundryMgmt?.tabFoundryAction || false,
                                    tabChatPlayground: prev.permissions.foundryMgmt?.tabChatPlayground || false,
                                    tabResourceSets: prev.permissions.foundryMgmt?.tabResourceSets || false,
                                    tabContentUnderstanding: prev.permissions.foundryMgmt?.tabContentUnderstanding || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Create Foundry Resources</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.foundryMgmt?.edit || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  foundryMgmt: {
                                    ...prev.permissions.foundryMgmt,
                                    view: prev.permissions.foundryMgmt?.view || false,
                                    add: prev.permissions.foundryMgmt?.add || false,
                                    edit: checked === true,
                                    delete: prev.permissions.foundryMgmt?.delete || false,
                                    tabWizard: prev.permissions.foundryMgmt?.tabWizard || false,
                                    tabResources: prev.permissions.foundryMgmt?.tabResources || false,
                                    tabFoundryAction: prev.permissions.foundryMgmt?.tabFoundryAction || false,
                                    tabChatPlayground: prev.permissions.foundryMgmt?.tabChatPlayground || false,
                                    tabResourceSets: prev.permissions.foundryMgmt?.tabResourceSets || false,
                                    tabContentUnderstanding: prev.permissions.foundryMgmt?.tabContentUnderstanding || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Edit Foundry Resources</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.foundryMgmt?.delete || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  foundryMgmt: {
                                    ...prev.permissions.foundryMgmt,
                                    view: prev.permissions.foundryMgmt?.view || false,
                                    add: prev.permissions.foundryMgmt?.add || false,
                                    edit: prev.permissions.foundryMgmt?.edit || false,
                                    delete: checked === true,
                                    tabWizard: prev.permissions.foundryMgmt?.tabWizard || false,
                                    tabResources: prev.permissions.foundryMgmt?.tabResources || false,
                                    tabFoundryAction: prev.permissions.foundryMgmt?.tabFoundryAction || false,
                                    tabChatPlayground: prev.permissions.foundryMgmt?.tabChatPlayground || false,
                                    tabResourceSets: prev.permissions.foundryMgmt?.tabResourceSets || false,
                                    tabContentUnderstanding: prev.permissions.foundryMgmt?.tabContentUnderstanding || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Delete Foundry Resources</Label>
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-3">Tab Visibility</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.foundryMgmt?.tabWizard || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  foundryMgmt: {
                                    ...prev.permissions.foundryMgmt,
                                    view: prev.permissions.foundryMgmt?.view || false,
                                    add: prev.permissions.foundryMgmt?.add || false,
                                    edit: prev.permissions.foundryMgmt?.edit || false,
                                    delete: prev.permissions.foundryMgmt?.delete || false,
                                    tabWizard: checked === true,
                                    tabResources: prev.permissions.foundryMgmt?.tabResources || false,
                                    tabFoundryAction: prev.permissions.foundryMgmt?.tabFoundryAction || false,
                                    tabChatPlayground: prev.permissions.foundryMgmt?.tabChatPlayground || false,
                                    tabResourceSets: prev.permissions.foundryMgmt?.tabResourceSets || false,
                                    tabContentUnderstanding: prev.permissions.foundryMgmt?.tabContentUnderstanding || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Wizard Tab</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.foundryMgmt?.tabResources || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  foundryMgmt: {
                                    ...prev.permissions.foundryMgmt,
                                    view: prev.permissions.foundryMgmt?.view || false,
                                    add: prev.permissions.foundryMgmt?.add || false,
                                    edit: prev.permissions.foundryMgmt?.edit || false,
                                    delete: prev.permissions.foundryMgmt?.delete || false,
                                    tabWizard: prev.permissions.foundryMgmt?.tabWizard || false,
                                    tabResources: checked === true,
                                    tabFoundryAction: prev.permissions.foundryMgmt?.tabFoundryAction || false,
                                    tabChatPlayground: prev.permissions.foundryMgmt?.tabChatPlayground || false,
                                    tabResourceSets: prev.permissions.foundryMgmt?.tabResourceSets || false,
                                    tabContentUnderstanding: prev.permissions.foundryMgmt?.tabContentUnderstanding || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Resources Tab</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.foundryMgmt?.tabFoundryAction || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  foundryMgmt: {
                                    ...prev.permissions.foundryMgmt,
                                    view: prev.permissions.foundryMgmt?.view || false,
                                    add: prev.permissions.foundryMgmt?.add || false,
                                    edit: prev.permissions.foundryMgmt?.edit || false,
                                    delete: prev.permissions.foundryMgmt?.delete || false,
                                    tabWizard: prev.permissions.foundryMgmt?.tabWizard || false,
                                    tabResources: prev.permissions.foundryMgmt?.tabResources || false,
                                    tabFoundryAction: checked === true,
                                    tabChatPlayground: prev.permissions.foundryMgmt?.tabChatPlayground || false,
                                    tabResourceSets: prev.permissions.foundryMgmt?.tabResourceSets || false,
                                    tabContentUnderstanding: prev.permissions.foundryMgmt?.tabContentUnderstanding || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Foundry Action Tab</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.foundryMgmt?.tabChatPlayground || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  foundryMgmt: {
                                    ...prev.permissions.foundryMgmt,
                                    view: prev.permissions.foundryMgmt?.view || false,
                                    add: prev.permissions.foundryMgmt?.add || false,
                                    edit: prev.permissions.foundryMgmt?.edit || false,
                                    delete: prev.permissions.foundryMgmt?.delete || false,
                                    tabWizard: prev.permissions.foundryMgmt?.tabWizard || false,
                                    tabResources: prev.permissions.foundryMgmt?.tabResources || false,
                                    tabFoundryAction: prev.permissions.foundryMgmt?.tabFoundryAction || false,
                                    tabChatPlayground: checked === true,
                                    tabResourceSets: prev.permissions.foundryMgmt?.tabResourceSets || false,
                                    tabContentUnderstanding: prev.permissions.foundryMgmt?.tabContentUnderstanding || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Chat Playground Tab</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.foundryMgmt?.tabResourceSets || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  foundryMgmt: {
                                    ...prev.permissions.foundryMgmt,
                                    view: prev.permissions.foundryMgmt?.view || false,
                                    add: prev.permissions.foundryMgmt?.add || false,
                                    edit: prev.permissions.foundryMgmt?.edit || false,
                                    delete: prev.permissions.foundryMgmt?.delete || false,
                                    tabWizard: prev.permissions.foundryMgmt?.tabWizard || false,
                                    tabResources: prev.permissions.foundryMgmt?.tabResources || false,
                                    tabFoundryAction: prev.permissions.foundryMgmt?.tabFoundryAction || false,
                                    tabChatPlayground: prev.permissions.foundryMgmt?.tabChatPlayground || false,
                                    tabResourceSets: checked === true,
                                    tabContentUnderstanding: prev.permissions.foundryMgmt?.tabContentUnderstanding || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Resource Sets Tab</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.foundryMgmt?.tabContentUnderstanding || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  foundryMgmt: {
                                    ...prev.permissions.foundryMgmt,
                                    view: prev.permissions.foundryMgmt?.view || false,
                                    add: prev.permissions.foundryMgmt?.add || false,
                                    edit: prev.permissions.foundryMgmt?.edit || false,
                                    delete: prev.permissions.foundryMgmt?.delete || false,
                                    tabWizard: prev.permissions.foundryMgmt?.tabWizard || false,
                                    tabResources: prev.permissions.foundryMgmt?.tabResources || false,
                                    tabFoundryAction: prev.permissions.foundryMgmt?.tabFoundryAction || false,
                                    tabChatPlayground: prev.permissions.foundryMgmt?.tabChatPlayground || false,
                                    tabResourceSets: prev.permissions.foundryMgmt?.tabResourceSets || false,
                                    tabContentUnderstanding: checked === true
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Content Understanding Tab</Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="contentUnderstanding" className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-3">Analysis Permissions</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.contentUnderstanding?.view || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  contentUnderstanding: {
                                    ...prev.permissions.contentUnderstanding,
                                    view: checked === true,
                                    runAnalysis: prev.permissions.contentUnderstanding?.runAnalysis || false,
                                    saveAnalysis: prev.permissions.contentUnderstanding?.saveAnalysis || false,
                                    deleteAnalysis: prev.permissions.contentUnderstanding?.deleteAnalysis || false,
                                    menuVisibility: prev.permissions.contentUnderstanding?.menuVisibility || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>View Analysis Results</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.contentUnderstanding?.runAnalysis || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  contentUnderstanding: {
                                    ...prev.permissions.contentUnderstanding,
                                    view: prev.permissions.contentUnderstanding?.view || false,
                                    runAnalysis: checked === true,
                                    saveAnalysis: prev.permissions.contentUnderstanding?.saveAnalysis || false,
                                    deleteAnalysis: prev.permissions.contentUnderstanding?.deleteAnalysis || false,
                                    menuVisibility: prev.permissions.contentUnderstanding?.menuVisibility || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Run Analysis</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.contentUnderstanding?.saveAnalysis || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  contentUnderstanding: {
                                    ...prev.permissions.contentUnderstanding,
                                    view: prev.permissions.contentUnderstanding?.view || false,
                                    runAnalysis: prev.permissions.contentUnderstanding?.runAnalysis || false,
                                    saveAnalysis: checked === true,
                                    deleteAnalysis: prev.permissions.contentUnderstanding?.deleteAnalysis || false,
                                    menuVisibility: prev.permissions.contentUnderstanding?.menuVisibility || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Save Analysis Results</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.contentUnderstanding?.deleteAnalysis || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  contentUnderstanding: {
                                    ...prev.permissions.contentUnderstanding,
                                    view: prev.permissions.contentUnderstanding?.view || false,
                                    runAnalysis: prev.permissions.contentUnderstanding?.runAnalysis || false,
                                    saveAnalysis: prev.permissions.contentUnderstanding?.saveAnalysis || false,
                                    deleteAnalysis: checked === true,
                                    menuVisibility: prev.permissions.contentUnderstanding?.menuVisibility || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Delete Analysis Results</Label>
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-3">Menu Visibility</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.contentUnderstanding?.menuVisibility || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  contentUnderstanding: {
                                    ...prev.permissions.contentUnderstanding,
                                    view: prev.permissions.contentUnderstanding?.view || false,
                                    runAnalysis: prev.permissions.contentUnderstanding?.runAnalysis || false,
                                    saveAnalysis: prev.permissions.contentUnderstanding?.saveAnalysis || false,
                                    deleteAnalysis: prev.permissions.contentUnderstanding?.deleteAnalysis || false,
                                    menuVisibility: checked === true
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Show in Sidebar Menu</Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="documentTranslation" className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-3">Translation Permissions</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.documentTranslation?.view || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  documentTranslation: {
                                    ...prev.permissions.documentTranslation,
                                    view: checked === true,
                                    runTranslation: prev.permissions.documentTranslation?.runTranslation || false,
                                    deleteTranslation: prev.permissions.documentTranslation?.deleteTranslation || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>View Translation Results</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.documentTranslation?.runTranslation || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  documentTranslation: {
                                    ...prev.permissions.documentTranslation,
                                    view: prev.permissions.documentTranslation?.view || false,
                                    runTranslation: checked === true,
                                    deleteTranslation: prev.permissions.documentTranslation?.deleteTranslation || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Run Translation</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.documentTranslation?.deleteTranslation || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  documentTranslation: {
                                    ...prev.permissions.documentTranslation,
                                    view: prev.permissions.documentTranslation?.view || false,
                                    runTranslation: prev.permissions.documentTranslation?.runTranslation || false,
                                    deleteTranslation: checked === true
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Delete Translation Results</Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="eval" className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-3">Eval Permissions</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.eval?.view || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  eval: {
                                    ...prev.permissions.eval,
                                    view: checked === true,
                                    run: prev.permissions.eval?.run || false,
                                    review: prev.permissions.eval?.review || false,
                                    finalize: prev.permissions.eval?.finalize || false,
                                    menuVisibility: prev.permissions.eval?.menuVisibility || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>View Eval Jobs</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.eval?.run || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  eval: {
                                    ...prev.permissions.eval,
                                    view: prev.permissions.eval?.view || false,
                                    run: checked === true,
                                    review: prev.permissions.eval?.review || false,
                                    finalize: prev.permissions.eval?.finalize || false,
                                    menuVisibility: prev.permissions.eval?.menuVisibility || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Run Evaluations</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.eval?.review || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  eval: {
                                    ...prev.permissions.eval,
                                    view: prev.permissions.eval?.view || false,
                                    run: prev.permissions.eval?.run || false,
                                    review: checked === true,
                                    finalize: prev.permissions.eval?.finalize || false,
                                    menuVisibility: prev.permissions.eval?.menuVisibility || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Review & Override Marks</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.eval?.finalize || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  eval: {
                                    ...prev.permissions.eval,
                                    view: prev.permissions.eval?.view || false,
                                    run: prev.permissions.eval?.run || false,
                                    review: prev.permissions.eval?.review || false,
                                    finalize: checked === true,
                                    menuVisibility: prev.permissions.eval?.menuVisibility || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Finalize Reviews</Label>
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-3">Menu Visibility</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.eval?.menuVisibility || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  eval: {
                                    ...prev.permissions.eval,
                                    view: prev.permissions.eval?.view || false,
                                    run: prev.permissions.eval?.run || false,
                                    review: prev.permissions.eval?.review || false,
                                    finalize: prev.permissions.eval?.finalize || false,
                                    menuVisibility: checked === true
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Show in Sidebar Menu</Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="sftpMgmt" className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-3">Admin Permissions</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.sftpMgmt?.view || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  sftpMgmt: {
                                    view: checked === true,
                                    create: prev.permissions.sftpMgmt?.create || false,
                                    update: prev.permissions.sftpMgmt?.update || false,
                                    disable: prev.permissions.sftpMgmt?.disable || false,
                                    delete: prev.permissions.sftpMgmt?.delete || false,
                                    mapUser: prev.permissions.sftpMgmt?.mapUser || false,
                                    viewSelfAccess: prev.permissions.sftpMgmt?.viewSelfAccess || false,
                                    rotateSshSelf: prev.permissions.sftpMgmt?.rotateSshSelf || false,
                                    rotatePasswordSelf: prev.permissions.sftpMgmt?.rotatePasswordSelf || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>View SFTP Users</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.sftpMgmt?.create || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  sftpMgmt: {
                                    view: prev.permissions.sftpMgmt?.view || false,
                                    create: checked === true,
                                    update: prev.permissions.sftpMgmt?.update || false,
                                    disable: prev.permissions.sftpMgmt?.disable || false,
                                    delete: prev.permissions.sftpMgmt?.delete || false,
                                    mapUser: prev.permissions.sftpMgmt?.mapUser || false,
                                    viewSelfAccess: prev.permissions.sftpMgmt?.viewSelfAccess || false,
                                    rotateSshSelf: prev.permissions.sftpMgmt?.rotateSshSelf || false,
                                    rotatePasswordSelf: prev.permissions.sftpMgmt?.rotatePasswordSelf || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Create SFTP Users</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.sftpMgmt?.update || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  sftpMgmt: {
                                    view: prev.permissions.sftpMgmt?.view || false,
                                    create: prev.permissions.sftpMgmt?.create || false,
                                    update: checked === true,
                                    disable: prev.permissions.sftpMgmt?.disable || false,
                                    delete: prev.permissions.sftpMgmt?.delete || false,
                                    mapUser: prev.permissions.sftpMgmt?.mapUser || false,
                                    viewSelfAccess: prev.permissions.sftpMgmt?.viewSelfAccess || false,
                                    rotateSshSelf: prev.permissions.sftpMgmt?.rotateSshSelf || false,
                                    rotatePasswordSelf: prev.permissions.sftpMgmt?.rotatePasswordSelf || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Update SFTP Users</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.sftpMgmt?.disable || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  sftpMgmt: {
                                    view: prev.permissions.sftpMgmt?.view || false,
                                    create: prev.permissions.sftpMgmt?.create || false,
                                    update: prev.permissions.sftpMgmt?.update || false,
                                    disable: checked === true,
                                    delete: prev.permissions.sftpMgmt?.delete || false,
                                    mapUser: prev.permissions.sftpMgmt?.mapUser || false,
                                    viewSelfAccess: prev.permissions.sftpMgmt?.viewSelfAccess || false,
                                    rotateSshSelf: prev.permissions.sftpMgmt?.rotateSshSelf || false,
                                    rotatePasswordSelf: prev.permissions.sftpMgmt?.rotatePasswordSelf || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Disable SFTP Users</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.sftpMgmt?.delete || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  sftpMgmt: {
                                    view: prev.permissions.sftpMgmt?.view || false,
                                    create: prev.permissions.sftpMgmt?.create || false,
                                    update: prev.permissions.sftpMgmt?.update || false,
                                    disable: prev.permissions.sftpMgmt?.disable || false,
                                    delete: checked === true,
                                    mapUser: prev.permissions.sftpMgmt?.mapUser || false,
                                    viewSelfAccess: prev.permissions.sftpMgmt?.viewSelfAccess || false,
                                    rotateSshSelf: prev.permissions.sftpMgmt?.rotateSshSelf || false,
                                    rotatePasswordSelf: prev.permissions.sftpMgmt?.rotatePasswordSelf || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Delete SFTP Users</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.sftpMgmt?.mapUser || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  sftpMgmt: {
                                    view: prev.permissions.sftpMgmt?.view || false,
                                    create: prev.permissions.sftpMgmt?.create || false,
                                    update: prev.permissions.sftpMgmt?.update || false,
                                    disable: prev.permissions.sftpMgmt?.disable || false,
                                    delete: prev.permissions.sftpMgmt?.delete || false,
                                    mapUser: checked === true,
                                    viewSelfAccess: prev.permissions.sftpMgmt?.viewSelfAccess || false,
                                    rotateSshSelf: prev.permissions.sftpMgmt?.rotateSshSelf || false,
                                    rotatePasswordSelf: prev.permissions.sftpMgmt?.rotatePasswordSelf || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Map Users to SFTP</Label>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-3">Self-Service Permissions</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.sftpMgmt?.viewSelfAccess || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  sftpMgmt: {
                                    view: prev.permissions.sftpMgmt?.view || false,
                                    create: prev.permissions.sftpMgmt?.create || false,
                                    update: prev.permissions.sftpMgmt?.update || false,
                                    disable: prev.permissions.sftpMgmt?.disable || false,
                                    delete: prev.permissions.sftpMgmt?.delete || false,
                                    mapUser: prev.permissions.sftpMgmt?.mapUser || false,
                                    viewSelfAccess: checked === true,
                                    rotateSshSelf: prev.permissions.sftpMgmt?.rotateSshSelf || false,
                                    rotatePasswordSelf: prev.permissions.sftpMgmt?.rotatePasswordSelf || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>View Own SFTP Access</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.sftpMgmt?.rotateSshSelf || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  sftpMgmt: {
                                    view: prev.permissions.sftpMgmt?.view || false,
                                    create: prev.permissions.sftpMgmt?.create || false,
                                    update: prev.permissions.sftpMgmt?.update || false,
                                    disable: prev.permissions.sftpMgmt?.disable || false,
                                    delete: prev.permissions.sftpMgmt?.delete || false,
                                    mapUser: prev.permissions.sftpMgmt?.mapUser || false,
                                    viewSelfAccess: prev.permissions.sftpMgmt?.viewSelfAccess || false,
                                    rotateSshSelf: checked === true,
                                    rotatePasswordSelf: prev.permissions.sftpMgmt?.rotatePasswordSelf || false
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Rotate Own SSH Key</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.sftpMgmt?.rotatePasswordSelf || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  sftpMgmt: {
                                    view: prev.permissions.sftpMgmt?.view || false,
                                    create: prev.permissions.sftpMgmt?.create || false,
                                    update: prev.permissions.sftpMgmt?.update || false,
                                    disable: prev.permissions.sftpMgmt?.disable || false,
                                    delete: prev.permissions.sftpMgmt?.delete || false,
                                    mapUser: prev.permissions.sftpMgmt?.mapUser || false,
                                    viewSelfAccess: prev.permissions.sftpMgmt?.viewSelfAccess || false,
                                    rotateSshSelf: prev.permissions.sftpMgmt?.rotateSshSelf || false,
                                    rotatePasswordSelf: checked === true
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>Rotate Own Password</Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="customerOnboarding" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.customerOnboarding?.view || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              customerOnboarding: {
                                view: checked === true,
                                upload: prev.permissions.customerOnboarding?.upload || false,
                                commit: prev.permissions.customerOnboarding?.commit || false,
                                delete: prev.permissions.customerOnboarding?.delete || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View Onboarding Jobs</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.customerOnboarding?.upload || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              customerOnboarding: {
                                view: prev.permissions.customerOnboarding?.view || false,
                                upload: checked === true,
                                commit: prev.permissions.customerOnboarding?.commit || false,
                                delete: prev.permissions.customerOnboarding?.delete || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Upload CSV Files</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.customerOnboarding?.commit || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              customerOnboarding: {
                                view: prev.permissions.customerOnboarding?.view || false,
                                upload: prev.permissions.customerOnboarding?.upload || false,
                                commit: checked === true,
                                delete: prev.permissions.customerOnboarding?.delete || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Commit Onboarding</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.customerOnboarding?.delete || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              customerOnboarding: {
                                view: prev.permissions.customerOnboarding?.view || false,
                                upload: prev.permissions.customerOnboarding?.upload || false,
                                commit: prev.permissions.customerOnboarding?.commit || false,
                                delete: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Delete Jobs</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="transferReports" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.transferReports?.view || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              transferReports: {
                                view: checked === true,
                                viewDetails: prev.permissions.transferReports?.viewDetails || false,
                                download: prev.permissions.transferReports?.download || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View Reports</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.transferReports?.viewDetails || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              transferReports: {
                                view: prev.permissions.transferReports?.view || false,
                                viewDetails: checked === true,
                                download: prev.permissions.transferReports?.download || false
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View Report Details</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.transferReports?.download || false}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              transferReports: {
                                view: prev.permissions.transferReports?.view || false,
                                viewDetails: prev.permissions.transferReports?.viewDetails || false,
                                download: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>Download Reports</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="activityLogs" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={editingRole.permissions.activityLogs.view}
                        onCheckedChange={(checked) => {
                          setEditingRole(prev => prev ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              activityLogs: {
                                ...prev.permissions.activityLogs,
                                view: checked === true
                              }
                            }
                          } : null);
                        }}
                      />
                      <Label>View Activity Logs</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="helpCenter" className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-3">User Guide Chapters</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'getting_started', label: 'Getting Started' },
                        { key: 'user_management', label: 'User Management' },
                        { key: 'organization_management', label: 'Organization Management' },
                        { key: 'role_permission_management', label: 'Role & Permission Management' },
                        { key: 'file_management', label: 'File Management' },
                        { key: 'storage_management', label: 'Storage Management' },
                        { key: 'data_protection', label: 'Data Protection' },
                        { key: 'ai_agent_management', label: 'AI Agent Management' },
                        { key: 'activity_logging', label: 'Activity Logging' },
                        { key: 'data_lifecycle_management', label: 'Data Lifecycle Management' },
                        { key: 'sftp_local_users', label: 'SFTP Local Users' },
                        { key: 'pgp_key_management', label: 'PGP Key Management' },
                        { key: 'content_understanding', label: 'Content Understanding' },
                        { key: 'document_translation', label: 'Document Translation' },
                        { key: 'siem_sentinel_integration', label: 'SIEM & Sentinel Integration' },
                        { key: 'foundry_ai_chat_playground', label: 'Foundry AI & Chat Playground' },
                        { key: 'cmk_encryption', label: 'Customer-Managed Key Encryption' },
                        { key: 'customer_onboarding', label: 'Customer Onboarding' },
                        { key: 'transfer_reports', label: 'Transfer Reports' },
                        { key: 'answer_sheet_evaluation', label: 'Answer Sheet Evaluation' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center space-x-2">
                          <Checkbox
                            checked={editingRole.permissions.helpCenter?.chapterWiseHelp?.[key] || false}
                            onCheckedChange={(checked) => {
                              setEditingRole(prev => prev ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  helpCenter: {
                                    ...prev.permissions.helpCenter,
                                    chapterWiseHelp: {
                                      ...prev.permissions.helpCenter?.chapterWiseHelp,
                                      [key]: checked === true
                                    }
                                  }
                                }
                              } : null);
                            }}
                          />
                          <Label>{label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">API Documentation</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={editingRole.permissions.helpCenter?.api?.api_integration_guide || false}
                          onCheckedChange={(checked) => {
                            setEditingRole(prev => prev ? {
                              ...prev,
                              permissions: {
                                ...prev.permissions,
                                helpCenter: {
                                  ...prev.permissions.helpCenter,
                                  api: { ...prev.permissions.helpCenter?.api, api_integration_guide: checked === true }
                                }
                              }
                            } : null);
                          }}
                        />
                        <Label>API Integration Guide</Label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Environment Variables</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={editingRole.permissions.helpCenter?.envVariable?.configuration_settings || false}
                          onCheckedChange={(checked) => {
                            setEditingRole(prev => prev ? {
                              ...prev,
                              permissions: {
                                ...prev.permissions,
                                helpCenter: {
                                  ...prev.permissions.helpCenter,
                                  envVariable: { ...prev.permissions.helpCenter?.envVariable, configuration_settings: checked === true }
                                }
                              }
                            } : null);
                          }}
                        />
                        <Label>Configuration Settings</Label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Troubleshooting</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={editingRole.permissions.helpCenter?.troubleshooting?.malware_scanning || false}
                          onCheckedChange={(checked) => {
                            setEditingRole(prev => prev ? {
                              ...prev,
                              permissions: {
                                ...prev.permissions,
                                helpCenter: {
                                  ...prev.permissions.helpCenter,
                                  troubleshooting: { ...prev.permissions.helpCenter?.troubleshooting, malware_scanning: checked === true }
                                }
                              }
                            } : null);
                          }}
                        />
                        <Label>Malware Scanning</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={editingRole.permissions.helpCenter?.troubleshooting?.storage_creation || false}
                          onCheckedChange={(checked) => {
                            setEditingRole(prev => prev ? {
                              ...prev,
                              permissions: {
                                ...prev.permissions,
                                helpCenter: {
                                  ...prev.permissions.helpCenter,
                                  troubleshooting: { ...prev.permissions.helpCenter?.troubleshooting, storage_creation: checked === true }
                                }
                              }
                            } : null);
                          }}
                        />
                        <Label>Storage Creation</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={editingRole.permissions.helpCenter?.troubleshooting?.eval_common_issues || false}
                          onCheckedChange={(checked) => {
                            setEditingRole(prev => prev ? {
                              ...prev,
                              permissions: {
                                ...prev.permissions,
                                helpCenter: {
                                  ...prev.permissions.helpCenter,
                                  troubleshooting: { ...prev.permissions.helpCenter?.troubleshooting, eval_common_issues: checked === true }
                                }
                              }
                            } : null);
                          }}
                        />
                        <Label>Answer Sheet Evaluation</Label>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                  </div>
                </div>
              </Tabs>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => {
                  setIsEditRoleOpen(false);
                  resetEditRoleForm();
                }} data-testid="button-cancel-edit-role">
                  Cancel
                </Button>
                <Button onClick={() => {
                  if (editingRole) {
                    updateRoleMutation.mutate({
                      id: editingRole.id,
                      name: editingRole.name,
                      description: editingRole.description || "",
                      permissions: editingRole.permissions
                    });
                  }
                }} disabled={updateRoleMutation.isPending} data-testid="button-update-role">
                  {updateRoleMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {updateRoleMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}