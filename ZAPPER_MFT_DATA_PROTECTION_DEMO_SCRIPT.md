# ZAPPER MFT - Data Protection Module
## Professional Video Demo Script

---

## OPENING SEQUENCE (0:00 - 0:20)

[TONE: Serious, security-focused, trust-building]

**NARRATOR:**

"Data in transit, data at rest—both need protection. Encryption, access controls, malware scanning, audit trails—these aren't optional features. They're the difference between a system you can trust and one that's a liability.

Zapper MFT's Data Protection module gives you complete visibility and control over how your data is protected. Let's explore what's possible."

---

## SECTION 1: THE DATA PROTECTION DASHBOARD (0:20 - 1:45)

[VISUAL: Show the Data Protection page with security status overview]

**NARRATOR:**

"When you open Data Protection, you see a comprehensive security dashboard.

At the top, there's a **security health score** — a real-time assessment of your overall protection posture. Are all files encrypted? Are access controls enforced? Are malware scans running? The score reflects these factors.

Below that, you see several security categories:

**Encryption status** — What percentage of your files are encrypted? Are any unencrypted files lurking in the system? Ideally, 100% are encrypted.

**Access control compliance** — Are all files respecting role-based access controls? Are there any files with overly broad permissions? This catches configuration drift.

**Malware scan status** — How many files have been scanned for malware? What's the health status? Any threats detected?

**Compliance coverage** — Which compliance frameworks are you aligned with? GDPR, HIPAA, SOX—are your security controls supporting these requirements?

**User authentication status** — Are all users authenticating with strong methods? Are there any accounts with default or weak credentials?

**Audit logging status** — Is logging enabled across all systems? What's the log retention policy?

This is your command center for security posture."

[PAUSE - 2 seconds]

[VISUAL: Show expanding each category to see details]

**NARRATOR:**

"When you click on any category, you drill down into details. 'Security: Encryption Status' shows you exactly which files are unencrypted, their size, location, and when they were last modified.

This granularity lets you identify and fix specific security gaps rather than guessing what might be wrong."

[PAUSE - 2 seconds]

---

## SECTION 2: ENCRYPTION AT REST (1:45 - 3:30)

[VISUAL: Show encryption configuration options]

**NARRATOR:**

"Encryption at rest means data stored in Azure is encrypted and unreadable without the decryption key.

Zapper supports two encryption approaches:

**First: Microsoft-managed encryption.**

Azure automatically encrypts all data using encryption keys managed by Microsoft. This is the default and is suitable for most use cases.

Advantages:
- **No key management burden** — Microsoft handles key rotation, backup, and security
- **Transparent** — You don't have to manage anything
- **FIPS 140-2 certified** — Meets government encryption standards
- **Included in cost** — No additional expense

Limitations:
- **You don't control the keys** — Microsoft does
- **Some compliance frameworks require customer-managed keys** — HIPAA, certain SOX implementations, and strict security policies often require this

**Second: Customer-managed encryption (Bring Your Own Key, or BYOK).**

You generate and manage your own encryption keys, stored in Azure Key Vault. Azure uses your keys to encrypt data.

Advantages:
- **You control the keys** — Full cryptographic control
- **Compliance requirement satisfaction** — HIPAA, SOX, PCI-DSS strict implementations require this
- **Revocation capability** — If a key is compromised, you can revoke it immediately
- **Audit visibility** — You can see who accessed keys and when

Disadvantages:
- **Key management responsibility** — You must secure, back up, and rotate keys
- **Additional cost** — Key Vault incurs charges
- **Complexity** — Requires more administration

When you enable BYOK, Zapper connects to your Azure Key Vault and uses your keys for all encryption. From that point forward, all new files are encrypted with your keys."

[PAUSE - 2 seconds]

[VISUAL: Show the BYOK configuration process]

**NARRATOR:**

"To enable BYOK, you:

1. Create an encryption key in Azure Key Vault
2. Grant Zapper's managed identity permission to use that key
3. Configure Zapper to use that key vault and key

From that moment, all new files are encrypted with your key. Existing files remain encrypted with Microsoft's key—you can migrate them gradually or leave them as-is.

Zapper tracks which encryption method was used for each file. You have complete visibility into your encryption landscape."

[PAUSE - 2 seconds]

---

## SECTION 3: ENCRYPTION IN TRANSIT (3:30 - 5:00)

[VISUAL: Show HTTPS/TLS configuration options]

**NARRATOR:**

"Encryption in transit means data moving between Zapper and Azure is encrypted and cannot be intercepted.

All Zapper connections use HTTPS with TLS (Transport Layer Security). This is the same encryption standard used by banks, government agencies, and security-sensitive organizations globally.

Important detail: When users upload files, data moves directly from their device to Azure storage using SAS (Shared Access Signature) tokens with HTTPS. Zapper doesn't proxy the data—it never has access to unencrypted content. This improves performance and security.

For downloads, users receive time-limited SAS URLs that give them direct access to Azure. They download directly from Azure using HTTPS. Again, Zapper is not in the middle, intercepting or potentially logging unencrypted data.

You can enforce HTTPS-only access at the storage account level. If anyone tries to access your storage using unencrypted HTTP, they're rejected. This prevents accidental exposure."

[PAUSE - 2 seconds]

[VISUAL: Show the HTTPS enforcement configuration]

**NARRATOR:**

"Configuring HTTPS-only is one click. From that point forward, all access requires encryption. No exceptions."

[PAUSE - 2 seconds]

---

## SECTION 4: MALWARE SCANNING & THREAT DETECTION (5:00 - 7:00)

[VISUAL: Show malware scanning status and threat detection dashboard]

**NARRATOR:**

"Files can contain malware—viruses, ransomware, trojans, worms. You upload what you think is a document, it's actually malicious code.

Zapper integrates with Microsoft Defender for Storage, which uses advanced threat detection to scan files for malware automatically.

Here's how it works:

When a file is uploaded to Zapper, Microsoft Defender scans it asynchronously. The scan happens in the background—it doesn't block the user's upload.

The scan identifies:

- **Known malware** — Signatures of viruses, trojans, ransomware from Microsoft's threat intelligence
- **Suspicious patterns** — Unusual code, obfuscation techniques, or executable behaviors
- **Zero-day threats** — Machine learning models that detect previously unknown malware patterns

Once the scan completes, a status is recorded:

- **Clean** — No threats detected
- **Suspicious** — Possible threat, requires investigation
- **Malicious** — Threat confirmed, file should be quarantined

In the Data Protection dashboard, you see malware scan status for all files. You can filter by threat level, see which files have threats, and take action."

[PAUSE - 2 seconds]

[VISUAL: Show a file with malware detected, options to quarantine or delete]

**NARRATOR:**

"When a threat is detected, you can:

- **Quarantine the file** — Move it to isolated storage, preventing access
- **Delete the file** — Permanently remove it
- **Notify users** — Alert the person who uploaded it
- **Block the uploader** — Prevent that user from uploading until reviewed
- **Investigate** — Download threat intelligence, understand what was found

This gives you options. Not all threats require deletion—maybe it's a false positive, or maybe you want to investigate before taking action."

[PAUSE - 2 seconds]

---

## SECTION 5: FILE INTEGRITY & HASH VERIFICATION (7:00 - 8:30)

[VISUAL: Show file hash and integrity information]

**NARRATOR:**

"How do you know a file hasn't been modified since upload? File hashing.

When a file is uploaded to Zapper, its cryptographic hash (SHA-256) is calculated and stored. A hash is a unique fingerprint—if even one byte of the file changes, the hash changes completely.

Later, if you want to verify the file hasn't been modified, you can recalculate its hash. If it matches the original, the file is unchanged. If it's different, something has modified the file.

This is crucial for:

- **Compliance verification** — Prove to auditors that files haven't been tampered with
- **Legal evidence** — In litigation, prove that documents are unchanged from when they were uploaded
- **Data integrity checks** — Detect corruption or accidental modification

In the Data Protection dashboard, you can see file hash information and verify file integrity. This is particularly important for files flagged with legal holds or subject to compliance requirements."

[PAUSE - 2 seconds]

---

## SECTION 6: ACCESS CONTROL & FILE PERMISSIONS (8:30 - 10:15)

[VISUAL: Show file-level access control interface]

**NARRATOR:**

"Encryption keeps data unreadable. But what if you want to prevent certain people from even accessing files in the first place?

That's where file-level access control comes in.

In Zapper, files can have explicit permissions separate from role-based access control. For example:

- Most people in Organization A can see all files in Organization A
- But a specific contract can be restricted to only the people working on that contract
- Or a confidential document can be restricted to executives only
- Or a user's personal folder can be private—only they can access it

These file-level permissions are enforceable and audited. If someone tries to access a file they don't have permission for, they're denied. The attempt is logged.

This is defense in depth. You have role-based access control (organization-level), and you have file-level access control. Both must grant permission."

[PAUSE - 2 seconds]

[VISUAL: Show setting file-level permissions on a specific file or folder]

**NARRATOR:**

"To set file-level permissions, you click on a file or folder, check the 'Restricted Access' box, and specify who can access it. You can grant access to specific users, groups, or roles.

These permissions are immediately enforced. Users without permission can't see the file or folder, even if they have organization-level access."

[PAUSE - 2 seconds]

---

## SECTION 7: DATA CLASSIFICATION & SENSITIVITY LABELS (10:15 - 12:00)

[VISUAL: Show data classification interface with sensitivity levels]

**NARRATOR:**

"Not all data is equally sensitive. A marketing brochure is less sensitive than a board meeting recording or a customer contract.

Zapper supports data classification—assigning sensitivity levels to files:

**Public** — Anyone can access. Marketing materials, public announcements, general information. No encryption required, broad access is fine.

**Internal** — Internal use only. Company policies, internal documentation, operational information. Accessible to all employees but not to partners or external users.

**Confidential** — Limited access. Strategic plans, financial data, legal documents. Accessible only to authorized personnel.

**Secret** — Maximum protection. Executive communications, acquisition targets, security vulnerabilities, executive compensation. Accessible only to a tiny group.

**Classified** — Government or regulatory classification. National security information, classified research. Special handling and storage requirements.

When you assign a sensitivity level to a file, Zapper enforces corresponding protections:

- **Public files** — Broader access, minimal restrictions
- **Confidential files** — Restricted access, mandatory encryption, intensive audit logging
- **Secret files** — Maximum encryption, minimal access, continuous monitoring
- **Classified files** — Special storage, special encryption, special audit requirements

The classification is visible to users so they understand how to handle files. A file labeled 'Secret' signals that it requires special care."

[PAUSE - 2 seconds]

[VISUAL: Show a file with a sensitivity label visible in the file browser]

**NARRATOR:**

"You can set default classifications for organizations or folders. All files in the Marketing folder default to Public. All files in the Legal folder default to Confidential. Users can override defaults if needed, but defaults set expectations.

This is how you embed security culture into the system. The classifications make sensitivity obvious."

[PAUSE - 2 seconds]

---

## SECTION 8: WATERMARKING & DLP (DATA LOSS PREVENTION) (12:00 - 13:45)

[VISUAL: Show watermarking and DLP features]

**NARRATOR:**

"Some organizations require watermarking—a visible or invisible mark on a file indicating its sensitivity or ownership.

Zapper can automatically apply watermarks to downloads. When a user downloads a confidential file, a watermark is applied: 'CONFIDENTIAL - Downloaded by john.smith@acme.com on 2025-11-23.' This discourages sharing because the recipient knows it came from a specific person.

Data Loss Prevention, or DLP, is a set of rules that prevent accidental or malicious data leakage:

**Rule 1: Prevent downloading outside your organization.**

Users in Organization A cannot download files to personal cloud storage (Dropbox, Google Drive, OneDrive). Files can only be accessed through Zapper.

**Rule 2: Prevent printing of sensitive files.**

Confidential and Secret files cannot be printed. This prevents physical documents from escaping the system.

**Rule 3: Prevent sharing outside the organization.**

Certain files cannot be shared with external users or sent to personal email addresses.

**Rule 4: Prevent copying to unencrypted devices.**

Files cannot be copied to devices without encryption enabled.

These rules are enforced at the application level. Users cannot bypass them. This prevents both accidental data loss (someone emails a file to their personal account) and malicious loss (someone stealing files to sell).

You configure DLP rules by sensitivity level and organization. Secret files have the strictest rules. Public files have the most permissive rules."

[PAUSE - 2 seconds]

---

## SECTION 9: COMPLIANCE FRAMEWORKS & MAPPING (13:45 - 15:30)

[VISUAL: Show compliance framework alignment status]

**NARRATOR:**

"Different industries have different security requirements. Zapper maps its security features to common compliance frameworks so you can understand your alignment:

**GDPR (General Data Protection Regulation).** European data protection. Key security requirements:
- Encryption for sensitive personal data
- Access control restricting data access
- Audit logging of all data access
- Data breach notification within 72 hours

Zapper enforces all of these. You have GDPR alignment.

**HIPAA (Health Insurance Portability and Accountability Act).** US healthcare. Key requirements:
- Encryption at rest and in transit
- Access control and audit logging
- Integrity verification (file hashing)
- Encryption keys in a separate, secure vault

Zapper with BYOK enabled fully supports HIPAA requirements.

**SOX (Sarbanes-Oxley Act).** US financial reporting. Key requirements:
- Encryption and access control for financial records
- Immutable audit logs
- Separation of duties
- Regular security assessments

Zapper enforcement prevents modification of financial records and logs every access.

**PCI-DSS (Payment Card Industry).** Credit card processing. Key requirements:
- Encryption for cardholder data
- Network segmentation
- Access control
- Regular security testing

Zapper protects cardholder data through encryption and access controls.

**FedRAMP (Federal Risk and Authorization Management Program).** US government cloud service requirements. Key requirements:
- FIPS 140-2 encryption
- Regular security assessments
- Authorized scanning
- Continuous monitoring

Zapper meets FedRAMP requirements.

For each compliance framework, Zapper shows you:
- Which security features align with the framework
- Which features still need configuration
- What gaps exist, if any

This takes compliance from an abstract concept to concrete, measurable security controls."

[PAUSE - 2 seconds]

[VISUAL: Show a compliance framework checklist with aligned and unaligned requirements]

**NARRATOR:**

"You can generate compliance reports showing your alignment with specific frameworks. 'Zapper's current configuration aligns with 95% of HIPAA security requirements. To reach 100%, you need to...'

This is proof of compliance that you can share with auditors or regulatory bodies."

[PAUSE - 2 seconds]

---

## SECTION 10: SECURITY AUDITING & MONITORING (15:30 - 17:00)

[VISUAL: Show security audit logs and monitoring dashboard]

**NARRATOR:**

"Every security-relevant action in Zapper is audited:

- **Who accessed which file** — User ID, file name, time, access method
- **What was downloaded or modified** — File contents, changes made, before/after states
- **Failed access attempts** — Rejected access due to permissions, encryption issues, malware
- **Configuration changes** — When security policies changed, who changed them
- **Encryption key access** — If using BYOK, who accessed your encryption keys
- **Malware detections** — When threats were detected, what files, what actions taken

These logs are immutable—they cannot be modified or deleted, even by administrators. This prevents covering up security breaches or unauthorized access.

You can set retention policies for audit logs. 'Keep audit logs for 7 years for HIPAA compliance.' After 7 years, logs are archived or deleted automatically based on retention settings."

[PAUSE - 2 seconds]

[VISUAL: Show the security audit dashboard with real-time monitoring]

**NARRATOR:**

"You can set up alerts for security events:

- **Malware detection** — Alert me immediately if any malware is found
- **Failed access attempts** — Alert me if there are unusual patterns of rejected access
- **Configuration changes** — Alert me if security policies change
- **Encryption key access** — Alert me if someone accesses encryption keys

These real-time alerts let you respond to threats immediately, not days later when someone notices."

[PAUSE - 2 seconds]

---

## SECTION 11: REAL-WORLD DATA PROTECTION SCENARIOS (17:00 - 18:45)

[VISUAL: Walk through scenario setups]

**NARRATOR:**

"Let me walk through three real-world data protection configurations:

**Scenario 1: Healthcare provider (HIPAA compliance).**

Patient medical records require maximum protection:
- BYOK encryption enabled — Customer-managed encryption keys in Key Vault
- Malware scanning enabled for all uploads
- File integrity verification (SHA-256 hashing)
- Data classification: All patient files marked Confidential
- Access control: Patient records restricted to authorized clinical staff
- DLP: Prevent printing, prevent sharing outside organization
- Audit logging: 6-year retention for HIPAA compliance
- Regular security assessments

Result: Secure medical records system that meets HIPAA requirements and audits prove compliance.

**Scenario 2: Financial services firm (SOX compliance).**

Financial records and communications require strong controls:
- Microsoft-managed encryption (sufficient for SOX, reduces key management)
- File integrity verification mandatory for all financial documents
- Data classification: Financial files marked Confidential, executive communications marked Secret
- Access control: Financial records restricted to authorized personnel
- Immutable audit logging with 7-year retention
- Watermarking on downloads of sensitive files
- Annual security assessment

Result: Financial compliance proven through audited security controls.

**Scenario 3: Media company (IP protection).**

Intellectual property (creative assets) requires protection from theft:
- Microsoft-managed encryption for performance
- Malware scanning to detect threats
- Data classification: Creative assets marked Confidential or Secret based on stage
- DLP: Prevent downloading to unencrypted devices, prevent sharing with external parties
- File-level access control: Only project team can access specific projects
- Watermarking: All downloads marked with who downloaded and when
- Audit logging: Monitor all access for unusual patterns

Result: IP protected from both external theft and internal misuse."

[PAUSE - 2 seconds]

---

## SECTION 12: INTEGRATING DATA PROTECTION WITH OTHER MODULES (18:45 - 20:00)

[VISUAL: Show how data protection connects to organizations, roles, and access control]

**NARRATOR:**

"Data Protection doesn't stand alone—it integrates with every other module in Zapper.

From Partner Organizations: You can apply different protection levels to different organizations. Organization A's data gets BYOK encryption; Organization B's gets Microsoft-managed encryption. This reflects different compliance requirements.

From User Management: Access controls respect roles. An Auditor can view audit logs of access but cannot download files. A File Downloader can download files but cannot see who else accessed them.

From File Management: When a file is uploaded, malware scanning begins immediately. Data classification can be set at upload time. File-level permissions are enforced transparently.

From Activity Logs: All security events are logged. You can search logs for 'Malware detection' or 'Failed access' and see security events.

From Data Lifecycle Management: Legal holds integrate with Data Protection. A file on legal hold cannot be encrypted with a new key—the hold protects the file from changes.

From Storage Accounts: Encryption settings are stored account-specific. Different storage accounts can use different encryption methods.

This integration means security is not a bolt-on feature. It's woven throughout the system."

[PAUSE - 2 seconds]

---

## SECTION 13: BEST PRACTICES FOR DATA PROTECTION (20:00 - 21:30)

[VISUAL: Show a well-designed protection strategy]

**NARRATOR:**

"Based on successful deployments, here are best practices for data protection in Zapper:

**Best Practice 1: Know your compliance requirements.**

Before configuring protection, understand your regulatory requirements. HIPAA? GDPR? SOX? Let compliance requirements drive protection decisions.

**Best Practice 2: Use BYOK for sensitive environments.**

If you're in healthcare, finance, or government, BYOK encryption is worth the complexity. You gain regulatory alignment and full cryptographic control.

**Best Practice 3: Enable malware scanning universally.**

Malware scanning is automatic and low-cost. Enable it for all files. The protection is valuable and the overhead is minimal.

**Best Practice 4: Classify data consistently.**

Establish data classification standards. Public, Internal, Confidential, Secret. Apply them consistently. Consistency makes security predictable.

**Best Practice 5: Use DLP strategically.**

Don't restrict everything—you'll frustrate users. Restrict based on sensitivity. Secret files have the strictest DLP rules. Public files have minimal restrictions. Balance security and usability.

**Best Practice 6: Verify file integrity for critical data.**

For contracts, financial records, and legally significant documents, enable file integrity verification. This proves to auditors that files haven't been tampered with.

**Best Practice 7: Monitor security events continuously.**

Set up alerts for malware, failed access, and configuration changes. Don't wait for quarterly audits. Respond to threats immediately.

**Best Practice 8: Review access regularly.**

Quarterly, review who has access to sensitive files. Remove access for people who've left teams or projects. Prevent access creep.

**Best Practice 9: Test disaster recovery with encryption.**

If using BYOK, test that you can recover with encrypted data. Do you have encrypted backups? Can you restore them? Test this before you need it.

**Best Practice 10: Educate users about sensitivity levels.**

Teach users what each classification level means and why. Users who understand why Secret files are handled differently will protect them appropriately."

[PAUSE - 2 seconds]

---

## SECTION 14: MONITORING PROTECTION EFFECTIVENESS (21:30 - 22:15)

[VISUAL: Show protection metrics and effectiveness dashboard]

**NARRATOR:**

"Data Protection provides metrics to measure your protection effectiveness:

**Encryption coverage** — What percentage of your files are encrypted? Aim for 100%.

**Malware scan coverage** — What percentage of your files have been scanned? Aim for 100%.

**Failed access attempts** — How many times did someone try to access a file they don't have permission for? This indicates either misconfiguration or attack attempts.

**Compliance framework coverage** — For each compliance framework you care about, what percentage of requirements are met? Track progress toward 100%.

**Threat detection rate** — How many threats have been detected? Is the rate increasing, stable, or decreasing?

**User authentication strength** — What percentage of users are using strong authentication (MFA)? Weak authentication is a common attack vector.

Monitor these metrics monthly. If encryption coverage is dropping, investigate why. If failed access attempts spike, that might indicate an attack. If malware detections increase, investigate the source.

This data-driven approach to security is better than hoping everything is secure."

[PAUSE - 2 seconds]

---

## SECTION 15: LIMITS & ADVANCED TOPICS (22:15 - 22:45)

[VISUAL: Show advanced security topics]

**NARRATOR:**

"For advanced security scenarios, Zapper supports:

**Hardware security modules (HSMs).** If you have extreme cryptographic control requirements, you can store encryption keys in dedicated hardware devices. This is for government or financial institutions with exceptional requirements.

**Key rotation.** Encryption keys degrade over time. Best practice is rotating them periodically (annually). Zapper supports automated key rotation with BYOK.

**Compliance audits and scanning.** Zapper can integrate with third-party security scanning services that perform authorized vulnerability assessments to verify your security posture.

**Incident response integration.** If a security incident occurs, Zapper can integrate with incident response platforms to provide forensic data and timeline of events.

These advanced features are available for organizations with sophisticated security requirements."

[PAUSE - 2 seconds]

---

## CLOSING SEQUENCE (22:45 - 23:15)

[TONE: Confident, emphasizing trust and reliability]

**NARRATOR:**

"Zapper's Data Protection module makes security visible, manageable, and provable.

Key takeaways:

- **Encryption at rest and in transit** — All data is protected from eavesdropping and storage theft
- **Malware scanning** — Automatic threat detection and response
- **Access control** — Role-based and file-level permissions enforce who can access what
- **Data classification** — Sensitivity levels guide users and enforce protections
- **Compliance alignment** — GDPR, HIPAA, SOX, PCI-DSS, FedRAMP, and more
- **Immutable audit logs** — Security events are logged and cannot be covered up
- **Real-time monitoring** — Alerts on threats and security events
- **Metrics-driven approach** — Measure and improve your security posture continuously

Whether you're protecting personal health information, financial records, intellectual property, or confidential business data, Data Protection gives you the controls and visibility you need.

Security isn't a feature. It's a foundation. Zapper makes it pervasive, measurable, and compliant.

Let's move to the next module."

[END SCENE]

---

## PRODUCTION NOTES FOR VIDEO CREATORS

### Pacing & Timing
- Total runtime: approximately **23 minutes 15 seconds**
- This module is sensitive—handle security concepts with appropriate gravity
- Balance technical detail with accessibility
- Avoid fear-mongering; instead, emphasize control and confidence
- Show real examples of threats and protective actions

### Visual Cues
- **Encryption visualization** — Data being encrypted/decrypted with keys
- **Malware scanning process** — File being scanned, threat detection
- **Access control decision tree** — Permission checks, approved/denied flows
- **Sensitivity level badges** — Color-coded labels (Public, Internal, Confidential, Secret)
- **Compliance framework mapping** — Checklist of requirements with aligned/unaligned status
- **Audit trail visualization** — Security events logged in timeline
- **Threat detection alerts** — Real-time notifications of security events

### Tone Guidance
- Serious and professional—security is critical
- Emphasize "control," "visibility," and "compliance"
- Use phrases like "immutable," "encrypted," "auditable," "proven"
- Avoid alarmism; focus on capability and confidence
- Position protection as enabling secure collaboration, not restricting it

### Key Talking Points to Emphasize
1. **Encryption everywhere** — At rest and in transit, no exceptions
2. **Automatic malware scanning** — Built-in threat detection
3. **Access control at multiple levels** — Roles + file-level permissions = defense in depth
4. **Compliance built-in** — Frameworks like GDPR, HIPAA, SOX supported
5. **Immutable audit logs** — Security events cannot be covered up
6. **Real-time monitoring** — Alert on threats immediately, not later

### Demonstration Sequence (Recommended Order)
1. Show the Data Protection dashboard with security health score
2. Show encryption status and coverage
3. Demonstrate enabling BYOK encryption
4. Show malware scanning in action (file scanned, status shown)
5. Show a file with a detected threat and quarantine options
6. Show file-level access control restrictions
7. Show data classification and sensitivity labels
8. Show DLP rules for confidential files
9. Show compliance framework alignment checklist
10. Show security audit logs and real-time alerts
11. Walk through a real-world scenario (healthcare or finance)

### Visual Metaphors Suggested
- **Lock and key imagery** for encryption
- **Shield with checkmarks** for protection and compliance
- **Scanning beam** for malware detection
- **Traffic light colors** for threat levels (red/yellow/green)
- **Layers of defense** showing multiple security controls
- **Audit trail flowing through time** for logging visualization
- **Sensitivity label badges** with color differentiation

### Call-to-Action (Optional Ending)
Consider ending with: "Data Protection is where security becomes visible and measurable. Encryption, malware scanning, access controls, and immutable audit trails—all working together to protect what matters. Now that we've covered protection, let's see how to manage the entire lifecycle of that data—from creation through retention and deletion."

---

**END OF DATA PROTECTION DEMO SCRIPT**
