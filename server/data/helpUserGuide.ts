export interface HelpChapter {
  id: string;
  title: string;
  slug: string;
  html: string;
  allowedRoles?: string[];
}

export const userGuideChapters: HelpChapter[] = [
  {
    id: "10",
    title: "Login & Session Basics",
    slug: "login-session-basics",
    html: `
      <h1>Login & Session Basics</h1>
      <p>Zapper Edge provides secure Single Sign-On (SSO) authentication through Microsoft Entra ID (Azure AD). This eliminates the need to manage separate passwords and leverages your existing organizational identity.</p>
      
      <h2>How to Sign In</h2>
      <p>When you first access Zapper, you'll see the sign-in screen with two options:</p>
      <ul>
        <li><strong>Sign in with Microsoft</strong> - Use your organizational Entra ID account</li>
        <li><strong>Sign in with Google</strong> - Use your Google workspace account </li>
      </ul>
      
      <p><img src="/assets/image_1762251826338.png" alt="Microsoft Sign-in Page" /></p>
      <p><em>Figure 1: Microsoft Sign-in Page</em></p>
      
      <h2>Authentication Flow</h2>
      <p>The authentication process follows these steps:</p>
      <ol>
        <li>Click your preferred sign-in method</li>
        <li>You'll be redirected to Microsoft or Google's secure login page</li>
        <li>Enter your credentials and complete any multi-factor authentication if required</li>
        <li>After successful authentication, you'll be redirected back to Zapper's dashboard</li>
      </ol>
      
      <h2>Session Management</h2>
      <p>Your session is protected by JWT (JSON Web Tokens) and will remain active as long as you're using the application. Sessions automatically expire after a period of inactivity for security purposes.</p>
      
      <h2>Access Denied</h2>
      <p>If you see an "Access Denied" message after signing in, it means your email address is not registered in the Zapper system. Contact your administrator to request access and be assigned to an organization with appropriate roles.</p>
      
      <p><img src="/assets/image_1762251846268.png" alt="Access Denied Message" /></p>
      <p><em>Figure 2: Access Denied Message</em></p>
      
      <h2>Security Features</h2>
      <ul>
        <li>All API calls are protected with JWT authentication</li>
        <li>Role-based access control enforces permissions at every level</li>
        <li>Organization-level validation prevents unauthorized cross-organization access</li>
        <li>All authentication events are logged for audit purposes</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support", "user"]
  },
  {
    id: "2",
    title: "File Management",
    slug: "file-management",
    html: `
      <h1>File Management</h1>
      <p>The File Management page is the central hub for all file operations in Zapper. Browse folders, upload files, download content, and manage your Azure storage data without learning complex cloud tools.</p>
      
      <h2>Browse Files and Folders</h2>
      <p>Select <strong>File Management</strong> from the sidebar to view your files. The interface displays a table with columns for name, size, last modified date, and security status. Click a folder name to navigate into it, and use the breadcrumb trail at the top to navigate back up to parent folders.</p>

      <h2>Search and Filter</h2>
      <p>Use the search bar at the top of the file list to find specific files or folders by name. The list updates in real-time as you type, searching through the current directory and its subdirectories.</p>

      <h2>File Operations</h2>
      <p>Hover over a file to see available actions:</p>
      <ul>
        <li><strong>Preview</strong> - View the contents of supported file types (images, PDFs, documents) directly in the browser.</li>
        <li><strong>Rename</strong> - Change the name of a file or folder. Zapper handles the underlying cloud operations to ensure consistency.</li>
        <li><strong>Delete</strong> - Remove files or folders permanently (subject to soft-delete policies).</li>
      </ul>

      <h2>Rehydrate Archived Files</h2>
      <p>Files in the <strong>Archive</strong> storage tier cannot be downloaded directly. To access them, you must first "Rehydrate" them to the <strong>Hot</strong> tier:</p>
      <ol>
        <li>Locate the archived file (indicated by the Archive status).</li>
        <li>Click the <strong>Rehydrate</strong> button.</li>
        <li>Zapper automatically initiates a <strong>High Priority</strong> rehydration to the Hot access tier for the fastest possible recovery.</li>
        <li>Wait for Azure to complete the rehydration process. You'll receive a notification once the file is back in the Hot tier and ready for download.</li>
      </ol>

      <h2>Upload Files</h2>
      <p>Zapper supports both single and bulk file uploads:</p>
      <ol>
        <li>Click <strong>Upload Files</strong> in the toolbar</li>
        <li>Choose files by clicking "Choose files" or drag and drop from your computer</li>
        <li>You can also select an entire folder to upload its contents</li>
        <li>Review the file count and total size</li>
        <li>Click <strong>Start Upload</strong> to begin the transfer</li>
      </ol>
      
      <h2>Upload Limits</h2>
      <p>By default, Zapper allows:</p>
      <ul>
        <li><strong>Maximum 1,000 files</strong> per upload batch</li>
        <li><strong>Maximum 15 GB</strong> total size per upload</li>
      </ul>
      <p>These limits are configurable by your administrator. If you exceed a limit, you'll see a clear warning message before the upload begins.</p>
      
      <h2>Download Files and Folders</h2>
      <p>To download a single file, click the download icon (⬇) next to it. For folders, Zapper automatically creates a ZIP archive:</p>
      <ul>
        <li>Small folders (under 10 MB by default) are zipped on the main server</li>
        <li>Large folders may be offloaded to Azure Container Apps for better performance</li>
        <li>A progress indicator shows the ZIP creation and download status</li>
      </ul>
      
      <h2>Delete Files and Folders</h2>
      <p>Click the delete icon (🗑) next to any file or folder. For folders, you'll be asked to type the folder name to confirm deletion, as this action removes all contents. Deleted data cannot be recovered unless Soft Delete is enabled on your storage account.</p>
      
      <h2>Geographic Restrictions (Geo-Fencing)</h2>
      <p>Your access to files may be restricted based on your geographic location if your administrator has enabled <strong>Geo-Fencing</strong> for your organization. If you attempt to access data from a restricted country, you will see an error message: <em>"Data access from your current country is restricted for this organization."</em></p>
      <p>If you believe you are receiving this message in error, contact your administrator to verify your organization's allowed countries list or enforcement mode.</p>

      <h2>Create Folders</h2>
      <p>To organize your files:</p>
      <ol>
        <li>Click <strong>New Folder</strong> in the toolbar</li>
        <li>Enter a folder name using letters, numbers, hyphens, and underscores</li>
        <li>Click <strong>Create</strong></li>
      </ol>
      <p>Folder names are case-sensitive, and the full path length must not exceed 1,024 characters.</p>
      
      <h2>Required Permissions</h2>
      <p>File operations require specific permissions assigned through your role:</p>
      <ul>
        <li><strong>VIEW_FILES</strong> - Browse and view file listings</li>
        <li><strong>UPLOAD_FILE</strong> - Upload individual files</li>
        <li><strong>UPLOAD_FOLDER</strong> - Upload entire folders</li>
        <li><strong>DOWNLOAD_FILE</strong> - Download files</li>
        <li><strong>DOWNLOAD_FOLDER</strong> - Download folders as ZIP</li>
        <li><strong>CREATE_FOLDER</strong> - Create new folders</li>
        <li><strong>DELETE_FILES_FOLDERS</strong> - Delete files and folders</li>
        <li><strong>REHYDRATE_FILE</strong> - Rehydrate archived files to the Hot access tier</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support", "user"]
  },
  {
    id: "3",
    title: "User Management",
    slug: "user-management",
    html: `
      <h1>User Management</h1>
      <p>User Management allows administrators to control who has access to Zapper and what they can do. Users are assigned to organizations and given roles that determine their permissions.</p>
      
      <h2>View Users</h2>
      <p>Click <strong>Users</strong> in the sidebar to see all users in your organization. The table shows each user's name, email, assigned roles, organization, user type (Internal/External), status (enabled/disabled), and available actions.</p>
      
      <h2>Add a New User</h2>
      <p>To add a user:</p>
      <ol>
        <li>Click <strong>Add User</strong></li>
        <li>Enter the user's <strong>Full Name</strong> and <strong>Email Address</strong> (must match their SSO email)</li>
        <li>Select a <strong>Role</strong> to assign. When you select a role, a color-coded risk badge will appear showing the risk level of that role (see Role Risk Categories below). Users can be assigned additional roles later</li>
        <li>Select the <strong>Partner Organization</strong> they belong to</li>
        <li>Choose the <strong>User Type</strong>:
          <ul>
            <li><strong>Internal</strong> - Users who belong to your organization (employees, staff)</li>
            <li><strong>External</strong> - Users who are partners or third parties outside your organization</li>
          </ul>
        </li>
        <li>Set the <strong>User Status</strong> to Enabled or Disabled</li>
        <li>Click <strong>Add User</strong> to save</li>
      </ol>
      
      <h2>Role Risk Warnings</h2>
      <p>When selecting a role during user creation or editing, Zapper displays a prominent security warning if the role carries elevated risk. These warnings are color-coded based on the role's risk category:</p>
      <ul>
        <li><span style="color: #DC2626; font-weight: bold;">Dangerous (Red)</span> - Roles with high-level permissions such as tenant-wide or cross-organization impact. Must never be assigned to external users</li>
        <li><span style="color: #EA580C; font-weight: bold;">Critical (Orange)</span> - Roles with significant permissions that could affect organization security or data access</li>
        <li><span style="color: #CA8A04; font-weight: bold;">Warning (Yellow)</span> - Roles with moderate permissions that should be assigned carefully</li>
        <li><span style="color: #2563EB; font-weight: bold;">Info (Blue)</span> - Standard roles with basic permissions suitable for general users</li>
      </ul>
      <p>These warnings help administrators make informed decisions and prevent accidental assignment of high-privilege roles to the wrong users.</p>
      
      <h2>User Type Classification</h2>
      <p>Each user is classified as either <strong>Internal</strong> or <strong>External</strong>:</p>
      <ul>
        <li><strong>Internal users</strong> are members of your own organization, such as employees and staff. They typically have higher trust levels and may be assigned more permissive roles</li>
        <li><strong>External users</strong> are partners, vendors, or third parties who interact with your organization. They should generally be given more restrictive roles to limit data exposure</li>
      </ul>
      <p>The user type is displayed as a badge in the users table and can be changed at any time by editing the user.</p>
      
      <h2>Edit User Details</h2>
      <p>Click the edit icon next to a user to modify their name, role, organization, user type, or status. Changes take effect immediately upon saving. The edit modal also displays the risk badge for the currently assigned role.</p>
      
      <h2>Enable or Disable Users</h2>
      <p>Disabling a user revokes their access without deleting their account. This is useful for temporary suspensions or when an employee leaves but you want to retain their activity history. Disabled users cannot sign in.</p>
      
      <h2>Delete Users</h2>
      <p>Deleting a user permanently removes their account but preserves their activity log entries for compliance. To delete a user, click the delete icon and confirm the action.</p>
      
      <h2>Multi-Organization Access</h2>
      <p>A user can be a member of only one organization at a time. To change a user's organization, edit their profile and select a different organization from the dropdown.</p>
      
      <h2>Security Safeguards</h2>
      <p>Zapper includes protection against accidental lockouts:</p>
      <ul>
        <li>You cannot disable or delete the last enabled user with administrative privileges</li>
        <li>This ensures there's always at least one active administrator who can manage the system</li>
      </ul>
      
      <h2>Required Permissions</h2>
      <p>User management operations require:</p>
      <ul>
        <li><strong>VIEW_USERS</strong> - See the user list</li>
        <li><strong>ADD_USER</strong> - Create new users</li>
        <li><strong>EDIT_USER</strong> - Modify user details</li>
        <li><strong>DELETE_USER</strong> - Remove users</li>
        <li><strong>ENABLE_DISABLE_USER</strong> - Change user status</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support"]
  },
  {
    id: "4",
    title: "Storage Management",
    slug: "storage-management",
    html: `
      <h1>Storage Management</h1>
      <p>Storage Management lets administrators provision new Azure storage accounts and containers, or register existing ones with Zapper. Each storage account can have multiple containers, and containers are assigned to specific organizations.</p>
      
      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md mb-4">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Important Rule:</strong> Zapper enforces a <strong>one-org-one-storage</strong> policy. Each organization can only be associated with ONE storage account and container combination. However, multiple organizations can share the same storage account using different containers.
        </p>
      </div>

      <h2>View Storage Accounts</h2>
      <p>Click <strong>Storage Management</strong> to see all registered storage accounts and containers. The table shows the storage account name, region, container name, resource group, assigned organization, and creation date.</p>
      
      <h2>Provision a New Storage Account</h2>
      <p>To create a brand new Azure storage account and container:</p>
      <ol>
        <li>Click <strong>Add Storage</strong></li>
        <li>Enter a globally unique <strong>Storage Account Name</strong> (3-24 lowercase letters/numbers)</li>
        <li>Enter a <strong>Container Name</strong> (3-63 characters, lowercase letters/numbers/hyphens)</li>
        <li>Select an existing <strong>Resource Group</strong> or create a new one</li>
        <li>Choose an <strong>Azure Region</strong> close to your users for better performance</li>
        <li>Select the <strong>Organization</strong> that will own this storage</li>
        <li>Click <strong>Create Storage</strong></li>
      </ol>
      <p>Zapper provisions the storage account, creates the container, and assigns the necessary permissions. This process may take 1-2 minutes.</p>
      
      <h2>Register an Existing Storage Account</h2>
      <p>To connect an existing Azure storage account to Zapper:</p>
      <ol>
        <li>Click <strong>Add Storage</strong></li>
        <li>Enable <strong>Use existing storage account for container creation</strong></li>
        <li>Select the existing storage account from the dropdown</li>
        <li>Enter the <strong>Container Name</strong> you want Zapper to manage</li>
        <li>The resource group and region auto-populate</li>
        <li>Select the <strong>Organization</strong></li>
        <li>Click <strong>Create Storage</strong></li>
      </ol>
      
      <h2>Storage Account Types</h2>
      <p>Zapper supports two types of Azure storage:</p>
      <ul>
        <li><strong>Azure Blob Storage</strong> - Object storage for unstructured data</li>
        <li><strong>Azure Data Lake Storage Gen2 (ADLS Gen2)</strong> - Hierarchical namespace storage for big data analytics</li>
      </ul>
      <p>The storage type is detected automatically based on the account's configuration in Azure.</p>
      
      <h2>Delete Storage Accounts or Containers</h2>
      <p>To remove a container or entire storage account:</p>
      <ol>
        <li>Click the delete icon next to the entry</li>
        <li>Type the name of the container or account to confirm</li>
        <li>Click <strong>Delete</strong></li>
      </ol>
      <p><strong>Warning:</strong> This action is permanent and cannot be undone through Zapper. If Soft Delete is enabled on the storage account, Azure retains blobs and containers for the configured retention period.</p>
      
      <h2>ADLS Gen2 Features</h2>
      <p>For ADLS Gen2 accounts, Zapper provides additional capabilities:</p>
      <ul>
        <li><strong>SFTP Access</strong> - Enable or disable SFTP endpoints for the storage account</li>
        <li><strong>Hierarchical Namespace</strong> - Automatic detection and optimized folder operations</li>
        <li><strong>Data Lake Analytics</strong> - Enhanced support for big data workloads</li>
      </ul>
      
      <h2>Required Permissions</h2>
      <ul>
        <li><strong>VIEW_STORAGE</strong> - View storage account list</li>
        <li><strong>ADD_STORAGE_ACCOUNT</strong> - Create new storage accounts</li>
        <li><strong>ADD_CONTAINER</strong> - Add containers to existing accounts</li>
        <li><strong>DELETE_STORAGE</strong> - Remove storage accounts or containers</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops"]
  },
  {
    id: "5",
    title: "Partner Organizations",
    slug: "partner-organizations",
    html: `
      <h1>Partner Organizations</h1>
      <p>Organizations in Zapper represent separate partner entities or business units. Each organization has its own users, storage containers, and activity logs, ensuring complete data isolation and security.</p>
      
      <h2>Why Organizations Matter</h2>
      <p>Organizations provide:</p>
      <ul>
        <li><strong>Data Isolation</strong> - Users can only access files and resources in their assigned organization</li>
        <li><strong>Multi-Tenancy</strong> - Host multiple partners or departments on a single Zapper instance</li>
        <li><strong>Separate Audit Trails</strong> - Each organization has its own activity logs</li>
        <li><strong>Custom Storage</strong> - Assign different Azure storage accounts to different organizations</li>
      </ul>
      
      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md mb-4">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Important Rule:</strong> Zapper enforces a <strong>one-org-one-storage</strong> policy. Each organization can only be associated with ONE storage account and container combination. However, multiple organizations can share the same storage account using different containers.
        </p>
      </div>

      <h2>View Organizations</h2>
      <p>Click <strong>Organizations</strong> in the sidebar to see all partner organizations. The table shows the organization name, assigned storage container, creation date, and number of active users.</p>
      
      <h2>Create a New Organization</h2>
      <p>To add a new partner organization:</p>
      <ol>
        <li>Click <strong>Add Organization</strong></li>
        <li>Enter an <strong>Organization Name</strong> (up to 24 characters)</li>
        <li>Select a <strong>Storage Container</strong> that this organization will use. <strong>Note:</strong> Organizations that already have storage associated will not appear in this list.</li>
        <li>Click <strong>Save</strong></li>
      </ol>
      <p>After creating the organization, add users and assign them roles through the User Management page.</p>
      
      <h2>Edit Organization Details</h2>
      <p>Click the edit icon next to an organization to change its name or reassign it to a different storage container. Be careful when changing storage containers as this affects all users in that organization.</p>
      
      <h2>Delete an Organization</h2>
      <p>Deleting an organization removes all its users and role assignments but does NOT delete any files in the storage container. To delete an organization:</p>
      <ol>
        <li>Click the delete icon</li>
        <li>Type the organization name to confirm</li>
        <li>Click <strong>Delete</strong></li>
      </ol>
      <p>This action cannot be undone. All users in the organization will lose access to Zapper.</p>
      
      <h2>Switching Organizations</h2>
      <p>If you're a member of multiple organizations (rare), you can switch between them using the organization selector in the top-right corner of the screen. This changes which storage containers and users you can see.</p>
      
      <h2>Organization-Level Security</h2>
      <p>Zapper enforces strict organization boundaries:</p>
      <ul>
        <li>Users cannot view or access resources from other organizations</li>
        <li>All API calls validate organization membership</li>
        <li>Activity logs are filtered by organization</li>
        <li>IDOR (Insecure Direct Object Reference) attacks are prevented</li>
        <li><strong>Geo-Fencing</strong> - Restrict data access to specific geographic locations</li>
      </ul>

      <h2>Geo-Fencing</h2>
      <p>Geo-fencing allows administrators to restrict data access for an organization to a specific list of allowed countries. When enabled, any attempt to download, upload, or preview files from a restricted location will be blocked.</p>
      <p>To configure geo-fencing for an organization:</p>
      <ol>
        <li>Edit the organization details</li>
        <li>Toggle <strong>Geo-Fencing</strong> to On</li>
        <li>Select one or more <strong>Allowed Countries</strong> from the multi-select list</li>
        <li>Select the <strong>Enforcement Mode</strong>:
          <ul>
            <li><strong>Strict</strong> - Block all access attempts from restricted countries</li>
            <li><strong>Audit</strong> - Allow access but log geographic location for compliance</li>
          </ul>
        </li>
        <li>Click <strong>Save</strong></li>
      </ol>
      <p><strong>Note:</strong> Zapper uses Azure Maps for real-time geolocation. If a user's location cannot be determined, access is denied in Strict mode to ensure security (Fail-Closed).</p>
      
      <h2>Required Permissions</h2>
      <ul>
        <li><strong>VIEW_ORGANIZATIONS</strong> - View the organization list</li>
        <li><strong>ADD_ORGANIZATION</strong> - Create new organizations</li>
        <li><strong>EDIT_ORGANIZATION</strong> - Modify organization details</li>
        <li><strong>DELETE_ORGANIZATION</strong> - Remove organizations</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops"]
  },
  {
    id: "6",
    title: "Roles & Permissions",
    slug: "roles-permissions",
    html: `
      <h1>Roles & Permissions</h1>
      <p>Roles define what users can do in Zapper. Each role has a set of permissions across seven module categories. Assign users to one or more roles to grant them the appropriate level of access.</p>
      
      <h2>Permission Categories</h2>
      <p>Zapper organizes permissions into seven modules:</p>
      <ol>
        <li><strong>User Management</strong> - Add, edit, delete, view, and enable/disable users</li>
        <li><strong>Role Management</strong> - Create and manage roles and their permissions</li>
        <li><strong>Organizations</strong> - Create and manage partner organizations</li>
        <li><strong>Storage Management</strong> - Provision storage accounts, add containers, configure data protection and lifecycle policies</li>
        <li><strong>File Management</strong> - Upload, download, create folders, delete files</li>
        <li><strong>Activity Logs</strong> - View audit trails of all system activity</li>
        <li><strong>AI Agent Management</strong> - Create and manage AI processing agents</li>
      </ol>
      
      <h2>Permission Risk Categories</h2>
      <p>Every permission in Zapper is automatically categorized by risk level. When creating or editing a role, each permission displays a color-coded risk badge so administrators can immediately see the security impact of the permissions they are granting:</p>
      <ul>
        <li><span style="color: #DC2626; font-weight: bold;">Dangerous (Red)</span> - High-impact permissions that grant tenant-wide or cross-organization control. Examples include deleting organizations, managing roles, and deleting storage accounts. These permissions should only be assigned to highly trusted administrators</li>
        <li><span style="color: #EA580C; font-weight: bold;">Critical (Orange)</span> - Significant permissions that affect organization security or broad data access. Examples include creating organizations, editing storage accounts, and managing PGP encryption keys</li>
        <li><span style="color: #CA8A04; font-weight: bold;">Warning (Yellow)</span> - Moderate permissions that grant write access to important resources. Examples include uploading files and creating directories</li>
        <li><span style="color: #2563EB; font-weight: bold;">Info (Blue)</span> - Standard read-only or low-risk permissions suitable for general users. Examples include viewing files, viewing activity logs, and downloading files</li>
      </ul>
      <p>The risk category for each role is computed automatically based on the highest-risk permission it contains. This category is displayed throughout the platform, including in the user assignment modals, to help administrators make security-conscious decisions.</p>
      
      <h2>View Roles</h2>
      <p>Click <strong>Roles & Permissions</strong> in the sidebar to see all defined roles. The table shows the role name, description, risk category badge, number of assigned users, and creation date.</p>
      
      <h2>Create a New Role</h2>
      <p>To create a custom role:</p>
      <ol>
        <li>Click <strong>Add Role</strong></li>
        <li>Enter a <strong>Role Name</strong> and <strong>Description</strong></li>
        <li>For each permission category, check the boxes for allowed actions. Each permission displays its risk level badge to help you understand the security implications</li>
        <li>Review the overall role risk category shown at the top, which reflects the highest-risk permission selected</li>
        <li>Click <strong>Save</strong></li>
      </ol>
      <p>The new role is immediately available for assignment to users.</p>
      
      <h2>Edit Role Permissions</h2>
      <p>Click the edit icon next to a role to modify its permissions. Changes apply immediately to all users assigned that role. Use caution when editing roles with many users. Pay attention to the risk badges when adding or removing permissions.</p>
      
      <h2>Delete a Role</h2>
      <p>To delete a role, click the delete icon and confirm. Users currently assigned to that role will lose those permissions immediately. Ensure users have alternate roles before deleting.</p>
      
      <h2>Common Role Patterns</h2>
      <p>Here are typical role configurations:</p>
      
      <h3>Super Administrator (Dangerous)</h3>
      <p>Full access to all modules. Super Admins can manage users, roles, organizations, storage, and view all activity logs. This role carries a Dangerous risk rating due to its tenant-wide impact.</p>
      
      <h3>Operations (Critical)</h3>
      <p>Permissions: Storage Management, File Management (all), Activity Logs. Operations teams can manage infrastructure and files but not users or roles.</p>
      
      <h3>User (Info)</h3>
      <p>Permissions: File Management (upload, download, view), limited Activity Logs. End users can work with files but cannot manage system settings. Carries an Info risk rating.</p>
      
      <h3>Auditor (Info)</h3>
      <p>Permissions: View Activity Logs, View Files (read-only). Auditors can review system activity and file metadata without making changes.</p>
      
      <h2>Multiple Roles per User</h2>
      <p>Users can be assigned multiple roles. Their effective permissions are the union of all assigned roles. For example, a user with both "Operations" and "Auditor" roles has all permissions from both.</p>
      
      <h2>Required Permissions</h2>
      <ul>
        <li><strong>VIEW_ROLES</strong> - View the role list</li>
        <li><strong>ADD_ROLE</strong> - Create new roles</li>
        <li><strong>EDIT_ROLE</strong> - Modify role permissions</li>
        <li><strong>DELETE_ROLE</strong> - Remove roles</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops"]
  },
  {
    id: "7",
    title: "Data Protection",
    slug: "data-protection",
    html: `
      <h1>Data Protection</h1>
      <p>Data Protection features help safeguard your files against accidental deletion and malicious content. Zapper integrates with Microsoft Defender for Storage to provide enterprise-grade security.</p>
      
      <h2>Protection Features Overview</h2>
      <p>Zapper supports four data protection features:</p>
      <ul>
        <li><strong>Blob Soft Delete</strong> - Retain deleted files for a specified period</li>
        <li><strong>Container Soft Delete</strong> - Recover accidentally deleted folders</li>
        <li><strong>Malware Scanning</strong> - Automatically scan uploaded files for threats</li>
        <li><strong>Sensitive Data Discovery</strong> - Identify and classify personal or confidential information</li>
      </ul>
      
      <h2>Access Data Protection Settings</h2>
      <p>Click <strong>Data Protection</strong> in the sidebar to see all storage accounts and their current protection settings. Each row shows which features are enabled and the retention periods.</p>
      
      <h2>Enable Soft Delete</h2>
      <p>To enable soft delete for a storage account:</p>
      <ol>
        <li>Click the edit icon next to the storage account</li>
        <li>In the Protection Settings dialog, toggle <strong>Blob Soft Delete</strong> to On</li>
        <li>Set the <strong>Retention Period</strong> (1-365 days)</li>
        <li>Optionally enable <strong>Container Soft Delete</strong> with its own retention period</li>
        <li>Click <strong>Save Changes</strong></li>
      </ol>
      <p>Once enabled, deleted files are retained in a soft-deleted state for the specified number of days before permanent removal. You can recover soft-deleted files from the Azure Portal.</p>
      
      <h2>Enable Malware Scanning</h2>
      <p>To enable malware scanning:</p>
      <ol>
        <li>Click the edit icon next to the storage account</li>
        <li>Toggle <strong>Malware Scanning</strong> to On</li>
        <li>Click <strong>Save Changes</strong></li>
      </ol>
      <p>Zapper automatically creates the required Azure Event Grid resources (topic and subscription) to receive scan results from Microsoft Defender. All uploaded files will be scanned, and results appear in the File Management page's Security Status column.</p>
      
      <h2>Malware Scan Results</h2>
      <p>After scanning, files display one of three security badges:</p>
      <ul>
        <li>🟢 <strong>Clean</strong> - No malware detected</li>
        <li>🔴 <strong>Malicious</strong> - Threat detected, do not use this file</li>
        <li>⚪ <strong>Not Scanned/N/A</strong> - Scanning disabled or result not yet available</li>
      </ul>
      
      <h2>Testing Malware Scanning with EICAR</h2>
      <p>To verify that scanning works, use the EICAR test file:</p>
      <ol>
        <li>Create a text file with this content on a single line:</li>
        <li><code>X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*</code></li>
        <li>Save it as <code>eicar-test.txt</code></li>
        <li>Upload it to Zapper</li>
        <li>Within seconds, it should show a red "Malicious" badge</li>
        <li>Delete the file after testing</li>
      </ol>
      
      <h2>Enable Sensitive Data Discovery</h2>
      <p>This feature uses Azure's data classification to identify files containing personally identifiable information (PII) or other sensitive data:</p>
      <ol>
        <li>Click the edit icon next to the storage account</li>
        <li>Toggle <strong>Sensitive Data Discovery</strong> to On</li>
        <li>Click <strong>Save Changes</strong></li>
      </ol>
      <p>Discovery results appear in the Azure Defender portal, not in Zapper. Administrators can review findings and apply data governance policies.</p>
      
      <h2>Disable Protection Features</h2>
      <p>To disable any feature, edit the storage account settings and toggle it to Off. For malware scanning, Zapper automatically cleans up the Event Grid resources when you disable it.</p>
      
      <h2>Required Permissions</h2>
      <p>Data protection operations require the <strong>DATA_PROTECTION</strong> permission within the Storage Management module.</p>
    `,
    allowedRoles: ["admin", "ops"]
  },
  {
    id: "8",
    title: "Data Lifecycle Management",
    slug: "data-lifecycle-management",
    html: `
      <h1>Data Lifecycle Management</h1>
      <p>Data Lifecycle Management helps you automatically move or delete old files based on age, reducing storage costs and maintaining compliance with data retention policies.</p>
      
      <h2>What are Lifecycle Rules?</h2>
      <p>Lifecycle rules define actions that Azure Storage automatically performs on blobs (files) after a specified number of days. Common actions include:</p>
      <ul>
        <li><strong>Move to Cool Storage</strong> - Transition infrequently accessed files to lower-cost Cool tier</li>
        <li><strong>Move to Archive</strong> - Archive very old files at minimal cost</li>
        <li><strong>Delete</strong> - Permanently remove files after the retention period expires</li>
      </ul>
      
      <h2>Access Lifecycle Management</h2>
      <p>Click <strong>Data Lifecycle</strong> in the sidebar to see all storage accounts and their configured lifecycle rules. The table shows the storage account, Azure region, and number of active rules.</p>
      
      <h2>View Lifecycle Rules</h2>
      <p>Click the <strong>View Rules</strong> button next to a storage account to see its lifecycle policies. Each rule displays:</p>
      <ul>
        <li><strong>Rule Name</strong> - Identifier for the policy</li>
        <li><strong>Action</strong> - What happens to matching files (move to Cool, Archive, or delete)</li>
        <li><strong>Days Since</strong> - Age threshold (files older than this are affected)</li>
        <li><strong>Prefix Filter</strong> - Optional folder path filter (e.g., "archive/", "logs/")</li>
        <li><strong>Status</strong> - Enabled or Disabled</li>
      </ul>
      
      <h2>Create a Lifecycle Rule</h2>
      <p>To add a new rule:</p>
      <ol>
        <li>Click <strong>View Rules</strong> next to the storage account</li>
        <li>In the Lifecycle Rules dialog, click <strong>Add Rule</strong></li>
        <li>Enter a <strong>Rule Name</strong> (alphanumeric, hyphens, underscores)</li>
        <li>Choose the <strong>Action</strong>: Cool, Archive, or Delete</li>
        <li>Set <strong>Days Since Modification</strong> (minimum 1 day)</li>
        <li>Optionally add a <strong>Prefix Filter</strong> to target specific folders</li>
        <li>Enable or disable the rule immediately</li>
        <li>Click <strong>Save</strong></li>
      </ol>
      <p>Azure processes lifecycle rules once per day. Changes may take up to 24 hours to apply.</p>
      
      <h2>Edit a Lifecycle Rule</h2>
      <p>Click the edit icon next to a rule to modify its action, age threshold, or prefix filter. Changes are saved immediately but may take up to 24 hours to take effect in Azure.</p>
      
      <h2>Delete a Lifecycle Rule</h2>
      <p>To remove a rule, click the delete icon and confirm. This stops the automatic processing of matching files.</p>
      
      <h2>Example Lifecycle Policies</h2>
      
      <h3>Archive Old Logs</h3>
      <p>Rule: Move files in the "logs/" folder to Archive tier after 90 days. This reduces storage costs for infrequently accessed log files.</p>
      
      <h3>Delete Temporary Files</h3>
      <p>Rule: Delete files in the "temp/" folder after 7 days. This keeps your storage clean and limits costs.</p>
      
      <h3>Cool Down Backups</h3>
      <p>Rule: Move all files to Cool tier after 30 days. This balances cost savings with reasonable access times.</p>
      
      <h2>Storage Tier Differences</h2>
      <ul>
        <li><strong>Hot Tier</strong> - Optimized for frequent access, highest storage cost, lowest access cost</li>
        <li><strong>Cool Tier</strong> - For infrequent access (less than once per month), lower storage cost, higher access cost</li>
        <li><strong>Archive Tier</strong> - For rarely accessed data, lowest storage cost, requires rehydration before access</li>
      </ul>
      
      <h2>Important Notes</h2>
      <ul>
        <li>Lifecycle rules apply to Blob Storage accounts only (not ADLS Gen2)</li>
        <li>Deleted files are subject to soft delete policies if enabled</li>
        <li>Archive tier files cannot be accessed immediately; rehydration can take hours</li>
        <li>Use prefix filters carefully to avoid unintended deletions</li>
      </ul>
      
      <h2>Required Permissions</h2>
      <p>Lifecycle management requires the <strong>DATA_LIFECYCLE</strong> permission within the Storage Management module.</p>
    `,
    allowedRoles: ["admin", "ops"]
  },
  {
    id: "9",
    title: "AI Agents",
    slug: "ai-agents",
    html: `
      <h1>AI Agents</h1>
      <p>AI Agents provide automated file processing capabilities powered by external AI services. Upload a file, trigger AI processing, and receive results directly in Azure Storage within minutes.</p>
      
      <h2>How AI Agents Work</h2>
      <p>When you trigger AI processing on a file:</p>
      <ol>
        <li>Zapper generates a time-limited SAS URL (5-15 minutes) for secure read-only file access</li>
        <li>Zapper prepares a result file location with write permissions</li>
        <li>A processing request is sent to the AI Agent's HTTP endpoint with file details</li>
        <li>The AI agent downloads the file, processes it with your AI service, and uploads results to Azure Storage</li>
        <li>Results appear in the configured results folder (default: "aiagent_results")</li>
        <li>Processing completes within 60 minutes (configurable timeout)</li>
      </ol>
      
      <h2>View AI Agents</h2>
      <p>Click <strong>AI Agents</strong> in the sidebar to see all configured agents. The table shows the agent name, description, API endpoint URL, assigned organization, and status (enabled/disabled).</p>
      
      <h2>Create an AI Agent</h2>
      <p>To add a new AI agent:</p>
      <ol>
        <li>Click <strong>Add AI Agent</strong></li>
        <li>Enter an <strong>Agent Name</strong> (up to 32 characters)</li>
        <li>Enter the <strong>API Endpoint URL</strong> (your external AI service endpoint, up to 192 characters)</li>
        <li>Enter the <strong>API Key</strong> for authentication (stored encrypted, up to 512 characters)</li>
        <li>Select the <strong>Partner Organization</strong> that will use this agent</li>
        <li><strong>Configure SAS URL Security (Advanced):</strong>
          <ul>
            <li><strong>SAS URL Validity</strong> - How long the generated SAS URL remains valid (1-3600 seconds, default: 900 = 15 minutes)</li>
            <li><strong>Enable IP restriction for SAS URLs</strong> - Check this box to restrict SAS URL access to a specific IP address</li>
            <li><strong>Allowed IP Address (Optional)</strong> - Enter the IPv4 address that can access the SAS URL (e.g., 74.225.19.231). Leave empty to auto-detect from incoming request headers</li>
          </ul>
        </li>
        <li>Click <strong>Create Agent</strong></li>
      </ol>
      
      <h2>SAS URL Security Configuration</h2>
      <p>Each AI agent can have custom SAS URL security settings independent of global system defaults:</p>
      
      <h3>SAS URL Validity Period</h3>
      <p>Controls how long the generated SAS URL remains valid:</p>
      <ul>
        <li><strong>Minimum:</strong> 1 second (for testing or ultra-short validity)</li>
        <li><strong>Maximum:</strong> 3600 seconds (1 hour)</li>
        <li><strong>Default:</strong> 900 seconds (15 minutes)</li>
        <li><strong>Use Cases:</strong>
          <ul>
            <li>Short validity (60-300s) for high-security scenarios where files process quickly</li>
            <li>Medium validity (900s) for standard processing workflows (recommended)</li>
            <li>Long validity (1800-3600s) for large files or slower AI processors</li>
          </ul>
        </li>
      </ul>
      
      <h3>IP Restriction for SAS URLs</h3>
      <p>When enabled, the generated SAS URL can only be accessed from the specified IP address. Azure Storage validates the client IP on every request.</p>
      
      <p><strong>Why use IP restrictions?</strong></p>
      <ul>
        <li>Prevents SAS URL abuse if intercepted during transmission</li>
        <li>Ensures only your AI processor server can download files</li>
        <li>Adds defense-in-depth security layer on top of time-limited URLs</li>
        <li>Meets compliance requirements for highly sensitive data</li>
      </ul>
      
      <p><strong>How to find your AI processor's IP address:</strong></p>
      <ol>
        <li><strong>Azure Container Apps:</strong> Find outbound IP addresses in the Azure Portal under Container App → Properties → Outbound IP Addresses</li>
        <li><strong>Azure VM:</strong> Use the VM's public IP address from Azure Portal → Virtual Machine → Overview</li>
        <li><strong>Third-party hosting:</strong> Run <code>curl ifconfig.me</code> on your server to display its public IP</li>
        <li><strong>Auto-detection:</strong> Leave the IP address field empty, and Zapper will extract the IP from the request headers (recommended for dynamic IPs)</li>
      </ol>
      
      <p><strong>⚠️ Important Notes:</strong></p>
      <ul>
        <li><strong>Azure Container Apps:</strong> Outbound IP addresses can change and may be different from inbound IPs. Use auto-detection or deploy on Azure VM with static IP</li>
        <li><strong>Auto-detection:</strong> Leaving IP address empty automatically uses the detected IP from <code>client-ip</code> or <code>x-forwarded-for</code> request headers</li>
        <li><strong>NAT/Proxies:</strong> If your AI processor is behind NAT or a proxy, use the public IP that Azure Storage will see, not the internal IP</li>
        <li><strong>Testing:</strong> You can verify your IP by checking Azure Storage access logs after a failed 403 Forbidden error</li>
      </ul>
      
      <h3>Configuration Examples</h3>
      
      <h4>Example 1: High Security with Static IP (Azure VM)</h4>
      <pre><code>Agent Name: Document Scanner
API Endpoint: http://74.225.19.231:8000/process
Enable IP restriction: ✓ Checked
Allowed IP Address: 74.225.19.231
SAS Validity: 300 seconds (5 minutes)

Result: SAS URLs expire in 5 minutes and only work from 74.225.19.231</code></pre>
      
      <h4>Example 2: Auto-Detect IP (Azure Container Apps)</h4>
      <pre><code>Agent Name: Secret Detector
API Endpoint: https://myagent.azurecontainerapps.io/detect
Enable IP restriction: ✓ Checked
Allowed IP Address: (leave empty)
SAS Validity: 900 seconds (15 minutes)

Result: Zapper auto-detects outbound IP from request headers</code></pre>
      
      <h4>Example 3: No IP Restriction (Maximum Compatibility)</h4>
      <pre><code>Agent Name: Text Analyzer
API Endpoint: https://api.myservice.com/analyze
Enable IP restriction: ☐ Unchecked
SAS Validity: 1800 seconds (30 minutes)

Result: SAS URLs work from any IP, rely on time-limit security only</code></pre>
      
      <h2>Simple API Integration</h2>
      <p>Your AI processor needs to implement a simple POST endpoint. Zapper sends the file URL, you process it, and return the results in the HTTP response. That's it!</p>
      
      <h3>What Zapper Sends to Your API</h3>
      <p>POST request with minimal payload:</p>
      <pre><code>{
  "source_file_url": "https://storage.blob.core.windows.net/data/file.txt?sp=r&se=..."
}

Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json</code></pre>
      
      <h3>Field Description</h3>
      <ul>
        <li><strong>source_file_url</strong> - Time-limited SAS URL to download the source file (valid for 2 hours). This URL expires after processing, so download the file immediately when you receive the request.</li>
      </ul>
      
      <h3>What Your API Should Do</h3>
      <ol>
        <li><strong>Verify the API key</strong> - Check the Authorization header contains your expected API key</li>
        <li><strong>Download the file</strong> - Use the source_file_url to download the file content</li>
        <li><strong>Process the file</strong> - Run your AI processing (scan, analyze, summarize, etc.)</li>
        <li><strong>Return the result</strong> - Send back the processing result in the HTTP response</li>
      </ol>
      
      <p><strong>Important:</strong> Zapper automatically saves your response to Azure blob storage. You don't need to upload files yourself!</p>
      
      <h3>What Your API Should Return</h3>
      <p>Return your processing result as JSON. Any valid JSON response is acceptable - Zapper saves it exactly as you return it:</p>
      <pre><code>Success (200 OK):
{
  "success": true,
  "message": "Processing completed successfully",
  "findings": {
    "secrets_found": 3,
    "risk_level": "high",
    "details": [
      "API key found on line 42",
      "Password in config.json line 15"
    ]
  },
  "processing_time": 2.5
}

Error (4xx/5xx):
{
  "success": false,
  "error": "Unsupported file format",
  "details": "Only .txt and .json files are supported"
}</code></pre>
      
      <h3>Simple Example (Python)</h3>
      <pre><code>from flask import Flask, request, jsonify
import requests

app = Flask(__name__)
EXPECTED_API_KEY = "your-secret-key-here"

@app.route('/api/process', methods=['POST'])
def process_file():
    # 1. Verify API key
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer ') or auth_header[7:] != EXPECTED_API_KEY:
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    
    # 2. Get file URL from request
    data = request.json
    file_url = data.get('source_file_url')
    if not file_url:
        return jsonify({"success": False, "error": "Missing source_file_url"}), 400
    
    # 3. Download file
    response = requests.get(file_url)
    if response.status_code != 200:
        return jsonify({"success": False, "error": "Failed to download file"}), 500
    
    file_content = response.text
    
    # 4. Process the file (your AI logic here)
    result = {
        "word_count": len(file_content.split()),
        "char_count": len(file_content),
        "summary": "File processed successfully"
    }
    
    # 5. Return result
    return jsonify({
        "success": True,
        "message": "Processing completed",
        "result": result
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)</code></pre>
      
      <h2>Edit an AI Agent</h2>
      <p>Click the edit icon next to an agent to modify its endpoint URL, API key, description, or enabled status. Changes take effect immediately for new processing requests.</p>
      
      <h2>Delete an AI Agent</h2>
      <p>To remove an agent, click the delete icon and confirm. This does not delete any processing results already stored in Azure Storage.</p>
      
      <h2>Trigger AI Processing</h2>
      <p>From the File Management page:</p>
      <ol>
        <li>Navigate to the file you want to process</li>
        <li>Click the AI robot icon next to the file</li>
        <li>Select the AI agent to use from the dropdown</li>
        <li>Click <strong>Process with AI</strong></li>
        <li>Monitor real-time status updates</li>
        <li>View results in the "aiagent_results" folder when complete</li>
      </ol>
      
      <h2>Security Best Practices</h2>
      
      <h3>⚠️ CRITICAL: Never Log SAS URLs!</h3>
      <p>SAS URLs contain authentication credentials. If you log them, anyone with access to your logs can download files from Azure storage.</p>
      
      <p><strong>What NOT to log:</strong></p>
      <pre><code>❌ NEVER DO THIS:
print(f"Processing {source_file_url}")
logger.error(f"Download failed: {source_file_url}")

✅ DO THIS INSTEAD:
print("Processing file from Zapper")
logger.error("Download failed for Zapper file")</code></pre>
      
      <h3>SAS URL Expiration</h3>
      <ul>
        <li>SAS URLs expire after 2 hours (120 minutes)</li>
        <li>Download the file immediately when you receive the request</li>
        <li>If the URL expires, return an error - Zapper will retry with a fresh URL</li>
        <li>All SAS URLs use HTTPS for secure transmission</li>
      </ul>
      
      <h3>API Key Security</h3>
      <ul>
        <li>Validate the API key from the Authorization header on every request</li>
        <li>API keys are encrypted in Zapper's database</li>
        <li>Rotate API keys regularly (every 3-6 months recommended)</li>
        <li>Never commit API keys to version control or share them publicly</li>
      </ul>
      
      <h2>Results Storage</h2>
      <p>When your API returns a successful response, Zapper automatically saves the result to Azure blob storage in the <code>aiagent_results</code> folder. The result filename includes:</p>
      <ul>
        <li>Original filename</li>
        <li>Agent name</li>
        <li>Timestamp</li>
        <li>Example: <code>document_Secret-Scanner_20250110_143052_result.json</code></li>
      </ul>
      
      <h2>How Results are Saved</h2>
      <ol>
        <li>Your API returns JSON response (status 200 OK)</li>
        <li>Zapper captures the entire response body</li>
        <li>Response is saved as a JSON file in <code>aiagent_results/</code> folder</li>
        <li>Users can download the result file from File Management</li>
      </ol>
      
      <p><strong>Important:</strong> You don't need to upload files to Azure yourself. Just return your processing result in the HTTP response!</p>
      
      <h2>Organization Security</h2>
      <p>AI agents are assigned to specific organizations. This ensures:</p>
      <ul>
        <li>Users can only process files from their organization</li>
        <li>Processing results are kept separate between organizations</li>
        <li>Multi-tenant security is enforced at all levels</li>
        <li>Audit logs track which organization triggered processing</li>
      </ul>
      
      <h2>Troubleshooting</h2>
      
      <h3>Error: "401 Unauthorized"</h3>
      <p><strong>Cause:</strong> API key mismatch or missing Authorization header.</p>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Verify the API key in Zapper matches your processor's expected key</li>
        <li>Check your code validates the Authorization header correctly</li>
        <li>Ensure the header format is: <code>Bearer YOUR_KEY</code> (not just YOUR_KEY)</li>
      </ul>
      
      <h3>Error: "403 Forbidden" when downloading file</h3>
      <p><strong>Cause:</strong> SAS URL expired (valid for 2 hours).</p>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Download the file immediately when you receive the request</li>
        <li>Don't queue requests for later processing - handle them right away</li>
        <li>If URL expired, return an error and Zapper will retry with a fresh URL</li>
      </ul>
      
      <h3>Processing times out after 2 minutes</h3>
      <p><strong>Cause:</strong> Your API took longer than 2 minutes to respond.</p>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Optimize your AI processing for faster execution</li>
        <li>For large files, implement caching or pre-processing</li>
        <li>Return partial results quickly, then enhance them asynchronously</li>
      </ul>
      
      <h3>Results not appearing in File Management</h3>
      <p><strong>Cause:</strong> Your API returned an error response or non-JSON data.</p>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Check Zapper's Activity Logs for error details</li>
        <li>Ensure your API returns status 200 OK for successful processing</li>
        <li>Verify response is valid JSON (not plain text or HTML)</li>
        <li>Check your API logs for exceptions or errors</li>
      </ul>
      
      <h2>Example Use Cases</h2>
      
      <h3>Secret Scanner</h3>
      <p>Scan text files for leaked credentials, API keys, and sensitive data. Results include line numbers, severity levels, and remediation suggestions.</p>
      
      <h3>Document Summarizer</h3>
      <p>Generate concise summaries of long documents, reports, and articles. Returns key points, word count, and sentiment analysis.</p>
      
      <h3>Image Classifier</h3>
      <p>Analyze images to identify objects, scenes, and content. Returns labels with confidence scores and safety ratings.</p>
      
      <h3>Data Validator</h3>
      <p>Validate CSV/Excel files for data quality issues, missing values, and format errors. Returns validation report with issue counts.</p>
      
      <h2>Processing Limits</h2>
      <ul>
        <li><strong>Maximum API response time:</strong> 2 minutes (120 seconds)</li>
        <li><strong>SAS URL validity:</strong> 2 hours (120 minutes)</li>
        <li><strong>Result size:</strong> Limited by HTTP response size (typically ~100MB)</li>
        <li><strong>Concurrent requests:</strong> Depends on your API's capacity</li>
      </ul>
      
      <p><strong>Tip:</strong> For large result files (images, videos, large datasets), consider returning a summary in the HTTP response and storing full results elsewhere.</p>
      
      <h2>Activity Logging</h2>
      <p>All AI processing events are logged in the Activity Logs with details:</p>
      <ul>
        <li>User who triggered processing</li>
        <li>AI agent used</li>
        <li>Source file name and path</li>
        <li>Processing status (success/failure)</li>
        <li>Processing duration</li>
        <li>Organization ID</li>
      </ul>
      
      <h2>Required Permissions</h2>
      <ul>
        <li><strong>VIEW_AI_AGENTS</strong> - View the agent list</li>
        <li><strong>ADD_AI_AGENT</strong> - Create new agents (admin/ops only)</li>
        <li><strong>EDIT_AI_AGENT</strong> - Modify agent settings (admin/ops only)</li>
        <li><strong>DELETE_AI_AGENT</strong> - Remove agents (admin/ops only)</li>
        <li><strong>USE_AI_AGENT</strong> - Trigger processing on files (all authorized users)</li>
      </ul>
      
      <h2>Developer Integration Guide</h2>
      <p>For developers building custom AI processors, refer to the complete <strong>AI Agent Integration Standard</strong> documentation which includes:</p>
      <ul>
        <li>Complete API specification with request/response schemas</li>
        <li>Security requirements and best practices</li>
        <li>Error handling and retry logic</li>
        <li>Complete code examples in Node.js, Python, and other languages</li>
        <li>Testing checklist and integration steps</li>
      </ul>
      <p>Contact your Zapper administrator for access to the full integration documentation.</p>
    `,
    allowedRoles: ["admin", "ops"]
  },
  {
    id: "10",
    title: "SFTP Local Users",
    slug: "sftp-local-users",
    html: `
      <h1>SFTP Local Users</h1>
      <p>SFTP Local Users allows you to create secure SFTP access credentials for Azure Data Lake Storage Gen2 (ADLS) accounts. Partners and external systems can connect via SFTP protocol to transfer files securely.</p>
      
      <h2>Prerequisites</h2>
      <ul>
        <li>Your organization must have an <strong>ADLS Gen2</strong> storage account configured</li>
        <li>SFTP must be enabled on the storage account (Azure charges apply)</li>
        <li>Only one ADLS storage account per organization supports SFTP</li>
      </ul>
      
      <h2>View SFTP Users</h2>
      <p>Click <strong>SFTP Users</strong> in the sidebar to view all SFTP local users. The table displays:</p>
      <ul>
        <li><strong>Username</strong> - The SFTP login username</li>
        <li><strong>Organization</strong> - Which organization the user belongs to</li>
        <li><strong>Connection String</strong> - Full SFTP connection endpoint</li>
        <li><strong>Auth Methods</strong> - SSH key and/or password authentication</li>
        <li><strong>Permissions</strong> - Container access levels (Read, Write, List, Delete)</li>
        <li><strong>Mapped User</strong> - The Zapper user associated with this SFTP account</li>
        <li><strong>Status</strong> - Active or Disabled</li>
      </ul>
      
      <h2>Create an SFTP User</h2>
      <ol>
        <li>Click <strong>Create SFTP User</strong></li>
        <li>Select the <strong>Organization</strong> (must have ADLS storage)</li>
        <li>Enter a <strong>Username</strong> (letters, numbers, underscores only)</li>
        <li>Optionally add a <strong>Display Name</strong></li>
        <li>Choose authentication method:
          <ul>
            <li><strong>SSH Key</strong> - RSA 4096-bit key (recommended)</li>
            <li><strong>Password</strong> - Azure-generated secure password</li>
          </ul>
        </li>
        <li>Select <strong>Mapped User</strong> - Each SFTP user must map to exactly one Zapper user</li>
        <li>Set <strong>Container Permissions</strong>:
          <ul>
            <li><strong>Read (R)</strong> - Download files</li>
            <li><strong>Write (W)</strong> - Upload files</li>
            <li><strong>List (L)</strong> - List directory contents</li>
            <li><strong>Delete (D)</strong> - Delete files</li>
          </ul>
        </li>
        <li>Click <strong>Create</strong></li>
      </ol>
      <p>After creation, download the SSH private key or password immediately - credentials are only shown once!</p>
      
      <h2>Connection Details</h2>
      <p>SFTP connection string format:</p>
      <pre><code>&lt;storageAccount&gt;.&lt;container&gt;.&lt;username&gt;@&lt;storageAccount&gt;.blob.core.windows.net</code></pre>
      <p>Example: <code>acmestorage.documents.partner1@acmestorage.blob.core.windows.net</code></p>
      
      <h2>Rotate Credentials</h2>
      <p>For security, regularly rotate SFTP credentials:</p>
      <ul>
        <li>Click the <strong>Refresh</strong> icon to rotate SSH key</li>
        <li>Click the <strong>Lock</strong> icon to rotate password</li>
        <li>New credentials have a <strong>120-second download window</strong></li>
      </ul>
      
      <h2>Enable/Disable Users</h2>
      <p>Toggle the status switch to temporarily disable an SFTP user. This removes their authentication credentials in Azure without deleting the user record. Re-enable to restore access.</p>
      
      <h2>Delete SFTP Users</h2>
      <p>Click the trash icon to permanently delete an SFTP user. This removes the user from Azure and cannot be undone.</p>
      
      <h2>Self-Service Access</h2>
      <p>Users can view their own SFTP access via <strong>My SFTP Access</strong> in the sidebar. They can:</p>
      <ul>
        <li>View their SFTP connection details</li>
        <li>Rotate their own SSH key (if permitted)</li>
        <li>Rotate their own password (if permitted)</li>
      </ul>
      
      <h2>Required Permissions</h2>
      <ul>
        <li><strong>SFTP_MGMT.VIEW</strong> - View all SFTP users</li>
        <li><strong>SFTP_MGMT.CREATE</strong> - Create new SFTP users</li>
        <li><strong>SFTP_MGMT.UPDATE</strong> - Modify SFTP user settings</li>
        <li><strong>SFTP_MGMT.DISABLE</strong> - Enable/disable SFTP users</li>
        <li><strong>SFTP_MGMT.DELETE</strong> - Delete SFTP users</li>
        <li><strong>SFTP_MGMT.MAP_USER</strong> - Assign mapped users</li>
        <li><strong>SFTP_MGMT.VIEW_SELF_ACCESS</strong> - View own SFTP access</li>
        <li><strong>SFTP_MGMT.ROTATE_SSH_SELF</strong> - Rotate own SSH key</li>
        <li><strong>SFTP_MGMT.ROTATE_PASSWORD_SELF</strong> - Rotate own password</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support", "user"]
  },
  {
    id: "11",
    title: "PGP Key Management",
    slug: "pgp-key-management",
    html: `
      <h1>PGP Key Management</h1>
      <p>PGP (Pretty Good Privacy) encryption protects sensitive files by encrypting them before storage and decrypting them on download. Zapper supports comprehensive PGP key lifecycle management.</p>
      
      <h2>Key Types</h2>
      <ul>
        <li><strong>OWN Keys</strong> - Your organization's keys with both public and private key storage. Used for decrypting files sent to you.</li>
        <li><strong>PARTNER Keys</strong> - Partner public keys only. Used for encrypting files before sending to partners.</li>
      </ul>
      
      <h2>View PGP Keys</h2>
      <p>Click <strong>PGP Keys</strong> in the sidebar to see all keys for your organization. The table shows:</p>
      <ul>
        <li><strong>Key Name</strong> - Friendly identifier</li>
        <li><strong>Type</strong> - OWN or PARTNER</li>
        <li><strong>Fingerprint</strong> - Unique key identifier</li>
        <li><strong>Email</strong> - Associated email address</li>
        <li><strong>Expires</strong> - Key expiration date (if set)</li>
        <li><strong>Status</strong> - Active or Expired</li>
      </ul>
      
      <h2>Generate a New Key</h2>
      <ol>
        <li>Click <strong>Generate Key</strong></li>
        <li>Enter a <strong>Name</strong> for the key</li>
        <li>Enter the <strong>Email</strong> associated with the key</li>
        <li>Set <strong>Expiration</strong> (optional but recommended)</li>
        <li>Enter a strong <strong>Passphrase</strong></li>
        <li>Click <strong>Generate</strong></li>
      </ol>
      <p>The private key can be stored in PostgreSQL or Azure Key Vault depending on configuration.</p>
      
      <h2>Import a Key</h2>
      <ol>
        <li>Click <strong>Import Key</strong></li>
        <li>Select key type: <strong>OWN</strong> (with private key) or <strong>PARTNER</strong> (public only)</li>
        <li>Paste the <strong>Public Key</strong> (ASCII armored format)</li>
        <li>For OWN keys, paste the <strong>Private Key</strong></li>
        <li>Click <strong>Import</strong></li>
      </ol>
      
      <h2>Encrypt Files</h2>
      <p>To encrypt a file before uploading or after storage:</p>
      <ol>
        <li>Navigate to the file in File Management</li>
        <li>Click the <strong>Encrypt</strong> action</li>
        <li>Select the recipient's <strong>PGP Key</strong></li>
        <li>Click <strong>Encrypt</strong></li>
      </ol>
      <p>The encrypted file will be saved with a <code>.pgp</code> extension.</p>
      
      <h2>Decrypt Files</h2>
      <p>To decrypt a PGP-encrypted file:</p>
      <ol>
        <li>Navigate to the encrypted file (ending in <code>.pgp</code>)</li>
        <li>Click the <strong>Decrypt</strong> action</li>
        <li>Enter your <strong>Passphrase</strong> (if required)</li>
        <li>Click <strong>Decrypt</strong></li>
      </ol>
      <p>Decrypted files are saved to the configured decrypt results directory.</p>
      
      <h2>Delete Keys</h2>
      <p>Click the trash icon to delete a key. Warning: Files encrypted with deleted keys cannot be decrypted!</p>
      
      <h2>Required Permissions</h2>
      <ul>
        <li><strong>PGP_KEY_MANAGEMENT.VIEW</strong> - View PGP keys</li>
        <li><strong>PGP_KEY_MANAGEMENT.GENERATE</strong> - Generate new keys</li>
        <li><strong>PGP_KEY_MANAGEMENT.IMPORT</strong> - Import existing keys</li>
        <li><strong>PGP_KEY_MANAGEMENT.DELETE</strong> - Delete keys</li>
        <li><strong>FILE_MANAGEMENT.ENCRYPT</strong> - Encrypt files</li>
        <li><strong>FILE_MANAGEMENT.DECRYPT</strong> - Decrypt files</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support", "user"]
  },
  {
    id: "12",
    title: "Content Understanding",
    slug: "content-understanding",
    html: `
      <h1>Content Understanding</h1>
      <p>Content Understanding (CU) uses Azure AI to analyze files and extract insights. It supports multiple content modalities including documents, images, audio, and video, using specialized analyzers tailored to each media type.</p>
      
      <h2>Supported Content Modalities</h2>
      <p>Zapper automatically detects the type of file you want to analyze and presents the appropriate analyzer options:</p>
      <ul>
        <li><strong>Document</strong> - PDF, Word, Excel, PowerPoint, HTML, CSV, RTF, and text files. Uses document-specific analyzers for text extraction, structure analysis, and entity recognition</li>
        <li><strong>Image</strong> - JPG, PNG, TIFF, BMP, GIF, and WebP files. Uses image analyzers for visual content description, object detection, and text extraction (OCR)</li>
        <li><strong>Audio</strong> - MP3, WAV, M4A, AAC, OGG, FLAC, WMA, and Opus files. Uses audio analyzers for transcription and speech analysis</li>
        <li><strong>Video</strong> - MP4, AVI, MOV, MKV, WMV, WebM, and FLV files. Uses video analyzers for visual and audio content analysis</li>
      </ul>
      
      <h2>Modality-Based Analyzer Selection</h2>
      <p>When you initiate content analysis, the system automatically determines the file's modality based on its extension and presents only the relevant analyzers:</p>
      <ul>
        <li><strong>Document files</strong> display document-specific analysis options such as layout extraction, key-value pair detection, and document classification</li>
        <li><strong>Image files</strong> display image-specific analysis options such as visual description, object identification, and embedded text extraction</li>
        <li><strong>Audio files</strong> display audio-specific analysis options such as speech transcription and speaker identification</li>
        <li><strong>Video files</strong> display video-specific analysis options combining visual and audio analysis capabilities</li>
      </ul>
      <p>This modality-based approach ensures you always see the most relevant analysis options for your file type, reducing confusion and improving results.</p>
      
      <h2>Synchronous vs. Asynchronous Analysis</h2>
      <p>Content Understanding uses two different processing modes depending on the file type:</p>
      <h3>Synchronous Analysis (Images)</h3>
      <p>Image files are analyzed immediately. When you click <strong>Analyze</strong>, the results appear within seconds. You can then choose to manually save the results using the <strong>Save</strong> button.</p>
      <h3>Asynchronous Analysis (Documents, Audio, Video)</h3>
      <p>Documents, audio files, and video files use asynchronous (background) processing because they typically require more time to analyze. When you click <strong>Analyze</strong>:</p>
      <ol>
        <li>The analysis job is submitted to Azure AI and a progress indicator appears showing elapsed time</li>
        <li>The system polls for completion in the background every few seconds</li>
        <li>A background worker simultaneously monitors all active jobs on the server side</li>
        <li>When analysis completes, results are <strong>automatically saved</strong> to blob storage</li>
        <li>The results are displayed on screen and the saved results count updates immediately</li>
      </ol>
      <p>You can navigate away from the page while analysis is in progress. The background worker will continue monitoring and will auto-save results when the job completes.</p>
      
      <h2>Auto-Save for Async Analysis</h2>
      <p>For documents, audio, and video files, analysis results are automatically saved once processing completes. This means:</p>
      <ul>
        <li>You do not need to manually click <strong>Save</strong> after async analysis finishes</li>
        <li>The saved results count (e.g., "3 saved") updates immediately upon completion</li>
        <li>In the saved results dropdown, auto-saved entries are labeled as <strong>"Auto-saved"</strong> with the date and time, making them easy to distinguish from manually saved results</li>
        <li>If you navigate away during analysis, results are still saved automatically in the background</li>
      </ul>
      <p>For image files (which use synchronous analysis), results are not auto-saved. You can use the <strong>Save</strong> button to save image analysis results manually.</p>
      
      <h2>Run Content Analysis</h2>
      <ol>
        <li>Navigate to the <strong>Content Discovery</strong> page from the sidebar</li>
        <li>Select the content type (Document, Image, etc.), analyzer category, specific analyzer, and Foundry resource from the toolbar</li>
        <li>Use the <strong>Files / Folders</strong> selector to browse and select a file from your organization's storage</li>
        <li>Click <strong>Analyze</strong> to begin processing</li>
        <li>For images, results appear immediately. For documents, audio, and video, a progress indicator shows while the background job runs</li>
      </ol>
      
      <h2>View Analysis Results</h2>
      <p>Analysis results are displayed in a human-readable format directly in the interface. Results are organized into two tabs:</p>
      <ul>
        <li><strong>Fields tab</strong> - Shows extracted fields with their values, types, and confidence scores in a structured layout. Arrays and nested objects are rendered in organized format</li>
        <li><strong>Result tab</strong> - Shows the raw JSON output from Azure AI for advanced inspection</li>
      </ul>
      <p>The status indicator next to "Analysis Results" shows the current state: <strong>Pending</strong>, <strong>Processing</strong> (with elapsed time), or <strong>Complete</strong>.</p>
      
      <h2>Saved Results Management</h2>
      <p>Each file can have multiple saved analysis results (up to the configured maximum). The saved results dropdown provides:</p>
      <ul>
        <li><strong>Result count</strong> - Shows the total number of saved results (e.g., "3 saved")</li>
        <li><strong>Meaningful labels</strong> - Each saved result displays the save type and date/time (e.g., "Auto-saved - Feb 18, 2026" with the time shown below), making it easy to identify when each analysis was performed</li>
        <li><strong>Load previous results</strong> - Click on any saved result to load and view it</li>
        <li><strong>Delete results</strong> - Remove individual saved results using the delete icon (requires delete permission)</li>
      </ul>
      <p>When a source file is deleted, all associated CU results are automatically removed (cascade delete).</p>
      
      <h2>Result File Naming</h2>
      <p>CU results follow a human-readable naming convention:</p>
      <pre><code>&lt;original_filename&gt;_cu_result_&lt;timestamp&gt;_&lt;sequence&gt;.json</code></pre>
      <p>Example: <code>report.pdf_cu_result_20260218_095830_001.json</code></p>
      <p>Results are stored in a dedicated <code>cu_folder</code> directory structure within the same container as the source file. The association between source files and their results is maintained via metadata on the source blob for resilience and self-healing.</p>
      
      <h2>Three-Tier Result Retrieval</h2>
      <p>To ensure analysis results are always available, the system uses a three-tier retrieval approach when an async job completes:</p>
      <ol>
        <li><strong>Azure Operation Re-fetch</strong> - Retrieves the result directly from the Azure AI operation endpoint (fastest, works within minutes of completion)</li>
        <li><strong>Saved Blob Fallback</strong> - If the Azure result has expired, loads the auto-saved result from blob storage</li>
        <li><strong>Graceful Confirmation</strong> - If neither source is available in the current session, displays a confirmation that results have been auto-saved with a link to view them from the saved results list</li>
      </ol>
      
      <h2>Background Job Tracking</h2>
      <p>All async analysis jobs are tracked in the database with the following states:</p>
      <ul>
        <li><strong>Submitted</strong> - Job has been sent to Azure AI</li>
        <li><strong>Running</strong> - Analysis is in progress</li>
        <li><strong>Succeeded</strong> - Analysis completed and results have been auto-saved</li>
        <li><strong>Failed</strong> - Analysis encountered an error</li>
        <li><strong>Cancelled</strong> - Job was cancelled</li>
      </ul>
      <p>The background polling worker (CuPollingService) runs on the server and monitors all active jobs across all users and organizations. When a job succeeds, the worker automatically saves the results to blob storage and updates the job status in the database.</p>
      
      <h2>One-Click Model Deployment</h2>
      <p>Content Understanding requires three Azure AI models to be deployed in your Foundry resource. Zapper provides a one-click deployment feature that handles this automatically:</p>
      <ol>
        <li>Navigate to <strong>Foundry Resources</strong> in the sidebar</li>
        <li>Select your organization's Foundry resource</li>
        <li>Scroll to the <strong>Content Understanding Configuration</strong> section</li>
        <li>Click <strong>Deploy Required Models</strong></li>
      </ol>
      <p>This single button deploys all three required models:</p>
      <ul>
        <li><strong>GPT-4.1</strong> - Primary language model for analysis</li>
        <li><strong>GPT-4.1 Mini</strong> - Lightweight model for faster processing</li>
        <li><strong>Text Embedding 3 Large</strong> - Embedding model for document indexing</li>
      </ul>
      <p>The system also configures the Content Understanding resource defaults automatically, eliminating the need for manual Azure Portal configuration.</p>
      
      <h2>Deployment Status</h2>
      <p>After clicking Deploy, the status indicators show:</p>
      <ul>
        <li><strong>Green checkmark</strong> - Model deployed successfully</li>
        <li><strong>Red X</strong> - Deployment failed (hover for details)</li>
        <li><strong>Spinner</strong> - Deployment in progress</li>
      </ul>
      <p>If any model fails, the error message will indicate what went wrong. Common issues include quota limits or region availability.</p>
      
      <h2>Configuration</h2>
      <p>Administrators can configure:</p>
      <ul>
        <li><strong>ZAPPER_CU_RESULTS_DIR</strong> - Directory name for storing analysis results (default: <code>cu_folder</code>)</li>
        <li><strong>ZAPPER_CU_MAX_RESULTS_PER_FILE</strong> - Maximum number of saved results per source file</li>
        <li><strong>ZAPPER_CU_MAX_PAYLOAD_SIZE</strong> - Maximum result payload size</li>
        <li><strong>ZAPPER_CU_POLL_INTERVAL_MS</strong> - Background polling interval in milliseconds (default: 5000)</li>
        <li><strong>ZAPPER_CU_MAX_POLLS</strong> - Maximum number of polling attempts before timing out (default: 2880)</li>
      </ul>
      
      <h2>Required Permissions</h2>
      <p>Content Understanding uses five granular permissions to control access:</p>
      <ul>
        <li><strong>CONTENT_UNDERSTANDING.VIEW</strong> - View saved analysis results and access the Content Discovery page</li>
        <li><strong>CONTENT_UNDERSTANDING.RUN_ANALYSIS</strong> - Run content analysis on files</li>
        <li><strong>CONTENT_UNDERSTANDING.SAVE_RESULT</strong> - Manually save analysis results (auto-save for async jobs is handled by the system regardless of this permission)</li>
        <li><strong>CONTENT_UNDERSTANDING.DELETE_RESULT</strong> - Delete saved analysis results</li>
        <li><strong>CONTENT_UNDERSTANDING.MENU_VISIBILITY</strong> - Controls whether Content Discovery appears in the sidebar navigation</li>
      </ul>
      <p>These permissions are automatically created for existing roles during system startup. Super Admin roles receive all permissions by default.</p>

      <h2>Post-Call Intelligence Analysis</h2>
      <p>Post-Call Intelligence Analysis is a second-layer AI feature built on top of audio and video content analysis. After a call transcript has been extracted by the Content Understanding engine, a Foundry AI agent performs a deep structured review of the conversation — scoring quality, detecting risk patterns, mapping call events, and generating recommendations.</p>
      <p>This feature is designed for call centre quality assurance, compliance monitoring, and agent performance review workflows.</p>

      <h3>Prerequisites</h3>
      <ul>
        <li>An audio or video file must be selected in Content Discovery</li>
        <li>The file must have been analysed using an audio or video analyzer (e.g. <code>prebuilt-audio</code>), producing a transcript with speaker turns</li>
        <li>A Foundry AI agent must be configured for your organisation and assigned to the post-call analysis function</li>
      </ul>

      <h3>How to Run</h3>
      <ol>
        <li>Select an audio or video file from the file selector in Content Discovery</li>
        <li>Run content analysis using an audio-capable analyzer to generate the transcript</li>
        <li>Switch to the <strong>Post-Call</strong> tab in the Analysis Results panel</li>
        <li>Click <strong>Run Post-Call Analysis</strong> — the AI agent will process the full transcript (this typically takes 30–120 seconds)</li>
        <li>Results appear automatically once the agent responds</li>
      </ol>
      <p>If a post-call analysis has been run previously for this file, it is <strong>automatically loaded</strong> when you select the file — no need to re-run unless you want fresh results.</p>

      <h3>Understanding the Report</h3>
      <p>The Post-Call Analysis report is divided into several sections:</p>

      <h4>Score Cards</h4>
      <ul>
        <li><strong>QA Score</strong> — overall quality score out of 100, with a short summary of critical issues or commendations</li>
        <li><strong>Compliance Audit</strong> — compliance score out of 100, flagging any regulatory or policy violations detected in the call</li>
        <li><strong>Customer Sentiment</strong> — the customer's emotional tone throughout the call (e.g. Neutral, Frustrated, Satisfied)</li>
      </ul>

      <h4>Status Indicators</h4>
      <ul>
        <li><strong>Call Resolution</strong> — whether the customer's issue was resolved, escalated, or left pending</li>
        <li><strong>Escalation Urgency</strong> — low, medium, or high urgency for follow-up</li>
        <li><strong>Agent Conduct</strong> — overall assessment of the agent's professionalism, communication, and adherence to guidelines</li>
      </ul>

      <h4>Overall Assessment</h4>
      <p>A narrative verdict and recommendation summary. Colour-coded by outcome: green for passing calls, amber for calls needing improvement, and red for critical failures. Topic tags below the summary indicate the key subjects discussed.</p>

      <h4>QA Scorecard Breakdown</h4>
      <p>A detailed table evaluating the call across multiple quality dimensions (e.g. Tax Advice Clarity, Transfer Explanation, Compliance Disclosures). Each row shows:</p>
      <ul>
        <li><strong>Category</strong> — the quality dimension being evaluated</li>
        <li><strong>Evidence</strong> — a quoted or paraphrased excerpt from the transcript supporting the score</li>
        <li><strong>Result badge</strong> — one of:
          <ul>
            <li><strong>PASS</strong> (green) — meets quality standards</li>
            <li><strong>NEEDS IMPROVEMENT</strong> (amber outline) — below standard but not critical</li>
            <li><strong>FAIL</strong> (red outline) — did not meet the standard</li>
            <li><strong>CRITICAL</strong> (solid red) — serious failure requiring immediate attention</li>
            <li><strong>MANIPULATION</strong> (solid purple) — potential coercive or misleading behaviour detected</li>
          </ul>
        </li>
      </ul>

      <h4>Call Event Timeline</h4>
      <p>A chronological list of significant moments in the call, each tagged with a colour-coded label such as:</p>
      <ul>
        <li><strong>TOPIC QUERY</strong> — customer asks about a specific subject</li>
        <li><strong>SPECULATIVE ADVICE</strong> — agent provides guidance that is not definitive</li>
        <li><strong>RESOLUTION ATTEMPT</strong> — agent attempts to close or resolve the issue</li>
        <li><strong>COMPLIANCE FLAG</strong> — a potential compliance event is detected</li>
        <li><strong>ESCALATION</strong> — the call is escalated to a supervisor or specialist</li>
      </ul>
      <p>Each timeline entry includes a timestamp and a brief description of what occurred.</p>

      <h4>Risk Flags &amp; Recommendations</h4>
      <ul>
        <li><strong>Risk Flags</strong> — specific concerns identified during the call that may require follow-up or review</li>
        <li><strong>Recommendations</strong> — actionable suggestions for the agent or team to improve quality or compliance</li>
      </ul>

      <h4>Agent Strengths &amp; Weaknesses</h4>
      <p>A balanced summary of what the agent did well and where there is room to improve, drawn directly from the call content.</p>

      <h3>Auto-Save and Cached Results</h3>
      <p>Every time a post-call analysis completes successfully, the result is <strong>automatically saved</strong> to blob storage at a fixed path tied to the source file. This means:</p>
      <ul>
        <li>The next time you select the same audio file, the saved post-call report loads automatically — you see it immediately without needing to re-run the AI agent</li>
        <li>The header bar in the Post-Call tab shows <strong>"Cached Result — saved [date &amp; time]"</strong> when a previously saved result is displayed</li>
        <li>If the result was just generated in the current session, the header shows <strong>"AI Analysis Complete"</strong></li>
        <li>Each file stores one post-call analysis — re-running overwrites the previous result</li>
      </ul>

      <h3>Re-running Analysis</h3>
      <p>To refresh the analysis (for example after the call transcript has been re-processed, or to get an updated evaluation), click the <strong>Re-run</strong> button in the Post-Call tab header. This clears the current result and lets you trigger a fresh AI agent run. The new result will overwrite the previously saved copy in storage.</p>

      <h3>Resizable Layout</h3>
      <p>The Content Discovery view is split into two panels: the file preview on the left and the analysis results on the right. For audio files, the preview panel only shows a compact audio player, so you may want to give more space to the analysis results. Drag the <strong>divider handle</strong> between the two panels left or right to adjust the split. The layout can be resized anywhere from 15% to 70% for the left panel.</p>

      <h3>Fraud &amp; Manipulation Alerts</h3>
      <p>If the AI agent detects language patterns consistent with potential fraud, manipulation, or coercive selling, a prominent red <strong>Fraud Alert</strong> banner appears at the top of the report. The banner lists specific behaviours detected with their timestamps. These cases should be reviewed promptly by a compliance officer.</p>
    `,
    allowedRoles: ["admin", "ops", "support", "user"]
  },
  {
    id: "13",
    title: "Document Translation",
    slug: "document-translation",
    html: `
      <h1>Document Translation</h1>
      <p>Document Translation uses Azure AI Translator to convert documents between 135+ languages while preserving formatting and structure.</p>
      
      <h2>Supported Languages</h2>
      <p>Azure AI supports translation between 135+ languages including:</p>
      <ul>
        <li>Major languages: English, Spanish, French, German, Chinese, Japanese, Korean, Arabic</li>
        <li>Regional variants: Brazilian Portuguese, Simplified/Traditional Chinese</li>
        <li>Less common languages: Welsh, Icelandic, Swahili, and many more</li>
      </ul>
      
      <h2>Translate a Document</h2>
      <ol>
        <li>Navigate to the file in File Management</li>
        <li>Click the <strong>Translate</strong> action</li>
        <li>Select the <strong>Target Language</strong> using the searchable dropdown</li>
        <li>Click <strong>Translate</strong></li>
      </ol>
      <p>Translation runs asynchronously. The translated file will appear in the same directory.</p>
      
      <h2>Language Selector</h2>
      <p>The language selector supports:</p>
      <ul>
        <li><strong>Search</strong> - Type to filter by language name or code</li>
        <li><strong>Translated Badge</strong> - Shows languages already translated</li>
        <li><strong>Grouping</strong> - Already-translated languages appear separately</li>
      </ul>
      
      <h2>View Translations</h2>
      <p>Translated documents are saved with the language code suffix:</p>
      <pre><code>&lt;filename&gt;_&lt;language_code&gt;.&lt;extension&gt;</code></pre>
      <p>Example: <code>report_es.pdf</code> (Spanish translation of report.pdf)</p>
      
      <h2>Delete Translations</h2>
      <p>Translations can be deleted individually without affecting the source document.</p>
      
      <h2>Supported File Formats</h2>
      <ul>
        <li>PDF documents</li>
        <li>Microsoft Word (DOCX)</li>
        <li>Microsoft Excel (XLSX)</li>
        <li>Microsoft PowerPoint (PPTX)</li>
        <li>Plain text (TXT)</li>
        <li>HTML files</li>
      </ul>
      
      <h2>Required Permissions</h2>
      <ul>
        <li><strong>DOCUMENT_TRANSLATION.VIEW</strong> - View translation results</li>
        <li><strong>DOCUMENT_TRANSLATION.RUN_TRANSLATION</strong> - Translate documents</li>
        <li><strong>DOCUMENT_TRANSLATION.DELETE_TRANSLATION</strong> - Delete translations</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support", "user"]
  },
  {
    id: "14",
    title: "SIEM & Sentinel Integration",
    slug: "siem-sentinel-integration",
    html: `
      <h1>SIEM & Sentinel Integration</h1>
      <p>Microsoft Sentinel integration provides enterprise-grade security monitoring for Zapper. Security events are streamed to Sentinel for analysis, alerting, and incident response.</p>
      
      <h2>What is Microsoft Sentinel?</h2>
      <p>Microsoft Sentinel is a cloud-native SIEM (Security Information and Event Management) and SOAR (Security Orchestration, Automation, and Response) solution. It collects security data, detects threats, and enables automated responses.</p>
      
      <h2>Zapper Security Events</h2>
      <p>Zapper streams the following security events to Sentinel:</p>
      <ul>
        <li>User authentication events (login, logout, failures)</li>
        <li>File operations (uploads, downloads, deletions)</li>
        <li>Permission changes</li>
        <li>Storage account modifications</li>
        <li>Suspicious activity patterns</li>
      </ul>
      
      <h2>View Detection Rules</h2>
      <p>Click <strong>Sentinel Rules</strong> in the sidebar to see available detection rules. The catalog shows:</p>
      <ul>
        <li><strong>Rule Name</strong> - Detection rule title</li>
        <li><strong>Description</strong> - What the rule detects</li>
        <li><strong>Severity</strong> - Low, Medium, High, or Critical</li>
        <li><strong>Status</strong> - Installed, Enabled, or Available</li>
      </ul>
      
      <h2>Install Detection Rules</h2>
      <ol>
        <li>Browse the <strong>Rules Catalog</strong></li>
        <li>Click <strong>Install</strong> on desired rules</li>
        <li>Rules are deployed to your Sentinel workspace</li>
        <li>Newly installed rules are enabled by default</li>
      </ol>
      
      <h2>Enable/Disable Rules</h2>
      <p>Toggle rules on/off without uninstalling:</p>
      <ul>
        <li><strong>Enable</strong> - Rule actively monitors for threats</li>
        <li><strong>Disable</strong> - Rule is paused but configuration retained</li>
      </ul>
      
      <h2>Delete Rules</h2>
      <p>Click <strong>Delete</strong> to remove a rule from Sentinel entirely. You can reinstall from the catalog later.</p>
      
      <h2>View Incidents</h2>
      <p>When detection rules trigger, incidents are created in Sentinel. View incidents to:</p>
      <ul>
        <li>See alert details and affected resources</li>
        <li>Investigate the security event</li>
        <li>Take response actions</li>
      </ul>
      
      <h2>Predefined Zapper Rules</h2>
      <p>Zapper includes pre-built detection rules for common security scenarios:</p>
      <ul>
        <li>Brute force login attempts</li>
        <li>Unusual file access patterns</li>
        <li>Mass file deletions</li>
        <li>Privilege escalation attempts</li>
        <li>Off-hours activity</li>
      </ul>
      
      <h2>Required Permissions</h2>
      <ul>
        <li><strong>SIEM_MANAGEMENT.VIEW</strong> - View Sentinel rules and incidents</li>
        <li><strong>SIEM_MANAGEMENT.INSTALL</strong> - Install detection rules</li>
        <li><strong>SIEM_MANAGEMENT.ENABLE</strong> - Enable/disable rules</li>
        <li><strong>SIEM_MANAGEMENT.DELETE</strong> - Remove rules</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support"]
  },
  {
    id: "15",
    title: "Foundry AI & Chat Playground",
    slug: "foundry-ai-chat-playground",
    html: `
      <h1>Foundry AI & Chat Playground</h1>
      <p>Azure AI Foundry integration enables powerful conversational AI capabilities. Create AI agents, upload documents for context, and interact with intelligent assistants trained on your content.</p>
      
      <h2>Key Concepts</h2>
      <ul>
        <li><strong>Foundry Resource</strong> - Azure AI Foundry workspace for your organization</li>
        <li><strong>Hub</strong> - Container for AI projects and resources</li>
        <li><strong>Project</strong> - Workspace for models, agents, and data</li>
        <li><strong>Vector Store</strong> - Indexed storage for document embeddings</li>
        <li><strong>Agent</strong> - AI assistant configured with specific capabilities</li>
      </ul>
      
      <h2>View Foundry Resources</h2>
      <p>Click <strong>Foundry Resources</strong> in the sidebar to see your organization's AI resources. Resources show provisioning status:</p>
      <ul>
        <li><strong>Pending</strong> - Awaiting Azure provisioning</li>
        <li><strong>Provisioning</strong> - Azure is creating resources</li>
        <li><strong>Active</strong> - Ready to use</li>
        <li><strong>Failed</strong> - Provisioning error occurred</li>
      </ul>
      
      <h2>Create Foundry Resource</h2>
      <ol>
        <li>Click <strong>Create Resource</strong></li>
        <li>Select <strong>Organization</strong></li>
        <li>Choose <strong>Resource Group</strong> and <strong>Location</strong></li>
        <li>Enter <strong>Hub Name</strong> and <strong>Project Name</strong></li>
        <li>Click <strong>Create</strong></li>
      </ol>
      <p>Azure provisions the resources asynchronously. This may take several minutes.</p>
      
      <h2>Configure Resource Set</h2>
      <p>Resource Sets define default AI configurations for your organization:</p>
      <ul>
        <li>Default Hub and Project</li>
        <li>Default Agent for chat</li>
        <li>Default Vector Store for document search</li>
      </ul>
      <p>Users can toggle between manual configuration and organization defaults in the Chat Playground.</p>
      
      <h2>Create AI Agents</h2>
      <ol>
        <li>Navigate to a Foundry Project</li>
        <li>Click <strong>Create Agent</strong></li>
        <li>Configure the agent:
          <ul>
            <li><strong>Name</strong> - Agent identifier</li>
            <li><strong>Model</strong> - GPT-4, GPT-3.5, etc.</li>
            <li><strong>Instructions</strong> - System prompt defining behavior</li>
            <li><strong>Tools</strong> - File search, code interpreter, etc.</li>
          </ul>
        </li>
        <li>Click <strong>Create</strong></li>
      </ol>
      
      <h2>Vector Stores</h2>
      <p>Vector Stores enable AI agents to search your documents:</p>
      <ol>
        <li>Create a Vector Store in your project</li>
        <li>Import files from Zapper storage</li>
        <li>Files are automatically indexed for semantic search</li>
        <li>Agents can reference document content in responses</li>
      </ol>
      
      <h2>Chat Playground</h2>
      <p>The Chat Playground provides an interactive interface to converse with AI agents:</p>
      <ol>
        <li>Select an <strong>Agent</strong> or use organization defaults</li>
        <li>Start a <strong>New Thread</strong> or continue existing conversation</li>
        <li>Type your message and press <strong>Send</strong></li>
        <li>View agent responses with optional <strong>Citations</strong> from your documents</li>
      </ol>
      
      <h2>Citations</h2>
      <p>When agents reference your documents, citations show:</p>
      <ul>
        <li>Source file name</li>
        <li>Relevant text excerpt</li>
        <li>Confidence score</li>
      </ul>
      
      <h2>Import Files to Foundry</h2>
      <p>Import files from Zapper storage to Foundry for AI processing:</p>
      <ol>
        <li>Navigate to the file in File Management</li>
        <li>Click <strong>Import to Foundry</strong></li>
        <li>Select the target <strong>Vector Store</strong></li>
        <li>Click <strong>Import</strong></li>
      </ol>
      
      <h2>Content Understanding Model Deployment</h2>
      <p>For Content Understanding analysis features, three AI models must be deployed to your Foundry resource. Zapper provides one-click deployment:</p>
      <ol>
        <li>Select your Foundry resource from the list</li>
        <li>Find the <strong>Content Understanding Configuration</strong> section</li>
        <li>Click <strong>Deploy Required Models</strong></li>
      </ol>
      <p>This automatically deploys GPT-4.1, GPT-4.1 Mini, and Text Embedding 3 Large models, then configures the CU resource defaults. Status indicators show success or failure for each model. See the <strong>Content Understanding</strong> chapter for more details.</p>
      
      <h2>Required Permissions</h2>
      <ul>
        <li><strong>FOUNDRY_MANAGEMENT.VIEW</strong> - View Foundry resources</li>
        <li><strong>FOUNDRY_MANAGEMENT.CREATE</strong> - Create resources, hubs, projects</li>
        <li><strong>FOUNDRY_MANAGEMENT.DELETE</strong> - Delete resources</li>
        <li><strong>FOUNDRY_MANAGEMENT.CREATE_AGENT</strong> - Create AI agents</li>
        <li><strong>FOUNDRY_MANAGEMENT.CREATE_VECTOR_STORE</strong> - Create vector stores</li>
        <li><strong>FOUNDRY_MANAGEMENT.CHAT</strong> - Use Chat Playground</li>
        <li><strong>FOUNDRY_MANAGEMENT.IMPORT_FILE</strong> - Import files to Foundry</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support", "user"]
  },
  {
    id: "16",
    title: "Customer-Managed Key Encryption",
    slug: "cmk-encryption",
    html: `
      <h1>Customer-Managed Key Encryption</h1>
      <p>Customer-Managed Key (CMK) encryption allows your organization to control the encryption keys used for Azure storage. Instead of Microsoft-managed keys, you use keys stored in your own Azure Key Vault.</p>
      
      <h2>Why Use CMK?</h2>
      <ul>
        <li><strong>Full Key Control</strong> - You own and manage the encryption keys</li>
        <li><strong>Compliance</strong> - Meet regulatory requirements for key management</li>
        <li><strong>Key Rotation</strong> - Rotate keys on your own schedule</li>
        <li><strong>Revocation</strong> - Disable keys to instantly block access to data</li>
      </ul>
      
      <h2>Prerequisites</h2>
      <ul>
        <li>Azure Key Vault configured with <code>KEY_VAULT_URL</code> environment variable</li>
        <li>Storage account with System-Assigned Managed Identity enabled</li>
        <li>Key Vault access policy granting the storage account key permissions</li>
      </ul>
      
      <h2>View Key Vault Keys</h2>
      <p>Navigate to <strong>Storage Management</strong> and select a storage account. The CMK section shows:</p>
      <ul>
        <li><strong>Current Status</strong> - Microsoft-managed or Customer-managed</li>
        <li><strong>Key Name</strong> - Active encryption key (if CMK enabled)</li>
        <li><strong>Key Version</strong> - Specific key version in use</li>
        <li><strong>Key Vault URL</strong> - Source Key Vault</li>
      </ul>
      
      <h2>Create a New Key</h2>
      <ol>
        <li>Go to <strong>Key Vault Keys</strong></li>
        <li>Click <strong>Create Key</strong></li>
        <li>Enter a <strong>Key Name</strong> (alphanumeric and hyphens only)</li>
        <li>Select <strong>Key Size</strong> (2048 or 4096 bits)</li>
        <li>Click <strong>Create</strong></li>
      </ol>
      <p>The key is created in your Azure Key Vault and available for storage encryption.</p>
      
      <h2>Enable CMK Encryption</h2>
      <ol>
        <li>Navigate to the storage account in Storage Management</li>
        <li>Click <strong>Enable CMK</strong></li>
        <li>Select the <strong>Encryption Key</strong> from your Key Vault</li>
        <li>Optionally specify a <strong>Key Version</strong> (or use latest)</li>
        <li>Click <strong>Enable</strong></li>
      </ol>
      <p>Azure will configure the storage account to use your key. This may take a few minutes.</p>
      
      <h2>Disable CMK Encryption</h2>
      <ol>
        <li>Navigate to the storage account</li>
        <li>Click <strong>Disable CMK</strong></li>
        <li>Confirm the action</li>
      </ol>
      <p>The storage account reverts to Microsoft-managed keys. Your data remains encrypted.</p>
      
      <h2>Key Rotation</h2>
      <p>Best practices for key rotation:</p>
      <ul>
        <li>Create a new key version in Key Vault</li>
        <li>Update the storage account to use the new version</li>
        <li>Or configure auto-rotation in Key Vault</li>
      </ul>
      
      <h2>Emergency Key Revocation</h2>
      <p>To immediately block all access to encrypted data:</p>
      <ol>
        <li>Disable the key in Azure Key Vault</li>
        <li>All storage operations will fail until the key is re-enabled</li>
      </ol>
      <p><strong>Warning:</strong> This is a destructive action that blocks all access to your data!</p>
      
      <h2>Required Permissions</h2>
      <ul>
        <li><strong>STORAGE_MANAGEMENT.VIEW</strong> - View CMK status</li>
        <li><strong>STORAGE_MANAGEMENT.ADD_CONTAINER</strong> - Enable/disable CMK, create keys</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops"]
  },
  {
    id: "17",
    title: "Activity Logs & Audit",
    slug: "activity-logs-audit",
    html: `
      <h1>Activity Logs & Audit</h1>
      <p>Activity Logs provide a complete audit trail of all user actions in Zapper. Every file upload, user creation, role change, and storage modification is recorded for compliance and security investigations.</p>
      
      <h2>Logging Modes</h2>
      <p>Zapper supports two primary modes for activity log storage and retrieval, controlled by the <code>ZAPPER_ACTIVITY_LOG_STORE</code> environment variable:</p>
      
      <ul>
        <li><strong>Database Mode (Default)</strong>: Logs are stored in the internal PostgreSQL database. This is ideal for most standard use cases and provides fast local access.
          <br/><em>Configuration: Set <code>ZAPPER_ACTIVITY_LOG_STORE</code> to any value except <code>FALSE</code> (or leave undefined).</em>
        </li>
        <li><strong>Azure Monitor / Log Analytics Mode</strong>: Logs are fetched from an external Azure Log Analytics workspace. This is recommended for enterprise environments using Azure Sentinel for centralized security monitoring.
          <br/><em>Configuration: Set <code>ZAPPER_ACTIVITY_LOG_STORE</code> to <code>FALSE</code>.</em>
        </li>
      </ul>

      <h2>Configuring Azure Sentinel Integration</h2>
      <p>When using Azure Monitor mode, Zapper logs events to a custom table named <code>ZapperSecurityEvents_CL</code>. To enable this integration:</p>
      <ol>
        <li>Configure the <code>AZURE_LOG_ANALYTICS_WORKSPACE_ID</code> and <code>AZURE_LOG_ANALYTICS_WORKSPACE_KEY</code> secrets.</li>
        <li>Set <code>ZAPPER_ACTIVITY_LOG_STORE=FALSE</code> to switch the UI to fetch logs from Azure.</li>
        <li>Ensure your Azure Service Principal has the "Log Analytics Reader" role.</li>
      </ol>

      <h2>View Activity Logs</h2>
      <p>Click <strong>Activity Logs</strong> in the sidebar to see the audit trail. The table displays:</p>
      <ul>
        <li><strong>Timestamp</strong> - When the action occurred</li>
        <li><strong>User</strong> - Who performed the action (email address)</li>
        <li><strong>Action</strong> - What they did (e.g., UPLOAD_FILE, DELETE_USER)</li>
        <li><strong>Details</strong> - Additional context (file name, user email, etc.)</li>
        <li><strong>Organization</strong> - Which organization the action belongs to</li>
        <li><strong>Status</strong> - Success or Failure</li>
      </ul>
      
      <h2>Organization vs. Cross-Org Views</h2>
      <p>Zapper provides two distinct ways to view logs:</p>
      <ul>
        <li><strong>Organization View</strong>: Standard view showing all activity within your selected organization.</li>
        <li><strong>My Activity Across Organizations</strong>: A specialized view for multi-org users, showing their own actions across all assigned organizations in one consolidated list.</li>
      </ul>

      <h2>Pagination & Performance</h2>
      <p>To handle large audit trails efficiently, Zapper uses server-side pagination. Use the <strong>Previous</strong> and <strong>Next</strong> buttons at the bottom of the table to navigate through history. The <strong>Refresh</strong> button fetches the most recent events from your chosen storage provider.</p>

      <h2>Search and Filter</h2>
      <p>Use the search box to find specific events by user email, action type, or details. You can also filter by:</p>
      <ul>
        <li><strong>Action Type</strong> - Show only uploads, deletions, user changes, etc.</li>
        <li><strong>Date Range</strong> - Limit results to a specific time period</li>
        <li><strong>Organization</strong> - View activity from a single partner organization</li>
        <li><strong>Status</strong> - Show only successful or failed actions</li>
      </ul>
      
      <h2>Logged Actions</h2>
      <p>Zapper logs the following categories of actions:</p>
      
      <h3>File Operations</h3>
      <ul>
        <li>UPLOAD_FILE - File uploaded to storage</li>
        <li>DOWNLOAD_FILE - File downloaded</li>
        <li>DELETE_FILE - File deleted</li>
        <li>CREATE_FOLDER - Folder created</li>
        <li>DELETE_FOLDER - Folder deleted</li>
      </ul>
      
      <h3>User Management</h3>
      <ul>
        <li>CREATE_USER - New user added</li>
        <li>UPDATE_USER - User details modified</li>
        <li>DELETE_USER - User removed</li>
        <li>ENABLE_USER - User enabled</li>
        <li>DISABLE_USER - User disabled</li>
      </ul>
      
      <h3>Role & Permission Management</h3>
      <ul>
        <li>CREATE_ROLE - New role created</li>
        <li>UPDATE_ROLE - Role permissions modified</li>
        <li>DELETE_ROLE - Role removed</li>
      </ul>
      
      <h3>Organization Management</h3>
      <ul>
        <li>CREATE_ORGANIZATION - New organization added</li>
        <li>UPDATE_ORGANIZATION - Organization details changed</li>
        <li>DELETE_ORGANIZATION - Organization removed</li>
      </ul>
      
      <h3>Storage Management</h3>
      <ul>
        <li>CREATE_STORAGE - Storage account or container created</li>
        <li>DELETE_STORAGE - Storage removed</li>
        <li>UPDATE_DATA_PROTECTION - Protection settings changed</li>
        <li>UPDATE_LIFECYCLE_RULES - Lifecycle policy modified</li>
      </ul>
      
      <h3>AI Agent Actions</h3>
      <ul>
        <li>AI_AGENT_PROCESS - File sent for AI processing</li>
        <li>CREATE_AI_AGENT - New AI agent configured</li>
        <li>UPDATE_AI_AGENT - Agent settings modified</li>
        <li>DELETE_AI_AGENT - Agent removed</li>
      </ul>
      
      <h2>Export Logs</h2>
      <p>To export activity logs for offline analysis or compliance reporting:</p>
      <ol>
        <li>Apply any desired filters (date range, action type, user)</li>
        <li>Click <strong>Export</strong></li>
        <li>Choose CSV or JSON format</li>
        <li>Save the file to your computer</li>
      </ol>
      
      <h2>Configurable Logging Levels</h2>
      <p>Administrators can control logging verbosity through environment variables:</p>
      <ul>
        <li><strong>LOG_UPLOADS</strong> - Enable/disable upload logging</li>
        <li><strong>LOG_DOWNLOADS</strong> - Enable/disable download logging</li>
        <li><strong>LOG_DELETES</strong> - Enable/disable deletion logging</li>
        <li><strong>LOG_USER_MGMT</strong> - Enable/disable user management logging</li>
      </ul>
      <p>This allows you to reduce database growth for high-volume operations while maintaining critical audit trails.</p>
      
      <h2>Retention and Compliance</h2>
      <p>Activity logs are stored in PostgreSQL and retained indefinitely by default. Organizations with specific retention policies should configure database-level archival or deletion jobs outside of Zapper.</p>
      
      <h2>Security Considerations</h2>
      <ul>
        <li>Activity logs cannot be modified or deleted by users</li>
        <li>All logged actions include timestamps and user identity</li>
        <li>Failed login attempts and authorization failures are logged</li>
        <li>Logs are filtered by organization to prevent information leakage</li>
      </ul>
      
      <h2>Required Permissions</h2>
      <p>Viewing activity logs requires the <strong>VIEW_ACTIVITY_LOGS</strong> permission. Users can only see logs for their own organization.</p>
    `,
    allowedRoles: ["admin", "ops", "support", "auditor"]
  },
  {
    id: "18",
    title: "Environment Variables Reference",
    slug: "environment-variables",
    html: `
      <h1>Environment Variables Reference</h1>
      <p>Zapper can be customized through environment variables to match your organization's requirements. This reference documents all available configuration options, organized by category.</p>
      
      <h2>Database Configuration</h2>
      
      <h3>DATABASE_URL</h3>
      <p><strong>Purpose:</strong> PostgreSQL database connection string</p>
      <p><strong>Format:</strong> <code>postgresql://username:password@hostname:5432/database_name</code></p>
      <p><strong>Required:</strong> Yes (unless using Key Vault)</p>
      <p><strong>Example:</strong> <code>postgresql://zapperuser:securepass@db.example.com:5432/zapper_prod</code></p>
      
     
      <h2>Authentication & Security</h2>
      
      <h3>ZAPPER_JWT_SECRET</h3>
      <p><strong>Purpose:</strong> Secret key for signing JWT tokens</p>
      <p><strong>Required:</strong> Yes</p>
      <p><strong>Security:</strong> Use a strong, random string (minimum 32 characters recommended)</p>
      <p><strong>Example:</strong> Generate with <code>openssl rand -base64 32</code></p>
      
      <h3>ZAPPER_USE_KEYVAULT</h3>
      <p><strong>Purpose:</strong> Load sensitive configuration from Azure Key Vault</p>
      <p><strong>Values:</strong> <code>true</code> or <code>false</code></p>
      <p><strong>Default:</strong> <code>false</code></p>
      <p><strong>Recommended:</strong> Set to <code>true</code> for production deployments</p>
      
      <h3>KEY_VAULT_URL</h3>
      <p><strong>Purpose:</strong> URL of your Azure Key Vault</p>
      <p><strong>Format:</strong> <code>https://your-vault-name.vault.azure.net/</code></p>
      <p><strong>Required:</strong> Only if <code>ZAPPER_USE_KEYVAULT=true</code></p>
      
      <h3>DB_SECRET_NAME</h3>
      <p><strong>Purpose:</strong> Name of the Key Vault secret containing DATABASE_URL</p>
      <p><strong>Default:</strong> <code>DatabaseUrl</code></p>
      <p><strong>Required:</strong> Only if <code>ZAPPER_USE_KEYVAULT=true</code></p>
      
      <h2>Azure Configuration</h2>
      
      
      <h3>ZAPPER_HNS_FLAG</h3>
      <p><strong>Purpose:</strong> Configure malware scanning mode for ADLS Gen2 (Hierarchical Namespace)</p>
      <p><strong>Values:</strong> <code>TRUE</code> or <code>FALSE</code></p>
      <p><strong>Default:</strong> <code>FALSE</code></p>
      <p><strong>When to use:</strong></p>
      <ul>
        <li><code>TRUE</code> - For ADLS Gen2 storage accounts (uses Event Grid webhooks + custom blob tags)</li>
        <li><code>FALSE</code> - For regular Blob Storage (uses native Defender blob tags)</li>
      </ul>
      
      <h2>File Upload Configuration</h2>
      
      <h3>ZAPPER_FILE_UPLOAD_MODE</h3>
      <p><strong>Purpose:</strong> Strategy for handling file uploads</p>
      <p><strong>Values:</strong> <code>memory</code>, <code>disk</code>, or <code>sas</code></p>
      <p><strong>Default:</strong> <code>memory</code></p>
      <p><strong>Recommendations:</strong></p>
      <ul>
        <li><code>memory</code> - Fast, best for files under 100MB, requires sufficient server RAM</li>
        <li><code>disk</code> - Slower, handles large files, uses server disk space temporarily</li>
        <li><code>sas</code> - Direct client-to-Azure upload, best for very large files (bypasses server)</li>
      </ul>
      
      <h3>ZAPPER_MEMORY_UPLOAD_LIMIT_MB</h3>
      <p><strong>Purpose:</strong> Maximum file size for memory-based uploads (in megabytes)</p>
      <p><strong>Default:</strong> <code>100</code> (100MB)</p>
      <p><strong>Note:</strong> Files larger than this limit require <code>disk</code> or <code>sas</code> upload mode</p>
      
      <h3>ZAPPER_UPLOAD_DIR</h3>
      <p><strong>Purpose:</strong> Temporary directory for disk-based uploads</p>
      <p><strong>Default:</strong> <code>/tmp/uploads</code> (Linux/Mac) or <code>./uploads</code> (Windows)</p>
      <p><strong>Note:</strong> Ensure this directory has sufficient free space for concurrent uploads</p>
      
      <h3>ZAPPER_CHUNK_SIZE_MB</h3>
      <p><strong>Purpose:</strong> Size of each chunk for multi-part Azure uploads (in megabytes)</p>
      <p><strong>Default:</strong> <code>4</code> (4MB chunks)</p>
      <p><strong>Range:</strong> 1-100MB (Azure's maximum block size is 100MB)</p>
      
      <h3>ZAPPER_UPLOAD_CONCURRENCY</h3>
      <p><strong>Purpose:</strong> Number of parallel chunk uploads per file</p>
      <p><strong>Default:</strong> <code>5</code></p>
      <p><strong>Note:</strong> Higher values speed up large file uploads but consume more bandwidth</p>
      
      <h3>ZAPPER_MAX_RETRIES</h3>
      <p><strong>Purpose:</strong> Number of retry attempts for failed chunk uploads</p>
      <p><strong>Default:</strong> <code>3</code></p>
      
      <h2>Upload Limits</h2>
      
      <h3>ZAPPER_MAX_FILES_COUNT</h3>
      <p><strong>Purpose:</strong> Maximum number of files in a single bulk upload operation</p>
      <p><strong>Default:</strong> <code>1000</code></p>
      <p><strong>Note:</strong> Helps prevent resource exhaustion from extremely large bulk operations</p>
      
      <h3>ZAPPER_MAX_UPLOAD_SIZE</h3>
      <p><strong>Purpose:</strong> Maximum total size for bulk uploads (in gigabytes)</p>
      <p><strong>Default:</strong> <code>15</code> (15GB)</p>
      <p><strong>Note:</strong> This is the combined size of all files in a single upload operation</p>
      
      <h2>Activity Logging Control</h2>
      <p>These variables allow fine-grained control over which user activities are recorded in the audit trail.</p>

      <h3>ZAPPER_LOG_GEO_ACCESS</h3>
      <p><strong>Purpose:</strong> Log allowed and blocked geographic access attempts</p>
      <p><strong>Values:</strong> <code>true</code> or <code>false</code></p>
      <p><strong>Default:</strong> <code>true</code></p>

      <h3>ZAPPER_LOG_UPDATE_GEO_FENCING</h3>
      <p><strong>Purpose:</strong> Log when geo-fencing settings are updated for an organization</p>
      <p><strong>Values:</strong> <code>true</code> or <code>false</code></p>
      <p><strong>Default:</strong> <code>true</code></p>

      <h3>ZAPPER_LOG_VIEW_INVENTORY</h3>
      <p><strong>Purpose:</strong> Log when a user views blob inventory summaries</p>
      <p><strong>Values:</strong> <code>true</code> or <code>false</code></p>
      <p><strong>Default:</strong> <code>true</code></p>

      <h3>ZAPPER_LOG_CONFIGURE_INVENTORY</h3>
      <p><strong>Purpose:</strong> Log when blob inventory rules are enabled or disabled</p>
      <p><strong>Values:</strong> <code>true</code> or <code>false</code></p>
      <p><strong>Default:</strong> <code>true</code></p>
      
      <h2>Zip and Download Configuration</h2>
      
      <h3>ZAPPER_ZIP_STRATEGY_THRESHOLD_MB</h3>
      <p><strong>Purpose:</strong> Folder size threshold for offloading zip creation to Azure Container Apps</p>
      <p><strong>Default:</strong> <code>100</code> (100MB)</p>
      <p><strong>Behavior:</strong></p>
      <ul>
        <li>Folders under this size: Zipped on the main backend server</li>
        <li>Folders over this size: Offloaded to scalable Azure Container Apps</li>
      </ul>
      
      <h3>ZAPPER_USE_ACA_FOR_DOWNLOADS</h3>
      <p><strong>Purpose:</strong> Force all zip operations to use Azure Container Apps (bypass threshold)</p>
      <p><strong>Values:</strong> <code>true</code> or <code>false</code></p>
      <p><strong>Default:</strong> <code>false</code></p>
      
      <h3>FOLDER_ZIPPER_API_URL</h3>
      <p><strong>Purpose:</strong> Override URL for the folder zipper service (development/testing)</p>
      <p><strong>Default:</strong> Auto-detected from Azure Container Apps</p>
      <p><strong>Example:</strong> <code>http://localhost:3000/api/zip</code></p>
      
      <h3>ZIPPER_IMAGE</h3>
      <p><strong>Purpose:</strong> Docker image for the folder zipper container</p>
      <p><strong>Default:</strong> <code>zapperedgedocker.azurecr.io/folder-zipper:latest</code></p>
      
      <h3>ZAPPER_ACA_ENVIRONMENT</h3>
      <p><strong>Purpose:</strong> Azure Container Apps environment name for zipper and AI processors</p>
      <p><strong>Default:</strong> <code>zapper-env</code></p>
      
      <h2>AI Agent Configuration</h2>
      
      <h3>AI_AGENT_PROCESSOR_URL</h3>
      <p><strong>Purpose:</strong> Override URL for AI agent processors (development/testing)</p>
      <p><strong>Default:</strong> Auto-detected from Azure Container Apps</p>
      <p><strong>Example:</strong> <code>http://localhost:5000/api/process</code></p>
      
      <h3>ZAPPER_AIAGENT_RESULTS_DIR</h3>
      <p><strong>Purpose:</strong> Folder name for storing AI processing results</p>
      <p><strong>Default:</strong> <code>aiagent_results</code></p>
      
      <h3>ZAPPER_DECRYPT_RESULTS_DIR</h3>
      <p><strong>Purpose:</strong> Folder name for storing decrypted files when using "Decrypt to Folder" feature</p>
      <p><strong>Default:</strong> <code>decrypted</code></p>
      <p><strong>Note:</strong> Decrypted files maintain the original directory structure within this folder</p>
      
      <h3>ZAPPER_CU_RESULTS_DIR</h3>
      <p><strong>Purpose:</strong> Folder name for storing Content Understanding (CU) analysis results</p>
      <p><strong>Default:</strong> <code>cu_folder</code></p>
      <p><strong>Note:</strong> CU results maintain the original directory structure and include timestamps for easy identification</p>
      
      <h2>SAS URL Configuration</h2>
      
      <h3>ZAPPER_AZURE_SAS_TIMEOUT</h3>
      <p><strong>Purpose:</strong> Default SAS URL validity period (in minutes) for file operations</p>
      <p><strong>Default:</strong> <code>5</code> (5 minutes)</p>
      <p><strong>Note:</strong> AI agents can override this with per-agent settings (1-3600 seconds)</p>
      
      <h3>ZAPPER_SAS_TIMEOUT_MINUTES</h3>
      <p><strong>Purpose:</strong> SAS URL validity for direct client uploads (in minutes)</p>
      <p><strong>Default:</strong> <code>15</code> (15 minutes)</p>
      
      <h3>ZAPPER_USE_IP_FOR_SAS</h3>
      <p><strong>Purpose:</strong> Enable IP address restrictions on SAS URLs globally</p>
      <p><strong>Values:</strong> <code>true</code> or <code>false</code></p>
      <p><strong>Default:</strong> <code>false</code></p>
      <p><strong>Note:</strong> When enabled, SAS URLs only work from the requesting client's IP address</p>
      
      <h3>ZAPPER_SKIP_SAS_IP_RESTRICTION</h3>
      <p><strong>Purpose:</strong> Temporarily disable SAS IP restrictions (testing/troubleshooting)</p>
      <p><strong>Values:</strong> <code>true</code> or <code>false</code></p>
      <p><strong>Default:</strong> <code>false</code></p>
      
      <h2>Initial Setup Configuration</h2>
      
      <h3>ZAPPER_INITIAL_USER</h3>
      <p><strong>Purpose:</strong> Email address for the first super admin user (created on initial deployment)</p>
      <p><strong>Example:</strong> <code>admin@example.com</code></p>
      <p><strong>Note:</strong> Only used on first startup when database is empty</p>
      
      <h3>ZAPPER_INITIAL_SUPER_ORG_NAME</h3>
      <p><strong>Purpose:</strong> Name of the initial super organization</p>
      <p><strong>Default:</strong> <code>Default Organization</code></p>
      <p><strong>Note:</strong> Only used on first startup when database is empty</p>
      
      <h2>MSAL Runtime Configuration</h2>
      <p>These variables configure Microsoft Authentication Library (MSAL) for Azure AD sign-in:</p>
      
      <h3>ZAPPER_MSAL_CLIENT_ID</h3>
      <p><strong>Purpose:</strong> Azure AD application (client) ID</p>
      <p><strong>Required:</strong> Yes (for Azure AD authentication)</p>
      <p><strong>Find it:</strong> Azure Portal → Azure AD → App registrations → Your app → Application (client) ID</p>
      
      <h3>ZAPPER_MSAL_AUTHORITY</h3>
      <p><strong>Purpose:</strong> MSAL authority URL for authentication</p>
      <p><strong>Format:</strong> <code>https://login.microsoftonline.com/{tenant-id}</code> or <code>https://{tenant}.ciamlogin.com</code></p>
      <p><strong>Required:</strong> Yes (for Azure AD authentication)</p>
      
      <h3>ZAPPER_MSAL_KNOWN_AUTHORITIES</h3>
      <p><strong>Purpose:</strong> Comma-separated list of trusted authority domains</p>
      <p><strong>Example:</strong> <code>zapperedge.ciamlogin.com</code></p>
      <p><strong>Note:</strong> Required for external identity providers (Entra External ID)</p>
      
      <h3>ZAPPER_REDIRECT_URI</h3>
      <p><strong>Purpose:</strong> OAuth redirect URI after successful authentication</p>
      <p><strong>Example:</strong> <code>https://yourapp.azurewebsites.net</code></p>
      <p><strong>Note:</strong> Must match a redirect URI configured in Azure AD app registration</p>
      
      <h3>ZAPPER_DOMAIN_HINT</h3>
      <p><strong>Purpose:</strong> Pre-fill the login page with a specific domain (optional)</p>
      <p><strong>Example:</strong> <code>contoso.onmicrosoft.com</code></p>
      <p><strong>Default:</strong> Empty (no domain hint)</p>

      <h2>Activity Log Storage</h2>
      
      <h3>ZAPPER_ACTIVITY_LOG_STORE</h3>
      <p><strong>Purpose:</strong> Configures where activity logs are stored and retrieved from.</p>
      <p><strong>Values:</strong> <code>TRUE</code> (Default/PostgreSQL) or <code>FALSE</code> (Azure Monitor/Log Analytics)</p>
      <p><strong>Behavior:</strong></p>
      <ul>
        <li><code>TRUE</code> or undefined: Logs are stored in the local PostgreSQL database and fetched via standard API.</li>
        <li><code>FALSE</code>: Logs are fetched from Azure Log Analytics using the <code>ZapperSecurityEvents_CL</code> table.</li>
      </ul>
      <p><strong>Note:</strong> When set to <code>FALSE</code>, ensure <code>AZURE_LOG_ANALYTICS_WORKSPACE_ID</code> is configured.</p>
      
      <h3>ZAPPER_MSAL_CACHE_LOCATION</h3>
      <p><strong>Purpose:</strong> Where MSAL stores authentication tokens in the browser</p>
      <p><strong>Values:</strong> <code>sessionStorage</code> or <code>localStorage</code></p>
      <p><strong>Default:</strong> <code>sessionStorage</code></p>
      <p><strong>Security:</strong> <code>sessionStorage</code> is more secure (tokens cleared on tab close)</p>
      
      <h3>ZAPPER_MSAL_STORE_AUTHSTATE_COOKIE</h3>
      <p><strong>Purpose:</strong> Store MSAL authentication state in cookies</p>
      <p><strong>Values:</strong> <code>true</code> or <code>false</code></p>
      <p><strong>Default:</strong> <code>false</code></p>
      
      <h3>ZAPPER_MSAL_LOGLEVEL</h3>
      <p><strong>Purpose:</strong> MSAL logging verbosity</p>
      <p><strong>Values:</strong> <code>Error</code>, <code>Warning</code>, <code>Info</code>, <code>Verbose</code></p>
      <p><strong>Default:</strong> <code>Error</code></p>
      
      <h2>Activity Logging Configuration</h2>
      <p>Zapper provides granular control over which actions are logged to the database. All variables default to <code>true</code>. Set to <code>false</code> to disable specific logging:</p>
      
      <h3>Authentication Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_LOGIN</strong> - Successful user logins</li>
        <li><strong>ZAPPER_LOG_LOGOUT</strong> - User logouts</li>
        <li><strong>ZAPPER_LOG_LOGIN_FAILED</strong> - Failed login attempts</li>
      </ul>
      
      <h3>File Management Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_UPLOAD_FILE</strong> - File uploads</li>
        <li><strong>ZAPPER_LOG_DOWNLOAD_FILE</strong> - File downloads</li>
        <li><strong>ZAPPER_LOG_DELETE_FILE</strong> - File deletions</li>
        <li><strong>ZAPPER_LOG_CREATE_DIRECTORY</strong> - Directory creation</li>
        <li><strong>ZAPPER_LOG_DELETE_DIRECTORY</strong> - Directory deletions</li>
        <li><strong>ZAPPER_LOG_DOWNLOAD_DIRECTORY</strong> - Folder downloads (zip operations)</li>
        <li><strong>ZAPPER_LOG_VIEW_FILES</strong> - File browsing/listing</li>
        <li><strong>ZAPPER_LOG_SEARCH_FILES</strong> - File search operations</li>
        <li><strong>ZAPPER_LOG_PREVIEW_FILE</strong> - File previews</li>
      </ul>
      
      <h3>Storage Management Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_CREATE_STORAGE_ACCOUNT</strong> - Storage account creation</li>
        <li><strong>ZAPPER_LOG_DELETE_STORAGE_ACCOUNT</strong> - Storage account deletion</li>
        <li><strong>ZAPPER_LOG_VIEW_STORAGE_ACCOUNTS</strong> - Storage account viewing</li>
        <li><strong>ZAPPER_LOG_CREATE_CONTAINER</strong> - Container creation</li>
        <li><strong>ZAPPER_LOG_CONFIGURE_CORS</strong> - CORS configuration changes</li>
        <li><strong>ZAPPER_LOG_CONFIGURE_DATA_PROTECTION</strong> - Data protection settings</li>
        <li><strong>ZAPPER_LOG_VIEW_DATA_PROTECTION_STATUS</strong> - Data protection status viewing</li>
        <li><strong>ZAPPER_LOG_CONFIGURE_DATA_LIFECYCLE</strong> - Lifecycle rule creation</li>
        <li><strong>ZAPPER_LOG_VIEW_DATA_LIFECYCLE_RULES</strong> - Lifecycle rule viewing</li>
        <li><strong>ZAPPER_LOG_DELETE_DATA_LIFECYCLE_RULE</strong> - Lifecycle rule deletion</li>
        <li><strong>ZAPPER_LOG_ENABLE_SFTP</strong> - SFTP enablement</li>
        <li><strong>ZAPPER_LOG_DISABLE_SFTP</strong> - SFTP disablement</li>
        <li><strong>ZAPPER_LOG_VIEW_SFTP_STATUS</strong> - SFTP status viewing</li>
      </ul>
      
      <h3>User Management Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_CREATE_USER</strong> - User creation</li>
        <li><strong>ZAPPER_LOG_UPDATE_USER</strong> - User updates</li>
        <li><strong>ZAPPER_LOG_DELETE_USER</strong> - User deletion</li>
        <li><strong>ZAPPER_LOG_VIEW_USERS</strong> - User list viewing</li>
        <li><strong>ZAPPER_LOG_ENABLE_USER_ROLE</strong> - User role enablement</li>
        <li><strong>ZAPPER_LOG_DISABLE_USER_ROLE</strong> - User role disablement</li>
        <li><strong>ZAPPER_LOG_DELETE_USER_ROLE</strong> - User role deletion</li>
      </ul>
      
      <h3>Organization Management Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_CREATE_ORGANIZATION</strong> - Organization creation</li>
        <li><strong>ZAPPER_LOG_UPDATE_ORGANIZATION</strong> - Organization updates</li>
        <li><strong>ZAPPER_LOG_DELETE_ORGANIZATION</strong> - Organization deletion</li>
        <li><strong>ZAPPER_LOG_VIEW_ORGANIZATIONS</strong> - Organization list viewing</li>
      </ul>
      
      <h3>Role Management Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_CREATE_ROLE</strong> - Role creation</li>
        <li><strong>ZAPPER_LOG_UPDATE_ROLE</strong> - Role permission updates</li>
        <li><strong>ZAPPER_LOG_DELETE_ROLE</strong> - Role deletion</li>
        <li><strong>ZAPPER_LOG_VIEW_ROLES</strong> - Role list viewing</li>
      </ul>
      
      <h3>AI Agent Management Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_CREATE_AI_AGENT</strong> - AI agent creation</li>
        <li><strong>ZAPPER_LOG_UPDATE_AI_AGENT</strong> - AI agent updates</li>
        <li><strong>ZAPPER_LOG_DELETE_AI_AGENT</strong> - AI agent deletion</li>
        <li><strong>ZAPPER_LOG_VIEW_AI_AGENTS</strong> - AI agent list viewing</li>
        <li><strong>ZAPPER_LOG_RUN_AI_AGENT</strong> - AI processing executions</li>
      </ul>
      
      <h3>PGP Key Management Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_PGP_KEY_GENERATE</strong> - PGP key generation</li>
        <li><strong>ZAPPER_LOG_PGP_KEY_IMPORT</strong> - PGP key imports (own keys and partner keys)</li>
        <li><strong>ZAPPER_LOG_PGP_KEY_DELETE</strong> - PGP key deletion</li>
        <li><strong>ZAPPER_LOG_VIEW_PGP_KEYS</strong> - PGP key list viewing</li>
      </ul>
      
      <h3>PGP Encryption/Decryption Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_FILE_ENCRYPT</strong> - Successful file encryptions</li>
        <li><strong>ZAPPER_LOG_FILE_DECRYPT</strong> - Successful file decryptions</li>
        <li><strong>ZAPPER_LOG_FILE_DECRYPT_FAILED</strong> - Failed decryption attempts (security audit)</li>
        <li><strong>ZAPPER_LOG_FILE_ENCRYPT_FAILED</strong> - Failed encryption attempts</li>
      </ul>
      
      <h3>Foundry AI Management Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_CREATE_FOUNDRY_RESOURCE</strong> - Foundry resource creation</li>
        <li><strong>ZAPPER_LOG_UPDATE_FOUNDRY_RESOURCE</strong> - Foundry resource updates</li>
        <li><strong>ZAPPER_LOG_DELETE_FOUNDRY_RESOURCE</strong> - Foundry resource deletion</li>
        <li><strong>ZAPPER_LOG_VIEW_FOUNDRY_RESOURCES</strong> - Foundry resource viewing</li>
        <li><strong>ZAPPER_LOG_CREATE_FOUNDRY_RESOURCE_SET</strong> - Resource set creation</li>
        <li><strong>ZAPPER_LOG_UPDATE_FOUNDRY_RESOURCE_SET</strong> - Resource set updates</li>
        <li><strong>ZAPPER_LOG_DELETE_FOUNDRY_RESOURCE_SET</strong> - Resource set deletion</li>
        <li><strong>ZAPPER_LOG_VIEW_FOUNDRY_RESOURCE_SETS</strong> - Resource set viewing</li>
        <li><strong>ZAPPER_LOG_CREATE_FOUNDRY_HUB</strong> - Foundry hub creation</li>
        <li><strong>ZAPPER_LOG_DELETE_FOUNDRY_HUB</strong> - Foundry hub deletion</li>
        <li><strong>ZAPPER_LOG_CREATE_FOUNDRY_PROJECT</strong> - Foundry project creation</li>
        <li><strong>ZAPPER_LOG_DELETE_FOUNDRY_PROJECT</strong> - Foundry project deletion</li>
        <li><strong>ZAPPER_LOG_CREATE_FOUNDRY_DEPLOYMENT</strong> - Model deployment creation</li>
        <li><strong>ZAPPER_LOG_DELETE_FOUNDRY_DEPLOYMENT</strong> - Model deployment deletion</li>
        <li><strong>ZAPPER_LOG_CREATE_FOUNDRY_AGENT</strong> - Foundry agent creation</li>
        <li><strong>ZAPPER_LOG_UPDATE_FOUNDRY_AGENT</strong> - Foundry agent updates</li>
        <li><strong>ZAPPER_LOG_DELETE_FOUNDRY_AGENT</strong> - Foundry agent deletion</li>
        <li><strong>ZAPPER_LOG_CREATE_FOUNDRY_VECTOR_STORE</strong> - Vector store creation</li>
        <li><strong>ZAPPER_LOG_DELETE_FOUNDRY_VECTOR_STORE</strong> - Vector store deletion</li>
        <li><strong>ZAPPER_LOG_FOUNDRY_CHAT</strong> - Chat thread and message activities</li>
        <li><strong>ZAPPER_LOG_FOUNDRY_FILE_IMPORT</strong> - File imports to Foundry</li>
      </ul>
      
      <h3>Content Understanding Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_RUN_CONTENT_ANALYSIS</strong> - Content analysis executions</li>
        <li><strong>ZAPPER_LOG_SAVE_CU_RESULT</strong> - Analysis result saves</li>
        <li><strong>ZAPPER_LOG_DELETE_CU_RESULT</strong> - Analysis result deletions</li>
        <li><strong>ZAPPER_LOG_VIEW_CU_RESULTS</strong> - Analysis result viewing</li>
      </ul>
      
      <h3>Document Translation Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_RUN_DOCUMENT_TRANSLATION</strong> - Document translation executions</li>
        <li><strong>ZAPPER_LOG_DELETE_DOCUMENT_TRANSLATION</strong> - Translated document deletions</li>
      </ul>
      
      <h3>SFTP Local User Management Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_CREATE_SFTP_LOCAL_USER</strong> - SFTP local user creation</li>
        <li><strong>ZAPPER_LOG_UPDATE_SFTP_LOCAL_USER</strong> - SFTP local user updates (including enable)</li>
        <li><strong>ZAPPER_LOG_DELETE_SFTP_LOCAL_USER</strong> - SFTP local user deletion</li>
        <li><strong>ZAPPER_LOG_DISABLE_SFTP_LOCAL_USER</strong> - SFTP local user disablement</li>
        <li><strong>ZAPPER_LOG_VIEW_SFTP_LOCAL_USERS</strong> - SFTP local user list viewing</li>
        <li><strong>ZAPPER_LOG_ROTATE_SFTP_SSH_KEY</strong> - SSH key rotation</li>
        <li><strong>ZAPPER_LOG_ROTATE_SFTP_PASSWORD</strong> - Password rotation</li>
        <li><strong>ZAPPER_LOG_MAP_SFTP_USER</strong> - User mapping changes</li>
        <li><strong>ZAPPER_LOG_VIEW_SFTP_SELF_ACCESS</strong> - Self-service access viewing</li>
        <li><strong>ZAPPER_LOG_DOWNLOAD_SFTP_CREDENTIALS</strong> - Credential downloads</li>
      </ul>
      
      <h3>SIEM/Sentinel Management Logs</h3>
      <ul>
        <li><strong>ZAPPER_LOG_INSTALL_SENTINEL_RULE</strong> - Sentinel analytics rule installation</li>
        <li><strong>ZAPPER_LOG_DELETE_SENTINEL_RULE</strong> - Sentinel analytics rule deletion</li>
        <li><strong>ZAPPER_LOG_ENABLE_SENTINEL_RULE</strong> - Sentinel analytics rule enablement</li>
        <li><strong>ZAPPER_LOG_DISABLE_SENTINEL_RULE</strong> - Sentinel analytics rule disablement</li>
        <li><strong>ZAPPER_LOG_VIEW_SENTINEL_RULES</strong> - Sentinel rules viewing</li>
      </ul>
      
      <h2>Performance Tuning</h2>
      <p>For high-volume deployments, consider disabling these logs to reduce database growth:</p>
      <ul>
        <li><strong>ZAPPER_LOG_VIEW_FILES=false</strong> - Disable file browsing logs (can be very frequent)</li>
        <li><strong>ZAPPER_LOG_DOWNLOAD_FILE=false</strong> - Disable download logs in read-heavy environments</li>
        <li><strong>ZAPPER_LOG_PREVIEW_FILE=false</strong> - Disable preview logs</li>
      </ul>
      <p>Keep critical audit logs enabled:</p>
      <ul>
        <li><strong>ZAPPER_LOG_DELETE_FILE</strong> - Always recommended for compliance</li>
        <li><strong>ZAPPER_LOG_LOGIN_FAILED</strong> - Security monitoring</li>
        <li><strong>ZAPPER_LOG_DELETE_USER</strong> - Administrative audit trail</li>
      </ul>
      
      
      
      
      <h2>Troubleshooting</h2>
      <p>If Zapper isn't starting or behaving correctly, verify these critical variables are set:</p>
      <ol>
        <li><strong>DATABASE_URL</strong> - Valid PostgreSQL connection string</li>
        <li><strong>ZAPPER_JWT_SECRET</strong> - Any non-empty string (32+ characters recommended)</li>
        <li><strong>ZAPPER_MSAL_CLIENT_ID</strong> - Valid Azure AD application ID</li>
        <li><strong>ZAPPER_MSAL_AUTHORITY</strong> - Valid Azure AD tenant authority URL</li>
        <li><strong>ZAPPER_REDIRECT_URI</strong> - Matches Azure AD app registration</li>
      </ol>
      
          `,
    allowedRoles: ["admin", "ops"]
  },
  {
    id: "19",
    title: "API Integration Guide",
    slug: "api-integration-guide",
    html: `
      <h1>API Integration Guide</h1>
      <p>The Zapper API provides programmatic access to all platform features for integration with external systems, automation workflows, and custom applications. This guide documents all available endpoints with request/response formats and error handling.</p>
      
      <h2>Base URL</h2>
      <p>All API endpoints are relative to your Zapper deployment URL:</p>
      <pre><code>https://your-zapper-instance.com/api</code></pre>
      
      <h2>Authentication</h2>
      <p>Most API endpoints require authentication using a JWT bearer token. Include the token in the <code>Authorization</code> header:</p>
      <pre><code>Authorization: Bearer YOUR_JWT_TOKEN</code></pre>
      
      <h3>Obtaining a JWT Token</h3>
      <p>Tokens are obtained through SSO authentication flows (Microsoft or Google). After successful authentication, the token is stored in an HTTP-only cookie and also available in the response.</p>
      
      <h2>Common Response Codes</h2>
      <table>
        <thead>
          <tr>
            <th>Status Code</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>200</td><td>Success - Request completed successfully</td></tr>
          <tr><td>201</td><td>Created - Resource created successfully</td></tr>
          <tr><td>400</td><td>Bad Request - Invalid request parameters or body</td></tr>
          <tr><td>401</td><td>Unauthorized - Missing or invalid authentication token</td></tr>
          <tr><td>403</td><td>Forbidden - Insufficient permissions for this operation</td></tr>
          <tr><td>404</td><td>Not Found - Resource does not exist</td></tr>
          <tr><td>409</td><td>Conflict - Resource already exists or conflict with current state</td></tr>
          <tr><td>500</td><td>Internal Server Error - Unexpected server error occurred</td></tr>
        </tbody>
      </table>

      <h2>Error Response Format</h2>
      <p>All error responses follow this consistent structure:</p>
      <pre><code>{
  "error": "Error message describing what went wrong",
  "details": "Additional context about the error (optional)"
}</code></pre>

      <hr/>
      
      <h2>User Profile APIs</h2>
      
      <h3>1. Get Current User</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/me</code></p>
      <p><strong>Description:</strong> Retrieves the currently authenticated user's profile information.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      
      <p><strong>Request Headers:</strong></p>
      <pre><code>Authorization: Bearer YOUR_JWT_TOKEN</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "id": 123,
  "email": "user@example.com",
  "name": "John Doe",
  "enabled": true,
  "organizationId": 5,
  "organizationName": "Acme Corp",
  "roles": [
    {
      "roleId": 1,
      "roleName": "Admin",
      "enabled": true
    }
  ]
}</code></pre>
      
      <p><strong>Errors:</strong></p>
      <ul>
        <li><code>401</code> - Invalid or missing authentication token</li>
        <li><code>404</code> - User not found in database</li>
      </ul>

      <h3>2. Get Role Permissions</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/my-role-permissions/:roleId</code></p>
      <p><strong>Description:</strong> Fetches detailed permissions for a specific role assigned to the current user.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      
      <p><strong>URL Parameters:</strong></p>
      <ul>
        <li><code>roleId</code> (integer, required) - The ID of the role</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "roleId": 1,
  "roleName": "Admin",
  "permissions": {
    "userManagement": {
      "add": true,
      "edit": true,
      "delete": true,
      "view": true,
      "enableDisable": true
    },
    "fileManagement": {
      "viewFiles": true,
      "uploadFile": true,
      "downloadFile": true,
      "deleteFilesAndFolders": true
    }
  }
}</code></pre>

      <hr/>
      
      <h2>User Management APIs</h2>
      
      <h3>3. List Users</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/users</code></p>
      <p><strong>Description:</strong> Retrieves a list of all users. Supports filtering by role and organization.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>USER_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Query Parameters:</strong></p>
      <ul>
        <li><code>roleId</code> (integer, optional) - Filter by role ID</li>
        <li><code>organizationId</code> (integer, optional) - Filter by organization ID</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>[
  {
    "id": 123,
    "email": "user@example.com",
    "name": "John Doe",
    "enabled": true,
    "organizationId": 5,
    "organizationName": "Acme Corp",
    "createdAt": "2024-01-15T10:30:00Z",
    "roles": [
      {
        "roleId": 1,
        "roleName": "Admin",
        "enabled": true
      }
    ]
  }
]</code></pre>

      <h3>4. Get User by ID</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/users/:id</code></p>
      <p><strong>Description:</strong> Retrieves detailed information for a specific user.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>USER_MANAGEMENT.VIEW</code></p>
      
      <p><strong>URL Parameters:</strong></p>
      <ul>
        <li><code>id</code> (integer, required) - User ID</li>
      </ul>
      
      <p><strong>Response (200):</strong> Same structure as single user object in List Users response</p>
      
      <p><strong>Errors:</strong></p>
      <ul>
        <li><code>403</code> - Insufficient permissions or user belongs to different organization</li>
        <li><code>404</code> - User not found</li>
      </ul>

      <h3>5. Create User</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/users</code></p>
      <p><strong>Description:</strong> Creates a new user account and assigns them to a role and organization.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>USER_MANAGEMENT.ADD</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "email": "newuser@example.com",
  "name": "Jane Smith",
  "organizationId": 5,
  "roleId": 2,
  "enabled": true
}</code></pre>
      
      <p><strong>Validation Rules:</strong></p>
      <ul>
        <li><code>email</code> - Valid email format, max 100 characters</li>
        <li><code>name</code> - 1-50 characters</li>
        <li><code>organizationId</code> - Must exist and user must have access</li>
        <li><code>roleId</code> - Must exist in system</li>
      </ul>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "id": 124,
  "email": "newuser@example.com",
  "name": "Jane Smith",
  "enabled": true,
  "organizationId": 5,
  "createdAt": "2024-01-16T14:25:00Z"
}</code></pre>
      
      <p><strong>Errors:</strong></p>
      <ul>
        <li><code>400</code> - Invalid email format or missing required fields</li>
        <li><code>403</code> - Insufficient permissions</li>
        <li><code>409</code> - User with this email already exists</li>
      </ul>

      <h3>6. Update User</h3>
      <p><strong>Endpoint:</strong> <code>PUT /api/users/:id</code></p>
      <p><strong>Description:</strong> Updates an existing user's details, including role and organization assignments.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>USER_MANAGEMENT.EDIT</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "email": "updated@example.com",
  "name": "John Updated",
  "organizationId": 5,
  "roleId": 3,
  "enabled": false
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "User updated successfully",
  "user": {
    "id": 123,
    "email": "updated@example.com",
    "name": "John Updated",
    "enabled": false
  }
}</code></pre>

      <h3>7. Delete User</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/users/:id</code></p>
      <p><strong>Description:</strong> Permanently deletes a user account. Activity logs are preserved.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>USER_MANAGEMENT.DELETE</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "User deleted successfully"
}</code></pre>
      
      <p><strong>Errors:</strong></p>
      <ul>
        <li><code>403</code> - Cannot delete last enabled admin user (system safeguard)</li>
        <li><code>404</code> - User not found</li>
      </ul>

      <hr/>
      
      <h2>Organization Management APIs</h2>
      
      <h3>8. List Organizations</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/organizations</code></p>
      <p><strong>Description:</strong> Retrieves all partner organizations accessible by the current user.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>ORGANIZATION_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>[
  {
    "id": 5,
    "name": "Acme Corp",
    "description": "Main organization",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]</code></pre>

      <h3>9. Create Organization</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/organizations</code></p>
      <p><strong>Description:</strong> Creates a new partner organization.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>ORGANIZATION_MANAGEMENT.ADD</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "name": "New Partner Corp",
  "description": "Partner organization description"
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "id": 6,
  "name": "New Partner Corp",
  "description": "Partner organization description",
  "createdAt": "2024-01-16T15:00:00Z"
}</code></pre>

      <h3>10. Update Organization</h3>
      <p><strong>Endpoint:</strong> <code>PUT /api/organizations/:id</code></p>
      <p><strong>Description:</strong> Updates organization name and description.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>ORGANIZATION_MANAGEMENT.EDIT</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "name": "Updated Corp Name",
  "description": "Updated description"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Organization updated successfully"
}</code></pre>

      <h3>11. Delete Organization</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/organizations/:id</code></p>
      <p><strong>Description:</strong> Deletes an organization. Fails if organization has users or storage accounts.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>ORGANIZATION_MANAGEMENT.DELETE</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Organization deleted successfully"
}</code></pre>
      
      <p><strong>Errors:</strong></p>
      <ul>
        <li><code>400</code> - Organization still has associated users or storage accounts</li>
      </ul>

      <hr/>
      
      <h2>Role Management APIs</h2>
      
      <h3>16. List Roles</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/roles</code></p>
      <p><strong>Description:</strong> Retrieves all defined roles in the system.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>ROLE_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>[
  {
    "id": 1,
    "name": "Admin",
    "description": "Full system access",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]</code></pre>

      <h3>17. Get Role by ID</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/roles/:id</code></p>
      <p><strong>Description:</strong> Retrieves detailed information including permissions for a specific role.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>ROLE_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "id": 1,
  "name": "Admin",
  "description": "Full system access",
  "permissions": {
    "userManagement": {
      "add": true,
      "edit": true,
      "delete": true,
      "view": true,
      "enableDisable": true
    },
    "roleManagement": {
      "add": true,
      "edit": true,
      "delete": true,
      "view": true
    }
  }
}</code></pre>

      <h3>18. Create Role</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/roles</code></p>
      <p><strong>Description:</strong> Creates a new role with specified permissions.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>ROLE_MANAGEMENT.ADD</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "name": "Auditor",
  "description": "Read-only access to logs",
  "permissions": {
    "userManagement": {
      "add": false,
      "edit": false,
      "delete": false,
      "view": true,
      "enableDisable": false
    },
    "activityLogs": {
      "view": true
    }
  }
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "id": 10,
  "name": "Auditor",
  "description": "Read-only access to logs",
  "createdAt": "2024-01-16T16:00:00Z"
}</code></pre>

      <h3>19. Update Role</h3>
      <p><strong>Endpoint:</strong> <code>PUT /api/roles/:id</code></p>
      <p><strong>Description:</strong> Updates role name, description, and permissions.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>ROLE_MANAGEMENT.EDIT</code></p>
      
      <p><strong>Request Body:</strong> Same structure as Create Role</p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Role updated successfully"
}</code></pre>

      <h3>20. Delete Role</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/roles/:id</code></p>
      <p><strong>Description:</strong> Deletes a role. Fails if role is assigned to enabled users.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>ROLE_MANAGEMENT.DELETE</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Role deleted successfully"
}</code></pre>

      <hr/>
      
      <h2>File Management APIs</h2>
      
      <h3>21. Create Directory</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/files/create-directory</code></p>
      <p><strong>Description:</strong> Creates a new folder in Azure Storage.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FILE_MANAGEMENT.CREATE_FOLDER</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "directoryPath": "projects/2024/q1"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Directory created successfully",
  "path": "projects/2024/q1"
}</code></pre>

      <h3>22. Upload File</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/files/upload-file</code></p>
      <p><strong>Description:</strong> Uploads a file to Azure Storage. Supports multiple upload modes (SAS, memory, disk).</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FILE_MANAGEMENT.UPLOAD_FILE</code></p>
      
      <p><strong>Request Body (multipart/form-data):</strong></p>
      <ul>
        <li><code>file</code> - The file to upload</li>
        <li><code>organizationId</code> - Organization ID (integer)</li>
        <li><code>targetPath</code> - Target directory path (string)</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "File uploaded successfully",
  "fileName": "report.pdf",
  "size": 2048576,
  "path": "uploads/report.pdf"
}</code></pre>
      
      <p><strong>Errors:</strong></p>
      <ul>
        <li><code>400</code> - File exceeds size limit or invalid file type</li>
        <li><code>413</code> - Payload too large</li>
      </ul>

      <h3>23. Download File</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/files/download</code></p>
      <p><strong>Description:</strong> Generates a secure SAS URL for downloading a file.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FILE_MANAGEMENT.DOWNLOAD_FILE</code></p>
      
      <p><strong>Query Parameters:</strong></p>
      <ul>
        <li><code>organizationId</code> (integer, required) - Organization ID</li>
        <li><code>filePath</code> (string, required) - Full path to file</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "url": "https://storage.blob.core.windows.net/container/file.pdf?sv=2021-06-08&..."
}</code></pre>

      <h3>24. Delete File</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/files/file</code></p>
      <p><strong>Description:</strong> Deletes a specific file from storage.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FILE_MANAGEMENT.DELETE_FILES_FOLDERS</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "filePath": "uploads/old-report.pdf"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "File deleted successfully"
}</code></pre>

      <h3>25. Delete Directory</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/files/directory</code></p>
      <p><strong>Description:</strong> Recursively deletes a directory and all its contents.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FILE_MANAGEMENT.DELETE_FILES_FOLDERS</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "directoryPath": "projects/archived"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Directory deleted successfully",
  "filesDeleted": 47
}</code></pre>

      <h3>26. Bulk Download</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/files/bulk-download</code></p>
      <p><strong>Description:</strong> Creates a ZIP archive of selected files and folders for download.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FILE_MANAGEMENT.DOWNLOAD_FOLDER</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "items": [
    { "type": "file", "path": "reports/q4-2024.pdf" },
    { "type": "directory", "path": "images/products" }
  ]
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "downloadUrl": "https://storage.blob.core.windows.net/.../archive.zip?sv=...",
  "zipFileName": "archive_20240116_160530.zip",
  "totalSize": 15728640
}</code></pre>

      <hr/>
      
      <h2>Storage Management APIs</h2>
      
      <h3>27. List Storage Accounts</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/storage-accounts</code></p>
      <p><strong>Description:</strong> Retrieves all storage accounts accessible by the current user's organization.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>STORAGE_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>[
  {
    "id": 1,
    "storageAccountName": "acmestorage",
    "containerName": "data",
    "region": "eastus",
    "resourceGroup": "rg-prod",
    "organizationId": 5,
    "organizationName": "Acme Corp",
    "storageType": "blob",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]</code></pre>

      <h3>28. Provision ADLS Storage</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/organizations/:organizationId/provision-adls</code></p>
      <p><strong>Description:</strong> Provisions a new Azure Data Lake Storage Gen2 account with filesystem and SFTP support.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>STORAGE_MANAGEMENT.ADD_STORAGE</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "storageAccountName": "newdatalake",
  "filesystemName": "datafiles",
  "resourceGroup": "rg-prod",
  "location": "eastus",
  "enableSftp": true
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "message": "ADLS storage provisioned successfully",
  "storageAccountName": "newdatalake",
  "filesystemName": "datafiles",
  "sftpEnabled": true
}</code></pre>

      <h3>29. Toggle SFTP</h3>
      <p><strong>Endpoint:</strong> <code>PUT /api/storage-accounts/:storageAccountName/sftp</code></p>
      <p><strong>Description:</strong> Enables or disables SFTP access for an ADLS Gen2 storage account.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>STORAGE_MANAGEMENT.EDIT</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "enable": true
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "SFTP enabled successfully",
  "sftpEnabled": true
}</code></pre>

      <h3>30. Delete Storage Account</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/storage-accounts/:id</code></p>
      <p><strong>Description:</strong> Deletes a storage account and its container from both Azure and Zapper database.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>STORAGE_MANAGEMENT.DELETE</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Storage account deleted successfully"
}</code></pre>

      <hr/>
      
      <h2>SFTP Local User Management APIs</h2>
      <p>SFTP local users enable secure file transfer via SFTP protocol. Each organization can have one ADLS (Azure Data Lake Storage Gen2) storage account configured for SFTP access. SFTP users must be mapped to organization users (1:1 mandatory mapping).</p>
      
      <h3>41. List SFTP Local Users</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/sftp-local-users</code></p>
      <p><strong>Description:</strong> Retrieves all SFTP local users accessible by the current user's organizations.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SFTP_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Query Parameters:</strong></p>
      <ul>
        <li><code>organizationId</code> (integer, optional) - Filter by organization</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>[
  {
    "id": 1,
    "localUsername": "partner-user1",
    "displayName": "Partner User 1",
    "organizationId": 5,
    "organizationName": "Acme Corp",
    "storageAccountName": "acmedatalake",
    "subscriptionId": "abc123-...",
    "resourceGroup": "rg-prod",
    "mappedUserId": 123,
    "mappedUserEmail": "user@example.com",
    "mappedUserName": "John Doe",
    "sshEnabled": true,
    "passwordEnabled": false,
    "status": "active",
    "isEnabled": true,
    "scopes": [
      {
        "containerName": "data",
        "permissions": {
          "read": true,
          "write": true,
          "list": true,
          "delete": false
        }
      }
    ],
    "createdAt": "2024-01-15T10:00:00Z"
  }
]</code></pre>

      <h3>42. Create SFTP Local User</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/sftp-local-users</code></p>
      <p><strong>Description:</strong> Creates a new SFTP local user with SSH key or password authentication. Generates RSA 4096-bit SSH keys if SSH is enabled.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SFTP_MANAGEMENT.CREATE</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "localUsername": "partner-user2",
  "displayName": "Partner User 2",
  "mappedUserId": 124,
  "type": "ssh",
  "permissions": {
    "read": true,
    "write": true,
    "list": true,
    "delete": false
  }
}</code></pre>
      
      <p><strong>Validation Rules:</strong></p>
      <ul>
        <li><code>localUsername</code> - 3-64 characters, alphanumeric with hyphens</li>
        <li><code>displayName</code> - 1-100 characters</li>
        <li><code>mappedUserId</code> - Required, must be a valid user in the organization</li>
        <li><code>type</code> - Either "ssh" (RSA 4096) or "password"</li>
        <li>Organization must have an ADLS storage account with SFTP enabled</li>
      </ul>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "id": 2,
  "localUsername": "partner-user2",
  "displayName": "Partner User 2",
  "organizationId": 5,
  "storageAccountName": "acmedatalake",
  "mappedUserId": 124,
  "mappedUserEmail": "partner@example.com",
  "mappedUserName": "Partner User",
  "sshEnabled": true,
  "passwordEnabled": false,
  "status": "active",
  "secretToken": "abc123xyz...",
  "scopes": [...]
}</code></pre>
      
      <p><strong>Note:</strong> The <code>secretToken</code> is a one-time download token valid for 120 seconds. Use it to retrieve the private key or password.</p>
      
      <p><strong>Errors:</strong></p>
      <ul>
        <li><code>400</code> - Organization has no ADLS storage account, or user already mapped</li>
        <li><code>409</code> - SFTP user with this username already exists</li>
      </ul>

      <h3>43. Enable SFTP Local User</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/sftp-local-users/:id/enable</code></p>
      <p><strong>Description:</strong> Enables a disabled SFTP local user, restoring their access.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SFTP_MANAGEMENT.DISABLE</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "success": true,
  "message": "SFTP local user enabled"
}</code></pre>

      <h3>44. Disable SFTP Local User</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/sftp-local-users/:id/disable</code></p>
      <p><strong>Description:</strong> Disables an SFTP local user, revoking their access without deleting the account.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SFTP_MANAGEMENT.DISABLE</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "success": true,
  "message": "SFTP local user disabled"
}</code></pre>

      <h3>45. Delete SFTP Local User</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/sftp-local-users/:id</code></p>
      <p><strong>Description:</strong> Permanently deletes an SFTP local user from both Azure and Zapper database.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SFTP_MANAGEMENT.DELETE</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "success": true,
  "message": "SFTP local user deleted successfully"
}</code></pre>

      <h3>46. Rotate SSH Key</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/sftp-local-users/:id/rotate-ssh</code></p>
      <p><strong>Description:</strong> Generates a new RSA 4096-bit SSH key pair, replacing the existing key.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SFTP_MANAGEMENT.UPDATE</code> or <code>SFTP_MANAGEMENT.ROTATE_SSH_SELF</code> (for self-service)</p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "secretToken": "xyz789abc...",
  "message": "SSH key rotated successfully"
}</code></pre>
      
      <p><strong>Note:</strong> Use the <code>secretToken</code> within 120 seconds to download the new private key.</p>

      <h3>47. Rotate Password</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/sftp-local-users/:id/rotate-password</code></p>
      <p><strong>Description:</strong> Generates a new random password for the SFTP user.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SFTP_MANAGEMENT.UPDATE</code> or <code>SFTP_MANAGEMENT.ROTATE_PASSWORD_SELF</code> (for self-service)</p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "secretToken": "def456ghi...",
  "message": "Password rotated successfully"
}</code></pre>

      <h3>48. Download Credentials</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/sftp-local-users/download/:token</code></p>
      <p><strong>Description:</strong> Downloads the SSH private key or password using a one-time token. Token expires after 120 seconds.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      
      <p><strong>Response (200) - For SSH:</strong></p>
      <pre><code>{
  "privateKey": "-----BEGIN RSA PRIVATE KEY-----\\nMIIJKQ...\\n-----END RSA PRIVATE KEY-----",
  "connectionInfo": {
    "host": "acmedatalake.blob.core.windows.net",
    "username": "acmedatalake.partner-user2",
    "port": 22
  }
}</code></pre>
      
      <p><strong>Response (200) - For Password:</strong></p>
      <pre><code>{
  "password": "randomSecurePassword123!",
  "connectionInfo": {
    "host": "acmedatalake.blob.core.windows.net",
    "username": "acmedatalake.partner-user2",
    "port": 22
  }
}</code></pre>
      
      <p><strong>Errors:</strong></p>
      <ul>
        <li><code>404</code> - Token not found or expired</li>
      </ul>

      <h3>49. Map User to SFTP Account</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/sftp-local-users/:id/map-user</code></p>
      <p><strong>Description:</strong> Changes the organization user mapped to an SFTP account.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SFTP_MANAGEMENT.MAP_USER</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "mappedUserId": 125
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "User mapping updated successfully"
}</code></pre>

      <h3>50. Get My SFTP Access (Self-Service)</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/sftp-local-users/my-access</code></p>
      <p><strong>Description:</strong> Retrieves SFTP accounts mapped to the current user for self-service credential management.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SFTP_MANAGEMENT.VIEW_SELF_ACCESS</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>[
  {
    "id": 2,
    "localUsername": "partner-user2",
    "displayName": "Partner User 2",
    "storageAccountName": "acmedatalake",
    "sshEnabled": true,
    "passwordEnabled": false,
    "status": "active",
    "connectionHost": "acmedatalake.blob.core.windows.net",
    "connectionUsername": "acmedatalake.partner-user2",
    "scopes": [...]
  }
]</code></pre>

      <hr/>
      
      <h2>Data Protection APIs</h2>
      
      <h3>31. Get Protection Status</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/data-protection/status/all</code></p>
      <p><strong>Description:</strong> Retrieves data protection settings for all accessible storage accounts.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>DATA_PROTECTION.VIEW</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>[
  {
    "storageAccountName": "acmestorage",
    "blobSoftDeleteEnabled": true,
    "blobSoftDeleteRetentionDays": 7,
    "containerSoftDeleteEnabled": true,
    "containerSoftDeleteRetentionDays": 7,
    "malwareScanningEnabled": false,
    "sensitiveDataDiscoveryEnabled": false
  }
]</code></pre>

      <h3>32. Configure Data Protection</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/data-protection/configure</code></p>
      <p><strong>Description:</strong> Configures soft delete, malware scanning, and sensitive data discovery settings.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>DATA_PROTECTION.CONFIGURE</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "storageAccountName": "acmestorage",
  "blobSoftDeleteEnabled": true,
  "blobSoftDeleteRetentionDays": 14,
  "containerSoftDeleteEnabled": true,
  "containerSoftDeleteRetentionDays": 14,
  "malwareScanningEnabled": true,
  "sensitiveDataDiscoveryEnabled": false
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Data protection configured successfully",
  "storageAccountName": "acmestorage"
}</code></pre>

      <hr/>
      
      <h2>AI Agent APIs</h2>
      
      <h3>33. List AI Agents</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/ai-agents</code></p>
      <p><strong>Description:</strong> Retrieves all AI agents accessible by the current user's organization.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>AI_AGENT_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Query Parameters:</strong></p>
      <ul>
        <li><code>organizationId</code> (integer, optional) - Filter by organization</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>[
  {
    "id": 1,
    "name": "Document Processor",
    "apiEndpoint": "https://ai.example.com/process",
    "organizationId": 5,
    "useIpForSas": true,
    "allowedIpAddress": "203.0.113.10",
    "sasValiditySeconds": 3600,
    "createdAt": "2024-01-10T12:00:00Z",
    "updatedAt": "2024-01-15T14:30:00Z"
  }
]</code></pre>

      <h3>34. Create AI Agent</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/ai-agents</code></p>
      <p><strong>Description:</strong> Creates a new AI agent configuration for automated file processing.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>AI_AGENT_MANAGEMENT.ADD</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "name": "Invoice Parser",
  "apiEndpoint": "https://ai.example.com/parse-invoice",
  "apiKey": "sk_live_abc123xyz",
  "organizationId": 5,
  "useIpForSas": true,
  "allowedIpAddress": "203.0.113.10",
  "sasValiditySeconds": 1800
}</code></pre>
      
      <p><strong>Validation Rules:</strong></p>
      <ul>
        <li><code>name</code> - 1-100 characters</li>
        <li><code>apiEndpoint</code> - Valid HTTPS URL</li>
        <li><code>apiKey</code> - Required, securely encrypted before storage</li>
        <li><code>sasValiditySeconds</code> - 300 to 86400 (5 minutes to 24 hours)</li>
        <li><code>allowedIpAddress</code> - Valid IPv4 format when <code>useIpForSas</code> is true</li>
      </ul>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "id": 2,
  "name": "Invoice Parser",
  "apiEndpoint": "https://ai.example.com/parse-invoice",
  "organizationId": 5,
  "useIpForSas": true,
  "allowedIpAddress": "203.0.113.10",
  "sasValiditySeconds": 1800,
  "createdAt": "2024-01-16T17:00:00Z"
}</code></pre>
      
      <p><strong>Errors:</strong></p>
      <ul>
        <li><code>400</code> - Invalid IP address format or missing required fields</li>
        <li><code>409</code> - AI agent with same name and endpoint already exists</li>
      </ul>

      <h3>35. Update AI Agent</h3>
      <p><strong>Endpoint:</strong> <code>PUT /api/ai-agents/:id</code></p>
      <p><strong>Description:</strong> Updates AI agent configuration. API key cannot be changed after creation.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>AI_AGENT_MANAGEMENT.EDIT</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "name": "Updated Invoice Parser",
  "apiEndpoint": "https://ai.example.com/parse-invoice-v2",
  "organizationId": 5,
  "useIpForSas": false,
  "allowedIpAddress": null,
  "sasValiditySeconds": 3600
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "AI agent updated successfully"
}</code></pre>

      <h3>36. Delete AI Agent</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/ai-agents/:id</code></p>
      <p><strong>Description:</strong> Permanently deletes an AI agent configuration.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>AI_AGENT_MANAGEMENT.DELETE</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "AI agent deleted successfully"
}</code></pre>

      <h3>37. Run AI Agent</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/ai-agents/run</code></p>
      <p><strong>Description:</strong> Initiates AI processing for a file by sending a manifest to the agent's endpoint.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>AI_AGENT_MANAGEMENT.VIEW</code> (run action)</p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "agentId": 2,
  "organizationId": 5,
  "filePath": "invoices/invoice-2024-001.pdf",
  "fileName": "invoice-2024-001.pdf"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "AI agent processing initiated",
  "manifest": {
    "fileUrl": "https://storage.blob.core.windows.net/.../invoice.pdf?sv=...",
    "fileName": "invoice-2024-001.pdf",
    "filePath": "invoices/invoice-2024-001.pdf",
    "resultPath": "aiagent_results/invoice-2024-001_invoiceparser_20240116_170530.json",
    "agentName": "Invoice Parser",
    "timestamp": "2024-01-16T17:05:30Z"
  }
}</code></pre>

      <hr/>
      
      <h2>PGP Key Management APIs</h2>
      <p>PGP key management enables secure file encryption and decryption using OpenPGP standards. Organizations can manage their own keys (with private key storage) and partner public keys.</p>
      
      <h3>51. List PGP Keys</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/pgp-keys</code></p>
      <p><strong>Description:</strong> Retrieves all PGP keys for the current user's organizations.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>PGP_KEY_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Query Parameters:</strong></p>
      <ul>
        <li><code>organizationId</code> (integer, optional) - Filter by organization</li>
        <li><code>keyType</code> (string, optional) - Filter by "own" or "partner"</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>[
  {
    "id": 1,
    "name": "Production Key",
    "keyType": "own",
    "email": "security@example.com",
    "fingerprint": "ABCD1234...",
    "organizationId": 5,
    "createdAt": "2024-01-10T10:00:00Z",
    "expiresAt": "2025-01-10T10:00:00Z"
  }
]</code></pre>

      <h3>52. Generate PGP Key</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/pgp-keys/generate</code></p>
      <p><strong>Description:</strong> Generates a new PGP key pair for the organization.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>PGP_KEY_MANAGEMENT.ADD</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "name": "New Production Key",
  "email": "security@example.com",
  "passphrase": "secure-passphrase",
  "expirationDays": 365
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "id": 2,
  "name": "New Production Key",
  "fingerprint": "EFGH5678...",
  "publicKey": "-----BEGIN PGP PUBLIC KEY BLOCK-----...",
  "message": "PGP key generated successfully"
}</code></pre>

      <h3>53. Import PGP Key</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/pgp-keys/import</code></p>
      <p><strong>Description:</strong> Imports an existing PGP public key (for partners) or key pair (for own keys).</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>PGP_KEY_MANAGEMENT.ADD</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "name": "Partner Key",
  "keyType": "partner",
  "publicKey": "-----BEGIN PGP PUBLIC KEY BLOCK-----..."
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "id": 3,
  "name": "Partner Key",
  "fingerprint": "IJKL9012...",
  "message": "PGP key imported successfully"
}</code></pre>

      <h3>54. Delete PGP Key</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/pgp-keys/:id</code></p>
      <p><strong>Description:</strong> Permanently deletes a PGP key.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>PGP_KEY_MANAGEMENT.DELETE</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "PGP key deleted successfully"
}</code></pre>

      <h3>55. Encrypt File</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/pgp/encrypt</code></p>
      <p><strong>Description:</strong> Encrypts a file using the specified PGP public key.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FILE_MANAGEMENT.ENCRYPT</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "filePath": "documents/sensitive.pdf",
  "keyId": 1,
  "outputPath": "documents/sensitive.pdf.gpg"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "File encrypted successfully",
  "outputPath": "documents/sensitive.pdf.gpg"
}</code></pre>

      <h3>56. Decrypt File</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/pgp/decrypt</code></p>
      <p><strong>Description:</strong> Decrypts a PGP-encrypted file using the organization's private key.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FILE_MANAGEMENT.DECRYPT</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "filePath": "documents/sensitive.pdf.gpg",
  "keyId": 1,
  "passphrase": "secure-passphrase"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "File decrypted successfully",
  "outputPath": "decrypted/documents/sensitive.pdf"
}</code></pre>

      <hr/>
      
      <h2>Content Understanding APIs</h2>
      <p>Content Understanding uses Azure AI to analyze files and extract structured information. It supports both synchronous analysis (images) and asynchronous analysis (documents, audio, video) with automatic result persistence.</p>
      
      <h3>57. Run Synchronous Content Analysis</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/content-understanding/analyze</code></p>
      <p><strong>Description:</strong> Initiates synchronous AI content analysis on image files. Results are returned immediately.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>CONTENT_UNDERSTANDING.RUN_ANALYSIS</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "sasUrl": "https://storage.blob.core.windows.net/...",
  "foundryResourceName": "my-foundry-resource",
  "organizationId": 5,
  "analyzerId": "prebuilt-layout"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "success": true,
  "result": {
    "contents": [...],
    "fields": {...}
  }
}</code></pre>

      <h3>58. Submit Async Analysis Job</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/cu/jobs/submit</code></p>
      <p><strong>Description:</strong> Submits an asynchronous analysis job for documents, audio, or video files. The job is processed in the background and results are auto-saved upon completion.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>CONTENT_UNDERSTANDING.RUN_ANALYSIS</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "sasUrl": "https://storage.blob.core.windows.net/...",
  "foundryResourceName": "my-foundry-resource",
  "organizationId": 5,
  "sourceFilePath": "invoices/invoice-001.pdf",
  "storageAccountName": "mystorageaccount",
  "containerName": "mycontainer",
  "analyzerId": "prebuilt-tax.us",
  "contentType": "document"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "success": true,
  "jobId": "2446705d-b97b-4bce-b861-d7567daaadef",
  "message": "Analysis job submitted"
}</code></pre>

      <h3>59. Check Async Job Status</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/cu/jobs/:jobId/status</code></p>
      <p><strong>Description:</strong> Checks the status of an async analysis job. When the job has succeeded, the response includes the analysis result if available.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "status": "succeeded",
  "result": { ... },
  "resultPath": "cu_folder/invoices/invoice-001.pdf_cu_result_20260218_095830_001.json"
}</code></pre>
      <p><strong>Possible status values:</strong> <code>submitted</code>, <code>running</code>, <code>succeeded</code>, <code>failed</code>, <code>cancelled</code></p>

      <h3>60. Save CU Result (Manual)</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/cu/results/save</code></p>
      <p><strong>Description:</strong> Manually saves content understanding analysis results as a JSON file. Used for synchronous (image) analysis where auto-save does not apply.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>CONTENT_UNDERSTANDING.SAVE_RESULT</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "sourceFilePath": "invoices/invoice-001.pdf",
  "analysisResult": { ... }
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "success": true,
  "resultNumber": 1,
  "blobPath": "cu_folder/invoices/invoice-001.pdf_cu_result_20260218_095830_001.json"
}</code></pre>

      <h3>61. List CU Results</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/cu/results/list</code></p>
      <p><strong>Description:</strong> Lists all saved content understanding results for a source file, including both auto-saved and manually saved results.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>CONTENT_UNDERSTANDING.VIEW</code></p>
      
      <p><strong>Query Parameters:</strong></p>
      <ul>
        <li><code>organizationId</code> (integer, required) - Organization ID</li>
        <li><code>sourceFilePath</code> (string, required) - Path to the source file</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "success": true,
  "results": [
    {
      "blobPath": "cu_folder/invoices/invoice-001.pdf_cu_result_20260218_095830_001.json",
      "blobName": "invoice-001.pdf_cu_result_20260218_095830_001.json",
      "resultNumber": 1,
      "createdAt": "2026-02-18T09:58:30.000Z",
      "size": 4523,
      "metadata": {
        "analyzedby": "system-background-worker",
        "createdat": "2026-02-18T09:58:30.000Z"
      }
    }
  ],
  "count": 1
}</code></pre>

      <h3>62. Get CU Result</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/cu/results/get</code></p>
      <p><strong>Description:</strong> Retrieves the full content of a specific saved CU result.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>CONTENT_UNDERSTANDING.VIEW</code></p>
      
      <p><strong>Query Parameters:</strong></p>
      <ul>
        <li><code>organizationId</code> (integer, required) - Organization ID</li>
        <li><code>blobPath</code> (string, required) - Blob path of the saved result</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "success": true,
  "result": {
    "sourceFilePath": "invoices/invoice-001.pdf",
    "sourceFileName": "invoice-001.pdf",
    "organizationId": 5,
    "analyzedBy": "system-background-worker",
    "createdAt": "2026-02-18T09:58:30.000Z",
    "resultNumber": 1,
    "saveMode": "auto",
    "analysisResult": { ... }
  }
}</code></pre>

      <h3>63. Delete CU Result</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/cu/results/delete</code></p>
      <p><strong>Description:</strong> Deletes a specific content understanding result file.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>CONTENT_UNDERSTANDING.DELETE_RESULT</code></p>
      
      <p><strong>Query Parameters:</strong></p>
      <ul>
        <li><code>organizationId</code> (integer, required) - Organization ID</li>
        <li><code>blobPath</code> (string, required) - Blob path of the result to delete</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "success": true,
  "message": "Result deleted successfully"
}</code></pre>

      <hr/>
      
      <h2>Document Translation APIs</h2>
      <p>Document Translation uses Azure AI Translator to translate documents while preserving formatting. Supports 135+ languages.</p>
      
      <h3>61. Translate Document</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/document-translation/translate</code></p>
      <p><strong>Description:</strong> Translates a document to the specified target language.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>DOCUMENT_TRANSLATION.RUN</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "sourceFilePath": "documents/contract.pdf",
  "targetLanguage": "es"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "success": true,
  "translatedFilePath": "documents/contract_es.pdf",
  "sourceLanguage": "en",
  "targetLanguage": "es"
}</code></pre>

      <h3>62. List Translated Documents</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/document-translation/translations</code></p>
      <p><strong>Description:</strong> Lists all translated versions of a document.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>DOCUMENT_TRANSLATION.VIEW</code></p>
      
      <p><strong>Query Parameters:</strong></p>
      <ul>
        <li><code>organizationId</code> (integer, required) - Organization ID</li>
        <li><code>sourceFilePath</code> (string, required) - Path to the source file</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "translations": [
    {
      "language": "es",
      "languageName": "Spanish",
      "filePath": "documents/contract_es.pdf",
      "createdAt": "2024-01-16T14:00:00Z"
    }
  ]
}</code></pre>

      <h3>63. Delete Translation</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/document-translation/translations</code></p>
      <p><strong>Description:</strong> Deletes a translated document.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>DOCUMENT_TRANSLATION.DELETE</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "translatedFilePath": "documents/contract_es.pdf"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Translation deleted successfully"
}</code></pre>

      <hr/>
      
      <h2>Data Lifecycle Management APIs</h2>
      <p>Data Lifecycle Management automates storage tier transitions and blob deletion based on age-based policies.</p>
      
      <h3>64. List Lifecycle Rules</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/data-lifecycle/rules</code></p>
      <p><strong>Description:</strong> Lists all lifecycle rules for accessible storage accounts.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>DATA_LIFECYCLE.VIEW</code></p>
      
      <p><strong>Query Parameters:</strong></p>
      <ul>
        <li><code>storageAccountName</code> (string, optional) - Filter by storage account</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>[
  {
    "storageAccountName": "acmestorage",
    "rules": [
      {
        "name": "archive-old-logs",
        "enabled": true,
        "prefixMatch": ["logs/"],
        "actions": [
          { "type": "TierToCool", "daysAfterModification": 30 },
          { "type": "TierToArchive", "daysAfterModification": 90 },
          { "type": "Delete", "daysAfterModification": 365 }
        ]
      }
    ]
  }
]</code></pre>

      <h3>65. Create Lifecycle Rule</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/data-lifecycle/configure</code></p>
      <p><strong>Description:</strong> Creates a new lifecycle management rule for a storage account.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>DATA_LIFECYCLE.CONFIGURE</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "storageAccountName": "acmestorage",
  "ruleName": "archive-old-logs",
  "prefixMatch": ["logs/"],
  "actions": [
    { "type": "TierToCool", "daysAfterModification": 30 },
    { "type": "TierToArchive", "daysAfterModification": 90 },
    { "type": "Delete", "daysAfterModification": 365 }
  ]
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "message": "Lifecycle rule created successfully",
  "ruleName": "archive-old-logs"
}</code></pre>

      <h3>66. Delete Lifecycle Rule</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/data-lifecycle/rule</code></p>
      <p><strong>Description:</strong> Deletes a lifecycle management rule.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>DATA_LIFECYCLE.DELETE</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "storageAccountName": "acmestorage",
  "ruleName": "archive-old-logs"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Lifecycle rule deleted successfully"
}</code></pre>

      <hr/>
      
      <h2>SIEM/Sentinel APIs</h2>
      <p>Microsoft Sentinel integration provides SIEM-based security monitoring with predefined Zapper detection rules.</p>
      
      <h3>67. Get Rules Catalog</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/sentinel/rules/catalog</code></p>
      <p><strong>Description:</strong> Retrieves the catalog of available Zapper detection rules.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SIEM_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "rules": [
    {
      "id": "zapper-pgp-decryption-failed",
      "name": "PGP Decryption Failed",
      "description": "Detects failed PGP decryption attempts",
      "severity": "Medium",
      "installed": false
    }
  ]
}</code></pre>

      <h3>68. Install Sentinel Rule</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/sentinel/rules/install</code></p>
      <p><strong>Description:</strong> Installs a Zapper detection rule into Microsoft Sentinel.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SIEM_MANAGEMENT.INSTALL</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "ruleId": "zapper-pgp-decryption-failed"
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "message": "Rule installed successfully",
  "ruleId": "zapper-pgp-decryption-failed",
  "sentinelRuleId": "abc123..."
}</code></pre>

      <h3>69. List Installed Rules</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/sentinel/rules/installed</code></p>
      <p><strong>Description:</strong> Lists all Zapper rules currently installed in Sentinel.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SIEM_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "rules": [
    {
      "ruleId": "zapper-pgp-decryption-failed",
      "sentinelRuleId": "abc123...",
      "name": "PGP Decryption Failed",
      "enabled": true,
      "installedAt": "2024-01-15T10:00:00Z"
    }
  ]
}</code></pre>

      <h3>70. Enable Sentinel Rule</h3>
      <p><strong>Endpoint:</strong> <code>PATCH /api/sentinel/rules/:ruleId/enable</code></p>
      <p><strong>Description:</strong> Enables a disabled Sentinel rule.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SIEM_MANAGEMENT.ENABLE_DISABLE</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Rule enabled successfully"
}</code></pre>

      <h3>71. Disable Sentinel Rule</h3>
      <p><strong>Endpoint:</strong> <code>PATCH /api/sentinel/rules/:ruleId/disable</code></p>
      <p><strong>Description:</strong> Disables an active Sentinel rule without deleting it.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SIEM_MANAGEMENT.ENABLE_DISABLE</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Rule disabled successfully"
}</code></pre>

      <h3>72. Delete Sentinel Rule</h3>
      <p><strong>Endpoint:</strong> <code>DELETE /api/sentinel/rules/:ruleId</code></p>
      <p><strong>Description:</strong> Uninstalls a Zapper rule from Microsoft Sentinel.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SIEM_MANAGEMENT.DELETE</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "Rule deleted successfully"
}</code></pre>

      <h3>73. List Sentinel Incidents</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/sentinel/incidents</code></p>
      <p><strong>Description:</strong> Lists security incidents from Microsoft Sentinel.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>SIEM_MANAGEMENT.INCIDENTS_VIEW</code></p>
      
      <p><strong>Query Parameters:</strong></p>
      <ul>
        <li><code>status</code> (string, optional) - Filter by status (New, Active, Closed)</li>
        <li><code>severity</code> (string, optional) - Filter by severity (High, Medium, Low, Informational)</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "incidents": [
    {
      "id": "incident-123",
      "title": "Multiple PGP Decryption Failures",
      "severity": "Medium",
      "status": "New",
      "createdAt": "2024-01-16T15:30:00Z"
    }
  ]
}</code></pre>

      <hr/>
      
      <h2>Foundry AI APIs</h2>
      <p>Azure AI Foundry provides AI agent management, vector stores, and chat functionality for intelligent document processing.</p>
      
      <h3>74. List Foundry Resources</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/foundry/resources</code></p>
      <p><strong>Description:</strong> Lists all Foundry resources accessible by the current user.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FOUNDRY_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>[
  {
    "id": 1,
    "name": "Production AI Hub",
    "hubName": "prod-ai-hub",
    "projectName": "document-processor",
    "organizationId": 5,
    "status": "active",
    "createdAt": "2024-01-10T10:00:00Z"
  }
]</code></pre>

      <h3>75. Create Foundry Resource</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/foundry/resources</code></p>
      <p><strong>Description:</strong> Creates a new Foundry resource configuration.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FOUNDRY_MANAGEMENT.ADD</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "organizationId": 5,
  "name": "New AI Hub",
  "resourceGroup": "rg-ai-prod",
  "location": "eastus"
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "id": 2,
  "name": "New AI Hub",
  "status": "pending",
  "message": "Resource created, provisioning in progress"
}</code></pre>

      <h3>76. Create Foundry Hub</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/foundry/hubs</code></p>
      <p><strong>Description:</strong> Creates an Azure AI Services hub for the Foundry resource.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FOUNDRY_MANAGEMENT.ADD</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "resourceId": 2,
  "hubName": "new-ai-hub",
  "resourceGroup": "rg-ai-prod",
  "location": "eastus"
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "message": "Hub created successfully",
  "hubName": "new-ai-hub"
}</code></pre>

      <h3>77. Create Foundry Project</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/foundry/projects</code></p>
      <p><strong>Description:</strong> Creates a project under an existing Foundry hub.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FOUNDRY_MANAGEMENT.ADD</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "resourceId": 2,
  "hubName": "new-ai-hub",
  "projectName": "doc-processor"
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "message": "Project created successfully",
  "projectName": "doc-processor"
}</code></pre>

      <h3>78. Create Vector Store</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/foundry/vector-stores</code></p>
      <p><strong>Description:</strong> Creates a vector store for document embeddings and search.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FOUNDRY_MANAGEMENT.ADD</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "resourceId": 2,
  "name": "document-vectors"
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "vectorStoreId": "vs_abc123",
  "name": "document-vectors",
  "message": "Vector store created successfully"
}</code></pre>

      <h3>79. Create Foundry Agent</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/foundry/agents</code></p>
      <p><strong>Description:</strong> Creates an AI agent with specified capabilities.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FOUNDRY_MANAGEMENT.ADD</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "resourceId": 2,
  "name": "Document Analyst",
  "instructions": "Analyze documents and extract key information",
  "vectorStoreId": "vs_abc123"
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "agentId": "agent_xyz789",
  "name": "Document Analyst",
  "message": "Agent created successfully"
}</code></pre>

      <h3>80. Create Chat Thread</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/foundry/chat/threads</code></p>
      <p><strong>Description:</strong> Creates a new chat thread for agent interaction.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FOUNDRY_MANAGEMENT.CHAT</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "resourceId": 2,
  "agentId": "agent_xyz789"
}</code></pre>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "threadId": "thread_abc123",
  "message": "Chat thread created"
}</code></pre>

      <h3>81. Send Chat Message</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/foundry/chat/threads/:threadId/messages</code></p>
      <p><strong>Description:</strong> Sends a message to the chat thread and runs the agent.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FOUNDRY_MANAGEMENT.CHAT</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "resourceId": 2,
  "agentId": "agent_xyz789",
  "content": "Summarize the key points from the uploaded document"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "messageId": "msg_def456",
  "response": "Based on the document analysis, the key points are...",
  "citations": [...]
}</code></pre>

      <h3>82. Import File to Foundry</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/foundry/files/import</code></p>
      <p><strong>Description:</strong> Imports a file from storage to Foundry for AI processing.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>FOUNDRY_MANAGEMENT.IMPORT_FILE</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "resourceId": 2,
  "organizationId": 5,
  "filePath": "documents/report.pdf"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "fileId": "file_ghi789",
  "status": "uploaded",
  "message": "File imported successfully"
}</code></pre>

      <hr/>
      
      <h2>Customer-Managed Key (CMK) APIs</h2>
      <p>CMK encryption allows organizations to use their own Azure Key Vault keys for storage account encryption, providing full control over encryption keys.</p>
      
      <h3>83. List Key Vault Keys</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/keyvault/keys</code></p>
      <p><strong>Description:</strong> Lists available encryption keys from Azure Key Vault.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>STORAGE_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "keyVaultUrl": "https://myvault.vault.azure.net",
  "keys": [
    {
      "name": "storage-encryption-key",
      "id": "https://myvault.vault.azure.net/keys/storage-encryption-key/abc123",
      "enabled": true,
      "created": "2024-01-10T10:00:00Z"
    }
  ]
}</code></pre>

      <h3>84. Create Key Vault Key</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/keyvault/keys</code></p>
      <p><strong>Description:</strong> Creates a new RSA encryption key in Azure Key Vault.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>STORAGE_MANAGEMENT.ADD_CONTAINER</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "keyName": "new-storage-key",
  "keySize": 2048
}</code></pre>
      
      <p><strong>Validation Rules:</strong></p>
      <ul>
        <li><code>keyName</code> - Alphanumeric and hyphens only</li>
        <li><code>keySize</code> - 2048 or 4096 (default: 2048)</li>
      </ul>
      
      <p><strong>Response (201):</strong></p>
      <pre><code>{
  "name": "new-storage-key",
  "id": "https://myvault.vault.azure.net/keys/new-storage-key/def456",
  "keyUri": "https://myvault.vault.azure.net/keys/new-storage-key"
}</code></pre>

      <h3>85. Get CMK Status</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/storage-accounts/:storageAccountName/cmk</code></p>
      <p><strong>Description:</strong> Gets the current CMK encryption status for a storage account.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>STORAGE_MANAGEMENT.VIEW</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "storageAccountName": "acmestorage",
  "cmkEnabled": true,
  "keySource": "Microsoft.Keyvault",
  "cmkDetails": {
    "keyVaultUri": "https://myvault.vault.azure.net",
    "keyName": "storage-encryption-key",
    "keyVersion": "abc123"
  },
  "identity": "SystemAssigned",
  "identityPrincipalId": "12345678-..."
}</code></pre>

      <h3>86. Enable CMK Encryption</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/storage-accounts/:storageAccountName/cmk/enable</code></p>
      <p><strong>Description:</strong> Enables customer-managed key encryption on a storage account.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>STORAGE_MANAGEMENT.ADD_CONTAINER</code></p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "keyName": "storage-encryption-key",
  "keyVersion": "abc123"
}</code></pre>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "CMK encryption enabled successfully",
  "storageAccountName": "acmestorage",
  "keyName": "storage-encryption-key"
}</code></pre>

      <h3>87. Disable CMK Encryption</h3>
      <p><strong>Endpoint:</strong> <code>POST /api/storage-accounts/:storageAccountName/cmk/disable</code></p>
      <p><strong>Description:</strong> Reverts storage account encryption to Microsoft-managed keys.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>STORAGE_MANAGEMENT.ADD_CONTAINER</code></p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "message": "CMK encryption disabled, reverted to Microsoft-managed keys",
  "storageAccountName": "acmestorage"
}</code></pre>

      <hr/>
      
      <h2>Activity Log APIs</h2>
      
      <h3>38. Get Activity Logs</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/user-activities</code></p>
      <p><strong>Description:</strong> Retrieves audit trail of all system activities with filtering and pagination support.</p>
      <p><strong>Authentication:</strong> JWT token required</p>
      <p><strong>Required Permission:</strong> <code>ACTIVITY_LOGS.VIEW</code></p>
      
      <p><strong>Query Parameters:</strong></p>
      <ul>
        <li><code>limit</code> (integer, optional) - Number of records to return (default: 100, max: 1000)</li>
        <li><code>offset</code> (integer, optional) - Pagination offset (default: 0)</li>
        <li><code>userId</code> (integer, optional) - Filter by user ID</li>
        <li><code>action</code> (string, optional) - Filter by action type</li>
        <li><code>startDate</code> (ISO date, optional) - Filter from this date</li>
        <li><code>endDate</code> (ISO date, optional) - Filter to this date</li>
      </ul>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "total": 1543,
  "activities": [
    {
      "id": 9876,
      "userId": 123,
      "userEmail": "user@example.com",
      "action": "FILE_UPLOAD",
      "details": "Uploaded report.pdf to /documents",
      "organizationId": 5,
      "ipAddress": "203.0.113.45",
      "timestamp": "2024-01-16T17:10:00Z"
    }
  ]
}</code></pre>

      <hr/>
      
      <h2>Configuration APIs</h2>
      
      <h3>39. Get MSAL Configuration</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/config</code></p>
      <p><strong>Description:</strong> Retrieves Microsoft Authentication Library (MSAL) configuration for frontend initialization.</p>
      <p><strong>Authentication:</strong> None required (public endpoint)</p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "clientId": "abc123-def456-...",
  "authority": "https://login.microsoftonline.com/tenant-id",
  "redirectUri": "https://your-zapper-instance.com/auth/callback",
  "cacheLocation": "localStorage",
  "loggingLevel": 3
}</code></pre>

      <h3>40. Get Upload Configuration</h3>
      <p><strong>Endpoint:</strong> <code>GET /api/config/upload</code></p>
      <p><strong>Description:</strong> Retrieves upload limits and configuration settings.</p>
      <p><strong>Authentication:</strong> None required (public endpoint)</p>
      
      <p><strong>Response (200):</strong></p>
      <pre><code>{
  "maxFileCount": 1000,
  "maxUploadSizeGB": 15,
  "chunkSizeMB": 4,
  "uploadConcurrency": 4,
  "maxRetries": 3,
  "fileUploadMode": "sas"
}</code></pre>

      <hr/>
      
      <h2>Best Practices</h2>
      
      <h3>Rate Limiting</h3>
      <p>While Zapper does not enforce strict rate limits, avoid making more than 100 requests per second to prevent performance degradation.</p>
      
      <h3>Error Handling</h3>
      <p>Always check the HTTP status code before parsing the response body. Implement exponential backoff for 429 (Too Many Requests) and 500-series errors.</p>
      
      <h3>Security</h3>
      <ul>
        <li>Never expose JWT tokens in URLs or logs</li>
        <li>Rotate tokens regularly by re-authenticating</li>
        <li>Use HTTPS for all API calls</li>
        <li>Validate organization IDs to prevent IDOR attacks</li>
        <li>Log all API calls for audit purposes</li>
      </ul>
      
      <h3>Performance Optimization</h3>
      <ul>
        <li>Use bulk operations (bulk download) instead of individual file downloads</li>
        <li>Implement client-side caching for configuration endpoints</li>
        <li>Use direct SAS uploads for large files instead of proxy uploads</li>
        <li>Filter activity logs with specific date ranges to reduce payload size</li>
      </ul>
      
      <h3>Pagination</h3>
      <p>For endpoints that return lists (users, organizations, activity logs), use limit and offset parameters to paginate through large result sets efficiently.</p>
      
      <h2>SDK and Code Examples</h2>
      
      <h3>JavaScript/TypeScript Example</h3>
      <pre><code>// Authentication with JWT token
const token = 'your_jwt_token_here';

// List all users
const response = await fetch('https://your-zapper.com/api/users', {
  headers: {
    'Authorization': \`Bearer \${token}\`,
    'Content-Type': 'application/json'
  }
});

const users = await response.json();
console.log(users);

// Create a new organization
const newOrg = await fetch('https://your-zapper.com/api/organizations', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${token}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'New Partner',
    description: 'Partner organization'
  })
});

const orgData = await newOrg.json();
console.log('Created organization:', orgData);
</code></pre>

      <h3>Python Example</h3>
      <pre><code>import requests

# Configuration
BASE_URL = 'https://your-zapper.com/api'
TOKEN = 'your_jwt_token_here'

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Content-Type': 'application/json'
}

# List AI agents
response = requests.get(f'{BASE_URL}/ai-agents', headers=headers)
agents = response.json()
print(f'Found {len(agents)} AI agents')

# Create a new role
new_role = {
    'name': 'Data Analyst',
    'description': 'Read-only access to files and reports',
    'permissions': {
        'fileManagement': {
            'viewFiles': True,
            'downloadFile': True,
            'uploadFile': False
        }
    }
}

response = requests.post(
    f'{BASE_URL}/roles',
    headers=headers,
    json=new_role
)

if response.status_code == 201:
    print('Role created successfully')
else:
    print(f'Error: {response.json()}')
</code></pre>

      <h3>cURL Example</h3>
      <pre><code># Get current user profile
curl -X GET "https://your-zapper.com/api/me" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Upload a file
curl -X POST "https://your-zapper.com/api/files/upload-file" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -F "file=@/path/to/document.pdf" \\
  -F "organizationId=5" \\
  -F "targetPath=uploads/"

# Download file
curl -X GET "https://your-zapper.com/api/files/download?organizationId=5&filePath=uploads/document.pdf" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
</code></pre>

      <hr/>
      
      <h2>Support and Contact</h2>
      <p>For API support, technical issues, or feature requests:</p>
      <ul>
        <li>Review the troubleshooting section in the help center</li>
        <li>Check activity logs for detailed error messages</li>
        <li>Contact your system administrator for access or permission issues</li>
        <li>For API bugs, include the full error response and request details</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support", "user"]
  },
  {
    id: "20",
    title: "Customer Onboarding",
    slug: "customer-onboarding",
    html: `
      <h1>Customer Onboarding</h1>
      <p>The Customer Onboarding module enables bulk import of customers, users, storage accounts, and SFTP configurations through a streamlined CSV upload wizard. This feature is designed for administrators who need to rapidly onboard multiple partner organizations and their users.</p>
      
      <h2>Overview</h2>
      <p>Customer Onboarding provides a 5-step wizard interface for:</p>
      <ul>
        <li><strong>Bulk Customer Import</strong> - Create multiple partner organizations in a single operation</li>
        <li><strong>User Provisioning</strong> - Add users with role assignments across organizations</li>
        <li><strong>Storage Account Setup</strong> - Configure Azure storage accounts for each organization</li>
        <li><strong>SFTP Configuration</strong> - Automatically provision SFTP local users for file transfer</li>
        <li><strong>Validation & Review</strong> - Real-time CSV validation with error reporting</li>
      </ul>
      
      <h2>Accessing Customer Onboarding</h2>
      <p>Navigate to <strong>Customer Onboarding</strong> in the sidebar. You must have the appropriate permissions to access this feature:</p>
      <ul>
        <li><strong>View</strong> - See existing onboarding history and status</li>
        <li><strong>Upload</strong> - Upload CSV files for processing</li>
        <li><strong>Commit</strong> - Execute the onboarding operation</li>
        <li><strong>Delete</strong> - Remove pending onboarding records</li>
      </ul>
      
      <h2>CSV File Format</h2>
      <p>The onboarding CSV must include specific columns for each entity type:</p>
      
      <h3>Customer/Organization Columns</h3>
      <ul>
        <li><code>organization_name</code> - Unique name for the partner organization</li>
      </ul>
      
      <h3>User Columns</h3>
      <ul>
        <li><code>user_email</code> - User's email address </li>
        <li><code>role_name</code> - Role to assign (must exist in system)</li>
      </ul>
      
      <h3>Storage Account Columns</h3>
      <ul>
        <li><code>storage_account_name</code> - Azure storage account name</li>
        <li><code>container_name</code> - Blob container name</li>
        <li><code>resource_group</code> - Azure resource group</li>
        <li><code>location</code> - Azure region (e.g., eastus, westeurope)</li>
      </ul>
      
      <h3>SFTP Configuration Columns</h3>
      <ul>
        <li><code>sftp_username</code> - SFTP local user name</li>
        <li><code>sftp_permissions</code> - Permission scope (read, write, list, delete,create)</li>
      </ul>
      
      <h2>The 5-Step Wizard</h2>
      
      <h3>Step 1: Upload CSV</h3>
      <p>Upload your prepared CSV file. The system validates the file format and column headers immediately.</p>
      
      <h3>Step 2: Data Validation</h3>
      <p>The system validates each row for:</p>
      <ul>
        <li>Required fields are present</li>
        <li>Email formats are valid</li>
        <li>Referenced roles exist</li>
        <li>Storage account names follow Azure naming rules</li>
        <li>No duplicate entries</li>
      </ul>
      <p>Errors are displayed with row numbers and specific field issues.</p>
      
      <h3>Step 3: Preview Changes</h3>
      <p>Review all entities that will be created:</p>
      <ul>
        <li>New organizations to create</li>
        <li>Users to add with their role assignments</li>
        <li>Storage accounts to configure</li>
        <li>SFTP users to provision</li>
      </ul>
      
      <h3>Step 4: Confirm & Execute</h3>
      <p>Click <strong>Commit</strong> to execute the onboarding. Progress is shown in real-time with success/failure status for each entity.</p>
      
      <h3>Step 5: Results Summary</h3>
      <p>View the final results showing:</p>
      <ul>
        <li>Total entities created</li>
        <li>Any failures with error details</li>
        <li>Activity log entries for audit trail</li>
      </ul>
      
      <h2>Error Handling</h2>
      <p>If errors occur during processing:</p>
      <ul>
        <li><strong>Validation Errors</strong> - Fix the CSV and re-upload</li>
        <li><strong>Partial Failures</strong> - Successfully created entities remain; fix and retry failed items</li>
        <li><strong>Rollback</strong> - Use the delete option to clean up partial imports</li>
      </ul>
      
      <h2>Best Practices</h2>
      <ul>
        <li>Start with a small test CSV to verify format</li>
        <li>Ensure all referenced roles exist before importing</li>
        <li>Review validation errors carefully before committing</li>
      </ul>
      
      <h2>Activity Logging</h2>
      <p>All onboarding operations are logged with these action types:</p>
      <ul>
        <li><code>CUSTOMER_ONBOARDING_UPLOAD</code> - CSV file uploaded</li>
        <li><code>CUSTOMER_ONBOARDING_VALIDATE</code> - Validation completed</li>
        <li><code>CUSTOMER_ONBOARDING_COMMIT</code> - Onboarding executed</li>
        <li><code>CUSTOMER_ONBOARDING_DELETE</code> - Records deleted</li>
      </ul>
      
      <h2>Required Permissions</h2>
      <p>Customer Onboarding requires these role permissions:</p>
      <ul>
        <li><strong>CUSTOMER_ONBOARDING.VIEW</strong> - View onboarding interface</li>
        <li><strong>CUSTOMER_ONBOARDING.UPLOAD</strong> - Upload CSV files</li>
        <li><strong>CUSTOMER_ONBOARDING.COMMIT</strong> - Execute onboarding</li>
        <li><strong>CUSTOMER_ONBOARDING.DELETE</strong> - Delete records</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support"]
  },
  {
    id: "20",
    title: "Transfer Reports",
    slug: "transfer-reports",
    html: `
      <h1>Transfer Reports</h1>
      <p>Transfer Reports provide comprehensive visibility into all file operations performed across your storage accounts. These reports help you track data movement, audit user activity, and ensure compliance with organizational policies.</p>
      
      <h2>Viewing Transfer Reports</h2>
      <p>Click <strong>Transfer Reports</strong> in the sidebar to access the reporting dashboard. The table displays a list of all file transfer activities, including uploads, downloads, and deletions.</p>
      
      <h2>Report Details</h2>
      <p>Each report entry includes the following information:</p>
      <ul>
        <li><strong>Operation Type</strong> - The type of transfer (Upload, Download, or Delete)</li>
        <li><strong>User</strong> - The email address of the user who performed the action</li>
        <li><strong>File Name</strong> - The name and path of the file or folder</li>
        <li><strong>Size</strong> - The size of the transferred data</li>
        <li><strong>Status</strong> - Whether the transfer was successful or encountered errors</li>
        <li><strong>Timestamp</strong> - The exact date and time of the operation</li>
      </ul>
      
      <h2>Filtering and Search</h2>
      <p>To find specific transfers, use the search bar at the top of the table. You can search by file name, user email, or operation type. You can also filter reports by date range or organization to narrow down the results.</p>
      
      <h2>Exporting Data</h2>
      <p>For external analysis or compliance audits, you can export transfer report data. Click the <strong>Download CSV</strong> button to generate a file containing the filtered report data for the selected period.</p>
      
      <h2>Required Permissions</h2>
      <p>Access to transfer reports is controlled by the following permissions:</p>
      <ul>
        <li><strong>VIEW_REPORTS</strong> - Ability to view the transfer report dashboard</li>
        <li><strong>VIEW_REPORT_DETAILS</strong> - Ability to see detailed information for individual transfers</li>
        <li><strong>DOWNLOAD_REPORTS</strong> - Ability to export report data to CSV</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support"]
  },
  {
    id: "21",
    title: "Answer Sheet Evaluation",
    slug: "answer-sheet-evaluation",
    html: `
      <h1>Answer Sheet Evaluation</h1>
      <p>Answer Sheet Evaluation is an AI-powered grading system that automatically assesses student answer sheets against a question paper and model answers. It supports batch submissions, detailed per-question scoring, manual reviewer overrides, and finalization — all within a structured workflow.</p>

      <h2>Overview</h2>
      <p>The Eval module is accessed by clicking <strong>Eval</strong> in the left sidebar. It contains two main tabs:</p>
      <ul>
        <li><strong>New Evaluation</strong> – Configure and submit answer sheets for grading</li>
        <li><strong>Results</strong> – View, review, and manage all submitted batches</li>
      </ul>

      <h2>New Evaluation Tab</h2>

      <h3>Step 1 — Exam Configuration</h3>
      <p>Before uploading answer sheets, configure the exam parameters:</p>
      <ul>
        <li><strong>AI Resource</strong> – Select the Foundry AI deployment that will perform the grading. This must be configured in the Foundry AI module first.</li>
        <li><strong>Question Paper</strong> – Provide the exam questions by either:
          <ul>
            <li>Uploading a PDF or document file using the file picker</li>
            <li>Typing or pasting the questions directly into the text area</li>
          </ul>
        </li>
        <li><strong>Standard Answers (Optional)</strong> – Provide model answers or a marking scheme to improve grading accuracy:
          <ul>
            <li>Upload a file containing the marking scheme</li>
            <li>Type the expected answers directly into the text area</li>
          </ul>
        </li>
      </ul>
      <p>Only one input method (file or text) can be active at a time for each field. Selecting a file will clear any typed text, and typing will clear any selected file.</p>

      <h3>Step 2 — Upload Answer Sheets</h3>
      <p>In the <strong>Answer Sheets</strong> panel, browse or navigate to the folder containing the student answer sheets:</p>
      <ol>
        <li>Use the breadcrumb path navigator to browse your storage folders</li>
        <li>Check the boxes next to individual answer sheet files to select them</li>
        <li>You can select up to <strong>50 sheets per batch</strong></li>
        <li>The selected count is shown at the top of the panel</li>
      </ol>
      <p>Answer sheets should be PDF, image, or document files containing handwritten or typed student responses.</p>

      <h3>Step 3 — Start Evaluation</h3>
      <p>Click <strong>Start Evaluation</strong> to submit the selected sheets. All sheets in the submission are grouped together as a single <strong>batch</strong> in the Results tab. A confirmation message will appear and the tab will automatically switch to Results.</p>

      <h2>Results Tab</h2>

      <h3>Batch View</h3>
      <p>All submissions are displayed as collapsible batch cards, grouped by submission. Each batch card shows:</p>
      <ul>
        <li><strong>Answer sheet count</strong> – Number of sheets in the batch</li>
        <li><strong>Question paper name</strong> – The file or text used as the exam paper</li>
        <li><strong>Submission date and time</strong></li>
        <li><strong>Status pills</strong> – Visual indicators for grading, done, failed, and finalized counts</li>
        <li><strong>Average score percentage</strong> – The mean score across all completed sheets in the batch</li>
      </ul>
      <p>Click a batch card to expand it and see the individual answer sheets within that batch.</p>

      <h3>Job Status Indicators</h3>
      <p>Each answer sheet (job) within a batch shows its current processing status:</p>
      <ul>
        <li><strong>Queued</strong> – Waiting to be picked up for processing</li>
        <li><strong>Running</strong> – Currently being graded by the AI</li>
        <li><strong>Completed</strong> – Grading finished successfully</li>
        <li><strong>Failed</strong> – An error occurred during grading</li>
      </ul>
      <p>When any jobs are actively grading, a <em>"Grading in progress…"</em> indicator appears in the page header and the results refresh automatically every few seconds.</p>

      <h3>Searching Results</h3>
      <p>Use the search bar at the top of the Results tab to filter batches by student name or file name. The batch list updates in real-time as you type. If no results match, a "No results match your search" message is shown.</p>

      <h2>Reviewing Graded Sheets</h2>
      <p>Once a sheet has been graded (status: Completed), a reviewer can open it for a detailed review:</p>
      <ol>
        <li>Expand the batch and click the <strong>Review</strong> button on the individual job row</li>
        <li>A full-screen review dialog opens with three panels:
          <ul>
            <li><strong>Left panel</strong> – The student's answer sheet (PDF or image preview)</li>
            <li><strong>Middle panel</strong> – The question paper for reference</li>
            <li><strong>Right panel</strong> – The AI-generated results, question by question</li>
          </ul>
        </li>
        <li>Each question shows the AI's awarded marks, maximum marks, status (correct/partial/incorrect), and feedback</li>
        <li>To override a mark, enter a new value in the <strong>Override</strong> field and optionally add a comment</li>
        <li>Click <strong>Save Review</strong> to persist all changes</li>
      </ol>

      <h3>Finalizing a Review</h3>
      <p>After reviewing and adjusting marks, click <strong>Finalize</strong> to mark the review as complete. Finalized sheets are locked and cannot be edited further. The status pill for that job changes to <strong>Finalized</strong>.</p>

      <h2>Exporting Results</h2>
      <p>To export results for a specific sheet, open its review dialog and click <strong>Export CSV</strong>. The exported file contains one row per question with the following columns:</p>
      <ul>
        <li>Student (file name)</li>
        <li>Question number</li>
        <li>Status (correct / partial / incorrect)</li>
        <li>Marks awarded</li>
        <li>Maximum marks</li>
        <li>AI feedback</li>
      </ul>

      <h2>Required Permissions</h2>
      <p>Access to the Answer Sheet Evaluation module is controlled by the following permissions, configurable in Roles &amp; Permissions:</p>
      <ul>
        <li><strong>Menu Visibility</strong> – Whether the Eval option appears in the sidebar</li>
        <li><strong>View</strong> – Ability to open the Eval page and see the Results tab</li>
        <li><strong>Run</strong> – Ability to submit new evaluations (access to the New Evaluation tab)</li>
        <li><strong>Review</strong> – Ability to open graded sheets and override marks</li>
        <li><strong>Finalize</strong> – Ability to lock a review as final</li>
      </ul>
      <p>Users without the <strong>Run</strong> permission will only see the Results tab. Users without <strong>Review</strong> permission can view results but cannot open the review dialog or change marks.</p>

      <h2>Tips for Best Results</h2>
      <ul>
        <li>Use high-quality scans or clear photographs for handwritten answer sheets — blurry images reduce grading accuracy</li>
        <li>Provide a detailed marking scheme in the Standard Answers field to guide the AI on partial credit</li>
        <li>Keep question papers concise and clearly numbered — the AI references question numbers when scoring</li>
        <li>Submit related sheets as a single batch so they appear grouped together in the Results tab</li>
        <li>Always finalize a review after making overrides so downstream reporting reflects the corrected marks</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support", "user"]
  }
];
