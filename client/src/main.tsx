import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { MsalProvider } from "@azure/msal-react";
import { EventType } from "@azure/msal-browser";
import { AuthProvider } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { loadRuntimeConfig } from "./runtimeConfig";
import { createMsalInstance } from "./auth/msalClient";
import { clearMsalCache, clearLoginHints, createUserFriendlyLoginRequest } from "./config/msalConfig";
import App from "./App";
import "./index.css";

const rootEl = document.getElementById("root")!;
const root = createRoot(rootEl);

const isSessionExpiredError = (err: any): boolean => {
  const errorStr = String(err);
  return errorStr.includes('AADSTS50133') ||
         errorStr.includes('AADSTS50173') ||
         errorStr.includes('AADSTS700082') ||
         errorStr.includes('AADSTS65001');
};

const isGoogleFederationError = (err: any): boolean => {
  const errorStr = String(err).toLowerCase();
  return (errorStr.includes('invalid_request') && errorStr.includes('username')) ||
         errorStr.includes('parameter not allowed for this message type');
};

const RETRY_KEY = 'zapper_google_federation_retry';

const renderApp = (msalInstance: any) => {
  (window as any).msalInstance = msalInstance;
  root.render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider>
              <App />
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      </MsalProvider>
    </React.StrictMode>
  );
};

(async () => {
  let msalInstance: any;
  
  try {
    const rc = await loadRuntimeConfig();
    msalInstance = createMsalInstance(rc);
    await msalInstance.initialize();
    
    msalInstance.addEventCallback((event: any) => {
      if (event.eventType === EventType.LOGIN_FAILURE) {
        const errorStr = String(event.error || '');
        console.error('[MSAL-EVENT] Login failure detected:', errorStr);
        
        if (isGoogleFederationError(event.error)) {
          const retryCount = parseInt(sessionStorage.getItem(RETRY_KEY) || '0', 10);
          
          if (retryCount < 2) {
            console.log(`[MSAL-EVENT] Google federation error detected (retry ${retryCount + 1}/2). Clearing cache and retrying...`);
            sessionStorage.setItem(RETRY_KEY, String(retryCount + 1));
            
            clearMsalCache(msalInstance);
            clearLoginHints();
            sessionStorage.removeItem('azure_token');
            sessionStorage.removeItem('user_display_name');
            
            setTimeout(() => {
              const request = createUserFriendlyLoginRequest();
              request.prompt = "login";
              msalInstance.loginRedirect(request).catch((e: any) => {
                console.error('[MSAL-EVENT] Retry loginRedirect failed:', e);
              });
            }, 500);
          } else {
            console.log('[MSAL-EVENT] Max retries reached for Google federation error. Showing login page.');
            sessionStorage.removeItem(RETRY_KEY);
          }
        }
      }
      
      if (event.eventType === EventType.LOGIN_SUCCESS) {
        sessionStorage.removeItem(RETRY_KEY);
      }
    });
    
    let result;
    try {
      result = await msalInstance.handleRedirectPromise();
    } catch (redirectErr) {
      console.error('[AUTH] handleRedirectPromise error:', redirectErr);
      
      if (isGoogleFederationError(redirectErr)) {
        const retryCount = parseInt(sessionStorage.getItem(RETRY_KEY) || '0', 10);
        
        if (retryCount < 2) {
          console.log(`[AUTH] Google federation redirect error (retry ${retryCount + 1}/2). Clearing and retrying...`);
          sessionStorage.setItem(RETRY_KEY, String(retryCount + 1));
          
          clearMsalCache(msalInstance);
          clearLoginHints();
          sessionStorage.removeItem('azure_token');
          sessionStorage.removeItem('user_display_name');
          
          const request = createUserFriendlyLoginRequest();
          request.prompt = "login";
          await msalInstance.loginRedirect(request);
          return;
        } else {
          sessionStorage.removeItem(RETRY_KEY);
        }
      }
      
      if (!isSessionExpiredError(redirectErr) && !isGoogleFederationError(redirectErr)) {
        throw redirectErr;
      }
    }
    
    if (result) {
      console.log('[AUTH] handleRedirectPromise returned account:', {
        username: result.account?.username,
        homeAccountId: result.account?.homeAccountId,
        tenantId: result.account?.tenantId,
        idTokenClaimsEmail: (result.account?.idTokenClaims as any)?.email,
        scopes: result.scopes,
      });
      sessionStorage.removeItem(RETRY_KEY);
    } else {
      console.log('[AUTH] handleRedirectPromise returned null (no redirect in progress)');
    }

    renderApp(msalInstance);
  } catch (err) {
    if (isSessionExpiredError(err) || isGoogleFederationError(err)) {
      console.log('[AUTH] Recoverable auth error detected. Clearing cache and continuing...', String(err));
      
      try {
        if (msalInstance) {
          await msalInstance.clearCache();
        }
      } catch (clearError) {
        console.error('Failed to clear MSAL cache:', clearError);
      }
      
      sessionStorage.removeItem('azure_token');
      sessionStorage.removeItem('user_display_name');
      
      try {
        const rc = await loadRuntimeConfig();
        const newMsalInstance = createMsalInstance(rc);
        await newMsalInstance.initialize();
        renderApp(newMsalInstance);
      } catch (retryErr) {
        root.render(
          <div style={{ fontFamily: "system-ui", padding: 24 }}>
            <h1>Configuration error</h1>
            <p>{String(retryErr)}</p>
          </div>
        );
      }
      return;
    }
    
    root.render(
      <div style={{ fontFamily: "system-ui", padding: 24 }}>
        <h1>Configuration error</h1>
        <p>{String(err)}</p>
      </div>
    );
  }
})();
