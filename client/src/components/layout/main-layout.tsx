import { ReactNode } from "react";
import { useLocation } from "wouter";
import Sidebar from "./sidebar";
import Header from "./header";

interface MainLayoutProps {
  children: ReactNode;
}

const getPageTitle = (location: string): string => {
  switch (location) {
    case "/":
    case "/dashboard":
      return "File Management";
    case "/users":
      return "Users Management";
    case "/roles":
      return "Roles & Permissions";
    case "/organizations":
      return "Partner Organizations";
    case "/activity-logs":
      return "Activity Logs";
    case "/storage":
      return "Storage Management";
    case "/adls-provisioning":
      return "Storage Management";
    case "/file-management":
      return "File Management";
    case "/retention-policy":
      return "Retention Policy";
    case "/settings":
      return "Settings";
    case "/ai-agents":
      return "Ai Agents";
    case "/pgp-key-management":
      return "PGP Key Management";
    case "/data-protection":
      return "Data Protection";
    case "/data-lifecycle":
      return "Data Lifecycle Management";
    case "/content-discovery":
      return "Content Discovery";
    case "/siem-rules":
      return "SIEM Rules";
    case "/sentinel-rules":
      return "SIEM Rules";
    case "/sentinel/rules":
      return "SIEM Rules";
    case "/sentinel-incidents":
      return "SIEM Incidents";
    case "/sentinel/incidents":
      return "SIEM Incidents";
    case "/foundry-ai":
      return "Foundry AI Management";
    case "/foundry-ai-config":
      return "Foundry AI Config";
    case "/document-translation":
      return "Document Translation";
    case "/sftp-users":
      return "SFTP Local Users";
    case "/my-sftp-access":
      return "My SFTP Access";
    case "/blob-inventory":
      return "Blob Inventory";
    case "/customer-onboarding":
      return "Customer Onboarding";
    case "/file-transfer-reports":
      return "Upload / Download Reports";
    case "/eval":
      return "Answer Sheet Evaluation";
    default:
      return "Page Title Not Found";
  }
};

export default function MainLayout({ children }: MainLayoutProps) {
  const [location] = useLocation();
  const pageTitle = getPageTitle(location);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <Header title={pageTitle} />

        <div className="flex-1 min-h-0 overflow-y-auto p-6">{children}</div>
      </main>
    </div>
  );
}
