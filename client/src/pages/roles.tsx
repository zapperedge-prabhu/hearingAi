import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Plus, Edit, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRolePermissions } from "@/hooks/use-role-permissions";

interface Role {
  id: number;
  name: string;
  description?: string;
  category: string;
  createdAt: string;
}

interface Permission {
  id: number;
  name: string;
  description?: string;
}

interface RolePermission {
  id: number;
  roleId: number;
  permissionId: number;
  accessLevel: string;
  permission: Permission;
}

interface RoleWithPermissions extends Role {
  permissions: RolePermission[];
}

const roleSchema = z.object({
  name: z.string().min(1, "Role name is required").max(64, "Role name must not exceed 64 characters"),
  description: z.string().optional(),
  permissions: z.array(z.object({
    permissionId: z.number(),
    accessLevel: z.enum(["Y", "R", "N"]),
  })).optional(),
});

type RoleFormData = z.infer<typeof roleSchema>;

interface PermissionRiskCategory {
  id: number;
  category: string;
  description: string;
  color: string;
  permissions: string[];
}

function RiskAssessment({ riskCategories, permissions, formPermissions }: { riskCategories: PermissionRiskCategory[], permissions: Permission[], formPermissions: any[] }) {
  if (!permissions) return null;
  const activePermissionIds = formPermissions
    .filter(fp => fp.accessLevel !== "N")
    .map(fp => fp.permissionId);
  
  const activePermissionNames = permissions
    ?.filter(p => activePermissionIds.includes(p.id))
    .map(p => p.name) || [];
  
  const activeRisks = riskCategories?.filter(cat => 
    cat.permissions.some((p: string) => activePermissionNames.includes(p))
  ) || [];

  if (activeRisks.length === 0) return null;

  return (
    <div className="space-y-3 pt-4 border-t">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Shield className="w-4 h-4 text-orange-500" />
        Permission Risk Assessment
      </h3>
      <div className="space-y-2">
        {activeRisks.map((risk) => (
          <div 
            key={risk.id} 
            className={`p-3 rounded-md border flex gap-3 ${
              risk.category === 'dangerous' ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-900/30' :
              risk.category === 'critical' ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-900/30' :
              risk.category === 'warning' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-900/30' :
              'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-900/30'
            }`}
          >
            <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
              risk.category === 'dangerous' ? 'bg-red-500' :
              risk.category === 'critical' ? 'bg-orange-500' :
              risk.category === 'warning' ? 'bg-yellow-500' :
              'bg-blue-500'
            }`} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider">{risk.category} RISK</p>
              <p className="text-xs mt-1 text-gray-700 dark:text-gray-300">{risk.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Roles() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const { toast } = useToast();
  
  // Get current user's role permissions
  const { data: rolePermissions } = useRolePermissions();

  const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  const { data: riskCategories } = useQuery<any[]>({
    queryKey: ["/api/permission-risk-categories"],
    staleTime: 30000,
  });

  const { data: permissions } = useQuery<Permission[]>({
    queryKey: ["/api/permissions"],
  });

  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: "",
      description: "",
      permissions: [],
    },
  });

  const { data: roleDetails, isLoading: roleDetailsLoading } = useQuery<RoleWithPermissions>({
    queryKey: [`/api/roles/${selectedRole}`],
    enabled: !!selectedRole,
  });

  const createRoleMutation = useMutation({
    mutationFn: async (data: RoleFormData) => {
      // Transform the data to match backend expectations
      const transformedData = {
        name: data.name,
        description: data.description,
        permissions: data.permissions?.map(p => ({
          permission_id: p.permissionId,
          access_level: p.accessLevel
        })) || []
      };
      
      const response = await fetch("/api/roles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(transformedData),
      });
      if (!response.ok) {
        throw new Error("Failed to create role");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      setCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Role created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create role",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: RoleFormData }) => {
      // Transform the data to match backend expectations
      const transformedData = {
        name: data.name,
        description: data.description,
        permissions: data.permissions?.map(p => ({
          permission_id: p.permissionId,
          access_level: p.accessLevel
        })) || []
      };
      
      const response = await fetch(`/api/roles/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(transformedData),
      });
      if (!response.ok) {
        throw new Error("Failed to update role");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles", selectedRole] });
      queryClient.refetchQueries({ queryKey: ["/api/roles"] });
      setEditDialogOpen(false);
      setEditingRole(null);
      setSelectedRole(null);
      form.reset();
      toast({
        title: "Success",
        description: "Role updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update role",
        variant: "destructive",
      });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/roles/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete role");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      setSelectedRole(null);
      toast({
        title: "Success",
        description: "Role deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete role",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RoleFormData) => {
    if (editingRole) {
      updateRoleMutation.mutate({ id: editingRole.id, data });
    } else {
      createRoleMutation.mutate(data);
    }
  };

  const handleEditRole = async (role: Role) => {
    setEditingRole(role);
    setSelectedRole(role.id);
    
    // Get the role details with permissions
    try {
      const response = await fetch(`/api/roles/${role.id}`);
      if (response.ok) {
        const roleWithPermissions = await response.json();
        const formPermissions = roleWithPermissions.permissions.map((rp: any) => ({
          permissionId: rp.permissionId,
          accessLevel: rp.accessLevel
        }));
        
        form.reset({
          name: role.name,
          description: role.description || "",
          permissions: formPermissions,
        });
      } else {
        form.reset({
          name: role.name,
          description: role.description || "",
          permissions: [],
        });
      }
    } catch (error) {
      console.error("Failed to load role permissions:", error);
      form.reset({
        name: role.name,
        description: role.description || "",
        permissions: [],
      });
    }
    
    setEditDialogOpen(true);
  };

  const handleDeleteRole = (roleId: number) => {
    if (window.confirm("Are you sure you want to delete this role?")) {
      deleteRoleMutation.mutate(roleId);
    }
  };

  const filteredRoles = roles?.filter((role: Role) => 
    role.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (role.description && role.description.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  const getRoleColor = (roleName: string) => {
    switch (roleName?.toLowerCase()) {
      case 'super admin':
        return 'bg-red-500';
      case 'org admin':
        return 'bg-green-500';
      case 'compliance auditor':
        return 'bg-yellow-500';
      case 'file uploader':
        return 'bg-blue-500';
      case 'file viewer':
        return 'bg-gray-500';
      case 'ai analyst':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getAccessLevelColor = (level: string) => {
    switch (level) {
      case 'Y':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'R':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'N':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const getAccessLevelText = (level: string) => {
    switch (level) {
      case 'Y':
        return 'Full Access';
      case 'R':
        return 'Read Only';
      case 'N':
        return 'No Access';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Roles Management</h1>
        </div>
        {/* Show Add Role button only if current user's role has add permission in role management */}
        {rolePermissions?.roleMgmt?.add && (
          <Dialog open={createDialogOpen} onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) form.reset();
          }}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Role
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Role</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter role name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Enter role description" 
                          {...field}
                          className="resize-none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Permissions</h3>
                  <div className="space-y-3">
                    {permissions?.map((permission) => (
                      <div key={permission.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium">{permission.name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {permission.description || 'No description'}
                          </p>
                        </div>
                        <Select
                          defaultValue="N"
                          onValueChange={(value) => {
                            const currentPermissions = form.getValues("permissions") || [];
                            const existingIndex = currentPermissions.findIndex(
                              p => p.permissionId === permission.id
                            );
                            
                            if (existingIndex >= 0) {
                              currentPermissions[existingIndex].accessLevel = value as "Y" | "R" | "N";
                            } else {
                              currentPermissions.push({
                                permissionId: permission.id,
                                accessLevel: value as "Y" | "R" | "N"
                              });
                            }
                            form.setValue("permissions", currentPermissions);
                          }}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Y">Full Access</SelectItem>
                            <SelectItem value="R">Read Only</SelectItem>
                            <SelectItem value="N">No Access</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  {/* Risk Warning Section */}
                  {(() => {
                    const formPermissions = form.watch("permissions") || [];
                    const activePermissionIds = formPermissions
                      .filter(fp => fp.accessLevel !== "N")
                      .map(fp => fp.permissionId);
                    
                    const activePermissionNames = permissions
                      ?.filter(p => activePermissionIds.includes(p.id))
                      .map(p => p.name) || [];
                    
                    const activeRisks = riskCategories?.filter(cat => 
                      cat.permissions.some((p: string) => activePermissionNames.includes(p))
                    ) || [];

                    if (activeRisks.length === 0) return null;

                    return (
                      <div className="space-y-3 pt-4 border-t">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Shield className="w-4 h-4 text-orange-500" />
                          Permission Risk Assessment
                        </h3>
                        <div className="space-y-2">
                          {activeRisks.map((risk) => (
                            <div 
                              key={risk.id} 
                              className={`p-3 rounded-md border flex gap-3 ${
                                risk.category === 'dangerous' ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-900/30' :
                                risk.category === 'critical' ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-900/30' :
                                risk.category === 'warning' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-900/30' :
                                'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-900/30'
                              }`}
                            >
                              <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                                risk.category === 'dangerous' ? 'bg-red-500' :
                                risk.category === 'critical' ? 'bg-orange-500' :
                                risk.category === 'warning' ? 'bg-yellow-500' :
                                'bg-blue-500'
                              }`} />
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider">{risk.category} RISK</p>
                                <p className="text-xs mt-1 text-gray-700 dark:text-gray-300">{risk.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createRoleMutation.isPending}
                  >
                    {createRoleMutation.isPending ? "Creating..." : "Create Role"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
          </Dialog>
        )}

        {/* Edit Role Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Role</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter role name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Enter role description" 
                          {...field}
                          className="resize-none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Permissions</h3>
                  <div className="space-y-3">
                    {permissions?.map((permission) => {
                      const currentPermission = roleDetails?.permissions?.find(
                        rp => rp.permissionId === permission.id
                      );
                      const baseValue = currentPermission?.accessLevel || "N";
                      
                      // Get current form value or use the default
                      const formPermissions = form.watch("permissions") || [];
                      const formPermission = formPermissions.find(p => p.permissionId === permission.id);
                      const currentValue = formPermission?.accessLevel || baseValue;
                      
                      return (
                        <div key={permission.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1">
                            <h4 className="text-sm font-medium">{permission.name}</h4>
                            <p className="text-xs text-muted-foreground">
                              {permission.description || 'No description'}
                            </p>
                          </div>
                          <Select
                            value={currentValue}
                            onValueChange={(value) => {
                              const currentPermissions = [...(form.getValues("permissions") || [])];
                              const existingIndex = currentPermissions.findIndex(
                                p => p.permissionId === permission.id
                              );
                              
                              if (existingIndex >= 0) {
                                currentPermissions[existingIndex].accessLevel = value as "Y" | "R" | "N";
                              } else {
                                currentPermissions.push({
                                  permissionId: permission.id,
                                  accessLevel: value as "Y" | "R" | "N"
                                });
                              }
                              form.setValue("permissions", currentPermissions);
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Y">Full Access</SelectItem>
                              <SelectItem value="R">Read Only</SelectItem>
                              <SelectItem value="N">No Access</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>

                  {/* Risk Warning Section */}
                  {(() => {
                    const formPermissions = form.watch("permissions") || [];
                    const activePermissionIds = formPermissions
                      .filter(fp => fp.accessLevel !== "N")
                      .map(fp => fp.permissionId);
                    
                    const activePermissionNames = permissions
                      ?.filter(p => activePermissionIds.includes(p.id))
                      .map(p => p.name) || [];
                    
                    const activeRisks = riskCategories?.filter(cat => 
                      cat.permissions.some((p: string) => activePermissionNames.includes(p))
                    ) || [];

                    if (activeRisks.length === 0) return null;

                    return (
                      <div className="space-y-3 pt-4 border-t">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Shield className="w-4 h-4 text-orange-500" />
                          Permission Risk Assessment
                        </h3>
                        <div className="space-y-2">
                          {activeRisks.map((risk) => (
                            <div 
                              key={risk.id} 
                              className={`p-3 rounded-md border flex gap-3 ${
                                risk.category === 'dangerous' ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-900/30' :
                                risk.category === 'critical' ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-900/30' :
                                risk.category === 'warning' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-900/30' :
                                'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-900/30'
                              }`}
                            >
                              <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                                risk.category === 'dangerous' ? 'bg-red-500' :
                                risk.category === 'critical' ? 'bg-orange-500' :
                                risk.category === 'warning' ? 'bg-yellow-500' :
                                'bg-blue-500'
                              }`} />
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider">{risk.category} RISK</p>
                                <p className="text-xs mt-1 text-gray-700 dark:text-gray-300">{risk.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setEditDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateRoleMutation.isPending}
                  >
                    {updateRoleMutation.isPending ? "Updating..." : "Update Role"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Roles Table */}
      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rolesLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-4 bg-gray-200 rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-4 bg-gray-200 rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-4 bg-gray-200 rounded animate-pulse"></div></TableCell>
                </TableRow>
              ))
            ) : filteredRoles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-12">
                  <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No roles found</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredRoles.map((role: Role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 ${
                            role.category === 'dangerous' ? 'bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]' :
                            role.category === 'critical' ? 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]' :
                            role.category === 'warning' ? 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.3)]' :
                            'bg-blue-500 shadow-sm'
                          } rounded-lg flex items-center justify-center border border-white/30 transition-all hover:scale-105 hover:shadow-lg`}>
                            <Shield className="w-4 h-4 text-white drop-shadow-sm" />
                          </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{role.name}</span>
                          <span 
                            className={`${
                              (role.category === 'dangerous' || role.name === 'Super Admin') 
                                ? 'bg-red-600 text-white border-red-700' 
                                : role.category === 'critical' 
                                ? 'bg-orange-500 text-white border-orange-600' 
                                : role.category === 'warning' 
                                ? 'bg-yellow-500 text-white border-yellow-600' 
                                : 'bg-blue-600 text-white border-blue-700'
                            } inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider leading-tight flex-shrink-0 shadow-sm`}
                          >
                            {(role.category || (role.name === 'Super Admin' ? 'dangerous' : 'info'))} Risk
                          </span>
                        </div>
                        <div className="text-sm text-gray-500">{role.description || 'No description'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {/* Permission badges will be rendered based on active permissions */}
                      {(() => {
                        const activePerms = [];
                        if (role.category === 'dangerous' || role.name === 'Super Admin') {
                          return <Badge className="bg-red-100 text-red-800">Full System Access</Badge>;
                        }
                        return <Badge className="bg-gray-100 text-gray-800">Standard Access</Badge>;
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      {rolePermissions?.roleMgmt?.edit && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleEditRole(role)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      {rolePermissions?.roleMgmt?.delete && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDeleteRole(role.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
