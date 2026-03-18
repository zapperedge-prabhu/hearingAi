import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  Shield, 
  Building, 
  Activity, 
  Cloud, 
  FolderOpen,
  Bot,
  LogOut,
  Menu,
  Archive,
  Database,
  ShieldCheck,
  AlertTriangle,
  Cpu,
  Scan,
  Languages,
  Key,
  User,
  Package,
  FileText,
  ClipboardCheck
} from "lucide-react";

const mainNavigation = [
  {
    name: "File Management",
    href: "/file-management", 
    icon: FolderOpen,
    permissionCheck: (permissions: any) => 
      permissions?.fileMgmt?.viewFiles || 
      permissions?.fileMgmt?.uploadFile || 
      permissions?.fileMgmt?.uploadFolder || 
      permissions?.fileMgmt?.downloadFile || 
      permissions?.fileMgmt?.downloadFolder || 
      permissions?.fileMgmt?.createFolder || 
      permissions?.fileMgmt?.deleteFilesAndFolders
  },
  {
    name: "Users",
    href: "/users", 
    icon: Users,
    permissionCheck: (permissions: any) => 
      permissions?.userMgmt?.view ||
      permissions?.userMgmt?.add ||
      permissions?.userMgmt?.edit ||
      permissions?.userMgmt?.delete ||
      permissions?.userMgmt?.enableDisable
  },
  {
    name: "Partner Organizations", 
    href: "/organizations",
    icon: Building,
    permissionCheck: (permissions: any) => 
      permissions?.orgMgmt?.view ||
      permissions?.orgMgmt?.add ||
      permissions?.orgMgmt?.edit ||
      permissions?.orgMgmt?.delete
  },
  {
    name: "Roles & Permissions",
    href: "/roles",
    icon: Shield,
    permissionCheck: (permissions: any) => 
      permissions?.roleMgmt?.view ||
      permissions?.roleMgmt?.add ||
      permissions?.roleMgmt?.edit ||
      permissions?.roleMgmt?.delete
  },
  // {
  //   name: "Storage Accounts",
  //   href: "/storage",
  //   icon: Cloud,
  //   permissionCheck: (permissions: any) => permissions?.storageMgmt?.view
  // },
  {
    name: "Storage Management", 
    href: "/adls-provisioning",
    icon: Database,
    permissionCheck: (permissions: any) => 
      permissions?.storageMgmt?.view ||
      permissions?.storageMgmt?.addStorageContainer ||
      permissions?.storageMgmt?.addContainer ||
      permissions?.storageMgmt?.delete
  },
  {
    name: "Data Protection",
    href: "/data-protection", 
    icon: Shield,
    permissionCheck: (permissions: any) => 
      permissions?.storageMgmt?.dataProtection === true
  },
  {
    name: "Data Lifecycle Management",
    href: "/data-lifecycle", 
    icon: Archive,
    permissionCheck: (permissions: any) => 
      permissions?.storageMgmt?.dataLifecycle === true
  },
  {
    name: "Blob Inventory",
    href: "/blob-inventory", 
    icon: Package,
    permissionCheck: (permissions: any) => 
      permissions?.storageMgmt?.inventoryView === true ||
      permissions?.storageMgmt?.inventoryConfigure === true
  },
  {
    name: "AI Agents",
    href: "/ai-agents",
    icon: Bot,
    permissionCheck: (permissions: any) => 
      permissions?.aiAgentMgmt?.view ||
      permissions?.aiAgentMgmt?.add ||
      permissions?.aiAgentMgmt?.edit ||
      permissions?.aiAgentMgmt?.delete
  },
  {
    name: "PGP Key Management",
    href: "/pgp-key-management",
    icon: Shield,
    permissionCheck: (permissions: any) => 
      permissions?.pgpKeyMgmt?.view ||
      permissions?.pgpKeyMgmt?.generate ||
      permissions?.pgpKeyMgmt?.delete ||
      permissions?.pgpKeyMgmt?.copy
  },
  {
    name: "Activity Logs",
    href: "/activity-logs",
    icon: Activity,
    permissionCheck: (permissions: any) => permissions?.activityLogs?.view
  },
  {
    name: "SIEM Rules",
    href: "/sentinel/rules",
    icon: ShieldCheck,
    permissionCheck: (permissions: any) => 
      permissions?.siemMgmt?.view ||
      permissions?.siemMgmt?.install ||
      permissions?.siemMgmt?.delete ||
      permissions?.siemMgmt?.enableDisable
  },
  {
    name: "SIEM Incidents",
    href: "/sentinel/incidents",
    icon: AlertTriangle,
    permissionCheck: (permissions: any) => 
      permissions?.siemMgmt?.incidentsView
  },
  {
    name: "Foundry AI",
    href: "/foundry-ai",
    icon: Cpu,
    permissionCheck: (permissions: any) => 
      permissions?.foundryMgmt?.view ||
      permissions?.foundryMgmt?.add ||
      permissions?.foundryMgmt?.edit ||
      permissions?.foundryMgmt?.delete
  },
  {
    name: "Content Discovery",
    href: "/content-discovery",
    icon: Scan,
    permissionCheck: (permissions: any) => 
      permissions?.contentUnderstanding?.menuVisibility
  },
  {
    name: "HearingAI",
    href: "/hearing-ai",
    icon: Scan,
    permissionCheck: (permissions: any) => 
      permissions?.contentUnderstanding?.menuVisibility
  },
  {
    name: "Document Translation",
    href: "/document-translation",
    icon: Languages,
    permissionCheck: (permissions: any) => 
      permissions?.documentTranslation?.view || 
      permissions?.documentTranslation?.runTranslation || 
      permissions?.documentTranslation?.deleteTranslation
  },
  {
    name: "Eval",
    href: "/eval",
    icon: ClipboardCheck,
    permissionCheck: (permissions: any) =>
      permissions?.eval?.menuVisibility
  },
  {
    name: "Customer Onboarding",
    href: "/customer-onboarding",
    icon: Users,
    permissionCheck: (permissions: any) => 
      permissions?.customerOnboarding?.view ||
      permissions?.customerOnboarding?.upload ||
      permissions?.customerOnboarding?.commit ||
      permissions?.customerOnboarding?.delete
  },
  {
    name: "SFTP Users",
    href: "/sftp-users",
    icon: Key,
    permissionCheck: (permissions: any) => 
      permissions?.sftpMgmt?.view ||
      permissions?.sftpMgmt?.create ||
      permissions?.sftpMgmt?.update ||
      permissions?.sftpMgmt?.delete
  },
  {
    name: "My SFTP Access",
    href: "/my-sftp-access",
    icon: User,
    permissionCheck: (permissions: any) => 
      permissions?.sftpMgmt?.viewSelfAccess
  },
  {
    name: "Transfer Reports",
    href: "/file-transfer-reports",
    icon: FileText,
    permissionCheck: (permissions: any) => 
      permissions?.transferReports?.view
  }
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // Get current user's role permissions
  const { data: rolePermissions } = useRolePermissions();
  
  const handleLogout = async () => {
    setIsLoggingOut(true);
    toast({
      title: "Logging out...",
      description: "Please wait while we sign you out.",
    });
    
    try {
      await logout();
      // Successful logout typically triggers a redirect, unmounting this component
    } catch (error) {
      console.error("Logout error:", error);
      toast({
        title: "Logout Failed",
        description: "Unable to log out. Please try again.",
        variant: "destructive",
      });
    } finally {
      // Always reset loading state, even if logout redirects or fails
      // This ensures button doesn't stay disabled in test/mock environments
      setIsLoggingOut(false);
    }
  };

  const isActiveRoute = (href: string) => {
    return location === href;
  };

  const getUserInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';
  };

  return (
    <aside className={cn(
      "bg-sidebar shadow-sm border-r border-sidebar-border flex flex-col transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Logo Header */}
      <div className="h-16 flex items-center justify-between border-b border-sidebar-border bg-sidebar-primary px-4">
        {!isCollapsed && (
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-sidebar-primary-foreground">
              Zapper Edge
            </h1>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-sidebar-primary-foreground hover:bg-white/10"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 py-6 overflow-y-auto">
        <TooltipProvider delayDuration={0}>
          <div className="space-y-2">
            {mainNavigation
              .filter((item) => item.permissionCheck(rolePermissions))
              .map((item) => {
                const isActive = isActiveRoute(item.href);
                
                const linkContent = (
                  <Link key={item.name} href={item.href} className={cn(
                    "sidebar-nav-item",
                    isActive && "active",
                    isCollapsed && "justify-center px-2"
                  )}>
                    <item.icon className={cn("w-5 h-5 flex-shrink-0", !isCollapsed && "mr-3")} />
                    {!isCollapsed && item.name}
                  </Link>
                );
                
                if (isCollapsed) {
                  return (
                    <Tooltip key={item.name}>
                      <TooltipTrigger asChild>
                        {linkContent}
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={10}>
                        <p>{item.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                
                return linkContent;
              })}
          </div>
        </TooltipProvider>
      </nav>

      {/* User Profile Section */}
      <div className="p-4 border-t border-sidebar-border">
        <TooltipProvider delayDuration={0}>
          <div className={cn("flex items-center", isCollapsed && "flex-col gap-2")}>
            {isCollapsed ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-8 h-8 bg-sidebar-primary rounded-full flex items-center justify-center cursor-default">
                      <span className="text-sm font-medium text-sidebar-primary-foreground">
                        {getUserInitials(user?.name || "")}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    <p className="font-medium">{user?.name || "User"}</p>
                    <p className="text-xs text-muted-foreground">{user?.email || ""}</p>
                    <p className="text-xs text-muted-foreground">{user?.role?.name || ""}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/10"
                      data-testid="button-logout-collapsed"
                    >
                      <LogOut className={cn("w-4 h-4", isLoggingOut && "animate-spin")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    <p>Logout</p>
                  </TooltipContent>
                </Tooltip>
              </>
            ) : (
              <>
                <div className="w-8 h-8 bg-sidebar-primary rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-sidebar-primary-foreground">
                    {getUserInitials(user?.name || "")}
                  </span>
                </div>
                <div className="ml-3 flex-1 min-w-0">
                  <p className="text-xs text-sidebar-foreground/60 truncate">
                    {user?.email || ""}
                  </p>
                  <p className="text-xs text-sidebar-foreground/40 truncate">
                    {user?.role?.name || ""}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="ml-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/10"
                      data-testid="button-logout"
                    >
                      <LogOut className={cn("w-4 h-4", isLoggingOut && "animate-spin")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Logout</p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </TooltipProvider>
      </div>
    </aside>
  );
}
