import { useRole } from "@/contexts/role-context";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User } from "lucide-react";
import { useState, useEffect } from "react";
import { OrganizationCombobox } from "@/components/organization-combobox";

export function RoleSelector() {
  const { selectedRole, selectedOrganizationId, availableRoles, setSelectedRole, isLoading } = useRole();
  const [localOrgId, setLocalOrgId] = useState<number | null>(null);
  
  // Get current user info for display name
  const { data: userInfo } = useQuery({
    queryKey: ["/api/me"],
    staleTime: 5 * 60 * 1000,
  });

  // Get unique organizations from available roles
  const availableOrganizations = availableRoles.reduce((acc, role) => {
    const org = role.organization;
    if (!acc.find(o => o.id === org.id)) {
      acc.push(org);
    }
    return acc;
  }, [] as Array<{ id: number; name: string; description?: string }>);

  // Always use the organization ID from the role context
  const currentOrgId = selectedOrganizationId || localOrgId;
  
  // Get roles for the selected organization
  const rolesForSelectedOrg = availableRoles.filter(
    role => role.organizationId === currentOrgId
  );

  // Sync local state with context
  useEffect(() => {
    if (selectedOrganizationId) {
      setLocalOrgId(selectedOrganizationId);
    } else if (selectedRole && selectedRole.organizationId !== localOrgId) {
      setLocalOrgId(selectedRole.organizationId);
    } else if (availableOrganizations.length > 0 && !localOrgId) {
      setLocalOrgId(availableOrganizations[0].id);
    }
  }, [selectedOrganizationId, selectedRole, availableOrganizations, localOrgId]);

  const handleOrganizationChange = (organizationId: number) => {
    setLocalOrgId(organizationId);
    
    // Auto-select first available role in this organization
    const firstRoleInOrg = availableRoles.find(role => role.organizationId === organizationId);
    if (firstRoleInOrg) {
      setSelectedRole(firstRoleInOrg.roleId, organizationId);
    }
  };

  const handleRoleChange = (roleId: string) => {
    if (currentOrgId) {
      setSelectedRole(parseInt(roleId), currentOrgId);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (availableRoles.length === 0) {
    return (
      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
        <span>No roles assigned</span>
      </div>
    );
  }

  const userName = (userInfo as any)?.name || "User";
  const selectedOrganization = availableOrganizations.find(org => org.id === currentOrgId);
  const currentRole = selectedRole?.role?.name || "Select Role";

  return (
    <div className="flex items-center space-x-6 text-sm w-full">
      <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      
      <div className="flex items-center space-x-4 flex-1">
        <div className="min-w-[240px]">
          <OrganizationCombobox
            organizations={availableOrganizations}
            value={currentOrgId}
            onValueChange={handleOrganizationChange}
            placeholder="Select Organization"
          />
        </div>
        
        <span className="text-muted-foreground">-</span>
        
        <div className="min-w-[180px]">
          <Select 
            value={selectedRole?.roleId.toString() || ""} 
            onValueChange={handleRoleChange}
            disabled={!currentOrgId}
          >
            <SelectTrigger className="border-none bg-transparent h-auto p-1 font-medium text-primary hover:text-primary/80 focus:ring-0 w-full text-left">
              <SelectValue className="text-left">
                {currentRole}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {rolesForSelectedOrg.map((role) => (
                <SelectItem key={role.roleId} value={role.roleId.toString()}>
                  {role.role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}