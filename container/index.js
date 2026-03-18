const express = require('express');
const OptimizedFolderZipper = require('./zipperApp');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Custom headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'ACA Folder Zipper');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Optional, useful for browser requests
  next();
});

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Main zip endpoint
app.post('/zip', async (req, res) => {
  try {
    const { storage_account, container, directory_path, output_blob, sas_token } = req.body;

    // Validate required fields
    if (!storage_account || !container || !directory_path || !output_blob) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['storage_account', 'container', 'directory_path', 'output_blob']
      });
    }

    console.log(`📨 Received zip request for: ${storage_account}/${container}/${directory_path}`);

    // Create zipper instance with config
    const config = {
      storageAccount: storage_account,
      containerName: container,
      directoryPath: directory_path,
      outputBlob: output_blob,
      sasToken: sas_token || undefined
    };

    const zipper = new OptimizedFolderZipper(config);
    
    // Run the zip process
    const result = await zipper.run();
    
    // Return success response
    res.status(200).json({
      success: true,
      message: result.message,
      output_url: `https://${storage_account}.blob.core.windows.net/${container}/${output_blob}`,
      config: {
        storage_account,
        container,
        directory_path,
        output_blob,
        sas_token_provided: !!sas_token
      }
    });

  } catch (error) {
    console.error('❌ Zip endpoint error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Zipper microservice listening on port ${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /healthz - Health check`);
  console.log(`   POST /zip     - Create zip archive`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');  
  process.exit(0);
});