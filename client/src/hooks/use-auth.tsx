import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { createUserFriendlyLoginRequest, clearLoginHints, clearMsalCache } from "@/config/msalConfig";
import { apiGet } from "@/lib/api";
import { getUserFriendlyEmail } from "@/utils/msalHelpers";
import { set401Handler } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

interface User {
  id: number;
  name: string;
  email: string;
  role: { name: string };
  organization: { name: string };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthorized: boolean;
  authError: string | null;
  isRedirecting: boolean;
  login: (emailFromUI?: string) => Promise<void>;
  logout: () => void;
  reauthenticateAfterUnauthorized: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasTriggeredAutoRedirect = useRef(false);

  useEffect(() => {
    const handle401 = () => {
      sessionStorage.removeItem('azure_token');
      sessionStorage.removeItem('user_display_name');
      setUser(null);
      setIsAuthorized(false);
      setAuthError(null);
      
      toast({
        title: "Session Expired",
        description: "Your session has expired. Please login again.",
        variant: "destructive",
      });
      
      instance.logoutRedirect({
        postLogoutRedirectUri: window.location.origin
      }).catch((error) => {
        console.error("Logout redirect error:", error);
        window.location.reload();
      });
    };
    
    set401Handler(handle401);
    
    return () => {
      set401Handler(() => {});
    };
  }, [instance]);

  useEffect(() => {
    const checkUserAuthorization = async () => {
      console.log('🔄 Starting authentication check...');
      setIsLoading(true);

      if (isAuthenticated && accounts.length > 0) {
        console.log('🔍 Checking Microsoft authentication...');
        const account = accounts[0];
        
        let userEmail = getUserFriendlyEmail(account);
        
        try {
          const tokenRequest = {
            scopes: ["https://graph.microsoft.com/User.Read"],
            account: account,
            forceRefresh: false
          };
          
          let tokenAcquired = false;
          
          try {
            const response = await instance.acquireTokenSilent(tokenRequest);
            if (response.accessToken) {
              sessionStorage.setItem('azure_token', response.accessToken);
              console.log("Token stored successfully");
              tokenAcquired = true;
            }
          } catch (tokenError) {
            console.error("Failed to acquire token silently:", tokenError);
            // Silent token acquisition failed — this is where the Google federation
            // "username" error typically occurs. Entra CIAM injects the cached
            // account's username when federating to Google during silent refresh.
            //
            // Fix: Clear ALL MSAL cached data from browser storage (non-navigating)
            // so Entra has no cached username to inject, then do a fresh loginRedirect
            // with prompt=login to force a completely clean authentication flow.
            try {
              console.log('[AUTH] Silent token failed — clearing MSAL cache to prevent username injection');
              clearMsalCache(instance);
              clearLoginHints();
              
              console.log('[AUTH] MSAL cache cleared, redirecting with prompt=login (no cached username)');
              const request = createUserFriendlyLoginRequest();
              request.prompt = "login";
              await instance.loginRedirect(request);
              return;
            } catch (redirectError) {
              console.error("Failed to acquire token via redirect:", redirectError);
            }
          }
          
          if (!tokenAcquired) {
            setAuthError("Failed to acquire access token");
            setIsLoading(false);
            return;
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
          
          try {
            const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
              headers: {
                'Authorization': `Bearer ${sessionStorage.getItem('azure_token')}`
              }
            });
            
            if (graphResponse.ok) {
              const userInfo = await graphResponse.json();
              console.log('Graph API user info:', userInfo);
              
              let email = userInfo.mail || userInfo.userPrincipalName;
              
              if (email && email.includes('#EXT#@')) {
                const externalPart = email.split('#EXT#@')[0];
                if (externalPart.includes('_')) {
                  const lastUnderscore = externalPart.lastIndexOf('_');
                  if (lastUnderscore > 0) {
                    const username = externalPart.substring(0, lastUnderscore);
                    const domain = externalPart.substring(lastUnderscore + 1);
                    email = `${username}@${domain}`;
                  }
                }
              }
              
              userEmail = email;
              
              let resolvedDisplayName = userInfo.displayName;
              if (!resolvedDisplayName || resolvedDisplayName.toLowerCase() === 'unknown') {
                const givenName = userInfo.givenName;
                const surname = userInfo.surname;
                if (givenName && surname) {
                  resolvedDisplayName = `${givenName} ${surname}`;
                } else if (givenName) {
                  resolvedDisplayName = givenName;
                } else if (surname) {
                  resolvedDisplayName = surname;
                } else {
                  resolvedDisplayName = email;
                }
              }
              
              if (resolvedDisplayName) {
                sessionStorage.setItem('user_display_name', resolvedDisplayName);
                console.log('Stored user display name:', resolvedDisplayName);
              }
            }
          } catch (graphError) {
            console.error("Failed to get user email from Graph API:", graphError);
          }
          
          const checkResult = await apiGet<{ exists: boolean; user?: User }>(`/api/auth/user-exists`);
          
          if (checkResult.exists && checkResult.user) {
            const dbUser = checkResult.user;
            console.log('✅ Microsoft user authorized:', dbUser.name);
            const displayName = sessionStorage.getItem('user_display_name') || dbUser.name;
            const userWithDisplayName = { ...dbUser, name: displayName };
            
            setUser(userWithDisplayName);
            setIsAuthorized(true);
            setAuthError(null);
            setAuthInitialized(true);
            
            try {
              await fetch('/api/login', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${sessionStorage.getItem('azure_token')}`,
                  'Content-Type': 'application/json'
                }
              });
            } catch (loginError) {
              console.error("Failed to record login activity:", loginError);
            }
          } else {
            console.log('❌ Microsoft user not authorized:');
            const displayName = sessionStorage.getItem('user_display_name') || account.name || 'Unknown User';
            const unauthorizedUser = {
              id: 0,
              name: displayName,
              email: userEmail,
              role: { name: 'Unauthorized' },
              organization: { name: 'None' }
            };
            
            setUser(unauthorizedUser);
            setIsAuthorized(false);
            setAuthError(`Your email address (${userEmail}) is not registered in the Zapper system. Please contact your system administrator to add your account and assign appropriate permissions.`);
            setAuthInitialized(true);
            
            sessionStorage.removeItem('azure_token');
          }
        } catch (error: any) {
          console.error("Error checking user authorization:", error);
          console.log("Error details:", { 
            message: error?.message, 
            toString: error?.toString(), 
            status: error?.status,
            response: error?.response
          });
          
          const account = accounts[0];
          let userEmail = account?.username || account?.homeAccountId || 'Unknown Email';
          
          try {
            const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
              headers: {
                'Authorization': `Bearer ${sessionStorage.getItem('azure_token')}`
              }
            });
            
            if (graphResponse.ok) {
              const userInfo = await graphResponse.json();
              let email = userInfo.mail || userInfo.userPrincipalName;
              
              if (email && email.includes('#EXT#@')) {
                const externalPart = email.split('#EXT#@')[0];
                if (externalPart.includes('_')) {
                  const lastUnderscore = externalPart.lastIndexOf('_');
                  if (lastUnderscore > 0) {
                    const username = externalPart.substring(0, lastUnderscore);
                    const domain = externalPart.substring(lastUnderscore + 1);
                    email = `${username}@${domain}`;
                  }
                }
              }
              
              userEmail = email;
              
              let resolvedDisplayName = userInfo.displayName;
              if (!resolvedDisplayName || resolvedDisplayName.toLowerCase() === 'unknown') {
                const givenName = userInfo.givenName;
                const surname = userInfo.surname;
                if (givenName && surname) {
                  resolvedDisplayName = `${givenName} ${surname}`;
                } else if (givenName) {
                  resolvedDisplayName = givenName;
                } else if (surname) {
                  resolvedDisplayName = surname;
                } else {
                  resolvedDisplayName = email;
                }
              }
              
              if (resolvedDisplayName) {
                sessionStorage.setItem('user_display_name', resolvedDisplayName);
              }
            }
          } catch (graphError) {
            console.error("Failed to get user email from Graph API in error case:", graphError);
          }
          const displayName = sessionStorage.getItem('user_display_name') || account?.name || 'Unknown User';
          const unauthorizedUser = {
            id: 0,
            name: displayName,
            email: userEmail,
            role: { name: 'Unauthorized' },
            organization: { name: 'None' }
          };
          
          setUser(unauthorizedUser);
          setIsAuthorized(false);
          setAuthError(`Your email address (${userEmail}) is not registered in the Zapper system. Please contact your system administrator to add your account and assign appropriate permissions.`);
          setAuthInitialized(true);
          
          sessionStorage.removeItem('azure_token');
        }
      } else {
        console.log('❌ No authentication found');
        setUser(null);
        setIsAuthorized(false);
        setAuthError(null);
        setAuthInitialized(true);
        
        if (hasTriggeredAutoRedirect.current) {
          setIsLoading(false);
        } else {
          console.log('🚀 Keeping loading state true - auto-redirect will trigger');
        }
        return;
      }
      
      setIsLoading(false);
    };

    checkUserAuthorization();
  }, [isAuthenticated, accounts]);

  // Auto-redirect to Entra CIAM when user is not authenticated.
  // Google federation is handled within Entra CIAM (not as a separate flow).
  // The "username" parameter issue is mitigated by:
  // 1. Never setting loginHint in MSAL requests (prevents Entra from forwarding it)
  // 2. Clearing all MSAL cached accounts before token refresh fallback
  // 3. Using prompt=login on refresh failures to force a fresh auth without cached usernames
  useEffect(() => {
    if (authInitialized && !isAuthenticated && accounts.length === 0 && !hasTriggeredAutoRedirect.current) {
      console.log('[AUTH-REDIRECT] No authenticated account, triggering Entra CIAM redirect...');
      setIsRedirecting(true);
      setIsLoading(false);
      hasTriggeredAutoRedirect.current = true;
      
      clearLoginHints();
      
      setTimeout(() => {
        const request = createUserFriendlyLoginRequest();
        console.log('[AUTH-REDIRECT] loginRedirect request:', JSON.stringify({
          scopes: request.scopes,
          prompt: request.prompt,
          loginHint: request.loginHint ?? '(not set)',
          extraQueryParameters: request.extraQueryParameters,
        }));
        instance.loginRedirect(request).catch((error) => {
          console.error("[AUTH-REDIRECT] Auto-redirect failed:", error);
          setIsRedirecting(false);
          setIsLoading(false);
          hasTriggeredAutoRedirect.current = false;
        });
      }, 100);
    }
  }, [authInitialized, isAuthenticated, accounts.length, instance]);

  const login = useCallback(async (_emailFromUI?: string) => {
    setIsLoading(true);
    try {
      clearLoginHints();

      const request = createUserFriendlyLoginRequest();
      console.log('[AUTH-REDIRECT] Manual login request:', JSON.stringify({
        scopes: request.scopes,
        prompt: request.prompt,
        loginHint: request.loginHint ?? '(not set)',
        extraQueryParameters: request.extraQueryParameters,
      }));

      await instance.loginRedirect(request);
    } catch (error) {
      console.error("Login failed:", error);
      setAuthError("Login failed. Please try again.");
      setIsLoading(false);
    }
  }, [instance]);

  const reauthenticateAfterUnauthorized = useCallback(async () => {
    console.log('[AUTH-REDIRECT] Reauthentication: clearing cache and forcing clean login...');
    clearMsalCache(instance);
    clearLoginHints();
    sessionStorage.removeItem('azure_token');
    sessionStorage.removeItem('user_display_name');
    
    const request = createUserFriendlyLoginRequest();
    request.prompt = "login";
    console.log('[AUTH-REDIRECT] Reauth loginRedirect request:', JSON.stringify({
      scopes: request.scopes,
      prompt: request.prompt,
      loginHint: request.loginHint ?? '(not set)',
      extraQueryParameters: request.extraQueryParameters,
    }));
    await instance.loginRedirect(request);
  }, [instance]);

  const logout = async () => {
    try {
      const token = sessionStorage.getItem('azure_token');
      if (token && isAuthorized) {
        await fetch('/api/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ session_id: 'current_session' })
        });
      }
    } catch (logoutError) {
      console.error("Failed to record logout activity:", logoutError);
    }
    
    sessionStorage.removeItem('azure_token');
    sessionStorage.removeItem('user_display_name');
    setUser(null);
    setIsAuthorized(false);
    setAuthError(null);
    
    try {
      await instance.logoutRedirect({
        postLogoutRedirectUri: window.location.origin
      });
    } catch (redirectError) {
      console.error("Redirect logout error:", redirectError);
      window.location.reload();
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: isAuthorized,
    isLoading: isLoading || !authInitialized,
    isAuthorized,
    authError,
    isRedirecting,
    login,
    logout,
    reauthenticateAfterUnauthorized,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
