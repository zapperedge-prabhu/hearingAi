import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface UserRole {
  id: number;
  userId: number;
  roleId: number;
  organizationId: number;
  createdAt: string;
  isEnabled: boolean;
  role: {
    id: number;
    name: string;
    description?: string;
  };
  organization: {
    id: number;
    name: string;
    description?: string;
  };
}

interface RoleContextType {
  selectedRoleId: number | null;
  selectedOrganizationId: number | null;
  selectedRole: UserRole | null;
  availableRoles: UserRole[];
  setSelectedRole: (roleId: number | null, organizationId: number | null) => void;
  isLoading: boolean;
  error: any;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<number | null>(null);
  const [hasRestoredFromStorage, setHasRestoredFromStorage] = useState(false);
  const [location, setLocation] = useLocation();

  // Fetch current user's roles from their email
  const { data: userInfo } = useQuery({
    queryKey: ["/api/me"],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: false,
  });

  const { data: availableRoles = [], isLoading, error } = useQuery<UserRole[]>({
    queryKey: ["/api/my-roles"],
    enabled: !!userInfo,
    staleTime: 30 * 1000,
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 30 * 1000,
  });

  // Filter only enabled roles
  const enabledRoles = availableRoles.filter(role => role.isEnabled);

  // Restore selection from localStorage on mount (only if role is enabled)
  useEffect(() => {
    if (enabledRoles.length === 0) return;
    
    const stored = localStorage.getItem('selectedRole');
    if (stored) {
      try {
        const { roleId, organizationId } = JSON.parse(stored);
        // Check if the stored role is still available and enabled
        if (enabledRoles.some(role => role.roleId === roleId && role.organizationId === organizationId)) {
          setSelectedRoleId(roleId);
          setSelectedOrganizationId(organizationId);
          setHasRestoredFromStorage(true);
          return;
        }
      } catch (error) {
        console.error('Failed to restore role selection:', error);
        localStorage.removeItem('selectedRole'); // Clean up invalid data
      }
    }
    
    // If no valid stored selection, auto-select first enabled role
    if (!selectedRoleId && enabledRoles.length > 0) {
      const firstRole = enabledRoles[0];
      setSelectedRoleId(firstRole.roleId);
      setSelectedOrganizationId(firstRole.organizationId);
    }
    
    setHasRestoredFromStorage(true);
  }, [enabledRoles]);

  const selectedRole = enabledRoles.find(
    role => role.roleId === selectedRoleId && role.organizationId === selectedOrganizationId
  ) || null;

  const setSelectedRole = (roleId: number | null, organizationId: number | null) => {
    const previousRoleId = selectedRoleId;
    const previousOrgId = selectedOrganizationId;
    
    setSelectedRoleId(roleId);
    setSelectedOrganizationId(organizationId);
    
    // Store selection in localStorage for persistence
    if (roleId && organizationId) {
      localStorage.setItem('selectedRole', JSON.stringify({ roleId, organizationId }));
    }
    
    // Navigate to File Management if role or organization changed (unless on login/auth pages)
    const shouldNavigateToFileManagement = (
      hasRestoredFromStorage && // Only after initial load
      (previousRoleId !== roleId || previousOrgId !== organizationId) && // Role/org actually changed
      location !== '/' && // Not already on root (File Management)
      location !== '/file-management' && // Not already on File Management
      !location.startsWith('/auth') && // Not on auth pages
      !location.startsWith('/login') // Not on login pages
    );
    
    if (shouldNavigateToFileManagement) {
      console.log('🔄 Organization/Role changed, navigating to File Management tab');
      setLocation('/file-management');
    }
  };



  return (
    <RoleContext.Provider value={{
      selectedRoleId,
      selectedOrganizationId,
      selectedRole,
      availableRoles: enabledRoles,
      setSelectedRole,
      isLoading,
      error,
    }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}