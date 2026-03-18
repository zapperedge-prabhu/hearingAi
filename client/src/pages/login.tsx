import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Building2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import zapperEdgeLogo from "@/assets/zapper-edge-logo.png";

export default function LoginPage() {
  const {
    login,
    logout,
    isLoading,
    authError,
    user,
    isAuthorized,
    reauthenticateAfterUnauthorized,
  } = useAuth();
  const { toast } = useToast();

  const handleMicrosoftLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error("Microsoft login error:", error);
      toast({
        title: "Login Failed",
        description: "Authentication failed. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRetryAuthentication = async () => {
    try {
      await reauthenticateAfterUnauthorized();
    } catch (error) {
      console.error("Reauthentication error:", error);
      toast({
        title: "Reauthentication Failed",
        description: "Failed to restart authentication. Please refresh the page.",
        variant: "destructive",
      });
    }
  };

  if (user && !isAuthorized) {
    return (
      <div className="azure-login-bg flex items-center justify-center p-4">
        <div className="azure-decorative-circles">
          <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-white rounded-full mix-blend-overlay"></div>
        </div>
        <div className="azure-grid-pattern"></div>

        <Card className="w-full max-w-md azure-glass-card">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-600 shadow-lg">
              <AlertCircle className="h-10 w-10 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-6">
              The email address <strong className="text-foreground">{user?.email || "Unknown"}</strong> is not registered with the Zapper Edge Platform.
              <br />
              <br />
              Please contact your administrator to request access.
            </p>
            <Button variant="outline" onClick={logout} className="w-full" data-testid="button-signout">
              Sign Out &amp; Try Different Account
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="azure-login-bg flex items-center justify-center p-4">
      <div className="azure-decorative-circles">
        <div className="absolute top-1/2 left-1/4 w-48 h-48 bg-white rounded-full mix-blend-overlay animate-pulse delay-500"></div>
        <div className="absolute bottom-1/3 left-1/2 w-32 h-32 bg-white rounded-full mix-blend-overlay animate-pulse delay-700"></div>
      </div>
      <div className="azure-grid-pattern"></div>

      <Card className="w-full max-w-md azure-glass-card relative z-10">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-lg shadow-lg overflow-hidden">
            <img
              src={zapperEdgeLogo}
              alt="Zapper Edge"
              className="w-full h-full object-contain"
              data-testid="img-logo"
            />
          </div>
          <CardTitle
            className="text-3xl font-bold"
            style={{
              background: "linear-gradient(45deg, #0078d4 0%, #106ebe 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
            data-testid="text-app-title"
          >
            Zapper Edge
          </CardTitle>
          <p className="text-muted-foreground mt-2" data-testid="text-login-subtitle">
            Sign in with your account to access the system
          </p>
        </CardHeader>

        <CardContent>
          {authError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md" data-testid="text-auth-error">
              <p className="text-sm text-red-600">{authError}</p>
            </div>
          )}

          <div className="space-y-4">
            <Button
              onClick={handleMicrosoftLogin}
              disabled={isLoading}
              className="w-full text-white shadow-lg hover:shadow-xl transition-all duration-200"
              size="lg"
              style={{
                background: "linear-gradient(45deg, #0078d4 0%, #106ebe 100%)",
                transition: "all 0.2s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background =
                  "linear-gradient(45deg, #106ebe 0%, #005a9e 100%)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background =
                  "linear-gradient(45deg, #0078d4 0%, #106ebe 100%)";
              }}
              data-testid="button-microsoft-login"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Signing in...
                </>
              ) : (
                <>
                  <Building2 className="mr-2 h-4 w-4" />
                  Sign in with Microsoft
                </>
              )}
            </Button>
          </div>

          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Shield className="h-3 w-3" />
              By signing in, you agree to the terms of service and privacy policy.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
