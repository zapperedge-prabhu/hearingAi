import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Building, Search, Plus, Users, Edit, Trash2, MoreVertical, Loader2, Globe, X, Check, ChevronsUpDown, ShieldCheck, Eye } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { COUNTRY_OPTIONS } from "@shared/countries";
import { cn } from "@/lib/utils";

interface Organization {
  id: number;
  name: string;
  description?: string;
  geoFencingEnabled: boolean;
  geoEnforcementMode: 'strict' | 'audit';
  allowedCountries: string[];
  createdAt: string;
}

const organizationSchema = z.object({
  name: z.string().min(3, "Organization name must be at least 3 characters").max(64, "Organization name must not exceed 64 characters"),
  description: z.string().max(90, "Description must not exceed 90 characters").optional(),
  geoFencingEnabled: z.boolean().default(false),
  geoEnforcementMode: z.enum(['strict', 'audit']).default('strict'),
  allowedCountries: z.array(z.string()).default([]),
}).refine((data) => {
  if (data.geoFencingEnabled && data.allowedCountries.length === 0) {
    return false;
  }
  return true;
}, {
  message: "Select at least one allowed country when geo-fencing is enabled",
  path: ["allowedCountries"],
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

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

export default function Organizations() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [deletingOrgId, setDeletingOrgId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Get current user's role permissions
  const { data: rolePermissions } = useRolePermissions();

  const { data: organizations, isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  // Create organization mutation
  const createMutation = useMutation({
    mutationFn: async (data: OrganizationFormData) => {
      const response = await apiRequest("POST", "/api/organizations", data);
      if (!response.ok) {
        let errorMessage = "Failed to create organization";
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
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-activities"] });
      setIsAddDialogOpen(false);
      toast({
        title: "Success",
        description: "Organization created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: parseErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  // Update organization mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: OrganizationFormData }) => {
      const response = await apiRequest("PUT", `/api/organizations/${id}`, data);
      if (!response.ok) {
        let errorMessage = "Failed to update organization";
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
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-roles"] });
      setIsEditDialogOpen(false);
      setEditingOrg(null);
      toast({
        title: "Success",
        description: "Organization updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: parseErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  // Delete organization mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/organizations/${id}`);
      if (!response.ok) {
        let errorMessage = "Failed to delete organization";
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/user-activities"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/my-roles"] });
      setDeletingOrgId(null);
      toast({
        title: "Success",
        description: "Organization deleted successfully",
      });
    },
    onError: (error: Error) => {
      setDeletingOrgId(null);
      toast({
        title: "Error",
        description: parseErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  // Form for adding organization
  const addForm = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      description: "",
      geoFencingEnabled: false,
      geoEnforcementMode: 'strict' as const,
      allowedCountries: [],
    },
  });

  // Form for editing organization
  const editForm = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      description: "",
      geoFencingEnabled: false,
      geoEnforcementMode: 'strict' as const,
      allowedCountries: [],
    },
  });

  // Watch geo-fencing enabled state for conditional rendering
  const addGeoFencingEnabled = useWatch({ control: addForm.control, name: "geoFencingEnabled" });
  const editGeoFencingEnabled = useWatch({ control: editForm.control, name: "geoFencingEnabled" });

  // Update edit form when editing organization changes
  const handleEditOrg = (org: Organization) => {
    setEditingOrg(org);
    editForm.reset({
      name: org.name,
      description: org.description || "",
      geoFencingEnabled: org.geoFencingEnabled || false,
      geoEnforcementMode: org.geoEnforcementMode || 'strict',
      allowedCountries: org.allowedCountries || [],
    });
    setIsEditDialogOpen(true);
  };

  const filteredOrganizations = organizations?.filter(org => 
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (org.description && org.description.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  const getOrgColor = (index: number) => {
    const colors = [
      'from-blue-500 to-blue-600',
      'from-green-500 to-green-600',
      'from-purple-500 to-purple-600',
      'from-pink-500 to-pink-600',
      'from-indigo-500 to-indigo-600',
      'from-yellow-500 to-yellow-600',
      'from-red-500 to-red-600',
    ];
    return colors[index % colors.length];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Building className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Partner Organizations</h1>
        </div>
        {/* Show Add Organization button only if current user has add permission in organization management */}
        {rolePermissions?.orgMgmt?.add && (
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) {
              addForm.reset();
            }
          }}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                Add Partner Organization
              </Button>
            </DialogTrigger>
          <DialogContent 
            className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto"
            showClose={!createMutation.isPending}
            onPointerDownOutside={(e) => {
              e.preventDefault();
              toast({
                title: "Dialog Protection",
                description: createMutation.isPending
                  ? "Please wait for the organization creation to complete. You cannot close this window during creation."
                  : "Please use the X button to close this dialog to avoid losing your work.",
                variant: "default",
              });
            }}
            onEscapeKeyDown={(e) => {
              e.preventDefault();
              toast({
                title: "Dialog Protection",
                description: createMutation.isPending
                  ? "Please wait for the organization creation to complete. You cannot close this window during creation."
                  : "Please use the X button to close this dialog to avoid losing your work.",
                variant: "default",
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Add New Partner Organization</DialogTitle>
            </DialogHeader>
            <Form {...addForm}>
              <form onSubmit={addForm.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={addForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partner Organization Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter partner organization name" {...field} />
                      </FormControl>
                      <div className="text-xs text-muted-foreground">
                        {field.value?.length || 0}/64 characters (minimum 3)
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Enter partner organization description (optional)" 
                          rows={3}
                          maxLength={90}
                          {...field} 
                        />
                      </FormControl>
                      <div className="flex items-center justify-between text-xs">
                        <span className={`${(field.value?.length || 0) > 80 ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'text-muted-foreground'}`}>
                          {field.value?.length || 0}/90 characters
                          {(field.value?.length || 0) > 80 && (
                            <span className="ml-2">Approaching limit</span>
                          )}
                        </span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Geo-fencing Section */}
                <div className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Geo-fencing</span>
                  </div>
                  
                  <FormField
                    control={addForm.control}
                    name="geoFencingEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">Enable Geo-fencing</FormLabel>
                          <FormDescription className="text-xs">
                            {field.value 
                              ? "Only users connecting from selected countries can access blob operations (Phase #2 enforcement)."
                              : "No geographic restriction. Users can access data from anywhere."
                            }
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked);
                              if (!checked) {
                                addForm.setValue("allowedCountries", []);
                              }
                            }}
                            data-testid="switch-geo-fencing-add"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {addGeoFencingEnabled && (
                    <>
                      <FormField
                        control={addForm.control}
                        name="geoEnforcementMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Enforcement Mode</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-enforcement-mode-add">
                                  <SelectValue placeholder="Select enforcement mode" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="strict">
                                  <div className="flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4 text-destructive" />
                                    <span>Strict - Block access from restricted countries</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="audit">
                                  <div className="flex items-center gap-2">
                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                    <span>Audit - Allow access but log location for compliance</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-xs">
                              {field.value === 'strict'
                                ? "Strict mode blocks all access attempts from countries not in the allowed list."
                                : "Audit mode allows access but logs geographic location for compliance monitoring."
                              }
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={addForm.control}
                        name="allowedCountries"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Allowed Countries</FormLabel>
                            <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn(
                                    "w-full justify-between",
                                    !field.value?.length && "text-muted-foreground"
                                  )}
                                  data-testid="button-country-select-add"
                                >
                                  {field.value?.length 
                                    ? `${field.value.length} ${field.value.length === 1 ? 'country' : 'countries'} selected`
                                    : "Select countries..."
                                  }
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search countries..." />
                                <CommandList>
                                  <CommandEmpty>No country found.</CommandEmpty>
                                  <CommandGroup className="max-h-64 overflow-auto">
                                    {COUNTRY_OPTIONS.map((country) => (
                                      <CommandItem
                                        key={country.code}
                                        value={country.label}
                                        onSelect={() => {
                                          const current = field.value || [];
                                          const updated = current.includes(country.code)
                                            ? current.filter((c) => c !== country.code)
                                            : [...current, country.code];
                                          field.onChange(updated);
                                        }}
                                        data-testid={`country-option-${country.code}`}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            field.value?.includes(country.code)
                                              ? "opacity-100"
                                              : "opacity-0"
                                          )}
                                        />
                                        {country.label}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          
                          {/* Selected countries display */}
                          {field.value && field.value.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {field.value.map((code) => {
                                const country = COUNTRY_OPTIONS.find((c) => c.code === code);
                                return (
                                  <Badge
                                    key={code}
                                    variant="secondary"
                                    className="text-xs"
                                    data-testid={`badge-country-${code}`}
                                  >
                                    {country?.name || code}
                                    <button
                                      type="button"
                                      className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                      onClick={() => {
                                        field.onChange(field.value?.filter((c) => c !== code));
                                      }}
                                      data-testid={`button-remove-country-${code}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    </>
                  )}
                </div>

                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsAddDialogOpen(false)}
                    disabled={createMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || !addForm.formState.isValid}
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Organization"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search Partner Organizations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Organizations Grid */}
      <ScrollArea className="h-[calc(100vh-280px)] min-h-[400px]">
      {orgsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pr-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-12 h-12 bg-muted rounded-lg"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredOrganizations.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Building className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {searchTerm ? "No organizations found" : "No organizations yet"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm 
                ? "No organizations match your search criteria." 
                : "Get started by creating your first organization."
              }
            </p>
            {/* Show Add Organization button in empty state only if user has add permission */}
            {rolePermissions?.orgMgmt?.add && (
              <Button 
                className="bg-primary hover:bg-primary/90"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Organization
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pr-4">
          {filteredOrganizations.map((org, index) => (
            <Card key={org.id} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center space-x-4 mb-4">
                  <div className={`w-12 h-12 bg-gradient-to-br ${getOrgColor(index)} rounded-lg flex items-center justify-center`}>
                    <Building className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-foreground truncate">{org.name}</h3>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Users className="w-4 h-4 mr-1" />
                      <span>Active</span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {/* Show edit option only if user has edit permission */}
                      {rolePermissions?.orgMgmt?.edit && (
                        <DropdownMenuItem onClick={() => handleEditOrg(org)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      {/* Show delete option only if user has delete permission */}
                      {rolePermissions?.orgMgmt?.delete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Partner Organization</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{org.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={deletingOrgId === org.id}>Cancel</AlertDialogCancel>
                              <Button
                                onClick={() => {
                                  setDeletingOrgId(org.id);
                                  deleteMutation.mutate(org.id);
                                }}
                                disabled={deletingOrgId === org.id}
                                className="bg-red-600 hover:bg-red-700 text-white"
                              >
                                {deletingOrgId === org.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Deleting...
                                  </>
                                ) : (
                                  "Delete"
                                )}
                              </Button>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {org.description || "No description provided"}
                </p>
                
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    Created {formatDate(org.createdAt)}
                  </span>
                  <div className="flex items-center text-xs text-green-600 dark:text-green-400">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                    Active
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </ScrollArea>

      {/* Edit Organization Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) {
          editForm.reset();
          setEditingOrg(null);
        }
      }}>
        <DialogContent 
          className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto"
          showClose={!updateMutation.isPending}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: updateMutation.isPending
                ? "Please wait for the organization update to complete. You cannot close this window during update."
                : "Please use the X button to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: updateMutation.isPending
                ? "Please wait for the organization update to complete. You cannot close this window during update."
                : "Please use the X button to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit Partner Organization</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => editingOrg && updateMutation.mutate({ id: editingOrg.id, data }))} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partner Organization Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter partner organization name" {...field} />
                    </FormControl>
                    <div className="text-xs text-muted-foreground">
                      {field.value?.length || 0}/64 characters (minimum 3)
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter partner organization description (optional)" 
                        rows={3}
                        maxLength={90}
                        {...field} 
                      />
                    </FormControl>
                    <div className="flex items-center justify-between text-xs">
                      <span className={`${(field.value?.length || 0) > 80 ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'text-muted-foreground'}`}>
                        {field.value?.length || 0}/90 characters
                        {(field.value?.length || 0) > 80 && (
                          <span className="ml-2">Approaching limit</span>
                        )}
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Geo-fencing Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Geo-fencing</span>
                </div>
                
                <FormField
                  control={editForm.control}
                  name="geoFencingEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium">Enable Geo-fencing</FormLabel>
                        <FormDescription className="text-xs">
                          {field.value 
                            ? "Only users connecting from selected countries can access blob operations (Phase #2 enforcement)."
                            : "No geographic restriction. Users can access data from anywhere."
                          }
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            if (!checked) {
                              editForm.setValue("allowedCountries", []);
                            }
                          }}
                          data-testid="switch-geo-fencing-edit"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {editGeoFencingEnabled && (
                  <>
                    <FormField
                      control={editForm.control}
                      name="geoEnforcementMode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Enforcement Mode</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-enforcement-mode-edit">
                                <SelectValue placeholder="Select enforcement mode" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="strict">
                                <div className="flex items-center gap-2">
                                  <ShieldCheck className="h-4 w-4 text-destructive" />
                                  <span>Strict - Block access from restricted countries</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="audit">
                                <div className="flex items-center gap-2">
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                  <span>Audit - Allow access but log location for compliance</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">
                            {field.value === 'strict'
                              ? "Strict mode blocks all access attempts from countries not in the allowed list."
                              : "Audit mode allows access but logs geographic location for compliance monitoring."
                            }
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="allowedCountries"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Allowed Countries</FormLabel>
                          <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full justify-between",
                                  !field.value?.length && "text-muted-foreground"
                                )}
                                data-testid="button-country-select-edit"
                              >
                                {field.value?.length 
                                  ? `${field.value.length} ${field.value.length === 1 ? 'country' : 'countries'} selected`
                                  : "Select countries..."
                                }
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search countries..." />
                              <CommandList>
                                <CommandEmpty>No country found.</CommandEmpty>
                                <CommandGroup className="max-h-64 overflow-auto">
                                  {COUNTRY_OPTIONS.map((country) => (
                                    <CommandItem
                                      key={country.code}
                                      value={country.label}
                                      onSelect={() => {
                                        const current = field.value || [];
                                        const updated = current.includes(country.code)
                                          ? current.filter((c) => c !== country.code)
                                          : [...current, country.code];
                                        field.onChange(updated);
                                      }}
                                      data-testid={`country-option-edit-${country.code}`}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          field.value?.includes(country.code)
                                            ? "opacity-100"
                                            : "opacity-0"
                                        )}
                                      />
                                      {country.label}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        
                        {/* Selected countries display */}
                        {field.value && field.value.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {field.value.map((code) => {
                              const country = COUNTRY_OPTIONS.find((c) => c.code === code);
                              return (
                                <Badge
                                  key={code}
                                  variant="secondary"
                                  className="text-xs"
                                  data-testid={`badge-country-edit-${code}`}
                                >
                                  {country?.name || code}
                                  <button
                                    type="button"
                                    className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                    onClick={() => {
                                      field.onChange(field.value?.filter((c) => c !== code));
                                    }}
                                    data-testid={`button-remove-country-edit-${code}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </>
                )}
              </div>

              <div className="flex justify-end space-x-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setEditingOrg(null);
                  }}
                  disabled={updateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateMutation.isPending || !editForm.formState.isValid}
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Organization"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
