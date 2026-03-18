import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { Clock, Settings, Save, RotateCcw, AlertTriangle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient } from "@/lib/queryClient";

interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  retentionDays: number;
  isEnabled: boolean;
  lastUpdated: string;
  dataType: string;
}

const retentionPolicySchema = z.object({
  name: z.string().min(1, "Policy name is required"),
  description: z.string().min(1, "Description is required"),
  retentionDays: z.number().min(1, "Retention days must be at least 1").max(7300, "Maximum retention is 20 years"),
  dataType: z.string().min(1, "Data type is required"),
  isEnabled: z.boolean().default(true),
});

type RetentionPolicyFormData = z.infer<typeof retentionPolicySchema>;

export default function RetentionPolicy() {
  const { toast } = useToast();
  const { data: rolePermissions } = useRolePermissions();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<RetentionPolicy | null>(null);

  const form = useForm<RetentionPolicyFormData>({
    resolver: zodResolver(retentionPolicySchema),
    defaultValues: {
      name: "",
      description: "",
      retentionDays: 90,
      dataType: "",
      isEnabled: true,
    },
  });

  // Mock data for demonstration - in real implementation this would come from API
  const retentionPolicies: RetentionPolicy[] = [
    {
      id: "1",
      name: "User Activity Logs",
      description: "Retention policy for user login/logout and activity tracking",
      retentionDays: 90,
      isEnabled: true,
      lastUpdated: new Date().toISOString(),
      dataType: "ACTIVITY_LOGS"
    },
    {
      id: "2", 
      name: "User Sessions",
      description: "Retention policy for user session data and authentication tokens",
      retentionDays: 30,
      isEnabled: true,
      lastUpdated: new Date().toISOString(),
      dataType: "USER_SESSIONS"
    },
    {
      id: "3",
      name: "File Uploads",
      description: "Retention policy for uploaded files and documents",
      retentionDays: 365,
      isEnabled: true,
      lastUpdated: new Date().toISOString(),
      dataType: "FILE_UPLOADS"
    },
    {
      id: "4",
      name: "Audit Trail",
      description: "Retention policy for system audit and compliance logs", 
      retentionDays: 2555, // 7 years
      isEnabled: true,
      lastUpdated: new Date().toISOString(),
      dataType: "AUDIT_LOGS"
    }
  ];

  const handleEditPolicy = (policy: RetentionPolicy) => {
    setSelectedPolicy(policy);
    form.reset({
      name: policy.name,
      description: policy.description,
      retentionDays: policy.retentionDays,
      dataType: policy.dataType,
      isEnabled: policy.isEnabled,
    });
    setEditDialogOpen(true);
  };

  const onSubmit = (data: RetentionPolicyFormData) => {
    // In real implementation, this would call an API
    toast({
      title: "Success",
      description: "Retention policy updated successfully",
    });
    setEditDialogOpen(false);
    setSelectedPolicy(null);
    form.reset();
  };

  const formatRetentionPeriod = (days: number): string => {
    if (days < 30) {
      return `${days} days`;
    } else if (days < 365) {
      const months = Math.floor(days / 30);
      return `${months} month${months > 1 ? 's' : ''}`;
    } else {
      const years = Math.floor(days / 365);
      const remainingDays = days % 365;
      if (remainingDays === 0) {
        return `${years} year${years > 1 ? 's' : ''}`;
      } else {
        return `${years} year${years > 1 ? 's' : ''}, ${remainingDays} days`;
      }
    }
  };

  const getStatusBadge = (isEnabled: boolean) => {
    return isEnabled ? (
      <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
    ) : (
      <Badge variant="secondary">Inactive</Badge>
    );
  };

  // Set document title
  useEffect(() => {
    document.title = "Retention Policy - Enterprise Management System";
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Clock className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Retention Policy</h1>
            <p className="text-gray-600 mt-1">Configure data retention settings and cleanup policies</p>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Policies</p>
                <p className="text-2xl font-bold text-gray-900">
                  {retentionPolicies.filter(p => p.isEnabled).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Settings className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Policies</p>
                <p className="text-2xl font-bold text-gray-900">{retentionPolicies.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <RotateCcw className="h-8 w-8 text-orange-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Average Retention</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Math.round(retentionPolicies.reduce((acc, p) => acc + p.retentionDays, 0) / retentionPolicies.length)} days
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Compliance Status</p>
                <p className="text-2xl font-bold text-green-600">Good</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Retention Policies Table */}
      <Card>
        <CardHeader>
          <CardTitle>Data Retention Policies</CardTitle>
          <CardDescription>
            Manage how long different types of data are stored in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {retentionPolicies.map((policy) => (
              <div key={policy.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <h3 className="font-medium text-gray-900">{policy.name}</h3>
                    {getStatusBadge(policy.isEnabled)}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{policy.description}</p>
                  <div className="flex items-center space-x-4 mt-2">
                    <span className="text-sm text-gray-500">
                      Retention: <span className="font-medium">{formatRetentionPeriod(policy.retentionDays)}</span>
                    </span>
                    <span className="text-sm text-gray-500">
                      Type: <span className="font-medium">{policy.dataType}</span>
                    </span>
                    <span className="text-sm text-gray-500">
                      Updated: <span className="font-medium">{new Date(policy.lastUpdated).toLocaleDateString()}</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {rolePermissions?.userMgmt?.edit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditPolicy(policy)}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Configure
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit Policy Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Configure Retention Policy</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Policy Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter policy name" {...field} />
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
                      <Input placeholder="Enter policy description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="retentionDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retention Period (Days)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="90" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dataType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select data type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVITY_LOGS">Activity Logs</SelectItem>
                        <SelectItem value="USER_SESSIONS">User Sessions</SelectItem>
                        <SelectItem value="FILE_UPLOADS">File Uploads</SelectItem>
                        <SelectItem value="AUDIT_LOGS">Audit Logs</SelectItem>
                        <SelectItem value="SYSTEM_LOGS">System Logs</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  <Save className="w-4 h-4 mr-2" />
                  Save Policy
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}