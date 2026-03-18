import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { db } from "./db";
import { fileTransferReports, users, organizations } from "@shared/schema";
import type { FileTransferReport, InsertFileTransferReport, FileTransferReportDetail } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const REPORT_CONTAINER = "zapper-up-download-report";

export class FileTransferReportService {
  private credential: DefaultAzureCredential;

  constructor() {
    this.credential = new DefaultAzureCredential();
  }

  private getBlobServiceClient(accountName: string): BlobServiceClient {
    return new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      this.credential
    );
  }

  private async ensureReportContainerExists(accountName: string): Promise<ContainerClient> {
    const blobService = this.getBlobServiceClient(accountName);
    const containerClient = blobService.getContainerClient(REPORT_CONTAINER);
    
    try {
      await containerClient.createIfNotExists();
      console.log(`[FILE-TRANSFER-REPORT] Ensured container exists: ${REPORT_CONTAINER}`);
    } catch (error: any) {
      if (error.statusCode !== 409) {
        console.error(`[FILE-TRANSFER-REPORT] Error creating container:`, error.message);
      }
    }
    
    return containerClient;
  }

  private generateBlobPath(orgId: number, actionType: string, actionId: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${orgId}/${year}/${month}/${day}/${actionType.toLowerCase()}_${actionId}.json`;
  }

  async initializeReport(
    organizationId: number,
    userId: number,
    actionType: "UPLOAD" | "DOWNLOAD",
    totalFiles: number,
    storageAccountName: string,
    containerName: string,
    userEmail: string,
    userName?: string
  ): Promise<{ actionId: string; report: FileTransferReport }> {
    const actionId = uuidv4();
    
    const [report] = await db.insert(fileTransferReports).values({
      actionId,
      organizationId,
      userId,
      actionType,
      totalFiles,
      successCount: 0,
      failureCount: 0,
      status: "IN_PROGRESS",
      storageAccountName,
      containerName,
    }).returning();

    console.log(`[FILE-TRANSFER-REPORT] Initialized ${actionType} report: ${actionId} for org ${organizationId}`);
    
    return { actionId, report };
  }

  async updateReportProgress(
    actionId: string,
    successCount: number,
    failureCount: number
  ): Promise<void> {
    await db.update(fileTransferReports)
      .set({ successCount, failureCount })
      .where(eq(fileTransferReports.actionId, actionId));
  }

  async finalizeReport(
    actionId: string,
    files: Array<{ fullPath: string; status: "SUCCESS" | "FAILED"; sizeBytes?: number; error?: string }>,
    userEmail: string,
    userName?: string
  ): Promise<FileTransferReport | null> {
    const [report] = await db.select()
      .from(fileTransferReports)
      .where(eq(fileTransferReports.actionId, actionId))
      .limit(1);

    if (!report) {
      console.error(`[FILE-TRANSFER-REPORT] Report not found for actionId: ${actionId}`);
      return null;
    }

    const successCount = files.filter(f => f.status === "SUCCESS").length;
    const failureCount = files.filter(f => f.status === "FAILED").length;
    
    let status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
    if (failureCount === 0) {
      status = "SUCCESS";
    } else if (successCount === 0) {
      status = "FAILED";
    } else {
      status = "PARTIAL_SUCCESS";
    }

    const now = new Date();
    const blobPath = this.generateBlobPath(report.organizationId, report.actionType, actionId);

    const detailReport: FileTransferReportDetail = {
      actionId,
      actionType: report.actionType as "UPLOAD" | "DOWNLOAD",
      initiatedBy: {
        userId: report.userId,
        email: userEmail,
        name: userName,
      },
      startedAt: report.createdAt?.toISOString() || now.toISOString(),
      completedAt: now.toISOString(),
      summary: {
        totalFiles: files.length,
        successful: successCount,
        failed: failureCount,
      },
      files,
    };

    let blobUploadSuccess = false;
    try {
      if (report.storageAccountName) {
        const containerClient = await this.ensureReportContainerExists(report.storageAccountName);
        const blobClient = containerClient.getBlockBlobClient(blobPath);
        const content = JSON.stringify(detailReport, null, 2);
        await blobClient.upload(content, Buffer.byteLength(content), {
          blobHTTPHeaders: { blobContentType: "application/json" },
        });
        console.log(`[FILE-TRANSFER-REPORT] Uploaded detailed report to: ${blobPath}`);
        blobUploadSuccess = true;
      }
    } catch (error: any) {
      console.error(`[FILE-TRANSFER-REPORT] Error uploading report to blob:`, error.message);
      blobUploadSuccess = false;
    }

    const [updated] = await db.update(fileTransferReports)
      .set({
        successCount,
        failureCount,
        status,
        reportBlobPath: blobUploadSuccess ? blobPath : null,
        completedAt: now,
      })
      .where(eq(fileTransferReports.actionId, actionId))
      .returning();

    console.log(`[FILE-TRANSFER-REPORT] Finalized report ${actionId}: ${status}`);
    return updated;
  }

  async listReports(
    organizationId: number,
    page: number = 1,
    pageSize: number = 20,
    actionType?: "UPLOAD" | "DOWNLOAD"
  ): Promise<{ reports: Array<FileTransferReport & { userName?: string; userEmail?: string }>; total: number }> {
    const offset = (page - 1) * pageSize;
    
    let whereClause = eq(fileTransferReports.organizationId, organizationId);
    if (actionType) {
      whereClause = and(whereClause, eq(fileTransferReports.actionType, actionType))!;
    }

    const reports = await db.select({
      id: fileTransferReports.id,
      actionId: fileTransferReports.actionId,
      organizationId: fileTransferReports.organizationId,
      userId: fileTransferReports.userId,
      actionType: fileTransferReports.actionType,
      totalFiles: fileTransferReports.totalFiles,
      successCount: fileTransferReports.successCount,
      failureCount: fileTransferReports.failureCount,
      status: fileTransferReports.status,
      reportBlobPath: fileTransferReports.reportBlobPath,
      storageAccountName: fileTransferReports.storageAccountName,
      containerName: fileTransferReports.containerName,
      createdAt: fileTransferReports.createdAt,
      completedAt: fileTransferReports.completedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(fileTransferReports)
    .leftJoin(users, eq(fileTransferReports.userId, users.id))
    .where(whereClause)
    .orderBy(desc(fileTransferReports.createdAt))
    .limit(pageSize)
    .offset(offset);

    const countResult = await db.select({ count: fileTransferReports.id })
      .from(fileTransferReports)
      .where(whereClause);

    return {
      reports: reports as any,
      total: countResult.length,
    };
  }

  async getReportById(actionId: string, organizationId: number): Promise<FileTransferReport | null> {
    const [report] = await db.select()
      .from(fileTransferReports)
      .where(and(
        eq(fileTransferReports.actionId, actionId),
        eq(fileTransferReports.organizationId, organizationId)
      ))
      .limit(1);

    return report || null;
  }

  async getReportDetails(
    actionId: string,
    organizationId: number
  ): Promise<FileTransferReportDetail | null> {
    console.log(`[FILE-TRANSFER-REPORT] Getting details for actionId=${actionId}, orgId=${organizationId}`);
    const report = await this.getReportById(actionId, organizationId);
    if (!report || !report.reportBlobPath || !report.storageAccountName) {
      console.log(`[FILE-TRANSFER-REPORT] Report missing required fields: report=${!!report}, blobPath=${report?.reportBlobPath}, storageAccount=${report?.storageAccountName}`);
      return null;
    }

    try {
      console.log(`[FILE-TRANSFER-REPORT] Fetching blob from ${report.storageAccountName}/${REPORT_CONTAINER}/${report.reportBlobPath}`);
      const blobService = this.getBlobServiceClient(report.storageAccountName);
      const containerClient = blobService.getContainerClient(REPORT_CONTAINER);
      const blobClient = containerClient.getBlobClient(report.reportBlobPath);
      
      const exists = await blobClient.exists();
      if (!exists) {
        console.warn(`[FILE-TRANSFER-REPORT] Report blob not found in Azure: ${report.reportBlobPath}`);
        return null;
      }

      const downloadResponse = await blobClient.download();
      const content = await this.streamToString(downloadResponse.readableStreamBody!);
      console.log(`[FILE-TRANSFER-REPORT] Successfully fetched report details for ${actionId}`);
      return JSON.parse(content) as FileTransferReportDetail;
    } catch (error: any) {
      console.error(`[FILE-TRANSFER-REPORT] Error fetching report details for ${actionId}:`, error.message);
      return null;
    }
  }

  private async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on("data", (data) => {
        chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      });
      readableStream.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
      readableStream.on("error", reject);
    });
  }
}

export const fileTransferReportService = new FileTransferReportService();
