# Eval System Migration and Enhancement

The project has been migrated and enhanced with the following features:

- **Azure Integration**: Full integration with Azure Content Understanding, Document Translation, and Foundry AI.
- **Blob Storage Persistence**: 
  - Heavy analysis results (JSON) are stored in Azure Blob Storage.
  - Database stores only metadata references (`{blobPath, resultNumber}`).
  - This pattern applies to Content Understanding, Document Translation, and Eval (Answer Sheet Evaluation) systems.
- **Organization-Specific Storage**:
  - Each organization can have its own Azure Storage Account configured in the `storage_accounts` table.
  - The application automatically picks the organization-specific storage account, with environment variables as a fallback.
- **Automatic Data Retrieval**:
  - GET endpoints for jobs automatically fetch the full JSON data from Blob Storage before returning to the frontend.
- **Enhanced Logging**:
  - Clear logs indicating the storage source (Database vs Environment) and the specific account/container used.
- **Post-Call Intelligence Analysis**:
  - Available in Content Discovery (`client/src/pages/content-discovery.tsx`) for audio/video transcript results.
  - Detected automatically when CU result `contents[]` have `startTime`/`endTime` fields.
  - New "Post-Call" tab appears in the result viewer; clicking "Run Post-Call Analysis" sends the transcript to the org's configured Foundry AI agent via `POST /api/cu/post-call-analysis`.
  - Backend route uses `contentUnderstandingPermissionRequired('runAnalysis')` — no separate Foundry permission needed.
  - Agent response is parsed from JSON and rendered by `PostCallAnalysis` component (`client/src/components/post-call-analysis.tsx`) with SVG score rings, risk flags, QA scorecard, timeline, sentiment, recommendations, and more.

## Configuration

Ensure the following environment variables are set for fallback/default behavior:
- `ZAPPER_STORAGE_ACCOUNT_NAME`
- `ZAPPER_CONTAINER_NAME`
- `ZAPPER_FOUNDRY_MODELS_RESOURCE_NAME`
- `AZURE_STORAGE_CONNECTION_STRING` (or Managed Identity)

For organization-specific storage, add entries to the `storage_accounts` table and link them to organizations.
