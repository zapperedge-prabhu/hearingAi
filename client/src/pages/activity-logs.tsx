import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, User, Download, Upload, Trash2, Plus, Edit, LogIn, LogOut, Filter, Calendar, RefreshCw, Building2 } from "lucide-react";
import { ActivityLogsRefreshProgressDialog } from "@/components/activity-logs-refresh-progress-dialog";
import { useRole } from "@/contexts/role-context";
import { buildFileApiUrl } from "@/lib/api";

interface ActivityLog {
  id: number;
  userId: string;
  userName: string;
  email: string;
  ipAddress?: string;
  action: string;
  actionCategory: string;
  resource?: string;
  resourceType?: string;
  details?: string;
  actionTime: string;
  loginTime?: string;
  logoutTime?: string;
  organizationId?: number;
  organizationName?: string;
}

export default function ActivityLogs() {
  const { selectedOrganizationId } = useRole();
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const [sortField, setSortField] = useState<'actionTime' | 'action' | 'userName' | 'actionCategory' | 'resource'>('actionTime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [crossOrgMode, setCrossOrgMode] = useState(false);
  const queryClient = useQueryClient();

  // Build filter params for API calls
  const filterParams = {
    limit: itemsPerPage,
    offset: (currentPage - 1) * itemsPerPage,
    ...(searchTerm && { search: searchTerm }),
    ...(actionFilter !== 'all' && { action: actionFilter }),
    ...(categoryFilter !== 'all' && { category: categoryFilter }),
    ...(userFilter !== 'all' && { userEmail: userFilter }),
  };

  // Query for organization-scoped activities
  const { data: orgData, isLoading: isLoadingOrg, refetch: refetchOrg } = useQuery<{ activities: ActivityLog[], total: number }>({
    queryKey: [buildFileApiUrl("/api/user-activities", { 
      organizationId: selectedOrganizationId,
      ...filterParams
    })],
    enabled: !!selectedOrganizationId && !crossOrgMode,
    staleTime: 0,
  });

  // Query for cross-organization activities (actor-centric)
  const { data: actorData, isLoading: isLoadingActor, refetch: refetchActor } = useQuery<{ activities: ActivityLog[], total: number }>({
    queryKey: ["/api/user-activities/actor", filterParams],
    enabled: crossOrgMode,
    staleTime: 0,
  });

  // Use the appropriate activities based on mode
  // The API returns { activities: ActivityLog[], total: number, limit: number, offset: number }
  const rawData = crossOrgMode ? actorData : orgData;
  const activities = (rawData as any)?.activities || [];
  const totalActivities = (rawData as any)?.total || 0;
  const isLoading = crossOrgMode ? isLoadingActor : isLoadingOrg;
  const refetch = crossOrgMode ? refetchActor : refetchOrg;

  // Client-side filtering only applies to the current page since we are doing server-side pagination
  const filteredAndSortedActivities = activities;
  
  // Calculate pagination
  const totalPages = Math.ceil(totalActivities / itemsPerPage);
  const hasMore = currentPage < totalPages;

  // Reset to page 1 when filters change
  const resetPagination = () => {
    setCurrentPage(1);
  };

  // Get unique values for filters (Note: these only show values from the CURRENT page now)
  const uniqueActions = Array.from(new Set(activities?.map(a => a.action).filter(Boolean) || []));
  const uniqueCategories = Array.from(new Set(activities?.map(a => a.actionCategory).filter(Boolean) || []));
  const uniqueUsers = Array.from(new Set(activities?.map(a => a.email).filter(Boolean) || []));
  const uniqueOrganizations = Array.from(new Set(activities?.map(a => a.organizationName).filter(Boolean) || []));

  // Handle sorting (Server-side sort could be implemented, but for now we sort the page)
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) {
      return <span className="text-gray-400">↕</span>;
    }
    return sortDirection === 'asc' ? <span className="text-blue-600">↑</span> : <span className="text-blue-600">↓</span>;
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'LOGIN': return <LogIn className="w-4 h-4 text-green-600" />;
      case 'LOGOUT': return <LogOut className="w-4 h-4 text-gray-600" />;
      case 'CREATE_USER': 
      case 'CREATE_ROLE': 
      case 'CREATE_ORGANIZATION': 
      case 'CREATE_STORAGE_ACCOUNT': return <Plus className="w-4 h-4 text-blue-600" />;
      case 'UPDATE_USER': 
      case 'UPDATE_ROLE': 
      case 'UPDATE_ORGANIZATION': return <Edit className="w-4 h-4 text-yellow-600" />;
      case 'DELETE_USER': 
      case 'DELETE_ROLE': 
      case 'DELETE_ORGANIZATION': 
      case 'DELETE_FILE': 
      case 'DELETE_DIRECTORY': 
      case 'DELETE_STORAGE_ACCOUNT': return <Trash2 className="w-4 h-4 text-red-600" />;
      case 'DOWNLOAD_FILE': 
      case 'DOWNLOAD_DIRECTORY': return <Download className="w-4 h-4 text-purple-600" />;
      case 'UPLOAD_FILE': return <Upload className="w-4 h-4 text-indigo-600" />;
      default: return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getCategoryBadge = (category: string) => {
    const colors = {
      AUTH: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      USER_MANAGEMENT: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
      ROLE_MANAGEMENT: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
      FILE_MANAGEMENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
      STORAGE_MANAGEMENT: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400',
      SYSTEM: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
    };
    
    return colors[category as keyof typeof colors] || colors.SYSTEM;
  };

  const formatActionName = (action: string) => {
    return action.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  const formatCategoryName = (category: string) => {
    return category.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  if (!selectedOrganizationId && !crossOrgMode) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Activity className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Activity Logs</h1>
          </div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-300">Please select an organization to view activity logs, or enable "My Activity Across Organizations" mode below.</p>
          <div className="flex items-center gap-2 mt-4">
            <Switch
              id="cross-org-mode-empty"
              checked={crossOrgMode}
              onCheckedChange={(checked) => {
                setCrossOrgMode(checked);
                setOrganizationFilter("all");
                resetPagination();
              }}
              data-testid="switch-cross-org-mode"
            />
            <Label htmlFor="cross-org-mode-empty" className="text-sm font-medium cursor-pointer">
              My Activity Across Organizations
            </Label>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Activity className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">Activity Logs</h1>
          </div>
        </div>
        <LoadingSpinner message="Loading activity logs..." size="lg" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-3">
            <Activity className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Activity Logs</h1>
            {crossOrgMode && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                All Organizations
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="cross-org-mode"
              checked={crossOrgMode}
              onCheckedChange={(checked) => {
                setCrossOrgMode(checked);
                setOrganizationFilter("all");
                resetPagination();
              }}
              data-testid="switch-cross-org-mode-main"
            />
            <Label htmlFor="cross-org-mode" className="text-sm font-medium cursor-pointer whitespace-nowrap">
              My Activity Across Organizations
            </Label>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters
            </h2>
            <Button 
              onClick={async () => {
                setIsRefreshing(true);
                try {
                  await refetch();
                  if (crossOrgMode) {
                    await queryClient.invalidateQueries({ queryKey: ["/api/user-activities/actor"] });
                  } else {
                    await queryClient.invalidateQueries({ queryKey: [buildFileApiUrl("/api/user-activities", { organizationId: selectedOrganizationId })] });
                  }
                  await new Promise(resolve => setTimeout(resolve, 500));
                } finally {
                  setIsRefreshing(false);
                }
              }} 
              variant="outline" 
              size="sm"
              className="flex items-center gap-2"
              disabled={isRefreshing || (!selectedOrganizationId && !crossOrgMode)}
              data-testid="button-refresh-activity-logs"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Search</label>
              <Input
                placeholder="Search by user, action, or resource..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-activity-search"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger data-testid="select-category-filter">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {uniqueCategories.map(category => (
                    <SelectItem key={category} value={category}>
                      {formatCategoryName(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Action</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger data-testid="select-action-filter">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {uniqueActions.map(action => (
                    <SelectItem key={action} value={action}>
                      {formatActionName(action)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">User</label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger data-testid="select-user-filter">
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {uniqueUsers.map(user => (
                    <SelectItem key={user} value={user}>
                      {user}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {crossOrgMode && (
              <div>
                <label className="block text-sm font-medium mb-2">Organization</label>
                <Select value={organizationFilter} onValueChange={setOrganizationFilter}>
                  <SelectTrigger data-testid="select-organization-filter">
                    <SelectValue placeholder="All Organizations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Organizations</SelectItem>
                    {uniqueOrganizations.map(org => (
                      <SelectItem key={org} value={org as string}>
                        {org}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => handleSort('action')}>
                  <div className="flex items-center gap-1">Action <SortIcon field="action" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => handleSort('userName')}>
                  <div className="flex items-center gap-1">User <SortIcon field="userName" /></div>
                </TableHead>
                {crossOrgMode && (
                  <TableHead>
                    <div className="flex items-center gap-1"><Building2 className="w-4 h-4" /> Organization</div>
                  </TableHead>
                )}
                <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => handleSort('actionCategory')}>
                  <div className="flex items-center gap-1">Category <SortIcon field="actionCategory" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => handleSort('resource')}>
                  <div className="flex items-center gap-1">Resource <SortIcon field="resource" /></div>
                </TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => handleSort('actionTime')}>
                  <div className="flex items-center gap-1">Time <SortIcon field="actionTime" /></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={crossOrgMode ? 7 : 6} className="text-center py-12">
                    <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No activity logs found</p>
                  </TableCell>
                </TableRow>
              ) : (
                activities.map((activity) => (
                  <TableRow key={activity.id} data-testid={`row-activity-${activity.id}`}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getActionIcon(activity.action)}
                        <span className="font-medium">{formatActionName(activity.action)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{activity.userName}</div>
                        <div className="text-sm text-gray-500">{activity.email}</div>
                      </div>
                    </TableCell>
                    {crossOrgMode && (
                      <TableCell>
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                          <Building2 className="w-3 h-3" />
                          {activity.organizationName || 'Unknown'}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge className={getCategoryBadge(activity.actionCategory)}>
                        {formatCategoryName(activity.actionCategory)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {activity.resource && (
                        <div>
                          <div className="font-medium">{activity.resource}</div>
                          {activity.resourceType && (
                            <div className="text-sm text-gray-500">{activity.resourceType}</div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {activity.ipAddress || '-'}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>{new Date(activity.actionTime).toLocaleString()}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-gray-500">
              Page {currentPage} of {Math.max(1, totalPages)} ({totalActivities} total logs)
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentPage(Math.max(1, currentPage - 1));
                  window.scrollTo(0, 0);
                }}
                disabled={currentPage === 1}
                data-testid="button-pagination-prev"
              >
                Previous
              </Button>
              <span className="text-sm font-medium px-4 py-1 border rounded bg-gray-50 dark:bg-gray-800">
                {currentPage}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentPage(currentPage + 1);
                  window.scrollTo(0, 0);
                }}
                disabled={!hasMore}
                data-testid="button-pagination-next"
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Activities</p>
                <p className="text-2xl font-bold">{totalActivities}</p>
              </div>
              <Activity className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Users on Page</p>
                <p className="text-2xl font-bold">{uniqueUsers.length}</p>
              </div>
              <User className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Categories on Page</p>
                <p className="text-2xl font-bold">{uniqueCategories.length}</p>
              </div>
              <Filter className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </div>

        <ActivityLogsRefreshProgressDialog isOpen={isRefreshing} />
      </div>
    </ScrollArea>
  );
}
