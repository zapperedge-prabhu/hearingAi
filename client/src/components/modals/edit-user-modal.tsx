import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { Shield, Loader2 } from "lucide-react";

const editUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  role_id: z.string().min(1, "Role is required"),
  organization_id: z.string().min(1, "Organization is required"),
  userType: z.enum(["internal", "external"]).default("internal"),
  user_role_id: z.number().optional(),
});

type EditUserForm = z.infer<typeof editUserSchema>;

interface Role {
  id: number;
  name: string;
  roleCategory?: string;
}

interface Organization {
  id: number;
  name: string;
}

interface UserWithRole {
  id: number;
  name: string;
  email: string;
  userType?: string | null;
  role: { name: string };
  organization: { name: string };
  userRoleId: number;
  roleId: number;
  organizationId: number;
  isEnabled: boolean;
}

interface EditUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithRole | null;
}

export default function EditUserModal({ open, onOpenChange, user }: EditUserModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rolePermissions } = useRolePermissions();
  const [isEnabled, setIsEnabled] = useState(true);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const form = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: "",
      email: "",
      role_id: "",
      organization_id: "",
      userType: "internal",
    },
  });

  const { data: riskCategories } = useQuery<any[]>({
    queryKey: ["/api/permission-risk-categories"],
    staleTime: 30000,
  });

  const selectedRoleId = form.watch("role_id");
  const { data: selectedRoleDetails } = useQuery<any>({
    queryKey: ["/api/roles", selectedRoleId],
    enabled: !!selectedRoleId && open,
  });

  const { data: roles } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    enabled: open,
  });

  const { data: permissions } = useQuery<any[]>({
    queryKey: ["/api/permissions"],
    enabled: open,
  });

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    enabled: open,
  });

  // Immediately populate form with user data when modal opens
  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        email: user.email,
        role_id: "",
        organization_id: "",
        userType: user.userType || "internal",
        user_role_id: user.userRoleId,
      });
      setIsEnabled(user.isEnabled ?? true);
    }
  }, [user, form]);

  // Update dropdown values when roles and organizations load
  useEffect(() => {
    if (user && roles && organizations) {
      const userRole = roles.find(role => role.name === user.role.name);
      const userOrganization = organizations.find(org => org.name === user.organization.name);
      
      // Only update the dropdown values, preserving name and email
      form.setValue("role_id", userRole?.id.toString() || "");
      form.setValue("organization_id", userOrganization?.id.toString() || "");
    }
  }, [user, roles, organizations, form]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: EditUserForm) => {
      if (!user) throw new Error("No user to update");
      
      const response = await apiRequest("PUT", `/api/users/${user.id}`, {
        ...data,
        role_id: parseInt(data.role_id),
        organization_id: parseInt(data.organization_id),
        userType: data.userType,
        user_role_id: data.user_role_id,
      });
      if (!response.ok) {
        let errorMessage = "Failed to update user";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response isn't JSON, use status text or generic message
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-roles"] });
      toast({
        title: "Success",
        description: "User updated successfully",
        variant: "default",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditUserForm) => {
    updateUserMutation.mutate(data);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
      setIsTogglingStatus(false);
    }
    onOpenChange(newOpen);
  };

  const handleToggleStatus = async (checked: boolean) => {
    if (!user) return;
    
    setIsTogglingStatus(true);
    try {
      const endpoint = checked 
        ? `/api/user-roles/${user.id}/${user.roleId}/${user.organizationId}/enable`
        : `/api/user-roles/${user.id}/${user.roleId}/${user.organizationId}/disable`;
      
      const response = await apiRequest("PUT", endpoint);
      
      if (!response.ok) {
        throw new Error(`Failed to ${checked ? 'enable' : 'disable'} user`);
      }
      
      setIsEnabled(checked);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: `User ${checked ? 'enabled' : 'disabled'} successfully`,
        variant: "default",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${checked ? 'enable' : 'disable'} user`,
        variant: "destructive",
      });
      // Revert the switch state on error
      setIsEnabled(!checked);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-md max-h-[85vh] overflow-y-auto"
        showClose={!updateUserMutation.isPending}
        onPointerDownOutside={(e) => {
          e.preventDefault();
          toast({
            title: "Dialog Protection",
            description: updateUserMutation.isPending
              ? "Please wait for the user update to complete. You cannot close this window during update."
              : "Please use the X button to close this dialog to avoid losing your work.",
            variant: "default",
          });
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          toast({
            title: "Dialog Protection",
            description: updateUserMutation.isPending
              ? "Please wait for the user update to complete. You cannot close this window during update."
              : "Please use the X button to close this dialog to avoid losing your work.",
            variant: "default",
          });
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update user information and manage role assignments.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter full name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input 
                      type="email" 
                      placeholder="Enter email address" 
                      {...field}
                      disabled
                      className="bg-gray-100 cursor-not-allowed"
                      data-testid="input-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  {!roles ? (
                    <div className="flex items-center space-x-2 p-3 border rounded-md bg-gray-50">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm text-gray-600">
                        Current: {user?.role.name} (Loading options...)
                      </span>
                    </div>
                  ) : (
                    <>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {roles.map((role) => (
                            <SelectItem key={role.id} value={role.id.toString()}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {(() => {
                        const selectedRoleIdFromField = field.value;
                        if (!selectedRoleIdFromField || !roles) return null;
                        
                        const selectedRole = roles.find(r => r.id.toString() === selectedRoleIdFromField);
                        const isSuperAdmin = selectedRole?.name.trim().toLowerCase() === 'super admin';

                        let activeRisks: any[] = [];
                        
                        // Priority 1: Use explicit risk assessment from selectedRole if it has a category
                        const roleFromApi = roles.find(r => r.id.toString() === selectedRoleIdFromField);
                        // Check both 'category' and 'roleCategory' to be safe
                        const riskCategory = (roleFromApi as any)?.category || (roleFromApi as any)?.roleCategory;
                        
                        if (riskCategory) {
                          const cat = riskCategories?.find(c => c.category.toLowerCase().trim() === riskCategory.toLowerCase().trim());
                          if (cat) {
                            activeRisks.push(cat);
                          }
                        } else if (isSuperAdmin) {
                          // Immediate fallback for Super Admin if no category yet
                          const dangerousCat = riskCategories?.find(c => c.category === 'dangerous') || {
                            category: 'dangerous',
                            description: 'This role has full administrative access to the entire platform, including all organizations and system settings.'
                          };
                          activeRisks.push(dangerousCat);
                        }

                        // Priority 2: Supplemental risk assessment from selectedRoleDetails if available
                        if (selectedRoleDetails && riskCategories && permissions) {
                          const rolePerms = selectedRoleDetails?.permissions || selectedRoleDetails?.role_permissions || [];
                          const activePermissionNames = permissions
                            .filter((p: any) => {
                              return rolePerms.some((rp: any) => 
                                (rp.permissionId === p.id || rp.permission_id === p.id) && 
                                (rp.access_level !== "N" && rp.accessLevel !== "N")
                              );
                            })
                            .map((p: any) => p.name);

                          const detailRisks = riskCategories.filter(cat => 
                            cat.permissions.some((p: string) => activePermissionNames.includes(p))
                          );
                          
                          detailRisks.forEach(dr => {
                            if (!activeRisks.some(ar => ar.category === dr.category)) {
                              activeRisks.push(dr);
                            }
                          });
                        }
                        
                        // Priority 3: Final fallback to hardcoded defaults for Super Admin only if no other risks found
                        if (activeRisks.length === 0 && isSuperAdmin) {
                          const dangerousCatFromData = riskCategories?.find(c => c.category === 'dangerous');
                          const dangerousCat = dangerousCatFromData || {
                            category: 'dangerous',
                            description: 'This role has full administrative access to the entire platform, including all organizations and system settings.'
                          };
                          activeRisks.push(dangerousCat);
                        }

                        if (activeRisks.length === 0) return null;

                        const highestRisk = activeRisks.reduce((prev, current) => {
                          const priority: Record<string, number> = { dangerous: 4, critical: 3, warning: 2, info: 1 };
                          return (priority[current.category] > priority[prev.category]) ? current : prev;
                        }, activeRisks[0]);

                        const isHighRisk = highestRisk.category === 'dangerous' || highestRisk.category === 'critical';

                        return (
                          <div className={`mt-2 p-3 rounded-md border flex gap-3 ${
                            highestRisk.category === 'dangerous' ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-900/30' :
                            highestRisk.category === 'critical' ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-900/30' :
                            highestRisk.category === 'warning' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-900/30' :
                            'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-900/30'
                          }`}>
                            <Shield className={`w-4 h-4 shrink-0 mt-0.5 ${
                              highestRisk.category === 'dangerous' ? 'text-red-600' :
                              highestRisk.category === 'critical' ? 'text-orange-600' :
                              highestRisk.category === 'warning' ? 'text-yellow-600' :
                              'text-blue-600'
                            }`} />
                            <div>
                              <p className={`text-xs font-bold uppercase tracking-wider ${isHighRisk ? 'text-red-700 dark:text-red-400 animate-pulse' : ''}`}>
                                {highestRisk.category} RISK ROLE {isHighRisk ? ' - PROCEED WITH CAUTION' : ''}
                              </p>
                              <p className="text-xs mt-1 text-gray-700 dark:text-gray-300">
                                {isHighRisk ? <strong>WARNING: This role has high-level permissions. </strong> : ''}
                                {highestRisk.description}
                              </p>
                              {isHighRisk && (
                                <p className="text-[10px] mt-2 text-red-600 font-medium italic">
                                  * Misassignment of this role can expose cross-organization data or sensitive system settings.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="organization_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Partner Organization</FormLabel>
                  {!organizations ? (
                    <div className="flex items-center space-x-2 p-3 border rounded-md bg-gray-50">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm text-gray-600">
                        Current: {user?.organization.name} (Loading options...)
                      </span>
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a partner organization" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {organizations.map((org) => (
                          <SelectItem key={org.id} value={org.id.toString()}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="userType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-user-type">
                        <SelectValue placeholder="Select user type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="external">External</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    Internal users belong to your organization. External users are partners or third parties.
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Show enable/disable toggle only if user has enableDisable permission */}
            {rolePermissions?.userMgmt?.enableDisable && (
              <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">User Status</Label>
                  <div className="text-sm text-muted-foreground">
                    Enable or disable this user account
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {isTogglingStatus && (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                  )}
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={handleToggleStatus}
                    disabled={isTogglingStatus}
                    data-testid="switch-edit-user-enabled"
                  />
                </div>
              </div>
            )}

            <div className="flex space-x-3 pt-4">
              <Button 
                type="submit" 
                className="flex-1 bg-primary hover:bg-primary/90"
                disabled={updateUserMutation.isPending}
              >
                {updateUserMutation.isPending ? "Updating..." : "Update User"}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1"
                onClick={() => handleOpenChange(false)}
                disabled={updateUserMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}