import { Router } from "express";
import multer from "multer";
import { tokenRequired } from "../auth";
import { customerOnboardingPermissionRequired } from "../auth-middleware";
import { onboardingService } from "../services/onboardingService";
import { ActivityLogger, ActivityActions, ActivityCategories, ResourceTypes } from "../activityLogger";

function getClientIp(req: any): string {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.socket?.remoteAddress || 
         'unknown';
}

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Upload and validate CSV
router.post('/upload',
  tokenRequired,
  customerOnboardingPermissionRequired('upload'),
  upload.single('file'),
  async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const userId = req.dbUser?.id;
      const user = req.dbUser;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const result = await onboardingService.uploadAndValidate(csvContent, userId);

      await ActivityLogger.log({
        userId: String(userId),
        userName: user?.name || 'Unknown',
        email: user?.email || 'Unknown',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
        action: ActivityActions.ONBOARDING_UPLOAD,
        actionCategory: ActivityCategories.CUSTOMER_ONBOARDING,
        resource: `Job #${result.jobId}`,
        resourceType: ResourceTypes.ONBOARDING_JOB,
        details: {
          jobId: result.jobId,
          fileName: req.file.originalname,
          totalRows: result.totalRows,
          validRows: result.validationResult.validRows,
          errorRows: result.validationResult.errorRows,
          warningRows: result.validationResult.warningRows,
        },
      });

      res.json(result);
    } catch (error: any) {
      console.error('[ONBOARDING] Upload error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Get job status
router.get('/jobs/:jobId',
  tokenRequired,
  customerOnboardingPermissionRequired('view'),
  async (req: any, res) => {
    try {
      const jobId = parseInt(req.params.jobId, 10);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: 'Invalid job ID' });
      }

      const job = await onboardingService.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Ownership check: only allow the creator to view the job
      if (job.createdByUserId !== req.dbUser?.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(job);
    } catch (error: any) {
      console.error('[ONBOARDING] Get job error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Get job progress (lightweight endpoint for polling)
router.get('/jobs/:jobId/progress',
  tokenRequired,
  customerOnboardingPermissionRequired('view'),
  async (req: any, res) => {
    try {
      const jobId = parseInt(req.params.jobId, 10);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: 'Invalid job ID' });
      }

      const job = await onboardingService.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Ownership check
      if (job.createdByUserId !== req.dbUser?.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Return lightweight progress data
      res.json({
        jobId: job.id,
        status: job.status,
        totalRows: job.totalRows,
        processedRows: job.successCount + job.errorCount,
        successCount: job.successCount,
        errorCount: job.errorCount,
        skippedCount: job.skippedCount,
        isComplete: ['completed', 'failed', 'partial_success'].includes(job.status),
      });
    } catch (error: any) {
      console.error('[ONBOARDING] Get progress error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// List jobs
router.get('/jobs',
  tokenRequired,
  customerOnboardingPermissionRequired('view'),
  async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const status = req.query.status as string | undefined;

      const result = await onboardingService.getJobs(req.dbUser?.id, { page, limit, status });
      res.json({
        jobs: result.jobs,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        }
      });
    } catch (error: any) {
      console.error('[ONBOARDING] List jobs error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Get job rows
router.get('/jobs/:jobId/rows',
  tokenRequired,
  customerOnboardingPermissionRequired('view'),
  async (req: any, res) => {
    try {
      const jobId = parseInt(req.params.jobId, 10);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: 'Invalid job ID' });
      }

      // Ownership check
      const job = await onboardingService.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      if (job.createdByUserId !== req.dbUser?.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const status = req.query.status as string | undefined;

      const result = await onboardingService.getJobRows(jobId, { page, limit, status });
      res.json({
        rows: result.rows,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        }
      });
    } catch (error: any) {
      console.error('[ONBOARDING] Get job rows error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Commit job
router.post('/jobs/:jobId/commit',
  tokenRequired,
  customerOnboardingPermissionRequired('commit'),
  async (req: any, res) => {
    try {
      const jobId = parseInt(req.params.jobId, 10);
      const user = req.dbUser;
      if (isNaN(jobId)) {
        return res.status(400).json({ error: 'Invalid job ID' });
      }

      // Ownership check
      const job = await onboardingService.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      if (job.createdByUserId !== req.dbUser?.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await ActivityLogger.log({
        userId: String(user?.id),
        userName: user?.name || 'Unknown',
        email: user?.email || 'Unknown',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
        action: ActivityActions.ONBOARDING_COMMIT,
        actionCategory: ActivityCategories.CUSTOMER_ONBOARDING,
        resource: `Job #${jobId}`,
        resourceType: ResourceTypes.ONBOARDING_JOB,
        details: {
          jobId,
          totalRows: job.totalRows,
        },
      });

      const result = await onboardingService.commitJob(jobId);

      const commitAction = result.status === 'completed' 
        ? ActivityActions.ONBOARDING_COMMIT_SUCCESS
        : result.status === 'partial_success'
          ? ActivityActions.ONBOARDING_COMMIT_PARTIAL
          : ActivityActions.ONBOARDING_COMMIT_FAILED;

      await ActivityLogger.log({
        userId: String(user?.id),
        userName: user?.name || 'Unknown',
        email: user?.email || 'Unknown',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
        action: commitAction,
        actionCategory: ActivityCategories.CUSTOMER_ONBOARDING,
        resource: `Job #${jobId}`,
        resourceType: ResourceTypes.ONBOARDING_JOB,
        details: {
          jobId,
          status: result.status,
          successCount: result.successCount,
          errorCount: result.errorCount,
          skippedCount: result.skippedCount,
          organizationsCreated: result.summary?.organizationsCreated,
          usersCreated: result.summary?.usersCreated,
          rolesAssigned: result.summary?.rolesAssigned,
          storageAccountsMapped: result.summary?.storageAccountsMapped,
          sftpUsersCreated: result.summary?.sftpUsersCreated,
        },
      });

      res.json(result);
    } catch (error: any) {
      console.error('[ONBOARDING] Commit error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Retry failed rows
router.post('/jobs/:jobId/retry',
  tokenRequired,
  customerOnboardingPermissionRequired('commit'),
  async (req: any, res) => {
    try {
      const jobId = parseInt(req.params.jobId, 10);
      const user = req.dbUser;
      if (isNaN(jobId)) {
        return res.status(400).json({ error: 'Invalid job ID' });
      }

      // Ownership check
      const job = await onboardingService.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      if (job.createdByUserId !== req.dbUser?.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const result = await onboardingService.retryFailedRows(jobId);

      await ActivityLogger.log({
        userId: String(user?.id),
        userName: user?.name || 'Unknown',
        email: user?.email || 'Unknown',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
        action: ActivityActions.ONBOARDING_RETRY,
        actionCategory: ActivityCategories.CUSTOMER_ONBOARDING,
        resource: `Job #${jobId}`,
        resourceType: ResourceTypes.ONBOARDING_JOB,
        details: {
          jobId,
          status: result.status,
          successCount: result.successCount,
          errorCount: result.errorCount,
          retriedRows: job.errorCount,
        },
      });

      res.json(result);
    } catch (error: any) {
      console.error('[ONBOARDING] Retry error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Delete job
router.delete('/jobs/:jobId',
  tokenRequired,
  customerOnboardingPermissionRequired('delete'),
  async (req: any, res) => {
    try {
      const jobId = parseInt(req.params.jobId, 10);
      const user = req.dbUser;
      if (isNaN(jobId)) {
        return res.status(400).json({ error: 'Invalid job ID' });
      }

      // Ownership check
      const job = await onboardingService.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      if (job.createdByUserId !== req.dbUser?.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const deleted = await onboardingService.deleteJob(jobId);
      if (!deleted) {
        return res.status(404).json({ error: 'Job not found' });
      }

      await ActivityLogger.log({
        userId: String(user?.id),
        userName: user?.name || 'Unknown',
        email: user?.email || 'Unknown',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
        action: ActivityActions.ONBOARDING_DELETE_JOB,
        actionCategory: ActivityCategories.CUSTOMER_ONBOARDING,
        resource: `Job #${jobId}`,
        resourceType: ResourceTypes.ONBOARDING_JOB,
        details: {
          jobId,
          jobStatus: job.status,
          totalRows: job.totalRows,
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('[ONBOARDING] Delete error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Download CSV template
router.get('/template',
  tokenRequired,
  customerOnboardingPermissionRequired('view'),
  (req, res) => {
    const template = onboardingService.generateCSVTemplate();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="onboarding-template.csv"');
    res.send(template);
  }
);

export default router;
