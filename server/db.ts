// Import Pool from node-postgres and Drizzle for node-postgres:
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@shared/schema';

// Ensure the DATABASE_URL is provided:
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set. Did you forget to provision a database?');
}

// Create a connection pool for Postgres:
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: false, 
  // If "sslmode=require" is in the connection string, SSL will be used automatically.
  // (No need to manually set ssl here unless you need custom SSL options.)
});

// Handle runtime errors on the pool (prevents the app from crashing on idle client errors):
pool.on('error', (err) => {
  console.error('Database pool error (will retry):', err.message);
});

// Auto-create database tables if enabled
async function autoCreateTables(db: ReturnType<typeof drizzle>) {
  if (process.env.ZAPPER_AUTO_CREATE_DB_TABLES?.toLowerCase() === 'true') {
    try {
      console.log('🔧 ZAPPER_AUTO_CREATE_DB_TABLES is enabled, creating database tables...');
      
      // Create tables using raw SQL based on the schema
      const createTables = async () => {
        // Get a client from the pool to execute raw SQL
        const client = await pool.connect();
        try {
          // Create all required tables based on the schema
          console.log('Creating database tables...');
          const essentialTables = [
            `CREATE TABLE IF NOT EXISTS "session" (
              "sid" VARCHAR NOT NULL,
              "sess" JSON NOT NULL,
              "expire" TIMESTAMP(6) NOT NULL,
              PRIMARY KEY ("sid")
            )`,
            
            // Core entities
            `CREATE TABLE IF NOT EXISTS "organizations" (
              "id" SERIAL PRIMARY KEY,
              "name" TEXT NOT NULL UNIQUE,
              "description" TEXT,
              "geo_fencing_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
              "geo_enforcement_mode" TEXT NOT NULL DEFAULT 'strict',
              "allowed_countries" TEXT[] NOT NULL DEFAULT '{}',
              "created_at" TIMESTAMP DEFAULT NOW()
            )`,

            `CREATE TABLE IF NOT EXISTS "permission_user_mgmt" (
              "id" SERIAL PRIMARY KEY,
              "permissions" JSONB NOT NULL DEFAULT '{"add": true, "edit": true, "delete": true, "view": true, "enableDisable": true}'::jsonb,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,

            `CREATE TABLE IF NOT EXISTS "permission_risk_categories" (
              "id" SERIAL PRIMARY KEY,
              "category" TEXT NOT NULL UNIQUE,
              "description" TEXT NOT NULL,
              "color" TEXT NOT NULL,
              "permissions" TEXT[] NOT NULL DEFAULT '{}',
              "created_at" TIMESTAMP DEFAULT NOW(),
              "updated_at" TIMESTAMP DEFAULT NOW()
            )`,

            // Seed Permission Risk Categories
            `INSERT INTO permission_risk_categories (category, description, color, permissions)
             VALUES 
              ('info', 'Low-risk permissions. Read-only or scoped operational actions within assigned organization. No cross-organization impact.', 'blue', '{"fileMgmt.uploadFile", "fileMgmt.uploadFolder", "fileMgmt.downloadFile", "fileMgmt.downloadFolder", "fileMgmt.viewFiles", "fileMgmt.createFolder", "fileMgmt.deleteFilesAndFolders", "fileMgmt.searchFiles", "fileMgmt.renameFile", "fileMgmt.rehydrate", "activityLogs.view", "transferReports.view", "transferReports.viewDetails", "sftpMgmt.viewSelfAccess", "sftpMgmt.rotateSshSelf", "sftpMgmt.rotatePasswordSelf", "helpCenter.chapterWiseHelp", "helpCenter.api", "helpCenter.envVariable", "helpCenter.troubleshooting", "contentUnderstanding.view", "contentUnderstanding.menuVisibility", "contentUnderstanding.deleteAnalysis", "documentTranslation.deleteTranslation", "foundryMgmt.tabFoundryAction", "foundryMgmt.tabChatPlayground"}'),
              ('warning', 'Moderate-risk permissions. Can run AI/processing actions or perform sensitive scoped operations within assigned organization but no tenant-wide control.', 'yellow', '{"documentTranslation.runTranslation", "contentUnderstanding.runAnalysis", "contentUnderstanding.saveAnalysis", "pgpKeyMgmt.decrypt"}'),
              ('critical', 'High-risk permissions. Administrative control within an organization. Can affect compliance, storage, or security posture.', 'orange', '{"userMgmt.add", "userMgmt.edit", "userMgmt.enableDisable", "roleMgmt.add", "roleMgmt.edit", "storageMgmt.addContainer", "storageMgmt.addStorageContainer", "storageMgmt.dataProtection", "storageMgmt.dataLifecycle", "storageMgmt.inventoryConfigure", "pgpKeyMgmt.generate", "pgpKeyMgmt.delete", "sftpMgmt.create", "sftpMgmt.update", "sftpMgmt.disable", "siemMgmt.install", "siemMgmt.enableDisable", "foundryMgmt.add", "foundryMgmt.edit"}'),
              ('dangerous', 'Tenant-wide or cross-organization impact. Exposure risk across organizations. Must never be assigned to external users.', 'red', '{"userMgmt.delete", "roleMgmt.delete", "orgMgmt.add", "orgMgmt.edit", "orgMgmt.delete", "orgMgmt.view", "storageMgmt.delete", "storageMgmt.inventoryView", "aiAgentMgmt.add", "aiAgentMgmt.edit", "aiAgentMgmt.delete", "aiAgentMgmt.view", "pgpKeyMgmt.view", "siemMgmt.delete", "siemMgmt.incidentsView", "foundryMgmt.delete", "foundryMgmt.view", "foundryMgmt.tabWizard", "foundryMgmt.tabResources", "foundryMgmt.tabResourceSets", "foundryMgmt.tabContentUnderstanding", "customerOnboarding.upload", "customerOnboarding.commit", "customerOnboarding.delete", "transferReports.download"}')
             ON CONFLICT (category) DO NOTHING`,
            
            `CREATE TABLE IF NOT EXISTS "roles" (
              "id" SERIAL PRIMARY KEY,
              "name" TEXT NOT NULL UNIQUE,
              "description" TEXT,
              "category" TEXT NOT NULL DEFAULT 'info',
              "created_at" TIMESTAMP DEFAULT NOW()
            )`,
            
            `CREATE TABLE IF NOT EXISTS "users" (
              "id" SERIAL PRIMARY KEY,
              "name" TEXT NOT NULL,
              "email" TEXT NOT NULL UNIQUE,
              "user_type" TEXT NOT NULL DEFAULT 'internal',
              "is_enabled" BOOLEAN NOT NULL DEFAULT true,
              "created_at" TIMESTAMP DEFAULT NOW(),
              "updated_at" TIMESTAMP DEFAULT NOW()
            )`,
            
            // User roles junction table (updated to match schema)
            `CREATE TABLE IF NOT EXISTS "user_roles" (
              "id" SERIAL PRIMARY KEY,
              "user_id" INTEGER NOT NULL,
              "role_id" INTEGER NOT NULL,
              "organization_id" INTEGER NOT NULL,
              "is_enabled" BOOLEAN NOT NULL DEFAULT true,
              "created_at" TIMESTAMP DEFAULT NOW(),
              UNIQUE("user_id", "role_id", "organization_id")
            )`,
            
            // Permission tables
            `CREATE TABLE IF NOT EXISTS "permission_user_mgmt" (
              "id" SERIAL PRIMARY KEY,
              "permissions" JSONB NOT NULL DEFAULT '{"add": true, "edit": true, "delete": true, "view": true, "enableDisable": true}'::jsonb,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,

            `CREATE TABLE IF NOT EXISTS "permission_role_mgmt" (
              "id" SERIAL PRIMARY KEY,
              "add" BOOLEAN NOT NULL DEFAULT false,
              "edit" BOOLEAN NOT NULL DEFAULT false,
              "delete" BOOLEAN NOT NULL DEFAULT false,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            `CREATE TABLE IF NOT EXISTS "permission_org_mgmt" (
              "id" SERIAL PRIMARY KEY,
              "add" BOOLEAN NOT NULL DEFAULT false,
              "edit" BOOLEAN NOT NULL DEFAULT false,
              "delete" BOOLEAN NOT NULL DEFAULT false,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            `CREATE TABLE IF NOT EXISTS "permission_storage_mgmt" (
              "id" SERIAL PRIMARY KEY,
              "add_storage_container" BOOLEAN NOT NULL DEFAULT false,
              "add_container" BOOLEAN NOT NULL DEFAULT false,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "delete" BOOLEAN NOT NULL DEFAULT false,
              "data_protection" BOOLEAN NOT NULL DEFAULT false,
              "data_lifecycle" BOOLEAN NOT NULL DEFAULT false,
              "inventory_view" BOOLEAN NOT NULL DEFAULT false,
              "inventory_configure" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            `CREATE TABLE IF NOT EXISTS "permission_file_mgmt" (
              "id" SERIAL PRIMARY KEY,
              "permissions" JSONB NOT NULL DEFAULT '{}'::jsonb,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            `CREATE TABLE IF NOT EXISTS "permission_activity_logs" (
              "id" SERIAL PRIMARY KEY,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            `CREATE TABLE IF NOT EXISTS "permission_ai_agent_mgmt" (
              "id" SERIAL PRIMARY KEY,
              "add" BOOLEAN NOT NULL DEFAULT false,
              "edit" BOOLEAN NOT NULL DEFAULT false,
              "delete" BOOLEAN NOT NULL DEFAULT false,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            `CREATE TABLE IF NOT EXISTS "permission_pgp_key_mgmt" (
              "id" SERIAL PRIMARY KEY,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "generate" BOOLEAN NOT NULL DEFAULT false,
              "delete" BOOLEAN NOT NULL DEFAULT false,
              "copy" BOOLEAN NOT NULL DEFAULT false,
              "decrypt" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            `CREATE TABLE IF NOT EXISTS "permission_help_center" (
              "id" SERIAL PRIMARY KEY,
              "chapter_wise_help" JSONB NOT NULL DEFAULT '{}'::jsonb,
              "api" JSONB NOT NULL DEFAULT '{}'::jsonb,
              "env_variable" JSONB NOT NULL DEFAULT '{}'::jsonb,
              "troubleshooting" JSONB NOT NULL DEFAULT '{}'::jsonb,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            // SIEM Management permissions
            `CREATE TABLE IF NOT EXISTS "permission_siem_mgmt" (
              "id" SERIAL PRIMARY KEY,
              "install" BOOLEAN NOT NULL DEFAULT false,
              "delete" BOOLEAN NOT NULL DEFAULT false,
              "enable_disable" BOOLEAN NOT NULL DEFAULT false,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "incidents_view" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            // Foundry AI Management permissions
            `CREATE TABLE IF NOT EXISTS "permission_foundry_mgmt" (
              "id" SERIAL PRIMARY KEY,
              "add" BOOLEAN NOT NULL DEFAULT false,
              "edit" BOOLEAN NOT NULL DEFAULT false,
              "delete" BOOLEAN NOT NULL DEFAULT false,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "tab_wizard" BOOLEAN NOT NULL DEFAULT false,
              "tab_resources" BOOLEAN NOT NULL DEFAULT false,
              "tab_foundry_action" BOOLEAN NOT NULL DEFAULT false,
              "tab_chat_playground" BOOLEAN NOT NULL DEFAULT false,
              "tab_resource_sets" BOOLEAN NOT NULL DEFAULT false,
              "tab_content_understanding" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            // Content Understanding permissions
            `CREATE TABLE IF NOT EXISTS "permission_content_understanding" (
              "id" SERIAL PRIMARY KEY,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "run_analysis" BOOLEAN NOT NULL DEFAULT false,
              "save_analysis" BOOLEAN NOT NULL DEFAULT false,
              "delete_analysis" BOOLEAN NOT NULL DEFAULT false,
              "menu_visibility" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,

            // HearingAI permissions
            `CREATE TABLE IF NOT EXISTS "permission_hearing_ai" (
              "id" SERIAL PRIMARY KEY,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "run_analysis" BOOLEAN NOT NULL DEFAULT false,
              "save_analysis" BOOLEAN NOT NULL DEFAULT false,
              "delete_analysis" BOOLEAN NOT NULL DEFAULT false,
              "menu_visibility" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            // Document Translation permissions
            `CREATE TABLE IF NOT EXISTS "permission_document_translation" (
              "id" SERIAL PRIMARY KEY,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "run_translation" BOOLEAN NOT NULL DEFAULT false,
              "delete_translation" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            // SFTP Management permissions
            `CREATE TABLE IF NOT EXISTS "permission_sftp_mgmt" (
              "id" SERIAL PRIMARY KEY,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "create" BOOLEAN NOT NULL DEFAULT false,
              "update" BOOLEAN NOT NULL DEFAULT false,
              "disable" BOOLEAN NOT NULL DEFAULT false,
              "delete" BOOLEAN NOT NULL DEFAULT false,
              "map_user" BOOLEAN NOT NULL DEFAULT false,
              "view_self_access" BOOLEAN NOT NULL DEFAULT false,
              "rotate_ssh_self" BOOLEAN NOT NULL DEFAULT false,
              "rotate_password_self" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            // Customer Onboarding permissions
            `CREATE TABLE IF NOT EXISTS "permission_customer_onboarding" (
              "id" SERIAL PRIMARY KEY,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "upload" BOOLEAN NOT NULL DEFAULT false,
              "commit" BOOLEAN NOT NULL DEFAULT false,
              "delete" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            // Populate default permissions for Customer Onboarding
            `INSERT INTO permission_customer_onboarding (view, upload, commit, delete) 
             VALUES (true, true, true, true) ON CONFLICT DO NOTHING`,
            
            // Transfer Reports permissions
            `CREATE TABLE IF NOT EXISTS "permission_transfer_reports" (
              "id" SERIAL PRIMARY KEY,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "view_details" BOOLEAN NOT NULL DEFAULT false,
              "download" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            // Populate default permissions for Transfer Reports
            `INSERT INTO permission_transfer_reports (view, view_details, download) 
             VALUES (true, true, true) ON CONFLICT DO NOTHING`,
            
            // Eval permissions
            `CREATE TABLE IF NOT EXISTS "permission_eval" (
              "id" SERIAL PRIMARY KEY,
              "view" BOOLEAN NOT NULL DEFAULT false,
              "run" BOOLEAN NOT NULL DEFAULT false,
              "review" BOOLEAN NOT NULL DEFAULT false,
              "finalize" BOOLEAN NOT NULL DEFAULT false,
              "menu_visibility" BOOLEAN NOT NULL DEFAULT false,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            // SFTP Local Users
            `CREATE TABLE IF NOT EXISTS "sftp_local_users" (
              "id" SERIAL PRIMARY KEY,
              "organization_id" INTEGER NOT NULL REFERENCES "organizations"("id"),
              "subscription_id" TEXT NOT NULL,
              "resource_group" TEXT NOT NULL,
              "storage_account_name" TEXT NOT NULL,
              "container_name" TEXT,
              "local_username" TEXT NOT NULL,
              "display_name" TEXT,
              "status" TEXT NOT NULL DEFAULT 'ACTIVE',
              "ssh_enabled" BOOLEAN NOT NULL DEFAULT true,
              "password_enabled" BOOLEAN NOT NULL DEFAULT false,
              "mapped_user_id" INTEGER NOT NULL REFERENCES "users"("id"),
              "mapped_entra_oid" TEXT,
              "mapped_entra_email" TEXT,
              "ssh_rotation_policy_days" INTEGER NOT NULL DEFAULT 30,
              "ssh_last_rotated_at" TIMESTAMP,
              "ssh_key_fingerprint" TEXT,
              "password_rotation_policy_days" INTEGER NOT NULL DEFAULT 30,
              "password_last_rotated_at" TIMESTAMP,
              "created_by_user_id" INTEGER REFERENCES "users"("id"),
              "created_at" TIMESTAMP DEFAULT NOW(),
              "updated_by_user_id" INTEGER REFERENCES "users"("id"),
              "updated_at" TIMESTAMP DEFAULT NOW(),
              CONSTRAINT "unique_sftp_local_user" UNIQUE ("organization_id", "local_username"),
              CONSTRAINT "unique_sftp_mapped_user" UNIQUE ("organization_id", "mapped_user_id")
            )`,
            
            // SFTP Local User Scopes
            `CREATE TABLE IF NOT EXISTS "sftp_local_user_scopes" (
              "id" SERIAL PRIMARY KEY,
              "organization_id" INTEGER NOT NULL,
              "sftp_local_user_id" INTEGER NOT NULL REFERENCES "sftp_local_users"("id") ON DELETE CASCADE,
              "container_name" TEXT NOT NULL,
              "permissions" JSONB NOT NULL,
              "created_at" TIMESTAMP DEFAULT NOW()
            )`,
            
            // SFTP Rotation Events
            `CREATE TABLE IF NOT EXISTS "sftp_rotation_events" (
              "id" SERIAL PRIMARY KEY,
              "organization_id" INTEGER NOT NULL REFERENCES "organizations"("id"),
              "sftp_local_user_id" INTEGER NOT NULL REFERENCES "sftp_local_users"("id") ON DELETE CASCADE,
              "actor_user_id" INTEGER NOT NULL REFERENCES "users"("id"),
              "actor_entra_oid" TEXT,
              "actor_email" TEXT NOT NULL,
              "rotation_type" TEXT NOT NULL,
              "action" TEXT NOT NULL,
              "old_fingerprint" TEXT,
              "new_fingerprint" TEXT,
              "status" TEXT NOT NULL,
              "error_code" TEXT,
              "error_message" TEXT,
              "created_at" TIMESTAMP DEFAULT NOW()
            )`,
            
            // Role permissions mapping
            `CREATE TABLE IF NOT EXISTS "role_permissions_modular" (
              "id" SERIAL PRIMARY KEY,
              "role_id" INTEGER NOT NULL,
              "permission_user_mgmt_id" INTEGER,
              "permission_role_mgmt_id" INTEGER,
              "permission_org_mgmt_id" INTEGER,
              "permission_storage_mgmt_id" INTEGER,
              "permission_file_mgmt_id" INTEGER,
              "permission_activity_logs_id" INTEGER,
              "permission_ai_agent_mgmt_id" INTEGER,
              "permission_pgp_key_mgmt_id" INTEGER,
              "permission_help_center_id" INTEGER,
              "permission_siem_mgmt_id" INTEGER,
              "permission_foundry_mgmt_id" INTEGER,
              "permission_content_understanding_id" INTEGER,
              "permission_hearing_ai_id" INTEGER,
              "permission_document_translation_id" INTEGER,
              "permission_sftp_mgmt_id" INTEGER,
              "permission_customer_onboarding_id" INTEGER,
              "permission_transfer_reports_id" INTEGER,
              "permission_eval_id" INTEGER,
              "created_by" INTEGER,
              "updated_by" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
              "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
            )`,
            
            // Onboarding Jobs - Track bulk import jobs
            `CREATE TABLE IF NOT EXISTS "onboarding_jobs" (
              "id" SERIAL PRIMARY KEY,
              "job_name" TEXT NOT NULL,
              "status" TEXT NOT NULL DEFAULT 'pending',
              "total_rows" INTEGER NOT NULL DEFAULT 0,
              "success_count" INTEGER NOT NULL DEFAULT 0,
              "error_count" INTEGER NOT NULL DEFAULT 0,
              "skipped_count" INTEGER NOT NULL DEFAULT 0,
              "csv_data" TEXT,
              "validation_errors" JSONB,
              "processing_errors" JSONB,
              "created_by_user_id" INTEGER NOT NULL REFERENCES "users"("id"),
              "created_at" TIMESTAMP DEFAULT NOW(),
              "completed_at" TIMESTAMP
            )`,
            
            // Onboarding Job Rows - Individual row status tracking
            `CREATE TABLE IF NOT EXISTS "onboarding_job_rows" (
              "id" SERIAL PRIMARY KEY,
              "job_id" INTEGER NOT NULL REFERENCES "onboarding_jobs"("id") ON DELETE CASCADE,
              "row_number" INTEGER NOT NULL,
              "raw_data" JSONB NOT NULL,
              "status" TEXT NOT NULL DEFAULT 'pending',
              "error_message" TEXT,
              "error_code" TEXT,
              "created_organization_id" INTEGER,
              "created_user_id" INTEGER,
              "created_user_role_id" INTEGER,
              "created_storage_account_id" INTEGER,
              "created_sftp_local_user_id" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW(),
              "processed_at" TIMESTAMP
            )`,
            
            // Indexes for onboarding tables
            `CREATE INDEX IF NOT EXISTS "idx_onboarding_jobs_status" ON "onboarding_jobs" ("status")`,
            `CREATE INDEX IF NOT EXISTS "idx_onboarding_jobs_created_by" ON "onboarding_jobs" ("created_by_user_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_onboarding_job_rows_job_id" ON "onboarding_job_rows" ("job_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_onboarding_job_rows_status" ON "onboarding_job_rows" ("status")`,
            
            // User activities for audit logging
            `CREATE TABLE IF NOT EXISTS "user_activities" (
              "id" SERIAL PRIMARY KEY,
              "user_id" TEXT NOT NULL,
              "user_name" TEXT NOT NULL,
              "email" TEXT NOT NULL,
              "ip_address" TEXT,
              "session_id" TEXT,
              "user_agent" TEXT,
              "action" TEXT NOT NULL,
              "action_category" TEXT NOT NULL,
              "resource" TEXT,
              "resource_type" TEXT,
              "details" TEXT,
              "role_id" INTEGER,
              "role_name" TEXT,
              "organization_id" INTEGER,
              "organization_name" TEXT,
              "login_time" TIMESTAMP,
              "logout_time" TIMESTAMP,
              "action_time" TIMESTAMP DEFAULT NOW(),
              "created_at" TIMESTAMP DEFAULT NOW()
            )`,
            
            // Storage accounts (Updated to match current schema)
            `CREATE TABLE IF NOT EXISTS "storage_accounts" (
              "id" SERIAL PRIMARY KEY,
              "name" TEXT NOT NULL,
              "location" TEXT DEFAULT 'East US',
              "container_name" TEXT NOT NULL,
              "resource_group_name" TEXT,
              "organization_id" INTEGER,
              "kind" TEXT NOT NULL DEFAULT 'blob',
              "created_at" TIMESTAMP DEFAULT NOW()
            )`,
            
            // AI agents (Updated to match current schema)
            `CREATE TABLE IF NOT EXISTS "ai_agents" (
              "id" SERIAL PRIMARY KEY,
              "name" VARCHAR(32) NOT NULL,
              "api_endpoint" VARCHAR(192) NOT NULL,
              "api_key" VARCHAR(512) NOT NULL,
              "organization_id" INTEGER NOT NULL,
              "use_ip_for_sas" BOOLEAN NOT NULL DEFAULT false,
              "allowed_ip_address" VARCHAR(45),
              "sas_validity_seconds" INTEGER NOT NULL DEFAULT 900,
              "created_at" TIMESTAMP DEFAULT NOW(),
              "updated_at" TIMESTAMP DEFAULT NOW()
            )`,
            
            // Organization PGP Keys (Phase 2 - Multi-Key Support)
            `CREATE TABLE IF NOT EXISTS "org_pgp_keys" (
              "id" SERIAL PRIMARY KEY,
              "organization_id" INTEGER NOT NULL,
              "key_name" VARCHAR(100) NOT NULL,
              "public_key_armored" TEXT NOT NULL,
              "key_vault_secret_name" VARCHAR(255),
              "private_key_data" TEXT,
              "key_id" VARCHAR(64),
              "key_type" VARCHAR(20) NOT NULL DEFAULT 'OWN',
              "belongs_to" VARCHAR(20) NOT NULL DEFAULT 'SELF',
              "source" VARCHAR(20) NOT NULL DEFAULT 'GENERATED',
              "is_active" BOOLEAN NOT NULL DEFAULT true,
              "created_by_user_id" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW(),
              "updated_at" TIMESTAMP DEFAULT NOW()
            )`,
            
            // Create indexes for org_pgp_keys if they don't exist
            `CREATE INDEX IF NOT EXISTS "idx_org_pgp_keys_org_id" ON "org_pgp_keys" ("organization_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_org_pgp_keys_key_type" ON "org_pgp_keys" ("key_type")`,
            `CREATE INDEX IF NOT EXISTS "idx_org_pgp_keys_belongs_to" ON "org_pgp_keys" ("belongs_to")`,
            
            // Note: video_jobs table removed - all async analysis consolidated into cu_jobs table

            // Foundry Resources for Azure AI Foundry Management (organization-scoped)
            // Each resource belongs to exactly one organization
            `CREATE TABLE IF NOT EXISTS "foundry_resources" (
              "id" SERIAL PRIMARY KEY,
              "organization_id" INTEGER NOT NULL,
              "resource_name" VARCHAR(128) NOT NULL,
              "resource_group" VARCHAR(128) NOT NULL,
              "location" VARCHAR(64) NOT NULL,
              "hub_name" VARCHAR(128),
              "custom_subdomain" VARCHAR(128),
              "resource_id" TEXT,
              "project_id" TEXT,
              "project_name" VARCHAR(128),
              "project_endpoint" TEXT,
              "agent_id" TEXT,
              "agent_name" VARCHAR(128),
              "vector_store_id" TEXT,
              "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
              "current_step" VARCHAR(32),
              "last_error" TEXT,
              "provisioning_started_at" TIMESTAMP,
              "provisioning_completed_at" TIMESTAMP,
              "shared_across_orgs" BOOLEAN NOT NULL DEFAULT false,
              "created_by_user_id" INTEGER,
              "created_at" TIMESTAMP DEFAULT NOW(),
              "updated_at" TIMESTAMP DEFAULT NOW()
            )`,
            // Add shared_across_orgs to foundry_resources if it doesn't exist (for pre-existing tables)
            `DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'foundry_resources'
                AND column_name = 'shared_across_orgs'
              ) THEN
                ALTER TABLE "foundry_resources" ADD COLUMN "shared_across_orgs" BOOLEAN NOT NULL DEFAULT false;
              END IF;
            END $$;`,
            
            // Create indexes for foundry_resources
            `CREATE INDEX IF NOT EXISTS "idx_foundry_resources_org_id" ON "foundry_resources" ("organization_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_foundry_resources_status" ON "foundry_resources" ("status")`,
            `CREATE INDEX IF NOT EXISTS "idx_foundry_resources_name" ON "foundry_resources" ("resource_name")`,
            `CREATE INDEX IF NOT EXISTS "idx_foundry_resources_project_agent" ON "foundry_resources" ("project_name", "agent_id")`,
            
            // Foundry Resource Sets for organization-scoped Azure AI configuration defaults
            // This is a lightweight mapping table that references foundry_resources via FK
            `CREATE TABLE IF NOT EXISTS "foundry_resource_sets" (
              "id" SERIAL PRIMARY KEY,
              "name" VARCHAR(255) NOT NULL,
              "organization_id" INTEGER NOT NULL,
              "foundry_resource_id" INTEGER NOT NULL,
              "default_agent_id" VARCHAR(255),
              "default_agent_name" VARCHAR(255),
              "default_vector_store_id" VARCHAR(255),
              "default_vector_store_name" VARCHAR(255),
              "status" VARCHAR(50) NOT NULL DEFAULT 'active',
              "notes" TEXT,
              "created_by" VARCHAR(255) NOT NULL,
              "created_at" TIMESTAMP DEFAULT NOW(),
              "updated_at" TIMESTAMP DEFAULT NOW()
            )`,
            
            // Create indexes for foundry_resource_sets
            `CREATE INDEX IF NOT EXISTS "idx_foundry_resource_sets_org_id" ON "foundry_resource_sets" ("organization_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_foundry_resource_sets_resource_id" ON "foundry_resource_sets" ("foundry_resource_id")`,
            
            // CU Jobs - Track async Content Understanding video analysis jobs
            `CREATE TABLE IF NOT EXISTS "cu_jobs" (
              "id" SERIAL PRIMARY KEY,
              "job_id" VARCHAR(100) NOT NULL UNIQUE,
              "organization_id" INTEGER NOT NULL REFERENCES "organizations"("id"),
              "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
              "source_file_path" VARCHAR(1000) NOT NULL,
              "storage_account_name" VARCHAR(100) NOT NULL,
              "container_name" VARCHAR(100) NOT NULL,
              "foundry_resource_name" VARCHAR(100) NOT NULL,
              "azure_operation_location" VARCHAR(2000),
              "status" VARCHAR(50) NOT NULL DEFAULT 'submitted',
              "result_path" VARCHAR(1000),
              "error" TEXT,
              "poll_attempts" INTEGER NOT NULL DEFAULT 0,
              "content_type" VARCHAR(50) NOT NULL DEFAULT 'video',
              "analyzer_id" VARCHAR(100),
              "created_at" TIMESTAMP DEFAULT NOW(),
              "started_at" TIMESTAMP,
              "completed_at" TIMESTAMP
            )`,
            
            // Create indexes for cu_jobs
            `CREATE INDEX IF NOT EXISTS "idx_cu_jobs_job_id" ON "cu_jobs" ("job_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_cu_jobs_status" ON "cu_jobs" ("status")`,
            `CREATE INDEX IF NOT EXISTS "idx_cu_jobs_org" ON "cu_jobs" ("organization_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_cu_jobs_user" ON "cu_jobs" ("user_id")`,

            // HearingAI Jobs
            `CREATE TABLE IF NOT EXISTS "hai_jobs" (
              "id" SERIAL PRIMARY KEY,
              "job_id" VARCHAR(100) NOT NULL UNIQUE,
              "organization_id" INTEGER NOT NULL REFERENCES "organizations"("id"),
              "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
              "source_file_path" VARCHAR(1000) NOT NULL,
              "storage_account_name" VARCHAR(100) NOT NULL,
              "container_name" VARCHAR(100) NOT NULL,
              "foundry_resource_name" VARCHAR(100) NOT NULL,
              "azure_operation_location" VARCHAR(2000),
              "status" VARCHAR(50) NOT NULL DEFAULT 'submitted',
              "result_path" VARCHAR(1000),
              "error" TEXT,
              "poll_attempts" INTEGER NOT NULL DEFAULT 0,
              "content_type" VARCHAR(50) NOT NULL DEFAULT 'video',
              "analyzer_id" VARCHAR(100),
              "created_at" TIMESTAMP DEFAULT NOW(),
              "started_at" TIMESTAMP,
              "completed_at" TIMESTAMP
            )`,

            // Create indexes for hai_jobs
            `CREATE INDEX IF NOT EXISTS "idx_hai_jobs_job_id" ON "hai_jobs" ("job_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_hai_jobs_status" ON "hai_jobs" ("status")`,
            `CREATE INDEX IF NOT EXISTS "idx_hai_jobs_org" ON "hai_jobs" ("organization_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_hai_jobs_user" ON "hai_jobs" ("user_id")`,
            
            // File Transfer Reports - Track upload/download operations
            `CREATE TABLE IF NOT EXISTS "file_transfer_reports" (
              "id" SERIAL PRIMARY KEY,
              "action_id" VARCHAR(100) NOT NULL UNIQUE,
              "organization_id" INTEGER NOT NULL REFERENCES "organizations"("id"),
              "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
              "action_type" VARCHAR(20) NOT NULL,
              "total_files" INTEGER NOT NULL DEFAULT 0,
              "success_count" INTEGER NOT NULL DEFAULT 0,
              "failure_count" INTEGER NOT NULL DEFAULT 0,
              "status" VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS',
              "report_blob_path" VARCHAR(500),
              "storage_account_name" VARCHAR(100),
              "container_name" VARCHAR(100),
              "created_at" TIMESTAMP DEFAULT NOW(),
              "completed_at" TIMESTAMP
            )`,
            
            // Create indexes for file_transfer_reports
            `CREATE INDEX IF NOT EXISTS "idx_file_transfer_reports_action_id" ON "file_transfer_reports" ("action_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_file_transfer_reports_org" ON "file_transfer_reports" ("organization_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_file_transfer_reports_user" ON "file_transfer_reports" ("user_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_file_transfer_reports_status" ON "file_transfer_reports" ("status")`,
            `CREATE INDEX IF NOT EXISTS "idx_file_transfer_reports_created_at" ON "file_transfer_reports" ("created_at")`,
          ];
          
          for (const sql of essentialTables) {
            await client.query(sql);
          }
          
          // Run migrations to add missing columns to existing tables
          const migrations = [
            // Add permission_siem_mgmt_id column to role_permissions_modular if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'role_permissions_modular' 
                AND column_name = 'permission_siem_mgmt_id'
              ) THEN
                ALTER TABLE "role_permissions_modular" ADD COLUMN "permission_siem_mgmt_id" INTEGER;
              END IF;
            END $$;`,
            // Legacy: search_files and rename_file boolean columns are no longer needed
            // They have been migrated to the JSONB permissions column
            // Drop them if they still exist as orphans
            `ALTER TABLE "permission_file_mgmt" DROP COLUMN IF EXISTS "search_files"`,
            `ALTER TABLE "permission_file_mgmt" DROP COLUMN IF EXISTS "rename_file"`,
            // Add permission_foundry_mgmt_id column to role_permissions_modular if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'role_permissions_modular' 
                AND column_name = 'permission_foundry_mgmt_id'
              ) THEN
                ALTER TABLE "role_permissions_modular" ADD COLUMN "permission_foundry_mgmt_id" INTEGER;
              END IF;
            END $$;`,
            // Add incidents_view column to permission_siem_mgmt if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_siem_mgmt' 
                AND column_name = 'incidents_view'
              ) THEN
                ALTER TABLE "permission_siem_mgmt" ADD COLUMN "incidents_view" BOOLEAN NOT NULL DEFAULT false;
              END IF;
            END $$;`,
            // Add tab_wizard column to permission_foundry_mgmt if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_foundry_mgmt' 
                AND column_name = 'tab_wizard'
              ) THEN
                ALTER TABLE "permission_foundry_mgmt" ADD COLUMN "tab_wizard" BOOLEAN NOT NULL DEFAULT false;
              END IF;
            END $$;`,
            // Add tab_resources column to permission_foundry_mgmt if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_foundry_mgmt' 
                AND column_name = 'tab_resources'
              ) THEN
                ALTER TABLE "permission_foundry_mgmt" ADD COLUMN "tab_resources" BOOLEAN NOT NULL DEFAULT false;
              END IF;
            END $$;`,
            // Add tab_foundry_action column to permission_foundry_mgmt if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_foundry_mgmt' 
                AND column_name = 'tab_foundry_action'
              ) THEN
                ALTER TABLE "permission_foundry_mgmt" ADD COLUMN "tab_foundry_action" BOOLEAN NOT NULL DEFAULT false;
              END IF;
            END $$;`,
            // Add tab_chat_playground column to permission_foundry_mgmt if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_foundry_mgmt' 
                AND column_name = 'tab_chat_playground'
              ) THEN
                ALTER TABLE "permission_foundry_mgmt" ADD COLUMN "tab_chat_playground" BOOLEAN NOT NULL DEFAULT false;
              END IF;
            END $$;`,
            // Add tab_resource_sets column to permission_foundry_mgmt if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_foundry_mgmt' 
                AND column_name = 'tab_resource_sets'
              ) THEN
                ALTER TABLE "permission_foundry_mgmt" ADD COLUMN "tab_resource_sets" BOOLEAN NOT NULL DEFAULT false;
              END IF;
            END $$;`,
            // Add tab_content_understanding column to permission_foundry_mgmt if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_foundry_mgmt' 
                AND column_name = 'tab_content_understanding'
              ) THEN
                ALTER TABLE "permission_foundry_mgmt" ADD COLUMN "tab_content_understanding" BOOLEAN NOT NULL DEFAULT false;
              END IF;
            END $$;`,
            // Fix foundry_resources table schema if it has wrong column names
            `DO $$ 
            BEGIN
              -- If table exists with old "name" column, drop and let it be recreated
              IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'foundry_resources' 
                AND column_name = 'name'
              ) THEN
                DROP TABLE IF EXISTS "foundry_resources" CASCADE;
              END IF;
              -- If table exists with old "resource_group_name" column, drop and let it be recreated
              IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'foundry_resources' 
                AND column_name = 'resource_group_name'
              ) THEN
                DROP TABLE IF EXISTS "foundry_resources" CASCADE;
              END IF;
            END $$;`,
            // Add organization_id column to foundry_resources if it doesn't exist (resources are now org-scoped)
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'foundry_resources' 
                AND column_name = 'organization_id'
              ) THEN
                -- Add column with a default of 1 for existing rows, then make it NOT NULL
                ALTER TABLE "foundry_resources" ADD COLUMN "organization_id" INTEGER;
                -- Update existing rows to use organization 1 as default (should be handled by data migration)
                UPDATE "foundry_resources" SET "organization_id" = 1 WHERE "organization_id" IS NULL;
                -- Make the column NOT NULL after setting defaults
                ALTER TABLE "foundry_resources" ALTER COLUMN "organization_id" SET NOT NULL;
                -- Create the index
                CREATE INDEX IF NOT EXISTS "idx_foundry_resources_org_id" ON "foundry_resources" ("organization_id");
              END IF;
            END $$;`,
            // Add hub_name column to foundry_resources if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'foundry_resources' 
                AND column_name = 'hub_name'
              ) THEN
                ALTER TABLE "foundry_resources" ADD COLUMN "hub_name" VARCHAR(128);
              END IF;
            END $$;`,
            // Add custom_subdomain column to foundry_resources if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'foundry_resources' 
                AND column_name = 'custom_subdomain'
              ) THEN
                ALTER TABLE "foundry_resources" ADD COLUMN "custom_subdomain" VARCHAR(128);
              END IF;
            END $$;`,
            // Add current_step column to foundry_resources if it doesn't exist (incremental provisioning tracking)
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'foundry_resources' 
                AND column_name = 'current_step'
              ) THEN
                ALTER TABLE "foundry_resources" ADD COLUMN "current_step" VARCHAR(32);
              END IF;
            END $$;`,
            // Add last_error column to foundry_resources if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'foundry_resources' 
                AND column_name = 'last_error'
              ) THEN
                ALTER TABLE "foundry_resources" ADD COLUMN "last_error" TEXT;
              END IF;
            END $$;`,
            // Add provisioning_started_at column to foundry_resources if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'foundry_resources' 
                AND column_name = 'provisioning_started_at'
              ) THEN
                ALTER TABLE "foundry_resources" ADD COLUMN "provisioning_started_at" TIMESTAMP;
              END IF;
            END $$;`,
            // Add provisioning_completed_at column to foundry_resources if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'foundry_resources' 
                AND column_name = 'provisioning_completed_at'
              ) THEN
                ALTER TABLE "foundry_resources" ADD COLUMN "provisioning_completed_at" TIMESTAMP;
              END IF;
            END $$;`,
            // Fix foundry_resource_sets table schema - migrate to new simplified schema with foundry_resource_id FK
            `DO $$ 
            BEGIN
              -- If table exists with old hub_name column (old schema), drop and recreate with new schema
              IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'foundry_resource_sets' 
                AND column_name = 'hub_name'
              ) THEN
                DROP TABLE IF EXISTS "foundry_resource_sets" CASCADE;
              END IF;
            END $$;`,
            // Add permission_document_translation_id column to role_permissions_modular if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'role_permissions_modular' 
                AND column_name = 'permission_document_translation_id'
              ) THEN
                ALTER TABLE "role_permissions_modular" ADD COLUMN "permission_document_translation_id" INTEGER;
              END IF;
            END $$;`,
            // Add permission_sftp_mgmt_id column to role_permissions_modular if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'role_permissions_modular' 
                AND column_name = 'permission_sftp_mgmt_id'
              ) THEN
                ALTER TABLE "role_permissions_modular" ADD COLUMN "permission_sftp_mgmt_id" INTEGER;
              END IF;
            END $$;`,
            // Add permission_customer_onboarding_id column to role_permissions_modular if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'role_permissions_modular' 
                AND column_name = 'permission_customer_onboarding_id'
              ) THEN
                ALTER TABLE "role_permissions_modular" ADD COLUMN "permission_customer_onboarding_id" INTEGER;
              END IF;
            END $$;`,
            // Add permission_transfer_reports_id column to role_permissions_modular if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'role_permissions_modular' 
                AND column_name = 'permission_transfer_reports_id'
              ) THEN
                ALTER TABLE "role_permissions_modular" ADD COLUMN "permission_transfer_reports_id" INTEGER;
              END IF;
            END $$;`,
            // Add container_name column to sftp_local_users if it doesn't exist
            // Note: Uses nullable column for backward compatibility with existing SFTP users
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'sftp_local_users' 
                AND column_name = 'container_name'
              ) THEN
                ALTER TABLE "sftp_local_users" ADD COLUMN "container_name" TEXT;
              END IF;
            END $$;`,
            // Add display_name column to sftp_local_users if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'sftp_local_users' 
                AND column_name = 'display_name'
              ) THEN
                ALTER TABLE "sftp_local_users" ADD COLUMN "display_name" TEXT;
              END IF;
            END $$;`,
            // Add inventory_view column to permission_storage_mgmt if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_storage_mgmt' 
                AND column_name = 'inventory_view'
              ) THEN
                ALTER TABLE "permission_storage_mgmt" ADD COLUMN "inventory_view" BOOLEAN NOT NULL DEFAULT false;
              END IF;
            END $$;`,
            // Add inventory_configure column to permission_storage_mgmt if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_storage_mgmt' 
                AND column_name = 'inventory_configure'
              ) THEN
                ALTER TABLE "permission_storage_mgmt" ADD COLUMN "inventory_configure" BOOLEAN NOT NULL DEFAULT false;
              END IF;
            END $$;`,
            // Add geo_enforcement_mode column to organizations if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'organizations' 
                AND column_name = 'geo_enforcement_mode'
              ) THEN
                ALTER TABLE "organizations" ADD COLUMN "geo_enforcement_mode" TEXT NOT NULL DEFAULT 'strict';
              END IF;
            END $$;`,
            // Migrate permission_file_mgmt from individual boolean columns to JSONB permissions column
            // This handles existing deployments that have the old schema
            `DO $$ 
            BEGIN
              -- Only run if the old schema exists (has upload_file column but no permissions column)
              IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_file_mgmt' 
                AND column_name = 'upload_file'
              ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_file_mgmt' 
                AND column_name = 'permissions'
              ) THEN
                -- First ensure search_files and rename_file columns exist for the migration
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permission_file_mgmt' AND column_name = 'search_files') THEN
                  ALTER TABLE "permission_file_mgmt" ADD COLUMN "search_files" BOOLEAN NOT NULL DEFAULT false;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permission_file_mgmt' AND column_name = 'rename_file') THEN
                  ALTER TABLE "permission_file_mgmt" ADD COLUMN "rename_file" BOOLEAN NOT NULL DEFAULT false;
                END IF;

                -- Add the new JSONB permissions column
                ALTER TABLE "permission_file_mgmt" ADD COLUMN "permissions" JSONB NOT NULL DEFAULT '{}'::jsonb;
                
                -- Migrate existing data from boolean columns to JSONB
                UPDATE "permission_file_mgmt" SET "permissions" = jsonb_build_object(
                  'uploadFile', COALESCE("upload_file", false),
                  'uploadFolder', COALESCE("upload_folder", false),
                  'downloadFile', COALESCE("download_file", false),
                  'downloadFolder', COALESCE("download_folder", false),
                  'viewFiles', COALESCE("view_files", false),
                  'createFolder', COALESCE("create_folder", false),
                  'deleteFilesAndFolders', COALESCE("delete_files_and_folders", false),
                  'searchFiles', COALESCE("search_files", false),
                  'renameFile', COALESCE("rename_file", false),
                  'rehydrate', false
                );
                
                -- Drop old boolean columns
                ALTER TABLE "permission_file_mgmt" DROP COLUMN "upload_file";
                ALTER TABLE "permission_file_mgmt" DROP COLUMN "upload_folder";
                ALTER TABLE "permission_file_mgmt" DROP COLUMN "download_file";
                ALTER TABLE "permission_file_mgmt" DROP COLUMN "download_folder";
                ALTER TABLE "permission_file_mgmt" DROP COLUMN "view_files";
                ALTER TABLE "permission_file_mgmt" DROP COLUMN "create_folder";
                ALTER TABLE "permission_file_mgmt" DROP COLUMN "delete_files_and_folders";
                ALTER TABLE "permission_file_mgmt" DROP COLUMN "search_files";
                ALTER TABLE "permission_file_mgmt" DROP COLUMN "rename_file";
              END IF;
            END $$;`,
            // Migrate permission_user_mgmt from individual boolean columns to JSONB permissions column
            // This handles existing deployments that have the old schema
            `DO $$ 
            BEGIN
              -- Only run if the old schema exists (has "add" column but no permissions column)
              IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_user_mgmt' 
                AND column_name = 'add'
              ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'permission_user_mgmt' 
                AND column_name = 'permissions'
              ) THEN
                -- Ensure enable_disable column exists
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permission_user_mgmt' AND column_name = 'enable_disable') THEN
                  ALTER TABLE "permission_user_mgmt" ADD COLUMN "enable_disable" BOOLEAN NOT NULL DEFAULT false;
                END IF;

                -- Add the new JSONB permissions column
                ALTER TABLE "permission_user_mgmt" ADD COLUMN "permissions" JSONB NOT NULL DEFAULT '{}'::jsonb;
                
                -- Migrate existing data from boolean columns to JSONB
                UPDATE "permission_user_mgmt" SET "permissions" = jsonb_build_object(
                  'add', COALESCE("add", false),
                  'edit', COALESCE("edit", false),
                  'delete', COALESCE("delete", false),
                  'view', COALESCE("view", false),
                  'enableDisable', COALESCE("enable_disable", false)
                );
                
                -- Drop old boolean columns
                ALTER TABLE "permission_user_mgmt" DROP COLUMN "add";
                ALTER TABLE "permission_user_mgmt" DROP COLUMN "edit";
                ALTER TABLE "permission_user_mgmt" DROP COLUMN "delete";
                ALTER TABLE "permission_user_mgmt" DROP COLUMN "view";
                ALTER TABLE "permission_user_mgmt" DROP COLUMN "enable_disable";
              END IF;
            END $$;`,

            // Add user_type column to users table for existing databases
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'user_type'
              ) THEN
                ALTER TABLE "users" ADD COLUMN "user_type" TEXT NOT NULL DEFAULT 'internal';
              END IF;
            END $$;`,
            // Add permission_eval_id column to role_permissions_modular if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'role_permissions_modular' 
                AND column_name = 'permission_eval_id'
              ) THEN
                ALTER TABLE "role_permissions_modular" ADD COLUMN "permission_eval_id" INTEGER;
              END IF;
            END $$;`,
            // Add permission_hearing_ai_id column to role_permissions_modular if it doesn't exist
            `DO $$ 
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'role_permissions_modular' 
                AND column_name = 'permission_hearing_ai_id'
              ) THEN
                ALTER TABLE "role_permissions_modular" ADD COLUMN "permission_hearing_ai_id" INTEGER;
              END IF;
            END $$;`,
            // Backfill permission_hearing_ai records for roles that don't have one yet
            `DO $$
            DECLARE
              r RECORD;
              new_perm_id INTEGER;
            BEGIN
              FOR r IN
                SELECT rpm.id, rpm.role_id
                FROM role_permissions_modular rpm
                WHERE rpm.permission_hearing_ai_id IS NULL
              LOOP
                INSERT INTO permission_hearing_ai (view, run_analysis, save_analysis, delete_analysis, menu_visibility, created_at, updated_at)
                VALUES (false, false, false, false, false, NOW(), NOW())
                RETURNING id INTO new_perm_id;
                UPDATE role_permissions_modular
                SET permission_hearing_ai_id = new_perm_id
                WHERE id = r.id;
              END LOOP;
            END $$;`,
            // Eval Jobs table
            `CREATE TABLE IF NOT EXISTS "eval_jobs" (
              "id" SERIAL PRIMARY KEY,
              "job_id" VARCHAR(100) NOT NULL UNIQUE,
              "batch_id" VARCHAR(100),
              "organization_id" INTEGER NOT NULL REFERENCES "organizations"("id"),
              "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
              "foundry_resource_id" INTEGER NOT NULL,
              "foundry_resource_name" VARCHAR(128) NOT NULL,
              "answer_sheet_path" VARCHAR(1000) NOT NULL,
              "question_paper_path" VARCHAR(1000),
              "question_paper_text" TEXT,
              "standard_answer_path" VARCHAR(1000),
              "standard_answer_text" TEXT,
              "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
              "review_status" VARCHAR(32) NOT NULL DEFAULT 'not_started',
              "progress" INTEGER NOT NULL DEFAULT 0,
              "error" TEXT,
              "result_json" JSONB,
              "reviewed_result_json" JSONB,
              "reviewed_questions" JSONB,
              "created_at" TIMESTAMP DEFAULT NOW(),
              "started_at" TIMESTAMP,
              "completed_at" TIMESTAMP,
              "reviewed_at" TIMESTAMP,
              "reviewed_by_user_id" INTEGER REFERENCES "users"("id")
            )`,
            // Add batch_id to eval_jobs if it doesn't exist (for pre-existing tables)
            `DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'eval_jobs'
                AND column_name = 'batch_id'
              ) THEN
                ALTER TABLE "eval_jobs" ADD COLUMN "batch_id" VARCHAR(100);
              END IF;
            END $$;`,
            // Add reviewed_questions to eval_jobs if it doesn't exist (for pre-existing tables)
            `DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'eval_jobs'
                AND column_name = 'reviewed_questions'
              ) THEN
                ALTER TABLE "eval_jobs" ADD COLUMN "reviewed_questions" JSONB;
              END IF;
            END $$;`,
            `CREATE INDEX IF NOT EXISTS "idx_eval_jobs_org" ON "eval_jobs" ("organization_id")`,
            // Eval Manual Overrides table
            `CREATE TABLE IF NOT EXISTS "eval_manual_overrides" (
              "id" SERIAL PRIMARY KEY,
              "job_id" VARCHAR(100) NOT NULL,
              "organization_id" INTEGER NOT NULL REFERENCES "organizations"("id"),
              "reviewer_user_id" INTEGER NOT NULL REFERENCES "users"("id"),
              "question_num" VARCHAR(32) NOT NULL,
              "original_marks_awarded" INTEGER,
              "new_marks_awarded" INTEGER NOT NULL,
              "new_status" VARCHAR(32),
              "comment" TEXT,
              "created_at" TIMESTAMP DEFAULT NOW()
            )`,
            `CREATE INDEX IF NOT EXISTS "idx_eval_overrides_job_id" ON "eval_manual_overrides" ("job_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_eval_overrides_job_question" ON "eval_manual_overrides" ("job_id", "question_num")`,
            // Batch Analyses table for SWOT / pattern analysis across a batch
            `CREATE TABLE IF NOT EXISTS "batch_analyses" (
              "id" SERIAL PRIMARY KEY,
              "batch_id" VARCHAR(100) NOT NULL UNIQUE,
              "organization_id" INTEGER NOT NULL REFERENCES "organizations"("id"),
              "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
              "status" VARCHAR(32) NOT NULL DEFAULT 'generating',
              "batch_size" INTEGER NOT NULL DEFAULT 0,
              "completed_count" INTEGER NOT NULL DEFAULT 0,
              "average_score" INTEGER,
              "analysis_json" JSONB,
              "error" TEXT,
              "created_at" TIMESTAMP DEFAULT NOW(),
              "updated_at" TIMESTAMP DEFAULT NOW()
            )`,
            `CREATE INDEX IF NOT EXISTS "idx_batch_analyses_batch_id" ON "batch_analyses" ("batch_id")`,
            `CREATE INDEX IF NOT EXISTS "idx_batch_analyses_org_id" ON "batch_analyses" ("organization_id")`,
          ];
          
          console.log(`Running schema migrations... (${essentialTables.length} total statements)`);
          let migrationErrors = 0;
          const failedMigrations: string[] = [];
          for (let i = 0; i < essentialTables.length; i++) {
            const stmtPreview = essentialTables[i].substring(0, 120).replace(/\n/g, ' ').trim();
            try {
              await client.query(essentialTables[i]);
              if (stmtPreview.includes('eval_jobs') || stmtPreview.includes('eval_manual_overrides') || stmtPreview.includes('eval_overrides')) {
                console.log(`✅ Migration #${i + 1}/${essentialTables.length} OK: ${stmtPreview}...`);
              }
            } catch (migErr: any) {
              migrationErrors++;
              const errMsg = `⚠️ MIGRATION ERROR #${i + 1}/${essentialTables.length}: ${stmtPreview}... => ${migErr.message}`;
              console.log(errMsg);
              failedMigrations.push(errMsg);
            }
          }
          
          const verifyResult = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name IN ('eval_jobs', 'eval_manual_overrides')
            ORDER BY table_name
          `);
          const foundTables = verifyResult.rows.map((r: any) => r.table_name);
          console.log(`[DB-VERIFY] Eval tables after migration: ${foundTables.length > 0 ? foundTables.join(', ') : 'NONE'}`);
          
          if (foundTables.length < 2) {
            console.log(`[DB-VERIFY] WARNING: Expected 2 eval tables but found ${foundTables.length}. Attempting direct creation...`);
            try {
              await client.query(`CREATE TABLE IF NOT EXISTS "eval_jobs" (
                "id" SERIAL PRIMARY KEY,
                "job_id" VARCHAR(100) NOT NULL UNIQUE,
                "batch_id" VARCHAR(100),
                "organization_id" INTEGER NOT NULL,
                "user_id" INTEGER NOT NULL,
                "foundry_resource_id" INTEGER NOT NULL,
                "foundry_resource_name" VARCHAR(128) NOT NULL,
                "answer_sheet_path" VARCHAR(1000) NOT NULL,
                "question_paper_path" VARCHAR(1000),
                "question_paper_text" TEXT,
                "standard_answer_path" VARCHAR(1000),
                "standard_answer_text" TEXT,
                "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
                "review_status" VARCHAR(32) NOT NULL DEFAULT 'not_started',
                "progress" INTEGER NOT NULL DEFAULT 0,
                "error" TEXT,
                "result_json" JSONB,
                "reviewed_result_json" JSONB,
                "reviewed_questions" JSONB,
                "created_at" TIMESTAMP DEFAULT NOW(),
                "started_at" TIMESTAMP,
                "completed_at" TIMESTAMP,
                "reviewed_at" TIMESTAMP,
                "reviewed_by_user_id" INTEGER
              )`);
              // Ensure batch_id exists even on pre-existing fallback-created tables
              await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eval_jobs' AND column_name='batch_id') THEN ALTER TABLE "eval_jobs" ADD COLUMN "batch_id" VARCHAR(100); END IF; END $$;`);
              // Ensure reviewed_questions exists even on pre-existing fallback-created tables
              await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eval_jobs' AND column_name='reviewed_questions') THEN ALTER TABLE "eval_jobs" ADD COLUMN "reviewed_questions" JSONB; END IF; END $$;`);
              console.log(`[DB-VERIFY] ✅ eval_jobs created (without FK constraints)`);
            } catch (e2: any) {
              console.log(`[DB-VERIFY] ❌ eval_jobs direct creation failed: ${e2.message}`);
            }
            try {
              await client.query(`CREATE TABLE IF NOT EXISTS "eval_manual_overrides" (
                "id" SERIAL PRIMARY KEY,
                "job_id" VARCHAR(100) NOT NULL,
                "organization_id" INTEGER NOT NULL,
                "reviewer_user_id" INTEGER NOT NULL,
                "question_num" VARCHAR(32) NOT NULL,
                "original_marks_awarded" INTEGER,
                "new_marks_awarded" INTEGER NOT NULL,
                "new_status" VARCHAR(32),
                "comment" TEXT,
                "created_at" TIMESTAMP DEFAULT NOW()
              )`);
              console.log(`[DB-VERIFY] ✅ eval_manual_overrides created (without FK constraints)`);
            } catch (e2: any) {
              console.log(`[DB-VERIFY] ❌ eval_manual_overrides direct creation failed: ${e2.message}`);
            }
            try {
              await client.query(`CREATE INDEX IF NOT EXISTS "idx_eval_jobs_org" ON "eval_jobs" ("organization_id")`);
              await client.query(`CREATE INDEX IF NOT EXISTS "idx_eval_overrides_job_id" ON "eval_manual_overrides" ("job_id")`);
              await client.query(`CREATE INDEX IF NOT EXISTS "idx_eval_overrides_job_question" ON "eval_manual_overrides" ("job_id", "question_num")`);
            } catch (_ignored: any) {}
            try {
              await client.query(`CREATE TABLE IF NOT EXISTS "batch_analyses" (
                "id" SERIAL PRIMARY KEY,
                "batch_id" VARCHAR(100) NOT NULL UNIQUE,
                "organization_id" INTEGER NOT NULL,
                "user_id" INTEGER NOT NULL,
                "status" VARCHAR(32) NOT NULL DEFAULT 'generating',
                "batch_size" INTEGER NOT NULL DEFAULT 0,
                "completed_count" INTEGER NOT NULL DEFAULT 0,
                "average_score" INTEGER,
                "analysis_json" JSONB,
                "error" TEXT,
                "created_at" TIMESTAMP DEFAULT NOW(),
                "updated_at" TIMESTAMP DEFAULT NOW()
              )`);
              await client.query(`CREATE INDEX IF NOT EXISTS "idx_batch_analyses_batch_id" ON "batch_analyses" ("batch_id")`);
              await client.query(`CREATE INDEX IF NOT EXISTS "idx_batch_analyses_org_id" ON "batch_analyses" ("organization_id")`);
            } catch (_ignored: any) {}
            
            const retryVerify = await client.query(`
              SELECT table_name FROM information_schema.tables 
              WHERE table_schema = 'public' AND table_name IN ('eval_jobs', 'eval_manual_overrides')
              ORDER BY table_name
            `);
            const retryTables = retryVerify.rows.map((r: any) => r.table_name);
            console.log(`[DB-VERIFY] Eval tables after retry: ${retryTables.length > 0 ? retryTables.join(', ') : 'STILL NONE'}`);
          }
          
          if (migrationErrors > 0) {
            console.log(`⚠️ Schema migrations completed with ${migrationErrors} error(s):`);
            for (const fm of failedMigrations) {
              console.log(`  ${fm}`);
            }
          } else {
            console.log('✅ Schema migrations completed');
          }
          
          // Data migration: Create SIEM permissions for existing roles that don't have them
          console.log('Running data migrations for SIEM permissions...');
          
          // Find all role_permissions_modular entries that don't have a permission_siem_mgmt_id
          const rolePermsWithoutSiem = await client.query(`
            SELECT rpm.id, rpm.role_id, r.name as role_name
            FROM role_permissions_modular rpm
            LEFT JOIN roles r ON r.id = rpm.role_id
            WHERE rpm.permission_siem_mgmt_id IS NULL
          `);
          
          for (const row of rolePermsWithoutSiem.rows) {
            // Check if this is a Super Admin role (grant all permissions) or other roles (grant none)
            const isSuperAdmin = row.role_name && row.role_name.toLowerCase().includes('super admin');
            
            // Create a SIEM permission entry
            const siemPermResult = await client.query(`
              INSERT INTO permission_siem_mgmt (install, delete, enable_disable, view, created_at, updated_at)
              VALUES ($1, $2, $3, $4, NOW(), NOW())
              RETURNING id
            `, [isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin]);
            
            const siemPermId = siemPermResult.rows[0].id;
            
            // Link it to the role_permissions_modular entry
            await client.query(`
              UPDATE role_permissions_modular
              SET permission_siem_mgmt_id = $1
              WHERE id = $2
            `, [siemPermId, row.id]);
            
            console.log(`✅ Created SIEM permissions for role "${row.role_name}" (roleId: ${row.role_id}, all perms: ${isSuperAdmin})`);
          }
          
          if (rolePermsWithoutSiem.rows.length === 0) {
            console.log('✅ All roles already have SIEM permissions configured');
          } else {
            console.log(`✅ Data migration completed: Added SIEM permissions for ${rolePermsWithoutSiem.rows.length} roles`);
          }
          
          // Data migration: Create Foundry permissions for existing roles that don't have them
          console.log('Running data migrations for Foundry AI permissions...');
          
          // Find all role_permissions_modular entries that don't have a permission_foundry_mgmt_id
          const rolePermsWithoutFoundry = await client.query(`
            SELECT rpm.id, rpm.role_id, r.name as role_name
            FROM role_permissions_modular rpm
            LEFT JOIN roles r ON r.id = rpm.role_id
            WHERE rpm.permission_foundry_mgmt_id IS NULL
          `);
          
          for (const row of rolePermsWithoutFoundry.rows) {
            // Check if this is a Super Admin role (grant all permissions) or other roles (grant none)
            const isSuperAdmin = row.role_name && row.role_name.toLowerCase().includes('super admin');
            
            // Create a Foundry permission entry with tab permissions
            const foundryPermResult = await client.query(`
              INSERT INTO permission_foundry_mgmt (add, edit, delete, view, tab_wizard, tab_resources, tab_foundry_action, tab_chat_playground, tab_resource_sets, tab_content_understanding, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
              RETURNING id
            `, [isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin]);
            
            const foundryPermId = foundryPermResult.rows[0].id;
            
            // Link it to the role_permissions_modular entry
            await client.query(`
              UPDATE role_permissions_modular
              SET permission_foundry_mgmt_id = $1
              WHERE id = $2
            `, [foundryPermId, row.id]);
            
            console.log(`✅ Created Foundry AI permissions for role "${row.role_name}" (roleId: ${row.role_id}, all perms: ${isSuperAdmin})`);
          }
          
          if (rolePermsWithoutFoundry.rows.length === 0) {
            console.log('✅ All roles already have Foundry AI permissions configured');
          } else {
            console.log(`✅ Data migration completed: Added Foundry AI permissions for ${rolePermsWithoutFoundry.rows.length} roles`);
          }
          
          // Data migration: Update existing Foundry permissions to set tab columns for Super Admin roles
          console.log('Running data migrations for Foundry AI tab permissions...');
          
          // Find Super Admin roles and update their foundry permissions with tab access
          const superAdminRolesForTabs = await client.query(`
            SELECT pfm.id, r.name as role_name
            FROM permission_foundry_mgmt pfm
            JOIN role_permissions_modular rpm ON rpm.permission_foundry_mgmt_id = pfm.id
            JOIN roles r ON r.id = rpm.role_id
            WHERE LOWER(r.name) LIKE '%super admin%'
            AND (pfm.tab_wizard = false OR pfm.tab_resources = false OR pfm.tab_foundry_action = false 
                 OR pfm.tab_chat_playground = false OR pfm.tab_resource_sets = false OR pfm.tab_content_understanding = false)
          `);
          
          for (const row of superAdminRolesForTabs.rows) {
            await client.query(`
              UPDATE permission_foundry_mgmt
              SET tab_wizard = true, tab_resources = true, tab_foundry_action = true, 
                  tab_chat_playground = true, tab_resource_sets = true, tab_content_understanding = true
              WHERE id = $1
            `, [row.id]);
            
            console.log(`✅ Updated Foundry AI tab permissions for Super Admin role "${row.role_name}"`);
          }
          
          if (superAdminRolesForTabs.rows.length === 0) {
            console.log('✅ All Super Admin roles already have Foundry AI tab permissions configured');
          } else {
            console.log(`✅ Data migration completed: Updated tab permissions for ${superAdminRolesForTabs.rows.length} Super Admin roles`);
          }
          
          // Data migration: Create Document Translation permissions for existing roles that don't have them
          console.log('Running data migrations for Document Translation permissions...');
          
          // Find all role_permissions_modular entries that don't have a permission_document_translation_id
          const rolePermsWithoutDocTranslation = await client.query(`
            SELECT rpm.id, rpm.role_id, r.name as role_name
            FROM role_permissions_modular rpm
            LEFT JOIN roles r ON r.id = rpm.role_id
            WHERE rpm.permission_document_translation_id IS NULL
          `);
          
          for (const row of rolePermsWithoutDocTranslation.rows) {
            // Check if this is a Super Admin role (grant all permissions) or other roles (grant none)
            const isSuperAdmin = row.role_name && row.role_name.toLowerCase().includes('super admin');
            
            // Create a Document Translation permission entry
            const docTranslationPermResult = await client.query(`
              INSERT INTO permission_document_translation (view, run_translation, delete_translation, created_at, updated_at)
              VALUES ($1, $2, $3, NOW(), NOW())
              RETURNING id
            `, [isSuperAdmin, isSuperAdmin, isSuperAdmin]);
            
            const docTranslationPermId = docTranslationPermResult.rows[0].id;
            
            // Link it to the role_permissions_modular entry
            await client.query(`
              UPDATE role_permissions_modular
              SET permission_document_translation_id = $1
              WHERE id = $2
            `, [docTranslationPermId, row.id]);
            
            console.log(`✅ Created Document Translation permissions for role "${row.role_name}" (roleId: ${row.role_id}, all perms: ${isSuperAdmin})`);
          }
          
          if (rolePermsWithoutDocTranslation.rows.length === 0) {
            console.log('✅ All roles already have Document Translation permissions configured');
          } else {
            console.log(`✅ Data migration completed: Added Document Translation permissions for ${rolePermsWithoutDocTranslation.rows.length} roles`);
          }
          
          // Data migration: Create SFTP Management permissions for existing roles that don't have them
          console.log('Running data migrations for SFTP Management permissions...');
          
          // Find all role_permissions_modular entries that don't have a permission_sftp_mgmt_id
          const rolePermsWithoutSftp = await client.query(`
            SELECT rpm.id, rpm.role_id, r.name as role_name
            FROM role_permissions_modular rpm
            LEFT JOIN roles r ON r.id = rpm.role_id
            WHERE rpm.permission_sftp_mgmt_id IS NULL
          `);
          
          for (const row of rolePermsWithoutSftp.rows) {
            // Check if this is a Super Admin role (grant all permissions) or other roles (grant none)
            const isSuperAdmin = row.role_name && row.role_name.toLowerCase().includes('super admin');
            
            // Create an SFTP Management permission entry
            const sftpPermResult = await client.query(`
              INSERT INTO permission_sftp_mgmt (view, "create", "update", disable, delete, map_user, view_self_access, rotate_ssh_self, rotate_password_self, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
              RETURNING id
            `, [isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin]);
            
            const sftpPermId = sftpPermResult.rows[0].id;
            
            // Link it to the role_permissions_modular entry
            await client.query(`
              UPDATE role_permissions_modular
              SET permission_sftp_mgmt_id = $1
              WHERE id = $2
            `, [sftpPermId, row.id]);
            
            console.log(`✅ Created SFTP Management permissions for role "${row.role_name}" (roleId: ${row.role_id}, all perms: ${isSuperAdmin})`);
          }
          
          if (rolePermsWithoutSftp.rows.length === 0) {
            console.log('✅ All roles already have SFTP Management permissions configured');
          } else {
            console.log(`✅ Data migration completed: Added SFTP Management permissions for ${rolePermsWithoutSftp.rows.length} roles`);
          }
          
          // Data migration: Create Customer Onboarding permissions for existing roles that don't have them
          // Also handle orphaned links (permission_customer_onboarding_id points to non-existent permission)
          console.log('Running data migrations for Customer Onboarding permissions...');
          
          // Debug: Count total rows in role_permissions_modular
          const totalRpmRows = await client.query(`SELECT COUNT(*) as total FROM role_permissions_modular`);
          console.log(`[DEBUG] Total rows in role_permissions_modular: ${totalRpmRows.rows[0]?.total || 0}`);
          
          // Find all role_permissions_modular entries that don't have a valid permission_customer_onboarding_id
          const rolePermsWithoutCo = await client.query(`
            SELECT rpm.id, rpm.role_id, r.name as role_name, rpm.permission_customer_onboarding_id
            FROM role_permissions_modular rpm
            LEFT JOIN roles r ON r.id = rpm.role_id
            LEFT JOIN permission_customer_onboarding pco ON pco.id = rpm.permission_customer_onboarding_id
            WHERE rpm.permission_customer_onboarding_id IS NULL OR pco.id IS NULL
          `);
          console.log(`[DEBUG] Found ${rolePermsWithoutCo.rows.length} roles without valid Customer Onboarding permissions`);
          
          for (const row of rolePermsWithoutCo.rows) {
            // Check if this is a Super Admin role (grant all permissions) or other roles (grant none)
            const isSuperAdmin = row.role_name && row.role_name.toLowerCase().includes('super admin');
            
            // Create a Customer Onboarding permission entry
            const coPermResult = await client.query(`
              INSERT INTO permission_customer_onboarding (view, upload, commit, delete, created_at, updated_at)
              VALUES ($1, $2, $3, $4, NOW(), NOW())
              RETURNING id
            `, [isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin]);
            
            const coPermId = coPermResult.rows[0].id;
            
            // Link it to the role_permissions_modular entry
            await client.query(`
              UPDATE role_permissions_modular
              SET permission_customer_onboarding_id = $1
              WHERE id = $2
            `, [coPermId, row.id]);
            
            console.log(`✅ Created Customer Onboarding permissions for role "${row.role_name}" (roleId: ${row.role_id}, all perms: ${isSuperAdmin})`);
          }
          
          if (rolePermsWithoutCo.rows.length === 0) {
            console.log('✅ All roles already have Customer Onboarding permissions configured');
          } else {
            console.log(`✅ Data migration completed: Added Customer Onboarding permissions for ${rolePermsWithoutCo.rows.length} roles`);
          }
          
          // Data migration: Create Content Understanding permissions for existing roles that don't have them
          console.log('Running data migrations for Content Understanding permissions...');
          
          const rolePermsWithoutCu = await client.query(`
            SELECT rpm.id, rpm.role_id, r.name as role_name, rpm.permission_content_understanding_id
            FROM role_permissions_modular rpm
            LEFT JOIN roles r ON r.id = rpm.role_id
            LEFT JOIN permission_content_understanding pcu ON pcu.id = rpm.permission_content_understanding_id
            WHERE rpm.permission_content_understanding_id IS NULL OR pcu.id IS NULL
          `);
          console.log(`[DEBUG] Found ${rolePermsWithoutCu.rows.length} roles without valid Content Understanding permissions`);
          
          for (const row of rolePermsWithoutCu.rows) {
            const isSuperAdmin = row.role_name && row.role_name.toLowerCase().includes('super admin');
            
            const cuPermResult = await client.query(`
              INSERT INTO permission_content_understanding (view, run_analysis, save_analysis, delete_analysis, menu_visibility, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
              RETURNING id
            `, [isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin]);
            
            const cuPermId = cuPermResult.rows[0].id;
            
            await client.query(`
              UPDATE role_permissions_modular
              SET permission_content_understanding_id = $1
              WHERE id = $2
            `, [cuPermId, row.id]);
            
            console.log(`✅ Created Content Understanding permissions for role "${row.role_name}" (roleId: ${row.role_id}, all perms: ${isSuperAdmin})`);
          }
          
          if (rolePermsWithoutCu.rows.length === 0) {
            console.log('✅ All roles already have Content Understanding permissions configured');
          } else {
            console.log(`✅ Data migration completed: Added Content Understanding permissions for ${rolePermsWithoutCu.rows.length} roles`);
          }
          
          // Data migration: Create Transfer Reports permissions for existing roles that don't have them
          // Also handle orphaned links (permission_transfer_reports_id points to non-existent permission)
          console.log('Running data migrations for Transfer Reports permissions...');
          
          // Find all role_permissions_modular entries that don't have a valid permission_transfer_reports_id
          const rolePermsWithoutTr = await client.query(`
            SELECT rpm.id, rpm.role_id, r.name as role_name, rpm.permission_transfer_reports_id
            FROM role_permissions_modular rpm
            LEFT JOIN roles r ON r.id = rpm.role_id
            LEFT JOIN permission_transfer_reports ptr ON ptr.id = rpm.permission_transfer_reports_id
            WHERE rpm.permission_transfer_reports_id IS NULL OR ptr.id IS NULL
          `);
          console.log(`[DEBUG] Found ${rolePermsWithoutTr.rows.length} roles without valid Transfer Reports permissions`);
          
          for (const row of rolePermsWithoutTr.rows) {
            // Check if this is a Super Admin role (grant all permissions) or other roles (grant none)
            const isSuperAdmin = row.role_name && row.role_name.toLowerCase().includes('super admin');
            
            // Create a Transfer Reports permission entry
            const trPermResult = await client.query(`
              INSERT INTO permission_transfer_reports (view, view_details, download, created_at, updated_at)
              VALUES ($1, $2, $3, NOW(), NOW())
              RETURNING id
            `, [isSuperAdmin, isSuperAdmin, isSuperAdmin]);
            
            const trPermId = trPermResult.rows[0].id;
            
            // Link it to the role_permissions_modular entry
            await client.query(`
              UPDATE role_permissions_modular
              SET permission_transfer_reports_id = $1
              WHERE id = $2
            `, [trPermId, row.id]);
            
            console.log(`✅ Created Transfer Reports permissions for role "${row.role_name}" (roleId: ${row.role_id}, all perms: ${isSuperAdmin})`);
          }
          
          if (rolePermsWithoutTr.rows.length === 0) {
            console.log('✅ All roles already have Transfer Reports permissions configured');
          } else {
            console.log(`✅ Data migration completed: Added Transfer Reports permissions for ${rolePermsWithoutTr.rows.length} roles`);
          }
          
          console.log('Running data migrations for Eval permissions...');
          
          const rolePermsWithoutEval = await client.query(`
            SELECT rpm.id, rpm.role_id, r.name as role_name, rpm.permission_eval_id
            FROM role_permissions_modular rpm
            LEFT JOIN roles r ON r.id = rpm.role_id
            LEFT JOIN permission_eval pe ON pe.id = rpm.permission_eval_id
            WHERE rpm.permission_eval_id IS NULL OR pe.id IS NULL
          `);
          console.log(`[DEBUG] Found ${rolePermsWithoutEval.rows.length} roles without valid Eval permissions`);
          
          for (const row of rolePermsWithoutEval.rows) {
            const isSuperAdmin = row.role_name && row.role_name.toLowerCase().includes('super admin');
            
            const evalPermResult = await client.query(`
              INSERT INTO permission_eval (view, run, review, finalize, menu_visibility, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
              RETURNING id
            `, [isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin, isSuperAdmin]);
            
            const evalPermId = evalPermResult.rows[0].id;
            
            await client.query(`
              UPDATE role_permissions_modular
              SET permission_eval_id = $1
              WHERE id = $2
            `, [evalPermId, row.id]);
            
            console.log(`✅ Created Eval permissions for role "${row.role_name}" (roleId: ${row.role_id}, all perms: ${isSuperAdmin})`);
          }
          
          if (rolePermsWithoutEval.rows.length === 0) {
            console.log('✅ All roles already have Eval permissions configured');
          } else {
            console.log(`✅ Data migration completed: Added Eval permissions for ${rolePermsWithoutEval.rows.length} roles`);
          }
          
        } finally {
          client.release();
        }
      };
      
      await createTables();
      console.log('✅ Database tables created successfully');
    } catch (error) {
      console.error('❌ Failed to create database tables:', (error as Error).message);
      // Don't exit the process, let it continue
    }
  }
}

// Test database connection on startup with a few retries:
async function testConnection() {
  let retries = 3;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('Database connection successful');
      break;
    } catch (error) {
      retries--;
      console.log(`Database connection attempt failed, ${retries} retries remaining`);
      if (retries > 0) {
        await new Promise(res => setTimeout(res, 2000));
      } else {
        console.log('Database connection failed after all retries, continuing startup');
      }
    }
  }
}

// Export the Pool and a Drizzle ORM DB instance:
export { pool };
export const db = drizzle({ client: pool, schema });

// Initialize database
export async function initializeDatabase() {
  await autoCreateTables(db);
  await testConnection();
}
