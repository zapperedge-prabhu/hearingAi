import { useState } from "react";
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { apiRequest } from "@/lib/api";
import AddUserModal from "@/components/modals/add-user-modal";
import EditUserModal from "@/components/modals/edit-user-modal";
import { LoadingSpinner } from "@/components/ui/spinner";
import { Users as UsersIcon, Plus, Edit, Trash2, ChevronUp, ChevronDown, Search, X } from "lucide-react";

// Type definition matching the actual API response
type UserWithRoleResponse = {
  id: number;
  name: string;
  email: string;
  userType: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  roleName: string | null;
  organizationName: string | null;
  userRoleId: number | null;
  roleId: number | null;
  organizationId: number | null;
  isEnabled: boolean | null;
  roleCategory: string | null;
};
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UserWithRole {
  id: number;
  name: string;
  email: string;
  userType: string | null;
  role: { name: string };
  organization: { name: string };
  userRoleId: number;
  roleId: number;
  organizationId: number;
  isEnabled: boolean;
  roleCategory: string | null;
}

interface GroupedUser {
  id: number;
  name: string;
  email: string;
  userType: string | null;
  roles: Array<{
    roleName: string;
    organizationName: string;
    userRoleId: number;
    roleId: number;
    organizationId: number;
    isEnabled: boolean;
    roleCategory: string | null;
  }>;
}

interface Role {
  id: number;
  name: string;
}

interface Organization {
  id: number;
  name: string;
}

// Helper function to extract clean error message from API errors
function parseErrorMessage(error: Error): string {
  const message = error.message;
  
  // Check if message contains status code prefix (e.g., "400: ...")
  const statusMatch = message.match(/^\d{3}:\s*/);
  if (statusMatch) {
    // Remove status code prefix
    const withoutStatus = message.substring(statusMatch[0].length);
    
    // Try to parse as JSON to extract error field
    try {
      const jsonMatch = withoutStatus.match(/\{.*\}/);
      if (jsonMatch) {
        const errorObj = JSON.parse(jsonMatch[0]);
        return errorObj.error || withoutStatus;
      }
    } catch {
      // If JSON parsing fails, return message without status code
      return withoutStatus;
    }
    
    return withoutStatus;
  }
  
  // Return original message if no status code prefix found
  return message;
}

export default function Users() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [deleteUserRole, setDeleteUserRole] = useState<{userId: number, roleId: number, organizationId: number, userName: string, roleName: string, orgName: string} | null>(null);
  const [togglingUserRoleIds, setTogglingUserRoleIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [sortField, setSortField] = useState<"name" | "role" | "organization">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Get current user's role permissions to check if they can add users
  const { data: rolePermissions } = useRolePermissions();

  const { data: users, isLoading: usersLoading, error } = useQuery<UserWithRoleResponse[]>({
    queryKey: ["/api/users"],
  });







  const deleteUserRoleMutation = useMutation({
    mutationFn: async (params: {userId: number, roleId: number, organizationId: number}) => {
      const response = await apiRequest("DELETE", `/api/user-roles/${params.userId}/${params.roleId}/${params.organizationId}`);
      if (!response.ok) {
        let errorMessage = "Failed to remove user role";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response isn't JSON, use status text or generic message
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/my-roles"] });
      toast({ 
        title: "Success", 
        description: "User role assignment removed successfully",
        variant: "default"
      });
      setDeleteUserRole(null);
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: parseErrorMessage(error),
        variant: "destructive"
      });
      setDeleteUserRole(null); // Close the dialog
    },
  });

  const enableUserRoleMutation = useMutation({
    mutationFn: async (params: {userId: number, roleId: number, organizationId: number, userRoleId: number}) => {
      const response = await apiRequest("PUT", `/api/user-roles/${params.userId}/${params.roleId}/${params.organizationId}/enable`);
      if (!response.ok) {
        let errorMessage = "Failed to enable user role";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response isn't JSON, use status text or generic message
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      return params.userRoleId;
    },
    onSuccess: async (userRoleId) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/my-roles"] });
      setTogglingUserRoleIds(prev => {
        const next = new Set(prev);
        next.delete(userRoleId);
        return next;
      });
      toast({ 
        title: "Success", 
        description: "User role enabled successfully",
        variant: "default"
      });
    },
    onError: (error, variables) => {
      setTogglingUserRoleIds(prev => {
        const next = new Set(prev);
        next.delete(variables.userRoleId);
        return next;
      });
      toast({ 
        title: "Error", 
        description: parseErrorMessage(error),
        variant: "destructive"
      });
    },
  });

  const disableUserRoleMutation = useMutation({
    mutationFn: async (params: {userId: number, roleId: number, organizationId: number, userRoleId: number}) => {
      const response = await apiRequest("PUT", `/api/user-roles/${params.userId}/${params.roleId}/${params.organizationId}/disable`);
      if (!response.ok) {
        let errorMessage = "Failed to disable user role";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response isn't JSON, use status text or generic message
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      return params.userRoleId;
    },
    onSuccess: async (userRoleId) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/my-roles"] });
      setTogglingUserRoleIds(prev => {
        const next = new Set(prev);
        next.delete(userRoleId);
        return next;
      });
      toast({ 
        title: "Success", 
        description: "User role disabled successfully",
        variant: "default"
      });
    },
    onError: (error, variables) => {
      setTogglingUserRoleIds(prev => {
        const next = new Set(prev);
        next.delete(variables.userRoleId);
        return next;
      });
      toast({ 
        title: "Error", 
        description: parseErrorMessage(error),
        variant: "destructive"
      });
    },
  });



  // Handle sorting
  const handleSort = (field: "name" | "role" | "organization") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Group users by unique ID to avoid duplication
  const groupedUsers: GroupedUser[] = users ? users.reduce((acc, user) => {
    const existingUser = acc.find(u => u.id === user.id);
    
    if (existingUser) {
      // Add role to existing user if not already present
      const roleExists = existingUser.roles.some(r => 
        r.roleName === (user.roleName || 'No Role') && r.organizationName === (user.organizationName || 'No Organization')
      );
      if (!roleExists) {
        existingUser.roles.push({
          roleName: user.roleName || 'No Role',
          organizationName: user.organizationName || 'No Organization',
          userRoleId: user.userRoleId || 0,
          roleId: user.roleId || 0,
          organizationId: user.organizationId || 0,
          isEnabled: user.isEnabled ?? true,
          roleCategory: user.roleCategory
        });
      }
    } else {
      // Create new grouped user
      acc.push({
        id: user.id,
        name: user.name,
        email: user.email,
        userType: user.userType,
        roles: [{
          roleName: user.roleName || 'No Role',
          organizationName: user.organizationName || 'No Organization',
          userRoleId: user.userRoleId || 0,
          roleId: user.roleId || 0,
          organizationId: user.organizationId || 0,
          isEnabled: user.isEnabled ?? true,
          roleCategory: user.roleCategory
        }]
      });
    }
    return acc;
  }, [] as GroupedUser[]) : [];

  // Filter users by search query (name or email)
  const filteredUsers = searchQuery.trim() === '' 
    ? groupedUsers 
    : groupedUsers.filter(user => {
        const searchLower = searchQuery.toLowerCase();
        return (
          user.name.toLowerCase().includes(searchLower) ||
          user.email.toLowerCase().includes(searchLower)
        );
      });

  // Sort filtered users
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let aValue: string, bValue: string;
    
    switch (sortField) {
      case "name":
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case "role":
        aValue = a.roles[0]?.roleName.toLowerCase() || "";
        bValue = b.roles[0]?.roleName.toLowerCase() || "";
        break;
      case "organization":
        aValue = a.roles[0]?.organizationName.toLowerCase() || "";
        bValue = b.roles[0]?.organizationName.toLowerCase() || "";
        break;
      default:
        return 0;
    }
    
    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const getUserInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getGradientColor = (index: number) => {
    const colors = [
      'from-blue-400 to-blue-600',
      'from-green-400 to-green-600', 
      'from-purple-400 to-purple-600',
      'from-pink-400 to-pink-600',
      'from-indigo-400 to-indigo-600',
      'from-yellow-400 to-yellow-600',
    ];
    return colors[index % colors.length];
  };

  const getRoleBadgeColor = (roleName: string, roleCategory?: string) => {
    const nameLower = roleName.toLowerCase();
    if (roleCategory === 'dangerous' || nameLower === 'super admin') {
      return 'bg-[#DC2626] text-white hover:bg-[#B91C1C] border-[#B91C1C] shadow-[0_2px_4px_rgba(220,38,38,0.4)] ring-1 ring-red-400/50 font-bold';
    }
    if (roleCategory === 'critical') {
      return 'bg-[#EA580C] text-white hover:bg-[#C2410C] border-[#C2410C] shadow-sm';
    }
    if (roleCategory === 'warning') {
      return 'bg-[#CA8A04] text-white hover:bg-[#A16207] border-[#A16207] shadow-sm';
    }
    if (roleCategory === 'info') {
      return 'bg-[#2563EB] text-white hover:bg-[#1D4ED8] border-[#1D4ED8] shadow-sm';
    }
    
    switch (nameLower) {
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

  const handleDeleteUserRole = (user: GroupedUser, role: GroupedUser['roles'][0]) => {
    setDeleteUserRole({
      userId: user.id,
      roleId: role.roleId,
      organizationId: role.organizationId,
      userName: user.name,
      roleName: role.roleName,
      orgName: role.organizationName
    });
  };

  const handleEditSpecificRole = (user: GroupedUser, role: GroupedUser['roles'][0]) => {
    // Convert to UserWithRole format for the edit modal
    const userWithRole: UserWithRole = {
      id: user.id,
      name: user.name,
      email: user.email,
      userType: user.userType,
      role: { name: role.roleName },
      organization: { name: role.organizationName },
      userRoleId: role.userRoleId,
      roleId: role.roleId,
      organizationId: role.organizationId,
      isEnabled: role.isEnabled,
      roleCategory: role.roleCategory
    };
    setEditingUser(userWithRole);
    setIsEditUserModalOpen(true);
  };



  if (usersLoading) {
    return (
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <UsersIcon className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
          </div>
        </div>
        <LoadingSpinner message="Loading users..." size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <UsersIcon className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
        </div>
        {/* Show Add User button only if current user's role has add permission in user management */}
        {rolePermissions?.userMgmt?.add && (
          <Button onClick={() => setIsAddUserModalOpen(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        )}
      </div>

      {/* Search Box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-10"
          data-testid="input-search-users"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="Clear search"
            data-testid="button-clear-search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results count */}
      {searchQuery && (
        <div className="text-sm text-gray-600">
          {sortedUsers.length === 0 
            ? `No results for "${searchQuery}"` 
            : `${sortedUsers.length} result${sortedUsers.length !== 1 ? 's' : ''} found`}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-lg border">
        <ScrollArea className="h-[calc(100vh-300px)] min-h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" 
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center gap-1">
                  Name
                  {sortField === "name" && (
                    sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </TableHead>
              <TableHead>Email</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" 
                onClick={() => handleSort("organization")}
              >
                <div className="flex items-center gap-1">
                  Partner Organization
                  {sortField === "organization" && (
                    sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" 
                onClick={() => handleSort("role")}
              >
                <div className="flex items-center gap-1">
                  Role
                  {sortField === "role" && (
                    sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <UsersIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No users found</p>
                </TableCell>
              </TableRow>
            ) : (
              sortedUsers.flatMap((user, userIndex) => 
                user.roles.map((role, roleIndex) => (
                  <TableRow key={`${user.id}-${role.userRoleId}`}>
                    <TableCell className="font-medium">
                      {user.name}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {user.email}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {role.organizationName}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${getRoleBadgeColor(role.roleName, role.roleCategory || undefined)}`}>
                        {role.roleName}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" data-testid={`badge-user-type-${user.id}`}>
                        {user.userType === "external" ? "External" : "Internal"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span 
                        className={`text-sm font-medium ${role.isEnabled ? 'text-green-600' : 'text-gray-400'}`}
                        data-testid={`status-user-role-${role.userRoleId}`}
                      >
                        {role.isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        {/* Show edit user button only if current user's role has edit permission in user management */}
                        {rolePermissions?.userMgmt?.edit && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEditSpecificRole(user, role)}
                            title={`Edit ${role.roleName} role in ${role.organizationName}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {/* Show delete user button only if current user's role has delete permission in user management */}
                        {rolePermissions?.userMgmt?.delete && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDeleteUserRole(user, role)}
                            className="text-red-600 hover:text-red-700"
                            title={`Remove ${role.roleName} role from ${role.organizationName}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )
            )}
          </TableBody>
        </Table>
        </ScrollArea>
      </div>

      {/* Add User Modal */}
      <AddUserModal 
        open={isAddUserModalOpen} 
        onOpenChange={setIsAddUserModalOpen}
      />

      {/* Edit User Modal */}
      <EditUserModal 
        open={isEditUserModalOpen} 
        onOpenChange={setIsEditUserModalOpen}
        user={editingUser}
      />

      {/* Delete User Role Confirmation Dialog */}
      <AlertDialog open={deleteUserRole !== null} onOpenChange={() => setDeleteUserRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User Role</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUserRole && (
                <>
                  Remove <strong>{deleteUserRole.roleName}</strong> role from <strong>{deleteUserRole.userName}</strong> in <strong>{deleteUserRole.orgName}</strong>?
                  <br /><br />
                  If this is the user's last role, their account will be deleted completely.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserRoleMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              onClick={() => {
                if (deleteUserRole) {
                  deleteUserRoleMutation.mutate({
                    userId: deleteUserRole.userId,
                    roleId: deleteUserRole.roleId,
                    organizationId: deleteUserRole.organizationId
                  });
                }
              }}
              disabled={deleteUserRoleMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUserRoleMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner size="sm" />
                  <span>Removing...</span>
                </div>
              ) : (
                "Remove User Role"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


    </div>
  );
}
