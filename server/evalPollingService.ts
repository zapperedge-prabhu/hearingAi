import { db } from "./db";
import { evalJobs, foundryResources } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { analyzeDocument } from "./content-understanding";
import { FoundryModelsClient } from "./eval/foundryModels";
import { buildEvalPrompt, extractCuMarkdown, countQuestionsInText } from "./eval/evalPrompt";
import { generateReadSasForOrgPath } from "./eval/evalDb";

const POLL_INTERVAL = parseInt(process.env.ZAPPER_EVAL_POLL_INTERVAL_MS || "5000", 10);

export class EvalPollingService {
  private static instance: EvalPollingService;
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;

  static getInstance() {
    if (!EvalPollingService.instance) EvalPollingService.instance = new EvalPollingService();
    return EvalPollingService.instance;
  }

  start() {
    if (this.interval) return;
    console.log("[EvalPollingService] Starting eval poller...");
    this.interval = setInterval(() => this.tick(), POLL_INTERVAL);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private tableVerified = false;

  private async tick() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      if (!this.tableVerified) {
        try {
          await db.select().from(evalJobs).limit(0);
          this.tableVerified = true;
        } catch (tableErr: any) {
          if (tableErr?.message?.includes('does not exist')) {
            return;
          }
          throw tableErr;
        }
      }

      const [job] = await db.select().from(evalJobs).where(eq(evalJobs.status, "queued")).limit(1);
      if (!job) return;

      console.log(`[EvalPollingService] Processing job ${job.jobId}`);

      await db.update(evalJobs).set({ status: "running", progress: 5, startedAt: new Date() })
        .where(eq(evalJobs.jobId, job.jobId));

      try {
        // Resolve storage account early — needed for OCR cache throughout the pipeline
        const cuPersistence = new (await import("./cu-persistence")).CuPersistenceService();
        const storage = (await import("./storage")).storage;
        const storageAccount = await storage.getStorageAccountByOrganization(job.organizationId);
        const storageAccountName = storageAccount?.name || process.env.ZAPPER_STORAGE_ACCOUNT_NAME;
        const containerName = storageAccount?.containerName || process.env.ZAPPER_CONTAINER_NAME;
        const hasStorage = !!(storageAccountName && containerName);

        console.log(`[EvalPollingService] Storage for org ${job.organizationId}: Account=${storageAccountName || 'NOT_SET'}, Container=${containerName || 'NOT_SET'} (Source: ${storageAccount ? 'Database' : 'Environment'})`);

        // ── Step 1: Answer sheet OCR ──────────────────────────────────────
        // Always run CU on the answer sheet (unique per student); cache result
        // so re-runs don't need to call CU again.
        let answerMarkdown: string;
        const cachedAnswerOcr = hasStorage
          ? await cuPersistence.getEvalOcrCache(storageAccountName!, containerName!, job.answerSheetPath, job.organizationId)
          : null;

        if (cachedAnswerOcr) {
          console.log(`[EvalPollingService] Answer sheet OCR loaded from cache: ${job.answerSheetPath}`);
          answerMarkdown = cachedAnswerOcr;
        } else {
          const answerSas = await generateReadSasForOrgPath(job.organizationId, job.answerSheetPath);
          const answerCu = await analyzeDocument({
            sasUrl: answerSas,
            foundryResourceName: job.foundryResourceName,
            analyzerId: process.env.ZAPPER_EVAL_ANALYZER_ANSWERSHEET || "prebuilt-document",
          });
          if (!answerCu.success) throw new Error(answerCu.error || "Answer sheet CU analysis failed");
          answerMarkdown = extractCuMarkdown(answerCu.result);
          if (hasStorage) {
            await cuPersistence.saveEvalOcrCache(storageAccountName!, containerName!, job.answerSheetPath, answerMarkdown, job.organizationId);
          }
        }

        await db.update(evalJobs).set({ progress: 40 }).where(eq(evalJobs.jobId, job.jobId));

        // ── Step 2: Question paper OCR ────────────────────────────────────
        // Shared across all students in a batch — cache is the key optimization.
        // First job in a batch runs CU and saves cache; subsequent jobs use cache.
        let qpText = job.questionPaperText || "";
        if (!qpText && job.questionPaperPath) {
          const cachedQpOcr = hasStorage
            ? await cuPersistence.getEvalOcrCache(storageAccountName!, containerName!, job.questionPaperPath, job.organizationId)
            : null;

          if (cachedQpOcr) {
            console.log(`[EvalPollingService] Question paper OCR loaded from cache: ${job.questionPaperPath}`);
            qpText = cachedQpOcr;
          } else {
            const qpSas = await generateReadSasForOrgPath(job.organizationId, job.questionPaperPath);
            const qpCu = await analyzeDocument({
              sasUrl: qpSas,
              foundryResourceName: job.foundryResourceName,
              analyzerId: process.env.ZAPPER_EVAL_ANALYZER_QUESTIONPAPER || "prebuilt-document",
            });
            if (!qpCu.success) throw new Error(qpCu.error || "Question paper CU analysis failed");
            qpText = extractCuMarkdown(qpCu.result);
            if (hasStorage) {
              await cuPersistence.saveEvalOcrCache(storageAccountName!, containerName!, job.questionPaperPath, qpText, job.organizationId);
            }
          }
        }

        await db.update(evalJobs).set({ progress: 60 }).where(eq(evalJobs.jobId, job.jobId));

        // ── Step 3: Standard answer OCR ───────────────────────────────────
        // Also shared across the batch — same caching pattern.
        let standardText = job.standardAnswerText || "";
        if (!standardText && job.standardAnswerPath) {
          const cachedStdOcr = hasStorage
            ? await cuPersistence.getEvalOcrCache(storageAccountName!, containerName!, job.standardAnswerPath, job.organizationId)
            : null;

          if (cachedStdOcr) {
            console.log(`[EvalPollingService] Standard answer OCR loaded from cache: ${job.standardAnswerPath}`);
            standardText = cachedStdOcr;
          } else {
            const stdSas = await generateReadSasForOrgPath(job.organizationId, job.standardAnswerPath);
            const stdCu = await analyzeDocument({
              sasUrl: stdSas,
              foundryResourceName: job.foundryResourceName,
              analyzerId: process.env.ZAPPER_EVAL_ANALYZER_QUESTIONPAPER || "prebuilt-document",
            });
            if (!stdCu.success) throw new Error(stdCu.error || "Standard answer CU analysis failed");
            standardText = extractCuMarkdown(stdCu.result);
            if (hasStorage) {
              await cuPersistence.saveEvalOcrCache(storageAccountName!, containerName!, job.standardAnswerPath, standardText, job.organizationId);
            }
          }
        }

        await db.update(evalJobs).set({ progress: 70 }).where(eq(evalJobs.jobId, job.jobId));

        const resourceName = process.env.ZAPPER_FOUNDRY_MODELS_RESOURCE_NAME || job.foundryResourceName;
        const cognitiveEndpoint = `https://${resourceName}.cognitiveservices.azure.com`;
        
        console.log(`[EvalPollingService] Using cognitive endpoint: ${cognitiveEndpoint}, deployment: ${process.env.ZAPPER_EVAL_CHAT_MODEL_DEPLOYMENT || 'gpt-4-1'}`);
        
        const client = new FoundryModelsClient({
          resourceName,
          endpoint: cognitiveEndpoint,
          apiVersion: process.env.ZAPPER_FOUNDRY_MODELS_API_VERSION || "2024-05-01-preview",
          apiKey: process.env.ZAPPER_FOUNDRY_MODELS_API_KEY || null,
          chatDeployment: process.env.ZAPPER_EVAL_CHAT_MODEL_DEPLOYMENT || "gpt-4-1",
        });

        const prompt = buildEvalPrompt({
          questionPaperText: qpText,
          answerSheetMarkdown: answerMarkdown,
          standardAnswerText: standardText || undefined,
        });

        const questionCount = countQuestionsInText(qpText || answerMarkdown);
        console.log(`[EvalPollingService] Detected ${questionCount} questions for job ${job.jobId}`);
        const grade = await client.gradeJson(prompt, questionCount);

        let finalResultJson: any = grade;

        if (storageAccountName && containerName) {
          try {
            const dbUser = await storage.getUser(job.userId);
            const saveRequest = {
              storageAccountName,
              containerName,
              sourceFilePath: job.answerSheetPath,
              analysisResult: grade,
              organizationId: job.organizationId,
              userEmail: dbUser?.email || "system-eval-poller",
              fileName: job.answerSheetPath.split('/').pop(),
              saveMode: 'auto' as const
            };
            
            console.log(`[EvalPollingService] Saving result to Azure Blob: ${storageAccountName}/${containerName}`);
            const saveResponse = await cuPersistence.saveResult(saveRequest);
            if (saveResponse.success) {
              // Successfully saved to blob, store ONLY the reference in DB
              finalResultJson = { blobPath: saveResponse.blobPath, resultNumber: saveResponse.resultNumber };
              console.log(`[EvalPollingService] SUCCESS: Result stored in blob: ${saveResponse.blobPath}`);
            } else {
              console.error(`[EvalPollingService] Azure save failed: ${saveResponse.error}. Falling back to database storage.`);
            }
          } catch (blobErr: any) {
            console.error(`[EvalPollingService] Azure save error:`, blobErr.message || blobErr);
          }
        } else {
          console.error(`[EvalPollingService] ERROR: No storage configuration (Database or Environment) found for organization ${job.organizationId}. Storing full JSON in database.`);
        }

        await db.update(evalJobs).set({
          status: "completed",
          progress: 100,
          resultJson: finalResultJson,
          completedAt: new Date(),
        }).where(eq(evalJobs.jobId, job.jobId));

        console.log(`[EvalPollingService] Job ${job.jobId} completed successfully`);

      } catch (err: any) {
        console.error(`[EvalPollingService] Job ${job.jobId} failed:`, err?.message || err);
        await db.update(evalJobs).set({
          status: "failed",
          error: String(err?.message || err),
          completedAt: new Date(),
        }).where(eq(evalJobs.jobId, job.jobId));
      }

    } catch (err: any) {
      console.error("[EvalPollingService] Tick error:", err?.message || err);
    } finally {
      this.isRunning = false;
    }
  }
}
