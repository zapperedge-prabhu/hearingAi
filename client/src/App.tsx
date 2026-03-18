import { Switch, Route } from "wouter";
import { useAuth } from "./hooks/use-auth";
import { RoleProvider } from "./contexts/role-context";
import { ThemeProvider } from "./contexts/theme-context";
import LoginPage from "./pages/login";
import MainLayout from "./components/layout/main-layout";
import Users from "./pages/users";
import RolesPermissions from "./pages/roles-permissions";
import Organizations from "./pages/organizations";
import ActivityLogs from "./pages/activity-logs";
import Storage from "./pages/storage";
import FileManagement from "./pages/file-management";
import Settings from "./pages/settings";
import AiAgents from "./pages/ai-agents";
import DataProtection from "./pages/data-protection";
import DataLifecycle from "./pages/data-lifecycle";
import AdlsProvisioning from "./pages/adls-provisioning";
import PgpKeyManagement from "./pages/pgp-key-management";
import SentinelRules from "./pages/sentinel-rules";
import SentinelIncidents from "./pages/sentinel-incidents";
import FoundryAiMgmt from "./pages/foundry-ai-mgmt";
import ContentDiscovery from "./pages/content-discovery";
import HearingAI from "./pages/hearing-ai";
import DocumentTranslation from "./pages/document-translation";
import Eval from "./pages/eval";
import SftpUsers from "./pages/sftp-users";
import MySftpAccess from "./pages/my-sftp-access";
import BlobInventory from "./pages/blob-inventory";
import CustomerOnboarding from "./pages/customer-onboarding";
import FileTransferReports from "./pages/file-transfer-reports";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading, isRedirecting } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // Show redirecting state instead of login page when auto-redirect is happening
  if (isRedirecting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <RoleProvider>
      <MainLayout>
        <Switch>
          <Route path="/" component={FileManagement} />
          <Route path="/users" component={Users} />
          <Route path="/roles" component={RolesPermissions} />
          <Route path="/organizations" component={Organizations} />
          <Route path="/activity-logs" component={ActivityLogs} />
          <Route path="/storage" component={Storage} />
          <Route path="/adls-provisioning" component={AdlsProvisioning} />
          <Route path="/data-protection" component={DataProtection} />
          <Route path="/data-lifecycle" component={DataLifecycle} />
          <Route path="/file-management" component={FileManagement} />
          <Route path="/ai-agents" component={AiAgents} />
          <Route path="/pgp-key-management" component={PgpKeyManagement} />
          <Route path="/sentinel/rules" component={SentinelRules} />
          <Route path="/sentinel/incidents" component={SentinelIncidents} />
          <Route path="/foundry-ai" component={FoundryAiMgmt} />
          <Route path="/content-discovery" component={ContentDiscovery} />
          <Route path="/hearing-ai" component={HearingAI} />
          <Route path="/document-translation" component={DocumentTranslation} />
          <Route path="/eval" component={Eval} />
          <Route path="/sftp-users" component={SftpUsers} />
          <Route path="/my-sftp-access" component={MySftpAccess} />
          <Route path="/blob-inventory" component={BlobInventory} />
          <Route path="/customer-onboarding" component={CustomerOnboarding} />
          <Route path="/file-transfer-reports" component={FileTransferReports} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </MainLayout>
    </RoleProvider>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="ui-theme">
      <Router />
    </ThemeProvider>
  );
}

export default App;
