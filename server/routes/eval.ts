import { Router, Request, Response } from "express";
import { db } from "../db";
import { evalJobs, evalManualOverrides, foundryResources, batchAnalyses } from "@shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { tokenRequired } from "../auth";
import { evalPermissionRequired } from "../auth-middleware";
import { FoundryModelsClient } from "../eval/foundryModels";
import { ActivityLogger, ActivityActions, ActivityCategories, ResourceTypes } from "../activityLogger";
import { getClientIp } from "../geoEnforcementService";

async function getEvalLogContext(req: Request, organizationId?: number) {
  const user = (req as any).user;
  const { storage } = await import("../storage");
  const roles = user?.email ? await storage.getUserRolesByEmail(user.email) : [];
  const primary = roles[0] || null;
  let orgName: string | undefined;
  if (organizationId) {
    const org = await storage.getOrganization(organizationId);
    orgName = org?.name;
  }
  return {
    userId: user?.oid || user?.id?.toString() || "unknown",
    userName: user?.name || user?.displayName || "Unknown User",
    email: user?.email || "unknown",
    ipAddress: getClientIp(req),
    userAgent: req.get("User-Agent") || "Unknown",
    organizationId: organizationId || primary?.organization?.id,
    organizationName: orgName || primary?.organization?.name,
    roleId: primary?.role?.id,
    roleName: primary?.role?.name,
  };
}

function isTableMissing(error: any): boolean {
  return error?.message?.includes('does not exist') && error?.code === '42P01';
}

const evalRouter = Router();

evalRouter.use(tokenRequired);

evalRouter.post("/start", evalPermissionRequired('run'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const {
      organizationId,
      foundryResourceId,
      answerSheetPath,
      questionPaperPath,
      questionPaperText,
      standardAnswerPath,
      standardAnswerText,
    } = req.body;

    if (!organizationId || !foundryResourceId || !answerSheetPath) {
      return res.status(400).json({ error: "organizationId, foundryResourceId, and answerSheetPath are required" });
    }

    const [foundry] = await db.select().from(foundryResources)
      .where(eq(foundryResources.id, foundryResourceId));
    if (!foundry || (foundry.organizationId !== parseInt(organizationId) && !foundry.sharedAcrossOrgs)) {
      return res.status(404).json({ error: "Foundry resource not found or does not belong to this organization" });
    }

    const dbUser = await (await import("../storage")).storage.getUserByEmail(user.email);
    if (!dbUser) return res.status(401).json({ error: "User not found" });

    const jobId = uuidv4();
    const [job] = await db.insert(evalJobs).values({
      jobId,
      organizationId: parseInt(organizationId),
      userId: dbUser.id,
      foundryResourceId: parseInt(foundryResourceId),
      foundryResourceName: foundry.resourceName,
      answerSheetPath,
      questionPaperPath: questionPaperPath || null,
      questionPaperText: questionPaperText || null,
      standardAnswerPath: standardAnswerPath || null,
      standardAnswerText: standardAnswerText || null,
      status: "queued",
      reviewStatus: "not_started",
      progress: 0,
    }).returning();

    getEvalLogContext(req, parseInt(organizationId)).then(ctx =>
      ActivityLogger.log({
        ...ctx,
        action: ActivityActions.START_EVAL_JOB,
        actionCategory: ActivityCategories.EVAL_MANAGEMENT,
        resource: job.answerSheetPath,
        resourceType: ResourceTypes.EVAL_JOB,
        details: { jobId: job.jobId, foundryResourceId, answerSheetPath },
      })
    ).catch(() => {});
    res.json({ jobId: job.jobId, status: job.status });
  } catch (error: any) {
    if (isTableMissing(error)) {
      return res.status(503).json({ error: "Eval tables are being set up. Please try again shortly." });
    }
    console.error("[Eval] Error starting eval job:", error);
    res.status(500).json({ error: "Failed to start evaluation job" });
  }
});

evalRouter.post("/batch-start", evalPermissionRequired('run'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const {
      organizationId,
      foundryResourceId,
      answerSheetPaths,
      questionPaperPath,
      questionPaperText,
      standardAnswerPath,
      standardAnswerText,
    } = req.body;

    if (!organizationId || !foundryResourceId || !answerSheetPaths || !Array.isArray(answerSheetPaths) || answerSheetPaths.length === 0) {
      return res.status(400).json({ error: "organizationId, foundryResourceId, and answerSheetPaths (non-empty array) are required" });
    }

    if (answerSheetPaths.length > 50) {
      return res.status(400).json({ error: "Maximum 50 answer sheets per batch" });
    }

    const [foundry] = await db.select().from(foundryResources)
      .where(eq(foundryResources.id, foundryResourceId));
    if (!foundry || (foundry.organizationId !== parseInt(organizationId) && !foundry.sharedAcrossOrgs)) {
      return res.status(404).json({ error: "Foundry resource not found or does not belong to this organization" });
    }

    const dbUser = await (await import("../storage")).storage.getUserByEmail(user.email);
    if (!dbUser) return res.status(401).json({ error: "User not found" });

    const batchId = uuidv4();
    const jobs = [];
    for (const answerSheetPath of answerSheetPaths) {
      const jobId = uuidv4();
      const [job] = await db.insert(evalJobs).values({
        jobId,
        batchId,
        organizationId: parseInt(organizationId),
        userId: dbUser.id,
        foundryResourceId: parseInt(foundryResourceId),
        foundryResourceName: foundry.resourceName,
        answerSheetPath,
        questionPaperPath: questionPaperPath || null,
        questionPaperText: questionPaperText || null,
        standardAnswerPath: standardAnswerPath || null,
        standardAnswerText: standardAnswerText || null,
        status: "queued",
        reviewStatus: "not_started",
        progress: 0,
      }).returning();
      jobs.push({ jobId: job.jobId, status: job.status });
    }

    getEvalLogContext(req, parseInt(organizationId)).then(ctx =>
      ActivityLogger.log({
        ...ctx,
        action: ActivityActions.START_EVAL_BATCH,
        actionCategory: ActivityCategories.EVAL_MANAGEMENT,
        resource: batchId,
        resourceType: ResourceTypes.EVAL_BATCH,
        details: { batchId, jobCount: jobs.length, foundryResourceId, answerSheetPaths },
      })
    ).catch(() => {});
    res.json({ jobs, count: jobs.length });
  } catch (error: any) {
    if (isTableMissing(error)) {
      return res.status(503).json({ error: "Eval tables are being set up. Please try again shortly." });
    }
    console.error("[Eval] Error starting batch eval:", error);
    res.status(500).json({ error: "Failed to start batch evaluation" });
  }
});

evalRouter.get("/jobs", evalPermissionRequired('view'), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.query;
    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });

    const jobs = await db.select().from(evalJobs)
      .where(eq(evalJobs.organizationId, parseInt(organizationId as string)))
      .orderBy(desc(evalJobs.createdAt));

    // For list view, we just return metadata.
    // Individual job detail view (GET /api/eval/job/:jobId) handles fetching full JSON from blob.
    // NOTE: VIEW_EVAL_JOBS is intentionally not logged here — this endpoint is polled every few
    // seconds by the frontend while jobs are running, which would flood the activity log.
    res.json(jobs);
  } catch (error: any) {
    if (isTableMissing(error)) {
      return res.json([]);
    }
    console.error("[Eval] Error listing jobs:", error);
    res.status(500).json({ error: "Failed to list evaluation jobs" });
  }
});

evalRouter.get("/job/:jobId", evalPermissionRequired('view'), async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { organizationId } = req.query;
    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });

    const [job] = await db.select().from(evalJobs)
      .where(and(eq(evalJobs.jobId, jobId), eq(evalJobs.organizationId, parseInt(organizationId as string))));

    if (!job) return res.status(404).json({ error: "Job not found" });

    const result = job.reviewedResultJson || job.resultJson;
    let mergedResult = result;

    // If it's a blob reference, fetch the actual data
    if (result && (result as any).blobPath) {
      try {
        const storage = (await import("../storage")).storage;
        const storageAccount = await storage.getStorageAccountByOrganization(parseInt(organizationId as string));
        
        const storageAccountName = storageAccount?.name || process.env.ZAPPER_STORAGE_ACCOUNT_NAME;
        const containerName = storageAccount?.containerName || process.env.ZAPPER_CONTAINER_NAME;
        
        if (storageAccountName && containerName) {
          console.log(`[Eval API] Fetching blob result from: ${storageAccountName}/${containerName}/${(result as any).blobPath}`);
          const cuPersistence = new (await import("../cu-persistence")).CuPersistenceService();
          const getResponse = await cuPersistence.getResult(storageAccountName, containerName, (result as any).blobPath, parseInt(organizationId as string));
          if (getResponse.success) {
            const fetched = getResponse.result;
            // Unwrap CU persistence wrapper: { analysisResult: gradeJson, sourceFilePath, ... }
            mergedResult = fetched?.analysisResult !== undefined ? fetched.analysisResult : fetched;
          } else {
            console.error(`[Eval API] Blob fetch failed: ${getResponse.error}`);
          }
        } else {
          console.error(`[Eval API] No storage account found for org ${organizationId} to retrieve blob.`);
        }
      } catch (blobErr) {
        console.error("[Eval] Error fetching result from blob:", blobErr);
      }
    }

    // Only log VIEW_EVAL_JOB when the job has reached a terminal state (completed/failed/reviewed/finalized).
    // While a job is queued or running, the frontend polls this endpoint every 3 seconds which
    // would flood the activity log with meaningless entries.
    if (job.status !== "queued" && job.status !== "running") {
      getEvalLogContext(req, parseInt(organizationId as string)).then(ctx =>
        ActivityLogger.log({
          ...ctx,
          action: ActivityActions.VIEW_EVAL_JOB,
          actionCategory: ActivityCategories.EVAL_MANAGEMENT,
          resource: job.answerSheetPath || jobId,
          resourceType: ResourceTypes.EVAL_JOB,
          details: { jobId, status: job.status, reviewStatus: job.reviewStatus },
        })
      ).catch(() => {});
    }
    res.json({
      ...job,
      mergedResult: mergedResult,
    });
  } catch (error: any) {
    if (isTableMissing(error)) {
      return res.status(503).json({ error: "Eval tables are being set up. Please try again shortly." });
    }
    console.error("[Eval] Error getting job:", error);
    res.status(500).json({ error: "Failed to get evaluation job" });
  }
});

evalRouter.patch("/review/:jobId", evalPermissionRequired('review'), async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { organizationId, questionNum, newMarksAwarded, newStatus, comment } = req.body;
    const user = (req as any).user;

    if (!organizationId || !questionNum || newMarksAwarded === undefined) {
      return res.status(400).json({ error: "organizationId, questionNum, and newMarksAwarded are required" });
    }

    const dbUser = await (await import("../storage")).storage.getUserByEmail(user.email);
    if (!dbUser) return res.status(401).json({ error: "User not found" });

    const [job] = await db.select().from(evalJobs)
      .where(and(eq(evalJobs.jobId, jobId), eq(evalJobs.organizationId, parseInt(organizationId))));
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.reviewStatus === "finalized") return res.status(400).json({ error: "Review is already finalized" });
    if (job.status !== "completed") return res.status(400).json({ error: "Job has not completed yet" });

    let aiResult = job.resultJson as any;

    // If aiResult is a blob reference, fetch the actual data
    if (aiResult && aiResult.blobPath) {
      try {
        const storage = (await import("../storage")).storage;
        const storageAccount = await storage.getStorageAccountByOrganization(parseInt(organizationId));
        
        const storageAccountName = storageAccount?.name || process.env.ZAPPER_STORAGE_ACCOUNT_NAME || "";
        const containerName = storageAccount?.containerName || process.env.ZAPPER_CONTAINER_NAME || "";
        
        if (storageAccountName && containerName) {
          const cuPersistence = new (await import("../cu-persistence")).CuPersistenceService();
          const getResponse = await cuPersistence.getResult(storageAccountName, containerName, aiResult.blobPath, parseInt(organizationId));
          if (getResponse.success) {
            const fetched = getResponse.result;
            // Unwrap CU persistence wrapper: { analysisResult: gradeJson, sourceFilePath, ... }
            aiResult = fetched?.analysisResult !== undefined ? fetched.analysisResult : fetched;
          } else {
            return res.status(500).json({ error: "Failed to fetch AI result from blob storage: " + getResponse.error });
          }
        }
      } catch (blobErr) {
        console.error("[Eval] Error fetching result from blob during review:", blobErr);
        return res.status(500).json({ error: "Failed to fetch AI result from blob storage" });
      }
    }

    const aiQuestion = aiResult?.questions?.find((q: any) => String(q.questionNumber) === String(questionNum));
    const originalMarksAwarded = aiQuestion?.marksAwarded ?? null;

    // Validate override marks against question's maxMarks
    const parsedNewMarks = parseFloat(newMarksAwarded);
    if (isNaN(parsedNewMarks) || parsedNewMarks < 0) {
      return res.status(400).json({ error: "newMarksAwarded must be a non-negative number" });
    }
    const questionMaxMarks = aiQuestion?.maxMarks ?? null;
    if (questionMaxMarks !== null && parsedNewMarks > questionMaxMarks) {
      return res.status(400).json({ error: `Cannot award ${parsedNewMarks} marks — maximum for this question is ${questionMaxMarks}` });
    }

    await db.insert(evalManualOverrides).values({
      jobId,
      organizationId: parseInt(organizationId),
      reviewerUserId: dbUser.id,
      questionNum: String(questionNum),
      originalMarksAwarded,
      newMarksAwarded: parseInt(newMarksAwarded),
      newStatus: newStatus || null,
      comment: comment || null,
    });

    const allOverrides = await db.select().from(evalManualOverrides)
      .where(eq(evalManualOverrides.jobId, jobId))
      .orderBy(desc(evalManualOverrides.createdAt));

    const latestOverrides = new Map<string, typeof allOverrides[0]>();
    for (const o of allOverrides) {
      if (!latestOverrides.has(o.questionNum)) {
        latestOverrides.set(o.questionNum, o);
      }
    }

    const reviewedResult = JSON.parse(JSON.stringify(aiResult));
    if (reviewedResult?.questions) {
      let totalMarksAwarded = 0;
      for (const q of reviewedResult.questions) {
        const override = latestOverrides.get(String(q.questionNumber));
        if (override) {
          q.marksAwarded = override.newMarksAwarded;
          q.overridden = true;
          q.overrideComment = override.comment;
          if (override.newStatus) q.status = override.newStatus;
        }
        totalMarksAwarded += (q.marksAwarded || 0);
      }
      reviewedResult.totalMarksAwarded = totalMarksAwarded;
      reviewedResult.reviewedQuestionsCount = latestOverrides.size;
    }

    // Save reviewed result to blob storage
    const storage = (await import("../storage")).storage;
    const storageAccount = await storage.getStorageAccountByOrganization(parseInt(organizationId));
    
    // Use organization-specific storage if available, otherwise fallback to environment variables
    const storageAccountName = storageAccount?.name || process.env.ZAPPER_STORAGE_ACCOUNT_NAME;
    const containerName = storageAccount?.containerName || process.env.ZAPPER_CONTAINER_NAME;
    
    let finalReviewedResultJson: any = reviewedResult;

    if (storageAccountName && containerName) {
      console.log(`[Eval API] Saving reviewed result for org ${organizationId}: Account=${storageAccountName}, Container=${containerName} (Source: ${storageAccount ? 'Database' : 'Environment'})`);
      try {
        const cuPersistence = new (await import("../cu-persistence")).CuPersistenceService();
        const saveResponse = await cuPersistence.saveResult({
          storageAccountName,
          containerName,
          sourceFilePath: job.answerSheetPath,
          analysisResult: reviewedResult,
          organizationId: parseInt(organizationId),
          userEmail: dbUser.email,
          fileName: job.answerSheetPath.split('/').pop(),
          saveMode: 'manual'
        });
        if (saveResponse.success) {
          finalReviewedResultJson = { blobPath: saveResponse.blobPath, resultNumber: saveResponse.resultNumber };
          console.log(`[Eval API] SUCCESS: Reviewed result stored in blob: ${saveResponse.blobPath}`);
        } else {
          console.error(`[Eval API] Azure save failed for review: ${saveResponse.error}. Falling back to database.`);
        }
      } catch (blobErr) {
        console.error("[Eval API] Azure save error for review:", blobErr);
      }
    } else {
      console.warn(`[Eval API] WARNING: No storage configuration found for organization ${organizationId} to save review. Storing full JSON in database.`);
    }

    await db.update(evalJobs)
      .set({
        reviewedResultJson: finalReviewedResultJson,
        reviewStatus: "in_progress",
        reviewedByUserId: dbUser.id,
      })
      .where(eq(evalJobs.jobId, jobId));

    getEvalLogContext(req, parseInt(organizationId)).then(ctx =>
      ActivityLogger.log({
        ...ctx,
        action: ActivityActions.REVIEW_EVAL_JOB,
        actionCategory: ActivityCategories.EVAL_MANAGEMENT,
        resource: job.answerSheetPath || jobId,
        resourceType: ResourceTypes.EVAL_JOB,
        details: { jobId, questionNum, newMarksAwarded, comment: comment || null },
      })
    ).catch(() => {});
    res.json({ success: true, reviewedResult });
  } catch (error: any) {
    if (isTableMissing(error)) {
      return res.status(503).json({ error: "Eval tables are being set up. Please try again shortly." });
    }
    console.error("[Eval] Error reviewing job:", error);
    res.status(500).json({ error: "Failed to save review" });
  }
});

evalRouter.post("/finalize/:jobId", evalPermissionRequired('finalize'), async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { organizationId } = req.body;
    const user = (req as any).user;

    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });

    const dbUser = await (await import("../storage")).storage.getUserByEmail(user.email);
    if (!dbUser) return res.status(401).json({ error: "User not found" });

    const [job] = await db.select().from(evalJobs)
      .where(and(eq(evalJobs.jobId, jobId), eq(evalJobs.organizationId, parseInt(organizationId))));
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status !== "completed") return res.status(400).json({ error: "Job has not completed yet" });
    if (job.reviewStatus === "finalized") return res.status(400).json({ error: "Review is already finalized" });

    const finalResult = job.reviewedResultJson || job.resultJson;

    // If finalResult is already a blob reference, we don't need to do anything special here
    // but we should ensure we're saving a fresh copy if it was just reviewed.
    let finalResultJson: any = finalResult;
    const storageAccountName = process.env.ZAPPER_STORAGE_ACCOUNT_NAME || "";
    const containerName = process.env.ZAPPER_CONTAINER_NAME || "";

    // If it's not already a blob reference, save it to blob
    if (finalResult && !(finalResult as any).blobPath) {
      const storage = (await import("../storage")).storage;
      const storageAccount = await storage.getStorageAccountByOrganization(parseInt(organizationId));
      
      const storageAccountName = storageAccount?.name || process.env.ZAPPER_STORAGE_ACCOUNT_NAME;
      const containerName = storageAccount?.containerName || process.env.ZAPPER_CONTAINER_NAME;

      if (storageAccountName && containerName) {
        console.log(`[Eval API] Finalizing result to blob for org ${organizationId}: Account=${storageAccountName}, Container=${containerName} (Source: ${storageAccount ? 'Database' : 'Environment'})`);
        try {
          const cuPersistence = new (await import("../cu-persistence")).CuPersistenceService();
          const saveResponse = await cuPersistence.saveResult({
            storageAccountName,
            containerName,
            sourceFilePath: job.answerSheetPath,
            analysisResult: finalResult,
            organizationId: parseInt(organizationId),
            userEmail: dbUser.email,
            fileName: job.answerSheetPath.split('/').pop(),
            saveMode: 'manual'
          });
          if (saveResponse.success) {
            finalResultJson = { blobPath: saveResponse.blobPath, resultNumber: saveResponse.resultNumber };
            console.log(`[Eval API] SUCCESS: Finalized result stored in blob: ${saveResponse.blobPath}`);
          } else {
            console.error(`[Eval API] Azure save failed for finalize: ${saveResponse.error}`);
          }
        } catch (blobErr) {
          console.error("[Eval API] Azure save error for finalize:", blobErr);
        }
      } else {
        console.warn(`[Eval API] WARNING: No storage configuration found for organization ${organizationId} to finalize to blob. Storing full JSON in database.`);
      }
    }

    await db.update(evalJobs)
      .set({
        reviewStatus: "finalized",
        reviewedResultJson: finalResultJson,
        reviewedAt: new Date(),
        reviewedByUserId: dbUser.id,
      })
      .where(eq(evalJobs.jobId, jobId));

    getEvalLogContext(req, parseInt(organizationId)).then(ctx =>
      ActivityLogger.log({
        ...ctx,
        action: ActivityActions.FINALIZE_EVAL_JOB,
        actionCategory: ActivityCategories.EVAL_MANAGEMENT,
        resource: job.answerSheetPath || jobId,
        resourceType: ResourceTypes.EVAL_JOB,
        details: { jobId },
      })
    ).catch(() => {});
    res.json({ success: true, message: "Review finalized" });
  } catch (error: any) {
    if (isTableMissing(error)) {
      return res.status(503).json({ error: "Eval tables are being set up. Please try again shortly." });
    }
    console.error("[Eval] Error finalizing review:", error);
    res.status(500).json({ error: "Failed to finalize review" });
  }
});

evalRouter.patch("/job/:jobId/question-reviews", evalPermissionRequired('review'), async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { organizationId, questionNums, reviewed } = req.body;
    if (!organizationId || !Array.isArray(questionNums) || typeof reviewed !== "boolean") {
      return res.status(400).json({ error: "organizationId, questionNums[], and reviewed (bool) are required" });
    }

    const [job] = await db.select().from(evalJobs)
      .where(and(eq(evalJobs.jobId, jobId), eq(evalJobs.organizationId, parseInt(organizationId))));
    if (!job) return res.status(404).json({ error: "Job not found" });

    const current = (job.reviewedQuestions as Record<string, boolean>) || {};
    const updated = { ...current };
    for (const qNum of questionNums) {
      if (reviewed) updated[String(qNum)] = true;
      else delete updated[String(qNum)];
    }

    await db.update(evalJobs)
      .set({ reviewedQuestions: updated })
      .where(and(eq(evalJobs.jobId, jobId), eq(evalJobs.organizationId, parseInt(organizationId))));

    getEvalLogContext(req, parseInt(organizationId)).then(ctx =>
      ActivityLogger.log({
        ...ctx,
        action: ActivityActions.UPDATE_EVAL_QUESTION_REVIEWS,
        actionCategory: ActivityCategories.EVAL_MANAGEMENT,
        resource: job.answerSheetPath || jobId,
        resourceType: ResourceTypes.EVAL_JOB,
        details: { jobId, questionNums, reviewed },
      })
    ).catch(() => {});
    res.json({ success: true, reviewedQuestions: updated });
  } catch (error: any) {
    console.error("[Eval] Error updating question reviews:", error);
    res.status(500).json({ error: "Failed to update question reviews" });
  }
});

evalRouter.get("/review-history/:jobId", evalPermissionRequired('review'), async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { organizationId } = req.query;
    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });

    const [job] = await db.select().from(evalJobs)
      .where(and(eq(evalJobs.jobId, jobId), eq(evalJobs.organizationId, parseInt(organizationId as string))));
    if (!job) return res.status(404).json({ error: "Job not found" });

    const overrides = await db.select().from(evalManualOverrides)
      .where(eq(evalManualOverrides.jobId, jobId))
      .orderBy(desc(evalManualOverrides.createdAt));

    getEvalLogContext(req, parseInt(organizationId as string)).then(ctx =>
      ActivityLogger.log({
        ...ctx,
        action: ActivityActions.VIEW_EVAL_REVIEW_HISTORY,
        actionCategory: ActivityCategories.EVAL_MANAGEMENT,
        resource: job.answerSheetPath || jobId,
        resourceType: ResourceTypes.EVAL_JOB,
        details: { jobId, overrideCount: overrides.length },
      })
    ).catch(() => {});
    res.json(overrides);
  } catch (error: any) {
    if (isTableMissing(error)) {
      return res.json([]);
    }
    console.error("[Eval] Error getting review history:", error);
    res.status(500).json({ error: "Failed to get review history" });
  }
});

// ─── Batch Analysis (SWOT) ────────────────────────────────────────────────────

evalRouter.get("/batch-analysis/:batchId", evalPermissionRequired('view'), async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { organizationId } = req.query;
    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });

    const [row] = await db.select().from(batchAnalyses)
      .where(and(eq(batchAnalyses.batchId, batchId), eq(batchAnalyses.organizationId, parseInt(organizationId as string))));

    if (!row) return res.status(404).json({ error: "No batch analysis found" });
    // Only log VIEW_EVAL_BATCH_ANALYSIS when analysis is done — the SWOT dialog polls this
    // endpoint every few seconds while generating, which would flood the activity log.
    if (row.status === "completed" || row.status === "failed") {
      getEvalLogContext(req, parseInt(organizationId as string)).then(ctx =>
        ActivityLogger.log({
          ...ctx,
          action: ActivityActions.VIEW_EVAL_BATCH_ANALYSIS,
          actionCategory: ActivityCategories.EVAL_MANAGEMENT,
          resource: batchId,
          resourceType: ResourceTypes.EVAL_BATCH,
          details: { batchId, status: row.status },
        })
      ).catch(() => {});
    }
    res.json(row);
  } catch (error: any) {
    if (isTableMissing(error)) return res.status(404).json({ error: "No batch analysis found" });
    res.status(500).json({ error: "Failed to get batch analysis" });
  }
});

evalRouter.post("/batch-analysis", evalPermissionRequired('run'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { batchId, organizationId } = req.body;
    if (!batchId || !organizationId) return res.status(400).json({ error: "batchId and organizationId are required" });

    const orgId = parseInt(organizationId);

    // Fetch all completed jobs in this batch
    const jobs = await db.select().from(evalJobs)
      .where(and(eq(evalJobs.batchId, batchId), eq(evalJobs.organizationId, orgId)));

    if (jobs.length === 0) return res.status(404).json({ error: "No jobs found for this batch" });

    const completedJobs = jobs.filter(j => j.status === "completed");
    if (completedJobs.length === 0) return res.status(400).json({ error: "No completed jobs in this batch yet" });

    // Upsert a 'generating' row so the client knows it's in progress
    const dbUser = await (await import("../storage")).storage.getUserByEmail(user.email);
    if (!dbUser) return res.status(401).json({ error: "User not found" });

    const [existingRow] = await db.select().from(batchAnalyses)
      .where(and(eq(batchAnalyses.batchId, batchId), eq(batchAnalyses.organizationId, orgId)));

    let analysisRow: any;
    if (existingRow) {
      [analysisRow] = await db.update(batchAnalyses)
        .set({ status: "generating", error: null, updatedAt: new Date() })
        .where(eq(batchAnalyses.id, existingRow.id))
        .returning();
    } else {
      [analysisRow] = await db.insert(batchAnalyses).values({
        batchId,
        organizationId: orgId,
        userId: dbUser.id,
        status: "generating",
        batchSize: jobs.length,
        completedCount: completedJobs.length,
      }).returning();
    }

    getEvalLogContext(req, orgId).then(ctx =>
      ActivityLogger.log({
        ...ctx,
        action: ActivityActions.START_EVAL_BATCH_ANALYSIS,
        actionCategory: ActivityCategories.EVAL_MANAGEMENT,
        resource: batchId,
        resourceType: ResourceTypes.EVAL_BATCH,
        details: { batchId, completedJobs: completedJobs.length, totalJobs: jobs.length },
      })
    ).catch(() => {});
    // Return immediately — do the heavy work async (fire-and-forget pattern)
    res.json({ status: "generating", id: analysisRow.id });

    // ── Async processing ──────────────────────────────────────────────────────
    (async () => {
      try {
        const storageModule = await import("../storage");
        const cuModule = await import("../cu-persistence");
        const storageAccount = await storageModule.storage.getStorageAccountByOrganization(orgId);
        const storageAccountName = storageAccount?.name || process.env.ZAPPER_STORAGE_ACCOUNT_NAME;
        const containerName = storageAccount?.containerName || process.env.ZAPPER_CONTAINER_NAME;
        const cuPersistence = new cuModule.CuPersistenceService();

        // Resolve result JSON for each completed job
        const resolvedResults: { studentName: string; result: any }[] = [];
        for (const job of completedJobs) {
          const raw = job.reviewedResultJson || job.resultJson;
          if (!raw) continue;
          let result = raw as any;
          if (result.blobPath && storageAccountName && containerName) {
            try {
              const resp = await cuPersistence.getResult(storageAccountName, containerName, result.blobPath, orgId);
              if (resp.success) result = resp.result?.analysisResult ?? resp.result ?? result;
            } catch { /* keep raw on error */ }
          }
          const filename = job.answerSheetPath?.split("/").pop() || "Unknown";
          const nameParts = filename.replace(/\.[^/.]+$/, "").split(/[_\-\s]+/).filter((p: string) => p && p.length > 2 && !/^\d+$/.test(p));
          const studentName = nameParts.length >= 2 ? nameParts.slice(0, 2).map((p: string) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ") : filename;
          resolvedResults.push({ studentName, result });
        }

        // Aggregate per-question stats
        const questionMap: Record<string, { nums: number[]; maxMarks: number; topics: string[]; feedbacks: string[] }> = {};
        let totalAwarded = 0, totalMax = 0;

        for (const { result } of resolvedResults) {
          const questions: any[] = result?.questions || [];
          for (const q of questions) {
            const num = String(q.questionNumber ?? q.question_number ?? "?");
            if (!questionMap[num]) questionMap[num] = { nums: [], maxMarks: q.maxMarks ?? q.max_marks ?? 0, topics: [], feedbacks: [] };
            const awarded = q.marksAwarded ?? q.marks_awarded ?? 0;
            questionMap[num].nums.push(awarded);
            if (q.maxMarks || q.max_marks) questionMap[num].maxMarks = Math.max(questionMap[num].maxMarks, q.maxMarks ?? q.max_marks ?? 0);
            if (q.topic) questionMap[num].topics.push(q.topic);
            if (q.feedback) questionMap[num].feedbacks.push(q.feedback);
            totalAwarded += awarded;
            totalMax += q.maxMarks ?? q.max_marks ?? 0;
          }
        }

        const avgPct = totalMax > 0 ? Math.round((totalAwarded / totalMax) * 100) : null;

        const questionBreakdownSummary = Object.entries(questionMap).map(([num, data]) => {
          const avg = data.nums.length ? data.nums.reduce((a, b) => a + b, 0) / data.nums.length : 0;
          const pct = data.maxMarks ? Math.round((avg / data.maxMarks) * 100) : 0;
          const passRate = data.nums.length ? Math.round((data.nums.filter(x => data.maxMarks ? x >= data.maxMarks * 0.5 : x > 0).length / data.nums.length) * 100) : 0;
          const topicCounts: Record<string, number> = {};
          for (const t of data.topics) topicCounts[t] = (topicCounts[t] || 0) + 1;
          const topTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
          const sampleFeedbacks = data.feedbacks.slice(0, 4).join(" | ");
          return `Q${num} (${topTopic || "General"}): avg ${avg.toFixed(1)}/${data.maxMarks} (${pct}%), pass rate ${passRate}%. Sample feedback: ${sampleFeedbacks || "N/A"}`;
        }).join("\n");

        const studentSummary = resolvedResults.map(({ studentName, result }) => {
          const qs: any[] = result?.questions || [];
          const tot = qs.reduce((s: number, q: any) => s + (q.marksAwarded ?? q.marks_awarded ?? 0), 0);
          const mx = qs.reduce((s: number, q: any) => s + (q.maxMarks ?? q.max_marks ?? 0), 0);
          return `${studentName}: ${tot}/${mx} (${mx ? Math.round((tot / mx) * 100) : 0}%)`;
        }).join(", ");

        const firstJob = completedJobs[0];
        const foundryResourceName = process.env.ZAPPER_FOUNDRY_MODELS_RESOURCE_NAME || firstJob.foundryResourceName;
        const endpoint = `https://${foundryResourceName}.cognitiveservices.azure.com`;

        const client = new FoundryModelsClient({
          resourceName: foundryResourceName,
          endpoint,
          apiVersion: process.env.ZAPPER_FOUNDRY_MODELS_API_VERSION || "2024-05-01-preview",
          apiKey: process.env.ZAPPER_FOUNDRY_MODELS_API_KEY || null,
          chatDeployment: process.env.ZAPPER_EVAL_CHAT_MODEL_DEPLOYMENT || "gpt-4-1",
        });

        const swotPrompt = `You are an expert educational analyst. Analyze the following batch evaluation data from a class and produce a comprehensive SWOT + insights report.

BATCH OVERVIEW:
- Total students evaluated: ${resolvedResults.length}
- Overall average score: ${avgPct !== null ? avgPct + "%" : "N/A"}
- Student scores: ${studentSummary}

PER-QUESTION BREAKDOWN:
${questionBreakdownSummary}

Return ONLY a JSON object with this exact structure:
{
  "overallSummary": "2-3 sentence summary of overall class performance",
  "strengths": [
    { "title": "concise strength title", "detail": "1-2 sentences with specifics", "questionNums": ["1","2"], "avgScorePct": 85 }
  ],
  "weaknesses": [
    { "title": "concise weakness title", "detail": "1-2 sentences with specifics", "questionNums": ["3"], "avgScorePct": 42 }
  ],
  "opportunities": [
    { "title": "opportunity title", "detail": "1-2 sentences describing growth area or next step" }
  ],
  "threats": [
    { "title": "threat/risk title", "detail": "1-2 sentences about systematic gaps or risks" }
  ],
  "questionBreakdown": [
    { "questionNum": "1", "topic": "topic name", "avgScorePct": 85, "passRate": 90, "pattern": "one sentence describing the class pattern on this question" }
  ],
  "recommendations": ["actionable recommendation 1", "actionable recommendation 2", "actionable recommendation 3"],
  "readinessLevel": "ready" or "partial" or "not_ready",
  "readinessDetail": "one sentence on readiness for next level"
}

Provide 2-4 items in each SWOT section. Be specific, data-driven, and constructive.`;

        const raw = await client.gradeJson(swotPrompt, 1);
        const analysisData = {
          ...raw,
          batchSize: jobs.length,
          completedCount: completedJobs.length,
          averageScorePct: avgPct,
          generatedAt: new Date().toISOString(),
        };

        await db.update(batchAnalyses).set({
          status: "completed",
          batchSize: jobs.length,
          completedCount: completedJobs.length,
          averageScore: avgPct,
          analysisJson: analysisData,
          updatedAt: new Date(),
        }).where(eq(batchAnalyses.id, analysisRow.id));

      } catch (err: any) {
        console.error("[BatchAnalysis] Error:", err?.message || err);
        await db.update(batchAnalyses).set({
          status: "failed",
          error: err?.message || "Analysis failed",
          updatedAt: new Date(),
        }).where(eq(batchAnalyses.id, analysisRow.id)).catch(() => {});
      }
    })();

  } catch (error: any) {
    if (isTableMissing(error)) return res.status(503).json({ error: "Tables are being set up. Please try again shortly." });
    console.error("[Eval] Error starting batch analysis:", error);
    res.status(500).json({ error: "Failed to start batch analysis" });
  }
});

export default evalRouter;
