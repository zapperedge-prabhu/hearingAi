import { Router, Request, Response, NextFunction } from "express";
import { tokenRequired } from "../auth";
import { userGuideChapters } from "../data/helpUserGuide";
import { troubleshootingChapters } from "../data/helpTroubleshooting";
import { storage } from "../storage";
import { resolvePermissionBySlug, hasChapterPermission } from "../utils/helpCenterPermissions";
import { ActivityLogger } from "../activityLogger";

const router = Router();

// All help routes require JWT authentication
router.use(tokenRequired);

// Middleware to check Help Center chapter permission
async function checkChapterPermission(req: Request, res: Response, next: NextFunction) {
  try {
    const userEmail = (req as any).user?.email;
    const userId = (req as any).dbUser?.id;
    
    if (!userId) {
      console.log(`🔒 [HELP-CENTER] Missing user context - userId: ${userId}`);
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { slug } = req.params;
    
    // Get permission field directly from slug (no need to lookup chapter first)
    const permissionField = resolvePermissionBySlug(slug);
    
    if (!permissionField) {
      console.log(`🔒 [HELP-CENTER] No permission mapping for slug: ${slug}`);
      return res.status(404).json({ error: 'Chapter not found or not accessible' });
    }

    // Find chapter by slug - verify it exists in data files
    const chapter = [...userGuideChapters, ...troubleshootingChapters].find(ch => ch.slug === slug);
    
    // If chapter not found in data files despite valid permission mapping, return 404
    if (!chapter) {
      console.error(`🔒 [HELP-CENTER] CRITICAL: Slug "${slug}" has permission mapping but no content in data files`);
      return res.status(404).json({ error: 'Chapter content not available' });
    }

    // Fetch user's aggregated help center permissions (across ALL organizations)
    const permissions = await storage.getUserHelpCenterPermissions(userId);

    // Check if user has permission using the new JSON structure
    const hasPermission = hasChapterPermission(permissions, slug);

    if (!hasPermission) {
      console.log(`🔒 [HELP-CENTER] Access denied: ${userEmail} → chapter "${chapter.title}" (${chapter.id})`);
      
      // Log denied access attempt
      // Note: organizationId is null because help center permissions are aggregated across ALL organizations
      await ActivityLogger.log({
        userId: userId.toString(),
        userName: userEmail.split('@')[0],
        email: userEmail,
        action: 'HELP_CENTER_ACCESS_DENIED' as any,
        actionCategory: 'HELP_CENTER' as any,
        resource: chapter.title,
        resourceType: 'HELP_CENTER_CHAPTER' as any,
        details: {
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          chapterSlug: slug,
          permissionField,
          note: 'Help center permissions are aggregated across all user organizations'
        },
        sessionId: (req as any).sessionID || 'unknown',
        organizationId: undefined, // Help center is global across all orgs
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(403).json({ 
        error: 'INSUFFICIENT_HELP_CENTER_PERMISSION',
        message: `Access denied: You do not have permission to view "${chapter.title}"`,
        chapter: chapter.title
      });
    }

    console.log(`✅ [HELP-CENTER] Access granted: ${userEmail} → chapter "${chapter.title}"`);
    next();
  } catch (error) {
    console.error('🔒 [HELP-CENTER] Permission check error:', error);
    res.status(500).json({ error: 'Permission validation failed' });
  }
}

// GET /api/help/user-guide - List all user guide chapters (filtered by permissions)
router.get("/user-guide", async (req, res) => {
  try {
    const userId = (req as any).dbUser?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user's permissions (across ALL organizations)
    const permissions = await storage.getUserHelpCenterPermissions(userId);

    // Filter chapters based on permissions using JSON structure
    const chapterList = userGuideChapters
      .filter(chapter => hasChapterPermission(permissions, chapter.slug))
      .map(chapter => ({
        id: chapter.id,
        title: chapter.title,
        slug: chapter.slug
      }));

    res.json({ chapters: chapterList });
  } catch (error) {
    console.error("Error fetching user guide chapters:", error);
    res.status(500).json({ error: "Failed to fetch user guide chapters" });
  }
});

// GET /api/help/user-guide/:slug - Get single user guide chapter with HTML
// Protected by permission middleware
router.get("/user-guide/:slug", checkChapterPermission, (req, res) => {
  try {
    const { slug } = req.params;
    const chapter = userGuideChapters.find(ch => ch.slug === slug);

    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    // Return full chapter including HTML content
    res.json({ chapter });
  } catch (error) {
    console.error("Error fetching user guide chapter:", error);
    res.status(500).json({ error: "Failed to fetch chapter" });
  }
});

// GET /api/help/troubleshooting - List all troubleshooting chapters (filtered by permissions)
router.get("/troubleshooting", async (req, res) => {
  try {
    const userId = (req as any).dbUser?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user's permissions (across ALL organizations)
    const permissions = await storage.getUserHelpCenterPermissions(userId);

    // Filter chapters based on permissions using JSON structure
    const chapterList = troubleshootingChapters
      .filter(chapter => hasChapterPermission(permissions, chapter.slug))
      .map(chapter => ({
        id: chapter.id,
        title: chapter.title,
        slug: chapter.slug
      }));

    res.json({ chapters: chapterList });
  } catch (error) {
    console.error("Error fetching troubleshooting chapters:", error);
    res.status(500).json({ error: "Failed to fetch troubleshooting chapters" });
  }
});

// GET /api/help/troubleshooting/:slug - Get single troubleshooting chapter with HTML
// Protected by permission middleware
router.get("/troubleshooting/:slug", checkChapterPermission, (req, res) => {
  try {
    const { slug } = req.params;
    const chapter = troubleshootingChapters.find(ch => ch.slug === slug);

    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    // Return full chapter including HTML content
    res.json({ chapter });
  } catch (error) {
    console.error("Error fetching troubleshooting chapter:", error);
    res.status(500).json({ error: "Failed to fetch chapter" });
  }
});

export default router;
