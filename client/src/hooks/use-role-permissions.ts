import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/contexts/role-context";
import { apiGet } from "@/lib/api";

interface RolePermissions {
  userMgmt: { add: boolean; edit: boolean; delete: boolean; view: boolean; enableDisable: boolean } | null;
  roleMgmt: { add: boolean; edit: boolean; delete: boolean; view: boolean } | null;
  orgMgmt: { add: boolean; edit: boolean; delete: boolean; view: boolean } | null;
  storageMgmt: { addStorageContainer: boolean; addContainer: boolean; view: boolean; delete: boolean } | null;
  fileMgmt: { [key: string]: boolean } | null;
  activityLogs: { view: boolean } | null;
  aiAgentMgmt: { add: boolean; edit: boolean; delete: boolean; view: boolean } | null;
  pgpKeyMgmt: { view: boolean; generate: boolean; delete: boolean; copy: boolean; decrypt: boolean } | null;
  siemMgmt: { install: boolean; delete: boolean; enableDisable: boolean; view: boolean; incidentsView: boolean } | null;
  foundryMgmt: { add: boolean; edit: boolean; delete: boolean; view: boolean; tabWizard: boolean; tabResources: boolean; tabFoundryAction: boolean; tabChatPlayground: boolean; tabResourceSets: boolean; tabContentUnderstanding: boolean } | null;
  contentUnderstanding: { view: boolean; runAnalysis: boolean; saveAnalysis: boolean; deleteAnalysis: boolean; menuVisibility: boolean } | null;
  documentTranslation: { view: boolean; runTranslation: boolean; deleteTranslation: boolean } | null;
  sftpMgmt: { view: boolean; create: boolean; update: boolean; disable: boolean; delete: boolean; mapUser: boolean; viewSelfAccess: boolean; rotateSshSelf: boolean; rotatePasswordSelf: boolean } | null;
  customerOnboarding: { view: boolean; upload: boolean; commit: boolean; delete: boolean } | null;
  transferReports: { view: boolean; viewDetails: boolean; download: boolean } | null;
  eval: { view: boolean; run: boolean; review: boolean; finalize: boolean; menuVisibility: boolean } | null;
}

export function useRolePermissions() {
  const { selectedRoleId } = useRole();

  return useQuery<RolePermissions>({
    queryKey: ['/api/my-role-permissions', selectedRoleId],
    queryFn: async () => {
      if (!selectedRoleId) throw new Error('No role selected');
      return apiGet(`/api/my-role-permissions/${selectedRoleId}`);
    },
    enabled: !!selectedRoleId,
    retry: false,
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnMount: true, // Always refetch on mount to get latest permissions
    refetchInterval: false,
    staleTime: 1 * 60 * 1000, // Reduced cache to 1 minute for fresher permissions
  });
}