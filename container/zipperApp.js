#!/usr/bin/env node

// Required Azure and Node modules
const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const archiver = require('archiver');
const path = require('path');
const { PassThrough } = require('stream');

class OptimizedFolderZipper {
  constructor(config) {
    // Load configuration from constructor parameter
    this.storageAccount = config.storageAccount;
    this.containerName = config.containerName;
    this.directoryPath = config.directoryPath;
    this.outputBlob = config.outputBlob;
    this.sasToken = config.sasToken;
    
    // Tuning parameters (with defaults)
    this.MAX_MEMORY_USAGE = parseInt(process.env.ZAPPER_MAX_MEMORY_MB || '500') * 1024 * 1024;
    this.CONCURRENT_DOWNLOADS = parseInt(process.env.ZAPPER_CONCURRENT_DOWNLOADS || '3');
    this.STREAM_THRESHOLD = parseInt(process.env.ZAPPER_STREAM_THRESHOLD_MB || '100') * 1024 * 1024;

    // Basic validation
    if (!this.storageAccount || !this.containerName || !this.directoryPath || !this.outputBlob) {
      throw new Error('Missing required configuration: storageAccount, containerName, directoryPath, outputBlob');
    }

    console.log('📋 ACA Optimized Zipper Configuration:');
    console.log(`   Storage Account: ${this.storageAccount}`);
    console.log(`   Container: ${this.containerName}`);
    console.log(`   Directory: ${this.directoryPath}`);
    console.log(`   Output Blob: ${this.outputBlob}`);
    console.log(`   SAS Token: ${this.sasToken ? 'PROVIDED' : 'NOT PROVIDED (using DefaultAzureCredential)'}`);
    console.log(`   Max Memory: ${Math.round(this.MAX_MEMORY_USAGE/1024/1024)}MB`);
    console.log(`   Concurrent Downloads: ${this.CONCURRENT_DOWNLOADS}`);
    console.log(`   Stream Threshold: ${Math.round(this.STREAM_THRESHOLD/1024/1024)}MB`);

    // Initialize Azure Blob clients
    this.initializeClients();
  }

  initializeClients() {
    try {
      if (this.sasToken) {
        // Use SAS token for authentication
        const blobServiceUrl = `https://${this.storageAccount}.blob.core.windows.net?${this.sasToken}`;
        this.blobServiceClient = new BlobServiceClient(blobServiceUrl);
      } else {
        // Use default Azure credentials (e.g., Managed Identity or az login session)
        const credential = new DefaultAzureCredential();
        this.blobServiceClient = new BlobServiceClient(
          `https://${this.storageAccount}.blob.core.windows.net`,
          credential
        );
      }
      this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      console.log('✅ Azure clients initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Azure clients:', error);
      throw error;
    }
  }

  async listDirectoryFiles(directoryPath) {
    try {
      console.log(`📁 Listing files in directory: ${directoryPath}`);
      const files = [];
      let totalSize = 0;
      // Ensure prefix ends with '/' for proper folder listing
      const prefix = directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`;

      for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
        // Skip "directory" placeholders (names ending in '/')
        if (blob.name.endsWith('/')) continue;
        const fileSize = blob.properties.contentLength || 0;
        totalSize += fileSize;
        files.push({
          name: blob.name,
          size: fileSize,
          relativePath: blob.name.substring(prefix.length)  // file path relative to the directory
        });
      }

      console.log(`📊 Found ${files.length} files to zip`);
      console.log(`📊 Total size: ${Math.round(totalSize/1024/1024)} MB`);

      // Optionally sort files by size (smallest first) to optimize memory usage
      files.sort((a, b) => a.size - b.size);
      return { files, totalSize };
    } catch (error) {
      console.error('❌ Failed to list directory files:', error);
      throw error;
    }
  }

  async createOptimizedZipStream() {
    try {
      console.log('🚀 Starting optimized zip creation process...');
      const { files, totalSize } = await this.listDirectoryFiles(this.directoryPath);
      if (files.length === 0) {
        console.warn('⚠️  No files found in the specified directory.');
        return;
      }
      // Decide whether to stream or buffer based on total size
      const useStreaming = totalSize > this.STREAM_THRESHOLD;
      console.log(`📋 Strategy: ${useStreaming ? 'STREAMING (large dataset)' : 'BUFFERING (small dataset)'}`);

      if (useStreaming) {
        await this.createStreamingZip(files, totalSize);
      } else {
        await this.createBufferedZip(files, totalSize);
      }
    } catch (error) {
      console.error('❌ Failed to create zip archive:', error);
      throw error;
    }
  }

  async createStreamingZip(files, totalSize) {
    console.log('🌊 Using STREAMING strategy for large dataset...');
    console.log('   Each file will be streamed from Blob Storage and compressed on-the-fly.');

    // Prepare archiver in ZIP mode (with moderate compression level for speed)
    const archive = archiver('zip', { zlib: { level: 6 } });
    // Set up event handlers for archiver
    archive.on('warning', err => {
      if (err.code === 'ENOENT') {
        console.warn(`⚠️ Archiver warning: ${err.message}`);
      } else {
        throw err;  // Any other non-fatal warning, treat as error
      }
    });
    archive.on('error', err => {
      console.error('❌ Archive error:', err);
      throw err;  // This will be caught by outer try-catch
    });
    archive.on('end', () => {
      console.log(`📦 Archive stream finished. Total ZIP size: ${Math.round(archive.pointer() / (1024*1024))} MB`);
    });

    // Azure Blob output stream setup
    const outputBlobClient = this.containerClient.getBlockBlobClient(this.outputBlob);
    // Configure streaming upload options
    const blockSize = 8 * 1024 * 1024;  // 8MB data chunks per block
    const maxConcurrency = 4;           // 4 parallel block uploads
    console.log(`📤 Initiating upload to blob "${this.outputBlob}" (blockSize=${blockSize/(1024*1024)}MB, concurrency=${maxConcurrency})`);

    // Start uploading the archive stream to Azure Blob Storage
    const uploadPromise = outputBlobClient.uploadStream(archive, blockSize, maxConcurrency, {
      blobHTTPHeaders: { blobContentType: 'application/zip' },
      onProgress: (progress) => {
        // Log progress occasionally (for very large blobs, this keeps us informed)
        if (progress.loadedBytes >= totalSize) {
          // When loadedBytes >= totalSize, the upload is essentially done (or compression made it smaller)
          console.log(`📊 Upload progress: 100% (${Math.round(progress.loadedBytes/1024/1024)} MB uploaded)`);
        } else if (progress.loadedBytes % (50 * 1024 * 1024) === 0 || progress.loadedBytes === totalSize) {
          // Every 50MB or at end, log progress
          const percent = totalSize ? ((progress.loadedBytes / totalSize) * 100).toFixed(1) : null;
          if (percent) {
            console.log(`📊 Upload progress: ${percent}% (${Math.round(progress.loadedBytes/1024/1024)} MB of ${Math.round(totalSize/1024/1024)} MB)`);
          } else {
            console.log(`📊 Uploaded ${Math.round(progress.loadedBytes/1024/1024)} MB...`);
          }
        }
      }
    });

    // Stream files into the archive one by one
    let processedFiles = 0;
    for (const file of files) {
      processedFiles++;
      console.log(`📄 [${processedFiles}/${files.length}] Adding file: ${file.name} (${Math.round(file.size/1024/1024)} MB)`);
      try {
        const blobClient = this.containerClient.getBlobClient(file.name);
        // Download the blob as a stream (without loading into memory)
        const downloadResponse = await blobClient.download();
        const fileStream = downloadResponse.readableStreamBody;
        if (!fileStream) {
          throw new Error(`No stream available for blob ${file.name}`);
        }
        // Append the blob's read stream to the ZIP archive
        // We wait for this stream to end before proceeding to the next file to avoid too many open streams
        await new Promise((resolve, reject) => {
          fileStream.on('end', resolve);
          fileStream.on('error', err => {
            console.error(`❌ Read stream error for file ${file.name}:`, err);
            reject(err);
          });
          archive.append(fileStream, { name: file.relativePath });  // Add to archive with correct path
        });
      } catch (fileError) {
        console.error(`❌ Error processing file "${file.name}":`, fileError);
        throw fileError;  // Break out on file error
      }
    }

    // Finalize the archive to flush remaining data and write central directory
    await archive.finalize();
    console.log('🔒 Archive finalize called, waiting for upload to complete...');

    // Wait for the Azure upload to finish
    await uploadPromise;
    console.log(`✅ Streaming zip archive "${this.outputBlob}" created and uploaded successfully.`);
  }

  async createBufferedZip(files, totalSize) {
    console.log('💾 Using BUFFERING strategy for smaller dataset...');

    // Create archiver with max compression (since data size is manageable)
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];
    let archiveSize = 0;
    archive.on('data', chunk => {
      chunks.push(chunk);
      archiveSize += chunk.length;
    });
    archive.on('warning', err => {
      if (err.code === 'ENOENT') {
        console.warn(`⚠️ Archiver warning: ${err.message}`);
      } else {
        throw err;
      }
    });
    archive.on('error', err => {
      console.error('❌ Archive error:', err);
      throw err;
    });
    let processedFiles = 0;
    for (const file of files) {
      processedFiles++;
      console.log(`📄 [${processedFiles}/${files.length}] Processing file: ${file.name}`);
      try {
        const blobClient = this.containerClient.getBlobClient(file.name);
        const downloadResponse = await blobClient.download();
        const fileStream = downloadResponse.readableStreamBody;
        if (fileStream) {
          // Read entire file into buffer (acceptable for small files total)
          const fileChunks = [];
          for await (const chunk of fileStream) {
            fileChunks.push(chunk);
          }
          const fileBuffer = Buffer.concat(fileChunks);
          archive.append(fileBuffer, { name: file.relativePath });
        }
        if (processedFiles % 5 === 0 || processedFiles === files.length) {
          const percent = ((processedFiles / files.length) * 100).toFixed(1);
          console.log(`📊 Buffered progress: ${percent}% (${processedFiles}/${files.length} files)`);
        }
      } catch (err) {
        console.error(`❌ Error buffering file "${file.name}":`, err);
        throw err;
      }
    }
    console.log('🔄 Finalizing archive (buffered mode)...');
    await new Promise((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('error', reject);
      archive.finalize();
    });
    const zipBuffer = Buffer.concat(chunks);
    console.log(`📦 Buffered archive size: ${Math.round(zipBuffer.length/(1024*1024))} MB`);
    // Upload the combined ZIP buffer in one request (suitable for smaller size)
    const outputBlobClient = this.containerClient.getBlockBlobClient(this.outputBlob);
    await outputBlobClient.upload(zipBuffer, zipBuffer.length, {
      blobHTTPHeaders: { blobContentType: 'application/zip' }
    });
    console.log(`✅ Buffered zip archive "${this.outputBlob}" uploaded successfully.`);
  }

  async run() {
    try {
      console.log('🚀 Starting Optimized Azure Folder Zipper...');
      console.log(`⏰ Start time: ${new Date().toISOString()}`);
      await this.createOptimizedZipStream();
      console.log(`⏰ End time: ${new Date().toISOString()}`);
      console.log('✅ Folder zipper process completed.');
      return { success: true, message: 'Folder zipper process completed successfully' };
    } catch (error) {
      console.error('❌ Folder zipper process failed:', error);
      throw error;
    }
  }
}

// Export the class for use as a module
module.exports = OptimizedFolderZipper;
