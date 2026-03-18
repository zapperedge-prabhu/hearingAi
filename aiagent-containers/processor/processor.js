const express = require('express');
const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const MAX_PROCESSING_TIME = 3600000; // 1 hour

const credential = new DefaultAzureCredential();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'ai-agent-processor' });
});

// Process AI agent job
app.post('/api/process', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { manifest } = req.body;
    
    if (!manifest) {
      return res.status(400).json({ 
        error: 'Missing required field: manifest' 
      });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[START] Processing AI Agent Job`);
    console.log(`[AGENT] ${manifest.agent_name}`);
    console.log(`[FILE] ${manifest.source_file.name}`);
    console.log(`${'='.repeat(60)}`);

    // Call AI service
    const result = await callAIService(manifest);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[SUCCESS] Processing completed in ${duration}s`);
    console.log(`${'='.repeat(60)}\n`);

    res.json({
      success: true,
      message: 'AI agent processing completed successfully',
      duration: parseFloat(duration),
      result: result
    });

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[ERROR] Processing failed after ${duration}s:`, error.message);
    console.log(`${'='.repeat(60)}\n`);

    // Try to write error result to storage
    try {
      if (req.body.manifest) {
        await writeErrorResult(req.body.manifest, error);
      }
    } catch (writeError) {
      console.error(`[ERROR] Could not write error result:`, writeError.message);
    }

    res.status(500).json({
      success: false,
      error: 'AI agent processing failed',
      details: error.message,
      duration: parseFloat(duration)
    });
  }
});

async function callAIService(manifest) {
  try {
    const { api_endpoint, api_key, source_file, agent_name } = manifest;
    
    console.log(`[AI CALL] Invoking external AI API: ${api_endpoint}`);
    console.log(`[AI CALL] Agent: ${agent_name}`);
    console.log(`[AI CALL] File: ${source_file.name}`);
    console.log(`[AI CALL] Simplified payload - Option 2: Only source_file_url sent`);
    
    const response = await axios.post(
      api_endpoint,
      {
        source_file_url: source_file.sas_url
      },
      {
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json'
        },
        timeout: MAX_PROCESSING_TIME
      }
    );
    
    console.log(`[AI SUCCESS] Status: ${response.status}`);
    console.log(`[AI SUCCESS] Response:`, JSON.stringify(response.data).substring(0, 200));
    
    // Write AI response to result file in Azure storage
    // Processor handles blob storage - external API just returns JSON
    await writeResultToStorage(manifest, response.data);
    
    return {
      success: true,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    if (error.response) {
      console.error(`[AI ERROR] Status: ${error.response.status}`);
      console.error(`[AI ERROR] Response:`, error.response.data);
      throw new Error(`AI service error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      console.error(`[AI ERROR] No response received`);
      throw new Error(`AI service timeout or network error: ${error.message}`);
    } else {
      console.error(`[AI ERROR] Request setup failed:`, error.message);
      throw new Error(`AI service request failed: ${error.message}`);
    }
  }
}

/**
 * Write AI agent result to Azure storage
 */
async function writeResultToStorage(manifest, aiResponse) {
  try {
    const { result_file, agent_name, source_file } = manifest;
    
    console.log(`[WRITE] Writing AI result to: ${result_file.path}`);
    
    // Parse the result file URI to extract storage account and container
    // Use result_file.path directly for the blob path (it's already decoded with spaces)
    const urlParts = new URL(result_file.uri);
    const accountName = urlParts.hostname.split('.')[0];
    const pathParts = urlParts.pathname.split('/');
    const containerName = pathParts[1];
    // Use the decoded path from manifest instead of extracting from encoded URI
    const blobPath = result_file.path;
    
    // Create blob service client using managed identity
    const blobServiceUrl = `https://${accountName}.blob.core.windows.net`;
    const blobServiceClient = new BlobServiceClient(blobServiceUrl, credential);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    
    // Format the result content
    const resultContent = formatAIResult(manifest, aiResponse);
    
    // Upload to Azure storage
    await blockBlobClient.upload(resultContent, Buffer.byteLength(resultContent), {
      blobHTTPHeaders: { blobContentType: 'text/plain; charset=utf-8' },
      metadata: {
        agent_name: agent_name,
        source_file: source_file.name,
        processed_at: new Date().toISOString(),
        processor: 'zapper-ai-agent'
      }
    });
    
    console.log(`[WRITE SUCCESS] Result saved to: ${result_file.path}`);
    console.log(`[WRITE SUCCESS] Size: ${Buffer.byteLength(resultContent)} bytes`);
    
  } catch (error) {
    console.error(`[WRITE ERROR] Failed to write result to storage:`, error.message);
    throw new Error(`Failed to save AI result to storage: ${error.message}`);
  }
}

/**
 * Format AI response into readable text format
 */
function formatAIResult(manifest, aiResponse) {
  const timestamp = new Date().toISOString();
  
  // Create a formatted header
  let content = `${'='.repeat(80)}\n`;
  content += `AI AGENT PROCESSING RESULT\n`;
  content += `${'='.repeat(80)}\n\n`;
  
  content += `Agent Name:      ${manifest.agent_name}\n`;
  content += `Source File:     ${manifest.source_file.name}\n`;
  content += `File Path:       ${manifest.source_file.path}\n`;
  content += `Processed At:    ${timestamp}\n`;
  content += `Organization ID: ${manifest.organization_id}\n`;
  content += `User ID:         ${manifest.user_id}\n`;
  content += `\n${'='.repeat(80)}\n`;
  content += `AI RESPONSE\n`;
  content += `${'='.repeat(80)}\n\n`;
  
  // Add the AI response (formatted as JSON if it's an object, otherwise as text)
  if (typeof aiResponse === 'object') {
    content += JSON.stringify(aiResponse, null, 2);
  } else {
    content += aiResponse.toString();
  }
  
  content += `\n\n${'='.repeat(80)}\n`;
  content += `Status: SUCCESS\n`;
  content += `${'='.repeat(80)}\n`;
  
  return content;
}

async function writeErrorResult(manifest, error) {
  try {
    const { result_file } = manifest;
    const urlParts = new URL(result_file.uri);
    const accountName = urlParts.hostname.split('.')[0];
    const pathParts = urlParts.pathname.split('/');
    const containerName = pathParts[1];
    // Use the decoded path from manifest instead of extracting from encoded URI
    const blobPath = result_file.path;
    
    const blobServiceUrl = `https://${accountName}.blob.core.windows.net`;
    const blobServiceClient = new BlobServiceClient(blobServiceUrl, credential);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    
    const errorContent = `AI Agent Processing Failed
Agent: ${manifest.agent_name}
File: ${manifest.source_file.name}
Time: ${new Date().toISOString()}

Error Details:
${error.message}

Status: FAILED
`;
    
    await blockBlobClient.upload(errorContent, Buffer.byteLength(errorContent), {
      blobHTTPHeaders: { blobContentType: 'text/plain' }
    });
    
    console.log(`[ERROR LOGGED] Written error result to: ${result_file.path}`);
  } catch (writeError) {
    console.error(`[ERROR] Failed to write error result:`, writeError.message);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`AI Agent Processor HTTP Server`);
  console.log(`Port: ${PORT}`);
  console.log(`Using Managed Identity authentication`);
  console.log(`Ready to process AI agent jobs\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Received SIGTERM signal');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Received SIGINT signal');
  process.exit(0);
});
