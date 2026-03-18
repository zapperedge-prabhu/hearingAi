import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import StatsCard from "@/components/stats-card";
import AddUserModal from "@/components/modals/add-user-modal";
import { useState } from "react";
import { 
  Users, 
  Building, 
  Database, 
  Clock, 
  UserPlus, 
  Shield, 
  Cloud,
  TrendingUp,
  Activity,
  CheckCircle,
  Circle
} from "lucide-react";

interface DashboardStats {
  totalUsers: number;
  totalOrganizations: number;
  activeSessions: number;
  totalRoles: number;
}

interface UserActivity {
  id: number;
  userName: string;
  email: string;
  ipAddress?: string;
  loginTime?: string;
  logoutTime?: string;
  sessionId?: string;
  userAgent?: string;
  createdAt: string;
}

interface UserWithRole {
  id: number;
  name: string;
  email: string;
  role: { name: string };
  organization: { name: string };
  roleName?: string;
  organizationName?: string;
}

interface Organization {
  id: number;
  name: string;
  description?: string;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);

  const { data: activities, isLoading: activitiesLoading} = useQuery<UserActivity[]>({
    queryKey: ["/api/user-activities"],
  });

  const { data: recentUsers, isLoading: usersLoading } = useQuery<UserWithRole[]>({
    queryKey: ["/api/users"],
  });

  const { data: organizations, isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const handleQuickAction = (action: string) => {
    switch (action) {
      case "addUser":
        setIsAddUserModalOpen(true);
        break;
      case "createRole":
        toast({ title: "Create Role", description: "Role creation feature coming soon" });
        break;
      case "addOrg":
        toast({ title: "Add Organization", description: "Organization creation feature coming soon" });
        break;
      case "setupStorage":
        toast({ title: "Setup Storage", description: "Storage configuration feature coming soon" });
        break;
    }
  };

  const getActivityIcon = (activity: UserActivity) => {
    if (activity.logoutTime) {
      return <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
        <Activity className="w-5 h-5 text-red-600 dark:text-red-400" />
      </div>;
    }
    return <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
      <Activity className="w-5 h-5 text-primary" />
    </div>;
  };

  const getActivityDescription = (activity: UserActivity) => {
    if (activity.logoutTime) {
      return `${activity.userName} logged out`;
    }
    return `${activity.userName} logged in`;
  };

  const getActivityTime = (activity: UserActivity) => {
    const date = new Date(activity.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minutes ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
  };

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

  const getRoleBadgeColor = (roleName: string) => {
    switch (roleName.toLowerCase()) {
      case 'super admin':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'org admin':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'compliance auditor':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'file uploader':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-10 pr-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-primary w-64 bg-background"
            />
            <Activity className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Users"
          value={recentUsers?.length || 0}
          icon={Users}
          change="+12% increase"
          changeType="positive"
          loading={usersLoading}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <StatsCard
          title="Partner Organizations"
          value={organizations?.length || 0}
          icon={Building}
          change="2 new this week"
          changeType="neutral"
          loading={orgsLoading}
          iconColor="text-accent"
          iconBg="bg-accent/10"
        />
        <StatsCard
          title="Storage Used"
          value="2.4 TB"
          icon={Database}
          change="68% of 5TB capacity"
          changeType="neutral"
          loading={false}
          iconColor="text-purple-600"
          iconBg="bg-purple-100"
          progress={68}
        />
        <StatsCard
          title="Active Sessions"
          value={activities?.filter(a => !a.logoutTime).length || 0}
          icon={Clock}
          change="Last login: 2 min ago"
          changeType="neutral"
          loading={activitiesLoading}
          iconColor="text-green-600"
          iconBg="bg-green-100"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent User Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Recent User Activity</CardTitle>
              <Button variant="link" size="sm" className="text-primary hover:text-primary/80">
                View all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {activitiesLoading ? (
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4 animate-pulse">
                    <div className="w-10 h-10 bg-muted rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-1/2"></div>
                      <div className="h-3 bg-muted rounded w-1/3"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {activities?.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex items-center space-x-4">
                    {getActivityIcon(activity)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {getActivityDescription(activity)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {activity.email} • {getActivityTime(activity)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {activity.ipAddress || 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="border-b border-border">
            <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3">
              <Button 
                className="w-full justify-center bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => handleQuickAction("addUser")}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add New User
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-center"
                onClick={() => handleQuickAction("createRole")}
              >
                <Shield className="w-4 h-4 mr-2" />
                Create Role
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-center"
                onClick={() => handleQuickAction("addOrg")}
              >
                <Building className="w-4 h-4 mr-2" />
                Add Partner Organization
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-center"
                onClick={() => handleQuickAction("setupStorage")}
              >
                <Cloud className="w-4 h-4 mr-2" />
                Setup Storage
              </Button>
            </div>
            
            <div className="mt-6 pt-6 border-t border-border">
              <h4 className="text-sm font-semibold text-foreground mb-3">System Status</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Database</span>
                  <span className="flex items-center text-sm text-green-600 dark:text-green-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Online
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Azure Storage</span>
                  <span className="flex items-center text-sm text-green-600 dark:text-green-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Connected
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Auth Service</span>
                  <span className="flex items-center text-sm text-green-600 dark:text-green-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Active
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users & Organizations Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Recent Users */}
        <Card>
          <CardHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Recent Users</CardTitle>
              <Button variant="link" size="sm" className="text-primary hover:text-primary/80">
                Manage users
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {usersLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4 animate-pulse">
                    <div className="w-10 h-10 bg-muted rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-1/2"></div>
                      <div className="h-3 bg-muted rounded w-1/3"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {recentUsers?.slice(0, 4).map((user, index) => (
                  <div key={`${user.id}-${user.roleName}-${user.organizationName}-${index}`} className="flex items-center space-x-4">
                    <div className={`w-10 h-10 bg-gradient-to-br ${getGradientColor(index)} rounded-full flex items-center justify-center`}>
                      <span className="text-sm font-medium text-white">
                        {getUserInitials(user.name)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="text-right">
                      <Badge className={`text-xs ${getRoleBadgeColor(user.roleName || 'No Role')}`}>
                        {user.roleName || 'No Role'}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">{user.organizationName || 'No Organization'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Organizations Overview */}
        <Card>
          <CardHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Partner Organizations</CardTitle>
              <Button variant="link" size="sm" className="text-primary hover:text-primary/80">
                View all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {orgsLoading ? (
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-muted rounded-lg animate-pulse">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-muted-foreground rounded-lg"></div>
                      <div className="space-y-2">
                        <div className="h-4 bg-muted-foreground rounded w-24"></div>
                        <div className="h-3 bg-muted-foreground rounded w-16"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {organizations?.slice(0, 4).map((org, index) => (
                  <div key={org.id} className="flex items-center justify-between p-4 bg-muted/30 dark:bg-muted/10 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 bg-gradient-to-br ${getGradientColor(index)} rounded-lg flex items-center justify-center`}>
                        <Building className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{org.name}</p>
                        <p className="text-xs text-muted-foreground">Active</p>
                      </div>
                    </div>
                    <span className="text-sm text-green-600 dark:text-green-400 font-medium">Active</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add User Modal */}
      <AddUserModal 
        open={isAddUserModalOpen} 
        onOpenChange={setIsAddUserModalOpen}
      />
    </div>
  );
}
