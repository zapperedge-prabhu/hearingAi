import { db } from "./db";
import { haiJobs } from "@shared/schema";
import { eq, or } from "drizzle-orm";
import { deriveCuEndpoint } from "./content-understanding";
import { DefaultAzureCredential } from "@azure/identity";
import { HearingAiPersistenceService } from "./hearing-ai-persistence";

const CU_API_VERSION = "2025-11-01";
const COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default";
const POLL_INTERVAL = parseInt(process.env.ZAPPER_CU_POLL_INTERVAL_MS || "5000", 10);
const MAX_POLLS = parseInt(process.env.ZAPPER_CU_MAX_POLLS || "2880", 10);

export class HaiPollingService {
  private static instance: HaiPollingService;
  private interval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private credential = new DefaultAzureCredential();
  private cuPersistence = new HearingAiPersistenceService();

  private constructor() {}

  public static getInstance(): HaiPollingService {
    if (!HaiPollingService.instance) {
      HaiPollingService.instance = new HaiPollingService();
    }
    return HaiPollingService.instance;
  }

  public start() {
    if (this.interval) return;
    console.log("[HaiPollingService] Starting background polling worker...");
    this.interval = setInterval(() => this.pollActiveJobs(), POLL_INTERVAL);
  }

  public stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async pollActiveJobs() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const activeJobs = await db.select().from(haiJobs).where(
        or(eq(haiJobs.status, "running"), eq(haiJobs.status, "submitted"))
      );

      if (activeJobs.length === 0) {
        this.isPolling = false;
        return;
      }

      console.log(`[HaiPollingService] Polling ${activeJobs.length} active jobs...`);
      const tokenResponse = await this.credential.getToken(COGNITIVE_SERVICES_SCOPE);
      const token = tokenResponse.token;

      for (const job of activeJobs) {
        await this.processJob(job, token);
      }
    } catch (error) {
      console.error("[HaiPollingService] Error in polling loop:", error);
    } finally {
      this.isPolling = false;
    }
  }

  private async processJob(job: any, token: string) {
    try {
      if (!job.azureOperationLocation) {
        console.warn(`[HaiPollingService] Job ${job.jobId} has no operation location, skipping`);
        return;
      }

      const response = await fetch(job.azureOperationLocation, {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!response.ok) {
        console.error(`[HaiPollingService] Poll failed for job ${job.jobId} (${job.contentType}): ${response.status}`);
        return;
      }

      const data: any = await response.json();
      const status = data.status?.toLowerCase();
      const newPollCount = (job.pollAttempts || 0) + 1;
      const now = new Date();

      if (status === "succeeded" || status === "completed") {
        console.log(`[HaiPollingService] Job ${job.jobId} (${job.contentType}) succeeded!`);

        let result = data.result || data.analyzeResult;
        if (data.resourceLocation && !result) {
          const resResponse = await fetch(data.resourceLocation, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (resResponse.ok) {
            result = await resResponse.json();
          }
        }
        if (!result) {
          result = data;
        }

        try {
          const saveResponse = await this.cuPersistence.saveResult({
            storageAccountName: job.storageAccountName,
            containerName: job.containerName,
            sourceFilePath: job.sourceFilePath,
            analysisResult: result,
            organizationId: job.organizationId,
            userEmail: "system-background-worker",
            saveMode: 'auto'
          });
          
          if (saveResponse.success) {
            console.log(`[HaiPollingService] Auto-saved result for job ${job.jobId} to blob: ${saveResponse.blobPath}`);
            
            await db.update(haiJobs)
              .set({
                status: "succeeded",
                resultPath: saveResponse.blobPath, // Store blob path as result reference
                pollAttempts: newPollCount,
                completedAt: now,
              })
              .where(eq(haiJobs.id, job.id));
            return; // Already updated DB
          } else {
            console.error(`[HaiPollingService] Failed to auto-save result for job ${job.jobId}:`, saveResponse.error);
          }
        } catch (saveError) {
          console.error(`[HaiPollingService] Error saving result for job ${job.jobId}:`, saveError);
        }

        await db.update(haiJobs)
          .set({
            status: "succeeded",
            resultPath: data.resourceLocation || null,
            pollAttempts: newPollCount,
            completedAt: now,
          })
          .where(eq(haiJobs.id, job.id));
      } else if (status === "failed") {
        console.error(`[HaiPollingService] Job ${job.jobId} (${job.contentType}) failed`);
        await db.update(haiJobs)
          .set({
            status: "failed",
            error: data.error?.message || "Analysis failed",
            pollAttempts: newPollCount,
            completedAt: now,
          })
          .where(eq(haiJobs.id, job.id));
      } else if (newPollCount >= MAX_POLLS) {
        console.warn(`[HaiPollingService] Job ${job.jobId} (${job.contentType}) timed out after ${newPollCount} polls`);
        await db.update(haiJobs)
          .set({
            status: "failed",
            error: `Analysis timed out after ${Math.round(newPollCount * POLL_INTERVAL / 1000)} seconds`,
            pollAttempts: newPollCount,
            completedAt: now,
          })
          .where(eq(haiJobs.id, job.id));
      } else {
        if (job.status === "submitted") {
          await db.update(haiJobs)
            .set({
              status: "running",
              pollAttempts: newPollCount,
              startedAt: job.startedAt || now,
            })
            .where(eq(haiJobs.id, job.id));
        } else {
          await db.update(haiJobs)
            .set({ pollAttempts: newPollCount })
            .where(eq(haiJobs.id, job.id));
        }
      }
    } catch (error) {
      console.error(`[HaiPollingService] Error processing job ${job.jobId}:`, error);
    }
  }
}
