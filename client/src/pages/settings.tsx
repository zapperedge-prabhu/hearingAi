import { useEffect } from "react";
import { Settings as SettingsIcon, Clock, Database, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Settings() {
  // Set document title
  useEffect(() => {
    document.title = "Settings - Enterprise Management System";
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <SettingsIcon className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        </div>
      </div>

      {/* Settings Categories */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Retention Policy Card */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-lg">Retention Policy</CardTitle>
            </div>
            <CardDescription>
              Configure data retention settings and cleanup policies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Activity Logs</span>
                <Badge variant="outline">90 days</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">User Sessions</span>
                <Badge variant="outline">30 days</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">File Uploads</span>
                <Badge variant="outline">1 year</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database Settings Card */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-green-600" />
              <CardTitle className="text-lg">Database</CardTitle>
            </div>
            <CardDescription>
              Database configuration and maintenance settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Connection Pool</span>
                <Badge variant="outline" className="bg-green-50 text-green-700">Active</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Auto Backup</span>
                <Badge variant="outline" className="bg-green-50 text-green-700">Enabled</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Query Optimization</span>
                <Badge variant="outline" className="bg-green-50 text-green-700">On</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Settings Card */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-purple-600" />
              <CardTitle className="text-lg">Security</CardTitle>
            </div>
            <CardDescription>
              Security policies and authentication settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Session Timeout</span>
                <Badge variant="outline">8 hours</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">2FA Required</span>
                <Badge variant="outline" className="bg-purple-50 text-purple-700">Yes</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Password Policy</span>
                <Badge variant="outline" className="bg-purple-50 text-purple-700">Strong</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Information */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>
            Current system status and configuration details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Environment</h4>
              <p className="text-sm text-gray-600">Development</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Version</h4>
              <p className="text-sm text-gray-600">1.0.0</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Last Updated</h4>
              <p className="text-sm text-gray-600">{new Date().toLocaleDateString()}</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Uptime</h4>
              <p className="text-sm text-gray-600">2 days, 14 hours</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}