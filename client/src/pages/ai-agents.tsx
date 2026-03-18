import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { apiRequest } from "@/lib/queryClient";
import { LoadingSpinner } from "@/components/ui/spinner";
import { Plus, Edit, Trash2, Bot, Settings, AlertCircle } from "lucide-react";
import { z } from "zod";

interface AiAgent {
  id: number;
  name: string;
  apiEndpoint: string;
  organizationId: number | null;
  useIpForSas: boolean;
  allowedIpAddress: string | null;
  sasValiditySeconds: number;
  createdAt: string;
  updatedAt: string;
}

interface Organization {
  id: number;
  name: string;
}

interface AiAgentPermissions {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
}

const createAiAgentSchema = z.object({
  name: z.string()
    .min(1, "Agent name is required")
    .max(32, "Agent name must not exceed 32 characters")
    .regex(/^[a-zA-Z0-9]+$/, "Agent name must contain only alphanumeric characters (a-z, A-Z, 0-9). No spaces or special characters allowed."),
  apiEndpoint: z.string()
    .min(1, "API endpoint is required")
    .max(192, "API endpoint must not exceed 192 characters")
    .url("Please enter a valid URL"),
  apiKey: z.string()
    .min(1, "API key is required")
    .max(512, "API key must not exceed 512 characters"),
  organizationId: z.string().min(1, "Organization is required").refine(val => val !== "none", "Please select an organization"),
  useIpForSas: z.boolean().default(false),
  allowedIpAddress: z.string()
    .regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, "Please enter a valid IPv4 address")
    .optional()
    .or(z.literal("")),
  sasValiditySeconds: z.coerce.number()
    .min(1, "SAS validity must be at least 1 second")
    .max(3600, "SAS validity must not exceed 3600 seconds")
    .default(900),
}).refine(data => {
  if (data.allowedIpAddress && data.allowedIpAddress !== "" && !data.useIpForSas) {
    return false;
  }
  return true;
}, {
  message: "IP restriction must be enabled to specify an IP address",
  path: ["allowedIpAddress"],
});

const editAiAgentSchema = z.object({
  name: z.string()
    .min(1, "Agent name is required")
    .max(32, "Agent name must not exceed 32 characters")
    .regex(/^[a-zA-Z0-9]+$/, "Agent name must contain only alphanumeric characters (a-z, A-Z, 0-9). No spaces or special characters allowed."),
  apiEndpoint: z.string()
    .min(1, "API endpoint is required")
    .max(192, "API endpoint must not exceed 192 characters")
    .url("Please enter a valid URL"),
  organizationId: z.string().min(1, "Organization is required").refine(val => val !== "none", "Please select an organization"),
  useIpForSas: z.boolean().default(false),
  allowedIpAddress: z.string()
    .regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, "Please enter a valid IPv4 address")
    .optional()
    .or(z.literal("")),
  sasValiditySeconds: z.coerce.number()
    .min(1, "SAS validity must be at least 1 second")
    .max(3600, "SAS validity must not exceed 3600 seconds")
    .default(900),
}).refine(data => {
  if (data.allowedIpAddress && data.allowedIpAddress !== "" && !data.useIpForSas) {
    return false;
  }
  return true;
}, {
  message: "IP restriction must be enabled to specify an IP address",
  path: ["allowedIpAddress"],
});

type CreateAiAgentForm = z.infer<typeof createAiAgentSchema>;
type EditAiAgentForm = z.infer<typeof editAiAgentSchema>;

export default function AiAgents() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AiAgent | null>(null);
  const [deleteAgent, setDeleteAgent] = useState<AiAgent | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch AI agent permissions across all user roles (not just selected role)
  const { data: aiAgentPermissions, isLoading: permissionsLoading } = useQuery<AiAgentPermissions>({
    queryKey: ["/api/ai-agent-permissions"],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Check if user has AI agent permissions (from any role)
  const hasViewPermission = Boolean(aiAgentPermissions?.view);
  const hasAddPermission = Boolean(aiAgentPermissions?.add);
  const hasEditPermission = Boolean(aiAgentPermissions?.edit);
  const hasDeletePermission = Boolean(aiAgentPermissions?.delete);
  
  // Check if user has ANY AI agent permission (not just view)
  const hasAnyPermission = hasViewPermission || hasAddPermission || hasEditPermission || hasDeletePermission;
  
  console.log('AI Agent Permission Flags:', {
    aiAgentPermissions,
    hasViewPermission,
    hasAddPermission,
    hasEditPermission,
    hasDeletePermission,
    hasAnyPermission
  });

  // Fetch AI agents - enabled if user has ANY AI agent permission
  const { data: agents = [], isLoading: agentsLoading } = useQuery<AiAgent[]>({
    queryKey: ["/api/ai-agents"],
    enabled: hasAnyPermission,
  });

  // Fetch organizations - enabled if user has ANY AI agent permission
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    enabled: hasAnyPermission,
  });

  // Create AI agent form
  const createForm = useForm<CreateAiAgentForm>({
    resolver: zodResolver(createAiAgentSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      apiEndpoint: "",
      apiKey: "",
      organizationId: "",
      useIpForSas: false,
      allowedIpAddress: "",
      sasValiditySeconds: 900,
    },
  });

  // Edit AI agent form
  const editForm = useForm<EditAiAgentForm>({
    resolver: zodResolver(editAiAgentSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      apiEndpoint: "",
      organizationId: "",
      useIpForSas: false,
      allowedIpAddress: "",
      sasValiditySeconds: 900,
    },
  });

  // Watch useIpForSas for create form and clear allowedIpAddress when disabled
  const createUseIpForSas = createForm.watch("useIpForSas");
  useEffect(() => {
    if (!createUseIpForSas) {
      createForm.setValue("allowedIpAddress", "");
    }
  }, [createUseIpForSas, createForm]);

  // Watch useIpForSas for edit form and clear allowedIpAddress when disabled
  const editUseIpForSas = editForm.watch("useIpForSas");
  useEffect(() => {
    if (!editUseIpForSas) {
      editForm.setValue("allowedIpAddress", "");
    }
  }, [editUseIpForSas, editForm]);

  // Create AI agent mutation
  const createAgentMutation = useMutation({
    mutationFn: async (data: CreateAiAgentForm) => {
      return await apiRequest("POST", "/api/ai-agents", {
        ...data,
        organizationId: parseInt(data.organizationId),
        useIpForSas: data.useIpForSas,
        allowedIpAddress: data.allowedIpAddress || null,
        sasValiditySeconds: data.sasValiditySeconds,
      });
    },
    onSuccess: async () => {
      // Wait for the cache to be invalidated and refetched before closing modal
      await queryClient.invalidateQueries({ queryKey: ["/api/ai-agents"] });
      toast({ title: "Success", description: "AI agent created successfully" });
      setIsAddModalOpen(false);
      createForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create AI agent", 
        variant: "destructive" 
      });
    },
  });

  // Update AI agent mutation
  const updateAgentMutation = useMutation({
    mutationFn: async (data: EditAiAgentForm & { id: number }) => {
      return await apiRequest("PUT", `/api/ai-agents/${data.id}`, {
        name: data.name,
        apiEndpoint: data.apiEndpoint,
        organizationId: parseInt(data.organizationId),
        useIpForSas: data.useIpForSas,
        allowedIpAddress: data.allowedIpAddress || null,
        sasValiditySeconds: data.sasValiditySeconds,
      });
    },
    onSuccess: async () => {
      // Wait for the cache to be invalidated and refetched before closing modal
      await queryClient.invalidateQueries({ queryKey: ["/api/ai-agents"] });
      toast({ title: "Success", description: "AI agent updated successfully" });
      setIsEditModalOpen(false);
      setEditingAgent(null);
      editForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update AI agent", 
        variant: "destructive" 
      });
    },
  });

  // Delete AI agent mutation
  const deleteAgentMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/ai-agents/${id}`);
    },
    onSuccess: async () => {
      // Wait for the cache to be invalidated and refetched before closing dialog
      await queryClient.invalidateQueries({ queryKey: ["/api/ai-agents"] });
      toast({ title: "Success", description: "AI agent deleted successfully" });
      setDeleteAgent(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete AI agent", 
        variant: "destructive" 
      });
    },
  });

  const handleCreateAgent = (data: CreateAiAgentForm) => {
    createAgentMutation.mutate(data);
  };

  const handleEditAgent = (agent: AiAgent) => {
    setEditingAgent(agent);
    editForm.setValue("name", agent.name);
    editForm.setValue("apiEndpoint", agent.apiEndpoint);
    editForm.setValue("organizationId", agent.organizationId?.toString() || "");
    editForm.setValue("useIpForSas", agent.useIpForSas);
    editForm.setValue("allowedIpAddress", agent.allowedIpAddress || "");
    editForm.setValue("sasValiditySeconds", agent.sasValiditySeconds);
    setIsEditModalOpen(true);
  };

  const handleUpdateAgent = (data: EditAiAgentForm) => {
    if (editingAgent) {
      updateAgentMutation.mutate({ ...data, id: editingAgent.id });
    }
  };

  const handleDeleteAgent = (agent: AiAgent) => {
    setDeleteAgent(agent);
  };

  const confirmDelete = () => {
    if (deleteAgent) {
      deleteAgentMutation.mutate(deleteAgent.id);
    }
  };

  const getOrganizationName = (organizationId: number | null) => {
    if (!organizationId) return "No Organization";
    const org = organizations.find(o => o.id === organizationId);
    return org ? org.name : "Unknown Organization";
  };

  // Show loading spinner when permissions are still loading
  if (permissionsLoading) {
    return (
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Bot className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">AI Agents</h1>
          </div>
        </div>
        <LoadingSpinner message="Loading AI agents..." size="lg" />
      </div>
    );
  }

  // Show access denied message if user doesn't have ANY AI agent permission
  if (!hasAnyPermission) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">AI Agents</h1>
            <p className="text-muted-foreground">Manage AI agents for your organization</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">Access Denied</h3>
              <p className="text-muted-foreground max-w-md">
                You don't have permission to access AI agents. Please contact your administrator to request access.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading spinner when agents are loading
  if (agentsLoading) {
    return (
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Bot className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">AI Agents</h1>
          </div>
          {hasAddPermission && (
            <Button onClick={() => {
              createForm.reset({
                name: "",
                apiEndpoint: "",
                apiKey: "",
                organizationId: "",
              });
              createForm.clearErrors();
              setIsAddModalOpen(true);
            }} className="bg-blue-600 hover:bg-blue-700" data-testid="button-add-agent">
              <Plus className="w-4 h-4 mr-2" />
              Add AI Agent
            </Button>
          )}
        </div>
        <LoadingSpinner message="Loading AI agents..." size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Bot className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">AI Agents</h1>
        </div>
        {hasAddPermission && (
          <Button onClick={() => {
            createForm.reset({
              name: "",
              apiEndpoint: "",
              apiKey: "",
              organizationId: "",
            });
            createForm.clearErrors();
            setIsAddModalOpen(true);
          }} className="bg-blue-600 hover:bg-blue-700" data-testid="button-add-agent">
            <Plus className="w-4 h-4 mr-2" />
            Add AI Agent
          </Button>
        )}
      </div>

      {/* AI Agents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Configured AI Agents</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>API Endpoint</TableHead>
                <TableHead>Partner Organization</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!agents || agents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <Bot className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No AI agents configured</p>
                  </TableCell>
                </TableRow>
              ) : (
                (agents || []).filter(agent => agent != null).map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell className="text-gray-600">{agent.apiEndpoint}</TableCell>
                    <TableCell className="text-gray-600">
                      {getOrganizationName(agent.organizationId)}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        {hasEditPermission && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEditAgent(agent)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {hasDeletePermission && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteAgent(agent)}
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
        </CardContent>
      </Card>

      {/* Add AI Agent Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={(open) => {
        setIsAddModalOpen(open);
        if (!open) {
          createForm.reset({
            name: "",
            apiEndpoint: "",
            apiKey: "",
            organizationId: "",
          });
          createForm.clearErrors();
        }
      }}>
        <DialogContent 
          className="sm:max-w-[510px] max-h-[90vh] flex flex-col"
          showClose={!createAgentMutation.isPending}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: createAgentMutation.isPending
                ? "Please wait for the AI agent creation to complete. You cannot close this window during creation."
                : "Please use the X button to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: createAgentMutation.isPending
                ? "Please wait for the AI agent creation to complete. You cannot close this window during creation."
                : "Please use the X button to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add New AI Agent</DialogTitle>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreateAgent)} className="flex flex-col overflow-hidden">
              <div className="overflow-y-auto pr-2 space-y-4 max-h-[60vh]">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agent Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter agent name" {...field} data-testid="input-agent-name" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {field.value.length}/32 characters (minimum 1)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="apiEndpoint"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Endpoint</FormLabel>
                    <FormControl>
                      <Input placeholder="https://api.example.com" {...field} data-testid="input-api-endpoint" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {field.value.length}/192 characters (minimum 1)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter API key" {...field} data-testid="input-api-key" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {field.value.length}/512 characters (minimum 1)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="organizationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partner Organization *</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4 pt-2 border-t">
                <h3 className="text-sm font-medium">SAS URL Configuration</h3>
                
                <FormField
                  control={createForm.control}
                  name="sasValiditySeconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SAS URL Validity (seconds)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="900" 
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 900)}
                          data-testid="input-sas-validity" 
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Valid range: 1-3600 seconds (default: 900 = 15 minutes)
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="useIpForSas"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-use-ip-for-sas"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Enable IP restriction for SAS URLs
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Restrict SAS URLs to specific IP address
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="allowedIpAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allowed IP Address (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="192.168.1.1" 
                          {...field}
                          disabled={!createForm.watch("useIpForSas")}
                          data-testid="input-allowed-ip" 
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Leave empty to use detected IP address from request
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t mt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createAgentMutation.isPending}>
                  {createAgentMutation.isPending ? "Creating..." : "Create Agent"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit AI Agent Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={(open) => {
        setIsEditModalOpen(open);
        if (!open) {
          editForm.reset({
            name: "",
            apiEndpoint: "",
            organizationId: "",
          });
          editForm.clearErrors();
          setEditingAgent(null);
        }
      }}>
        <DialogContent 
          className="sm:max-w-[510px] max-h-[90vh] flex flex-col"
          showClose={!updateAgentMutation.isPending}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: updateAgentMutation.isPending
                ? "Please wait for the AI agent update to complete. You cannot close this window during update."
                : "Please use the X button to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: updateAgentMutation.isPending
                ? "Please wait for the AI agent update to complete. You cannot close this window during update."
                : "Please use the X button to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit AI Agent</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleUpdateAgent)} className="flex flex-col overflow-hidden">
              <div className="overflow-y-auto pr-2 space-y-4 max-h-[60vh]">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agent Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter agent name" {...field} data-testid="input-agent-name-edit" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {field.value.length}/32 characters (minimum 1)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="apiEndpoint"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Endpoint</FormLabel>
                    <FormControl>
                      <Input placeholder="https://api.example.com" {...field} data-testid="input-api-endpoint-edit" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {field.value.length}/192 characters (minimum 1)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="organizationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partner Organization *</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4 pt-2 border-t">
                <h3 className="text-sm font-medium">SAS URL Configuration</h3>
                
                <FormField
                  control={editForm.control}
                  name="sasValiditySeconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SAS URL Validity (seconds)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="900" 
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 900)}
                          data-testid="input-sas-validity-edit" 
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Valid range: 1-3600 seconds (default: 900 = 15 minutes)
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="useIpForSas"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-use-ip-for-sas-edit"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Enable IP restriction for SAS URLs
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Restrict SAS URLs to specific IP address
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="allowedIpAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allowed IP Address (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="192.168.1.1" 
                          {...field}
                          disabled={!editForm.watch("useIpForSas")}
                          data-testid="input-allowed-ip-edit" 
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Leave empty to use detected IP address from request
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded">
                Note: API key cannot be changed for security reasons. Create a new agent if you need to update the API key.
              </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t mt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateAgentMutation.isPending}>
                  {updateAgentMutation.isPending ? "Updating..." : "Update Agent"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteAgent} onOpenChange={() => setDeleteAgent(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete AI Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Are you sure you want to delete the AI agent "{deleteAgent?.name}"?</p>
            <p className="text-sm text-gray-500">This action cannot be undone.</p>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setDeleteAgent(null)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmDelete}
                disabled={deleteAgentMutation.isPending}
              >
                {deleteAgentMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}