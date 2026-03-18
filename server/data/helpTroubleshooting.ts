import { HelpChapter } from "./helpUserGuide";

export const troubleshootingChapters: HelpChapter[] = [
  {
    id: "1",
    title: "Malware Scanning – Permission Error",
    slug: "malware-scanning-permission-error",
    html: `
      <h1>Malware Scanning – Permission Error</h1>
      <p>This error occurs when Zapper's service identity doesn't have sufficient permissions to enable malware scanning or read scan results from Microsoft Defender for Storage.</p>
      
      <h2>Common Causes</h2>
      <ul>
        <li><strong>Missing Azure RBAC Roles</strong> - The Zapper app's managed identity needs specific permissions on the storage account</li>
        <li><strong>Defender Not Enabled</strong> - Microsoft Defender for Storage must be enabled at the subscription level</li>
        <li><strong>Event Grid Setup Failure</strong> - Zapper couldn't create the Event Grid topic or subscription</li>
        <li><strong>Wrong Storage Account Type</strong> - Some features only work with Blob Storage, not ADLS Gen2</li>
      </ul>
      
      <h2>Required Azure Roles</h2>
      <p>To enable malware scanning, the Zapper managed identity needs these roles on the storage account:</p>
      <ul>
        <li><strong>Storage Blob Data Contributor</strong> - To read and write blob metadata (scan results)</li>
        <li><strong>Reader</strong> - To query storage account properties</li>
        <li><strong>Event Grid Contributor</strong> (on subscription or resource group) - To create Event Grid resources</li>
      </ul>
      
      <h2>How to Fix</h2>
      
      <h3>Step 1: Verify Defender is Enabled</h3>
      <ol>
        <li>Open the Azure Portal and navigate to <strong>Microsoft Defender for Cloud</strong></li>
        <li>Go to <strong>Environment settings</strong></li>
        <li>Select your subscription</li>
        <li>Under <strong>Defender plans</strong>, ensure <strong>Storage</strong> is set to <strong>On</strong></li>
        <li>If it's off, turn it on and wait a few minutes for activation</li>
      </ol>
      
      <h3>Step 2: Assign RBAC Roles to Zapper</h3>
      <ol>
        <li>Navigate to your <strong>Storage Account</strong> in the Azure Portal</li>
        <li>Click <strong>Access Control (IAM)</strong> in the left menu</li>
        <li>Click <strong>Add</strong> → <strong>Add role assignment</strong></li>
        <li>Select <strong>Storage Blob Data Contributor</strong></li>
        <li>Under <strong>Members</strong>, choose <strong>Managed identity</strong></li>
        <li>Find and select your Zapper web app's managed identity</li>
        <li>Click <strong>Review + assign</strong></li>
        <li>Repeat for the <strong>Reader</strong> role</li>
      </ol>
      
      <h3>Step 3: Verify Event Grid Permissions</h3>
      <ol>
        <li>Navigate to your <strong>Resource Group</strong> or <strong>Subscription</strong></li>
        <li>Go to <strong>Access Control (IAM)</strong></li>
        <li>Check if Zapper's managed identity has <strong>EventGrid Contributor</strong> role</li>
        <li>If not, add it following the steps above</li>
      </ol>
      
      <h3>Step 4: Re-enable Malware Scanning in Zapper</h3>
      <ol>
        <li>Return to Zapper and go to <strong>Data Protection</strong></li>
        <li>Click the edit icon next to the storage account</li>
        <li>Toggle <strong>Malware Scanning</strong> off, then back on</li>
        <li>Click <strong>Save Changes</strong></li>
        <li>Check for any error messages</li>
      </ol>
      
      <h3>Step 5: Test with EICAR</h3>
      <p>Upload an EICAR test file to verify scanning works:</p>
      <ol>
        <li>Create a text file with: <code>X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*</code></li>
        <li>Save as <code>eicar-test.txt</code></li>
        <li>Upload to Zapper</li>
        <li>Wait 10-30 seconds</li>
        <li>Refresh the file list</li>
        <li>The file should show a red "Malicious" badge</li>
      </ol>
      
      <h2>Still Not Working?</h2>
      <p>If the issue persists:</p>
      <ul>
        <li>Check <strong>Activity Logs</strong> in Zapper for detailed error messages</li>
        <li>Review Azure Event Grid topics in the Portal - look for a topic named like <code>zappermalwarescan-{storageaccount}</code></li>
        <li>Verify the storage account is in a supported region for Defender for Storage</li>
        <li>Ensure you're using a standard storage account (not premium or FileStorage)</li>
        <li>Contact your Azure administrator to verify subscription-level Defender settings</li>
      </ul>
      
      <h2>Prevention</h2>
      <p>To avoid this error in the future:</p>
      <ul>
        <li>Use Zapper's automatic provisioning feature - it assigns roles correctly</li>
        <li>Enable Defender for Storage at the subscription level before creating storage accounts</li>
        <li>Document which managed identity is used by Zapper and ensure it has broad Event Grid permissions</li>
        <li>Test malware scanning immediately after creating new storage accounts</li>
      </ul>
      
      <h2>Related Topics</h2>
      <ul>
        <li>Data Protection - How to configure protection features</li>
        <li>Storage Management - Provisioning new storage accounts</li>
        <li>Activity Logs - Finding detailed error messages</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support"]
  },
  {
    id: "2",
    title: "Storage Creation – Permission Error",
    slug: "storage-creation-permission-error",
    html: `
      <h1>Storage Creation – Permission Error</h1>
      <p>This error occurs when Zapper cannot create a new Azure storage account or container due to insufficient Azure permissions, invalid configuration, or Azure policy restrictions.</p>
      
      <h2>Common Causes</h2>
      <ul>
        <li><strong>Missing Azure RBAC Roles</strong> - Zapper's managed identity needs Contributor or Owner role</li>
        <li><strong>Invalid Storage Account Name</strong> - Name must be globally unique, 3-24 lowercase alphanumeric characters</li>
        <li><strong>Azure Policy Restrictions</strong> - Corporate policies may block certain regions, tiers, or naming patterns</li>
        <li><strong>Quota Limits</strong> - Subscription may have reached maximum storage accounts</li>
        <li><strong>Region Availability</strong> - Some regions may not support the requested features</li>
        <li><strong>Resource Group Locked</strong> - Resource group may have a delete or read-only lock</li>
      </ul>
      
      <h2>Required Azure Roles</h2>
      <p>To create storage accounts and containers, Zapper's managed identity needs:</p>
      <ul>
        <li><strong>Contributor</strong> role on the resource group (minimum)</li>
        <li><strong>Owner</strong> role on the resource group (recommended for full functionality)</li>
        <li>Or <strong>Storage Account Contributor</strong> role specifically</li>
      </ul>
      
      <h2>How to Fix</h2>
      
      <h3>Step 1: Verify Storage Account Name</h3>
      <p>Ensure your storage account name meets Azure requirements:</p>
      <ul>
        <li>3 to 24 characters</li>
        <li>Lowercase letters and numbers only (no hyphens, underscores, or special characters)</li>
        <li>Must be globally unique across all Azure subscriptions</li>
      </ul>
      <p><strong>Invalid:</strong> <code>MyStorage-123</code>, <code>storage_account</code>, <code>MYACCOUNT</code></p>
      <p><strong>Valid:</strong> <code>mycompanyfiles2025</code>, <code>zapperstore01</code>, <code>contosoblob</code></p>
      
      <h3>Step 2: Check Azure Permissions</h3>
      <ol>
        <li>Open the Azure Portal and navigate to your <strong>Resource Group</strong></li>
        <li>Click <strong>Access Control (IAM)</strong></li>
        <li>Click <strong>Check access</strong></li>
        <li>Search for your Zapper web app's managed identity</li>
        <li>Verify it has <strong>Contributor</strong> or <strong>Owner</strong> role</li>
      </ol>
      
      <h3>Step 3: Assign Contributor Role (If Missing)</h3>
      <ol>
        <li>In the Resource Group's IAM page, click <strong>Add</strong> → <strong>Add role assignment</strong></li>
        <li>Select <strong>Contributor</strong> role</li>
        <li>Under <strong>Members</strong>, choose <strong>Managed identity</strong></li>
        <li>Find and select your Zapper app's system-assigned or user-assigned managed identity</li>
        <li>Click <strong>Review + assign</strong></li>
        <li>Wait 1-2 minutes for the role to propagate</li>
      </ol>
      
      <h3>Step 4: Verify Container Name</h3>
      <p>Container names must follow these rules:</p>
      <ul>
        <li>3 to 63 characters</li>
        <li>Lowercase letters, numbers, and hyphens only</li>
        <li>Must start and end with a letter or number (not hyphen)</li>
        <li>No consecutive hyphens</li>
      </ul>
      <p><strong>Invalid:</strong> <code>My Container</code>, <code>-files</code>, <code>docs--backup</code></p>
      <p><strong>Valid:</strong> <code>files</code>, <code>backup-2025</code>, <code>company-documents</code></p>
      
      <h3>Step 5: Check Azure Policies</h3>
      <p>Your organization may have Azure policies that restrict storage creation:</p>
      <ol>
        <li>In the Azure Portal, go to <strong>Policy</strong></li>
        <li>Click <strong>Compliance</strong></li>
        <li>Filter by your subscription or resource group</li>
        <li>Look for policies related to <strong>Storage</strong> or <strong>Allowed locations</strong></li>
        <li>If a policy blocks storage creation, contact your Azure administrator</li>
      </ol>
      
      <h3>Step 6: Verify Region Availability</h3>
      <p>Some Azure regions may not support all storage features:</p>
      <ul>
        <li>Try a different region (e.g., East US, West Europe, Southeast Asia)</li>
        <li>Verify your subscription has access to the selected region</li>
        <li>Check Azure status page for any regional outages</li>
      </ul>
      
      <h3>Step 7: Check Subscription Quotas</h3>
      <ol>
        <li>In Azure Portal, navigate to <strong>Subscriptions</strong></li>
        <li>Select your subscription</li>
        <li>Click <strong>Usage + quotas</strong></li>
        <li>Search for <strong>Storage Accounts</strong></li>
        <li>Verify you haven't reached the maximum (default: 250 per region)</li>
        <li>If you're at the limit, delete unused storage accounts or request a quota increase</li>
      </ol>
      
      <h3>Step 8: Retry Storage Creation</h3>
      <ol>
        <li>Return to Zapper's <strong>Storage Management</strong> page</li>
        <li>Click <strong>Add Storage</strong></li>
        <li>Enter a unique storage account name</li>
        <li>Verify the container name is valid</li>
        <li>Select a supported region</li>
        <li>Click <strong>Create Storage</strong></li>
        <li>Monitor for error messages</li>
      </ol>
      
      <h2>Alternative: Use Existing Storage</h2>
      <p>If you can't create a new storage account, you can register an existing one:</p>
      <ol>
        <li>Create the storage account manually in the Azure Portal</li>
        <li>Ensure Zapper's managed identity has <strong>Storage Blob Data Contributor</strong> role on it</li>
        <li>In Zapper, click <strong>Add Storage</strong></li>
        <li>Enable <strong>Use existing storage account for container creation</strong></li>
        <li>Select your existing account from the dropdown</li>
        <li>Enter the container name (Zapper can create containers even if it can't create accounts)</li>
        <li>Click <strong>Create Storage</strong></li>
      </ol>
      
      <h2>Check Activity Logs for Details</h2>
      <p>Zapper logs all storage creation attempts. To see the exact error:</p>
      <ol>
        <li>Go to <strong>Activity Logs</strong> in Zapper</li>
        <li>Filter by <strong>Action Type</strong>: CREATE_STORAGE</li>
        <li>Look for entries with <strong>Status</strong>: Failure</li>
        <li>Click the entry to see the detailed error message</li>
        <li>The Azure error code will indicate the specific issue</li>
      </ol>
      
      <h2>Common Azure Error Codes</h2>
      <ul>
        <li><strong>AccountNameInvalid</strong> - Invalid storage account name format</li>
        <li><strong>StorageAccountAlreadyTaken</strong> - Name is already in use globally</li>
        <li><strong>AuthorizationFailed</strong> - Missing RBAC permissions</li>
        <li><strong>QuotaExceeded</strong> - Subscription storage account limit reached</li>
        <li><strong>LocationNotAvailableForResourceType</strong> - Region doesn't support storage accounts</li>
        <li><strong>ResourceGroupNotFound</strong> - Resource group doesn't exist</li>
      </ul>
      
      <h2>Prevention</h2>
      <p>To avoid this error in the future:</p>
      <ul>
        <li>Use Zapper's name validation - it checks names before submission</li>
        <li>Create a naming convention document for your team</li>
        <li>Assign Contributor role to Zapper's managed identity during initial setup</li>
        <li>Document any Azure policies that affect storage creation</li>
        <li>Keep a list of approved Azure regions for your organization</li>
      </ul>
      
      <h2>Related Topics</h2>
      <ul>
        <li>Storage Management - Complete guide to storage operations</li>
        <li>Data Protection - Configuring security features after creation</li>
        <li>Partner Organizations - Assigning storage to organizations</li>
        <li>Activity Logs - Finding detailed error messages</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support"]
  },
  {
    id: "3",
    title: "Answer Sheet Evaluation – Common Issues",
    slug: "eval-common-issues",
    html: `
      <h1>Answer Sheet Evaluation – Common Issues</h1>
      <p>This article covers the most frequently encountered issues when using the Answer Sheet Evaluation module and explains how to resolve them.</p>

      <h2>Issue: Evaluation Job Stuck in "Queued" State</h2>
      <p>A job that stays in <strong>Queued</strong> status for more than a few minutes has not been picked up for processing.</p>

      <h3>Possible Causes</h3>
      <ul>
        <li>The AI resource (Foundry deployment) is not configured or is unavailable</li>
        <li>The server's background polling service is not running</li>
        <li>The organization's Azure connection is not active</li>
      </ul>

      <h3>Steps to Resolve</h3>
      <ol>
        <li>Go to <strong>Foundry AI</strong> in the sidebar and verify the AI resource selected during submission is active and accessible</li>
        <li>Check your Azure credentials are configured correctly (contact your system administrator)</li>
        <li>Refresh the Results tab — if the job remains queued after 5 minutes, contact support with the job ID</li>
      </ol>

      <h2>Issue: Evaluation Job Shows "Failed" Status</h2>
      <p>A <strong>Failed</strong> status means the AI could not process the answer sheet successfully.</p>

      <h3>Common Reasons</h3>
      <ul>
        <li><strong>Unreadable file</strong> – The answer sheet file is corrupted, password-protected, or in an unsupported format</li>
        <li><strong>Empty or blank file</strong> – The uploaded file has no readable content</li>
        <li><strong>Question paper missing</strong> – No question paper was provided or it could not be read</li>
        <li><strong>AI resource quota exceeded</strong> – The Foundry AI deployment has hit its rate or token limit</li>
        <li><strong>File too large</strong> – Answer sheet files above the size limit cannot be processed</li>
      </ul>

      <h3>Steps to Resolve</h3>
      <ol>
        <li>Open the failed job row in the Results tab and check if an error message is displayed</li>
        <li>Verify the answer sheet file opens correctly on your local machine — re-scan or re-upload if it appears corrupted</li>
        <li>Ensure the question paper is provided and contains readable text</li>
        <li>Check the Foundry AI resource for quota or rate-limit errors in your Azure portal</li>
        <li>Re-submit the affected sheets as a new batch after resolving the issue</li>
      </ol>

      <h2>Issue: Grading Results Seem Inaccurate</h2>
      <p>The AI assigned incorrect marks or misinterpreted student answers.</p>

      <h3>Steps to Improve Accuracy</h3>
      <ol>
        <li><strong>Provide a marking scheme</strong> – Use the Standard Answers field to supply model answers and partial credit rules. The AI uses this to calibrate its scoring.</li>
        <li><strong>Improve scan quality</strong> – Ensure answer sheets are scanned at a high resolution (at least 300 DPI). Blurry or skewed images degrade recognition accuracy.</li>
        <li><strong>Number questions clearly</strong> – The AI maps answers to question numbers. If question numbers are unclear or missing, scores may be misassigned.</li>
        <li><strong>Use the Review workflow</strong> – Open the graded sheet in the Review dialog, adjust marks question-by-question, and finalize the review to lock in corrected scores.</li>
      </ol>

      <h2>Issue: "No AI Resource Available" When Starting Evaluation</h2>
      <p>The AI Resource dropdown shows no options or an error when you try to submit.</p>

      <h3>Steps to Resolve</h3>
      <ol>
        <li>Go to <strong>Foundry AI</strong> in the sidebar and confirm at least one deployment resource exists for your organization</li>
        <li>Verify you have permission to use Foundry AI resources (contact your administrator if the option is missing)</li>
        <li>If a resource exists but does not appear in Eval, refresh the page and try again</li>
      </ol>

      <h2>Issue: Cannot Open Review Dialog</h2>
      <p>The Review button is disabled or clicking it has no effect.</p>

      <h3>Steps to Resolve</h3>
      <ul>
        <li>Confirm the job status is <strong>Completed</strong> — reviews can only be opened for completed jobs, not queued, running, or failed ones</li>
        <li>Verify you have the <strong>Review</strong> permission assigned to your role (check with your administrator)</li>
        <li>If the job is completed and you have the permission, try refreshing the page</li>
      </ul>

      <h2>Issue: Cannot Finalize a Review</h2>
      <p>The Finalize button is grayed out or not visible.</p>

      <h3>Steps to Resolve</h3>
      <ul>
        <li>Ensure you have the <strong>Finalize</strong> permission — this is separate from the Review permission and must be explicitly granted</li>
        <li>Check that the review is not already finalized — once finalized, a sheet is locked and cannot be edited again</li>
      </ul>

      <h2>Related Topics</h2>
      <ul>
        <li>Answer Sheet Evaluation – User guide for the full workflow</li>
        <li>Foundry AI &amp; Chat Playground – Setting up AI resources</li>
        <li>Roles &amp; Permissions – Managing Eval permissions</li>
        <li>Activity Logs – Checking detailed error messages</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support"]
  },
  {
    id: "5",
    title: "Post-Call Analysis – Common Issues",
    slug: "post-call-analysis-common-issues",
    html: `
      <h1>Post-Call Analysis – Common Issues</h1>
      <p>Post-Call Intelligence Analysis relies on three components working together: a completed audio/video transcript, a configured Foundry AI agent, and Azure Blob Storage for caching results. Use the steps below to diagnose and resolve common issues.</p>

      <h2>Issue: Post-Call Tab Is Not Visible</h2>
      <p>The <strong>Post-Call</strong> tab does not appear in the Analysis Results panel after running audio/video analysis.</p>
      <h3>Steps to Resolve</h3>
      <ul>
        <li>The Post-Call tab only appears when the system detects the analysis result contains a call transcript. Ensure you have run analysis using an audio-capable analyzer such as <code>prebuilt-audio</code></li>
        <li>Verify the audio/video file was selected and analyzed successfully — the <strong>Complete</strong> badge must be visible next to "Analysis Results"</li>
        <li>Check that the file's modality is set to <strong>Audio</strong> or <strong>Video</strong> in the analyzer selector toolbar</li>
        <li>If the result was loaded from a previously saved result, ensure the saved result contains transcript content (speaker turns or VTT-formatted text)</li>
      </ul>

      <h2>Issue: "Run Post-Call Analysis" Button Has No Effect or Fails Immediately</h2>
      <p>Clicking the button produces no result or returns an error straight away.</p>
      <h3>Steps to Resolve</h3>
      <ul>
        <li>Confirm a Foundry AI agent has been configured for your organisation — navigate to <strong>Foundry Resources</strong> and verify a project with an active agent exists</li>
        <li>Check that the agent is assigned to the post-call analysis function in the Foundry Resource Set configuration</li>
        <li>Verify your role has the <strong>CONTENT_UNDERSTANDING.RUN_ANALYSIS</strong> permission — without it the request will be rejected</li>
        <li>Check the Activity Logs for a more detailed error message from the server</li>
      </ul>

      <h2>Issue: Analysis Times Out After 2 Minutes</h2>
      <p>The loading spinner runs for the full 2-minute limit and then shows a timeout error.</p>
      <h3>Steps to Resolve</h3>
      <ul>
        <li>Very long call recordings (over 60 minutes) may exceed the agent's response window — try breaking the recording into shorter segments if possible</li>
        <li>Check the Azure AI Foundry project and agent for quota or throttling limits — high concurrent usage can cause delays</li>
        <li>Verify the agent is running and not in a degraded state in the Azure Portal</li>
        <li>Try re-running the analysis — transient network issues can cause single-attempt timeouts</li>
      </ul>

      <h2>Issue: Agent Returns Invalid JSON or Malformed Report</h2>
      <p>The analysis completes but the report is not displayed — an error like "Agent returned invalid JSON" appears.</p>
      <h3>Steps to Resolve</h3>
      <ul>
        <li>The AI agent's system prompt must instruct it to return a strictly structured JSON object. If the prompt has been modified, restore the standard post-call analysis prompt schema</li>
        <li>Ensure the agent model (GPT-4.1 or equivalent) supports structured JSON output and has not been swapped for a model without that capability</li>
        <li>Check if the transcript text was too long — extremely long transcripts may cause the agent to truncate or format its response incorrectly. Consider enabling a summarization step for very long calls</li>
        <li>Review the raw response in Activity Logs to identify what the agent returned</li>
      </ul>

      <h2>Issue: Cached Result Does Not Load When File Is Selected</h2>
      <p>A post-call analysis was previously run, but opening the same file shows the "Run Post-Call Analysis" prompt instead of the cached report.</p>
      <h3>Steps to Resolve</h3>
      <ul>
        <li>The cache lookup uses the exact blob path of the source file. If the file was moved or renamed after the analysis was saved, the cached result will not be found — re-run the analysis on the new path to create a fresh cache entry</li>
        <li>Confirm the file extension is in the supported audio/video list: <code>.mp3 .mp4 .wav .ogg .webm .m4a .aac .flac .mov .avi .mkv</code> — other extensions will not trigger the cache lookup</li>
        <li>Check that your role has the <strong>CONTENT_UNDERSTANDING.VIEW</strong> permission — without it the GET request for the cached result will be blocked</li>
        <li>If the storage account for your organisation was changed, old cache blobs in the previous account will no longer be accessible</li>
      </ul>

      <h2>Issue: Report Sections Are Empty or Missing</h2>
      <p>The report renders but some sections such as the QA Scorecard or Call Event Timeline are blank.</p>
      <h3>Steps to Resolve</h3>
      <ul>
        <li>Certain sections (like the timeline and risk flags) are only populated if the AI agent detects relevant events in the call. A short or low-complexity call may legitimately produce empty sections</li>
        <li>Check that the AI agent's prompt explicitly requests all sections. If the scorecard categories or timeline labels have been customised, ensure the JSON schema still includes the expected fields: <code>qa_scorecard</code>, <code>behaviors_detected</code>, <code>risk_flags</code>, <code>recommendations</code></li>
        <li>Verify the transcript text passed to the agent is complete and not truncated — open the <strong>Fields</strong> tab of the audio analysis to confirm all speaker turns are present</li>
      </ul>

      <h2>Issue: Fraud Alert Banner Appears Unexpectedly</h2>
      <p>A red Fraud Alert banner appears even though no fraud is suspected.</p>
      <h3>Steps to Resolve</h3>
      <ul>
        <li>The fraud detection is driven by the AI agent's assessment — certain phrasing patterns (e.g. strong sales pressure, urgent language, evasive responses) may trigger the flag even in legitimate calls</li>
        <li>Review the specific behaviours listed in the banner and assess whether the agent's interpretation is correct</li>
        <li>If the flag is consistently triggering incorrectly for your use case, adjust the AI agent's system prompt to refine the threshold for fraud detection</li>
      </ul>

      <h2>Related Topics</h2>
      <ul>
        <li>Content Understanding – Full guide including Post-Call Analysis setup</li>
        <li>Foundry AI &amp; Chat Playground – Configuring AI agents</li>
        <li>Roles &amp; Permissions – Managing Content Understanding permissions</li>
        <li>Activity Logs – Checking detailed server-side errors</li>
      </ul>
    `,
    allowedRoles: ["admin", "ops", "support"]
  }
];
