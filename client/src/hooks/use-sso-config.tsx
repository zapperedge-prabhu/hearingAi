import { useQuery } from "@tanstack/react-query";

interface SSOConfig {
  ssoFeature: number;
  supportsMicrosoft: boolean;
  supportsGoogle: boolean;
  supportsBoth: boolean;
  providers: {
    microsoft: boolean;
    google: boolean;
  };
}

export function useSSOConfig() {
  const { data: ssoConfig, isLoading } = useQuery<SSOConfig>({
    queryKey: ["/api/sso-config"],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    ssoConfig,
    isLoading,
    supportsMicrosoft: ssoConfig?.supportsMicrosoft ?? false,
    supportsGoogle: ssoConfig?.supportsGoogle ?? false,
    supportsBoth: ssoConfig?.supportsBoth ?? false,
  };
}