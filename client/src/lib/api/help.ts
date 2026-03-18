import { apiRequest } from "../queryClient";

export interface HelpChapter {
  id: string;
  title: string;
  slug: string;
  html?: string;
  allowedRoles?: string[];
}

export interface HelpChapterList {
  chapters: HelpChapter[];
}

export interface HelpChapterDetail {
  chapter: HelpChapter;
}

// Fetch list of user guide chapters
export async function getUserGuideChapters(): Promise<HelpChapter[]> {
  const res = await apiRequest("GET", "/api/help/user-guide");
  const data = await res.json() as HelpChapterList;
  return data.chapters;
}

// Fetch single user guide chapter with HTML content
export async function getUserGuideChapter(slug: string): Promise<HelpChapter> {
  const res = await apiRequest("GET", `/api/help/user-guide/${slug}`);
  const data = await res.json() as HelpChapterDetail;
  return data.chapter;
}

// Fetch list of troubleshooting chapters
export async function getTroubleshootingChapters(): Promise<HelpChapter[]> {
  const res = await apiRequest("GET", "/api/help/troubleshooting");
  const data = await res.json() as HelpChapterList;
  return data.chapters;
}

// Fetch single troubleshooting chapter with HTML content
export async function getTroubleshootingChapter(slug: string): Promise<HelpChapter> {
  const res = await apiRequest("GET", `/api/help/troubleshooting/${slug}`);
  const data = await res.json() as HelpChapterDetail;
  return data.chapter;
}
