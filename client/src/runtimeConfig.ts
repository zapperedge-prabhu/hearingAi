export type RuntimeConfig = {
  msal: {
    auth: {
      clientId: string;
      authority: string;
      knownAuthorities: string[];
      redirectUri: string | null;
      navigateToLoginRequestUrl: boolean;
    };
    cache: {
      cacheLocation: "localStorage" | "sessionStorage";
      storeAuthStateInCookie: boolean;
    };
    system: { logLevel: string };
  };
  login: {
    domainHint: string | null;
  };
  meta: { env: string; generatedAt: string };
};

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load runtime config: ${response.status}`);
  }
  return response.json();
}