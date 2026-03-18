export function extractCuMarkdown(cuRawResult: any): string {
  const contents = cuRawResult?.result?.contents || cuRawResult?.contents || [];
  return contents.map((c: any) => c.markdown || "").filter(Boolean).join("\n\n");
}

export function countQuestionsInText(text: string): number {
  if (!text) return 10;

  // Pattern 1: Q1, Q.1, Q 1 — track highest number seen
  const qPatterns = [...text.matchAll(/\bQ\.?\s*(\d+)\b/gi)];
  // Pattern 2: numbered lines like "1. What is..." or "2. Explain..."
  const numberedLines = [...text.matchAll(/^\s*(\d+)\.\s+\S/gm)];
  // Pattern 3: (1) style
  const bracketNums = [...text.matchAll(/^\s*\((\d+)\)\s+\S/gm)];
  // Pattern 4: "Question 1", "Question 2"
  const wordQuestion = [...text.matchAll(/\bQuestion\s+(\d+)\b/gi)];
  // Pattern 5: [X marks] or [X mark] labels — one per question in formal papers
  const markLabels = text.match(/\[\d+\s*marks?\]/gi);

  let maxNum = 0;

  for (const match of [...qPatterns, ...numberedLines, ...bracketNums, ...wordQuestion]) {
    const n = parseInt(match[1], 10);
    if (n > maxNum && n < 200) maxNum = n;
  }

  // mark labels count is often more reliable than numbering
  if (markLabels && markLabels.length > maxNum) {
    maxNum = markLabels.length;
  }

  return maxNum || 10;
}

function detectSheetType(answerSheetMarkdown: string): "omr" | "handwritten" {
  const lower = answerSheetMarkdown.toLowerCase();
  // OMR sheets typically contain bubble grids, circles, filled marks
  const omrSignals = [
    /omr/i,
    /bubble/i,
    /fill.*circle/i,
    /darken.*bubble/i,
    /\bA\s+B\s+C\s+D\b/,           // option row
    /\(\s*[A-D]\s*\)\s*\(\s*[A-D]\s*\)/,  // (A) (B) (C) (D)
    /●|◉|⬤|○|◯/,                  // circle characters
  ];
  const omrScore = omrSignals.filter(r => r.test(answerSheetMarkdown)).length;
  return omrScore >= 2 ? "omr" : "handwritten";
}

export function buildEvalPrompt(params: {
  questionPaperText: string;
  answerSheetMarkdown: string;
  standardAnswerText?: string;
}) {
  const sheetType = detectSheetType(params.answerSheetMarkdown);

  const omrInstructions = sheetType === "omr" ? `
IMPORTANT - OMR ANSWER SHEET:
This is an Objective Multiple Choice (OMR) answer sheet where students darken bubbles for options A/B/C/D.
- The OCR output may show bubbles as tables, symbols (●○◯), or letters.
- Identify which option (A/B/C/D) the student selected for each question by finding the darkened/filled bubble.
- Compare the student's selected option against the correct answer. If no standard answers are provided, solve each question yourself to determine the correct option.
- Give marksAwarded=1 if correct option selected, marksAwarded=0 if wrong or not answered.
- Keep feedback brief: "Correct. Student selected (A)." or "Incorrect. Student selected (B); correct answer is (A) 4."
` : "";

  const standardAnswerSection = params.standardAnswerText?.trim()
    ? `\nMARKING SCHEME / STANDARD ANSWERS (use this to determine correct answers and mark breakdowns):\n${params.standardAnswerText.trim()}\n`
    : "";

  return `
You are an experienced examiner grading a student exam paper.
${omrInstructions}

QUESTION PAPER:
${params.questionPaperText?.trim() || "Not provided. Use expert judgment based on the student's answers; be conservative."}

${standardAnswerSection}

STUDENT ANSWER SHEET (OCR markdown):
${params.answerSheetMarkdown}

Return ONLY valid JSON in this exact shape — include ALL questions from the question paper:
{
  "questions": [
    {
      "questionNumber": "1",
      "marksAwarded": 3,
      "maxMarks": 5,
      "status": "partial",
      "feedback": "..."
    }
  ],
  "totalMarksAwarded": 18,
  "totalMaxMarks": 50,
  "percentage": 36.0,
  "overallFeedback": "..."
}

GRADING RULES:

1. STATUS must be exactly: "correct" | "partial" | "incorrect"

2. UNANSWERED QUESTIONS: If a question is not attempted, set marksAwarded=0, status="incorrect",
   feedback="Not attempted. A complete answer would have required [briefly state what was needed]."

3. ILLEGIBLE ANSWERS: If the student's answer is completely unreadable or garbled OCR symbols,
   set marksAwarded=null, status="illegible",
   feedback="Answer could not be read clearly — please review the original sheet."

4. PARTIAL CREDIT RULES (apply based on maxMarks):
   - maxMarks = 1: binary only — 0 or 1, no decimals.
   - maxMarks 2–3: award in 0.5 increments based on partial concept coverage.
   - maxMarks 4–6: award in 1-mark steps. Use this guide:
       0 marks = completely wrong or blank
       25% = correct approach but fundamentally flawed execution
       50% = correct approach, covers roughly half the required concepts
       75% = mostly correct, minor omissions only
       100% = complete, accurate, well-expressed answer
   - maxMarks 7+: award in 1-mark steps for each distinct concept or step demonstrated.
   - For MATH questions specifically: always award method marks for correct working
     even if the final numerical answer is wrong due to an arithmetic slip.

5. QUESTION TYPE GRADING GUIDANCE:
   - MCQ: compare selected option exactly against correct answer. No partial credit.
   - Short answer: award marks for key concepts present. Accept synonyms and paraphrases.
   - Essay/long answer: score across these dimensions proportionally —
       thesis clarity (25%), supporting evidence (35%), structure (25%), language (15%)
   - Math/calculation: award step-by-step. Show which steps earned marks in feedback.
   - Diagram/label: score on correct labels (60%), relationships shown (30%), completeness (10%).

6. FEEDBACK must follow this 3-part structure for every question:
   Part 1 — What the student got right (skip this part if nothing was correct).
   Part 2 — What was specifically missing or incorrect. Name the concept or topic.
   Part 3 — One concrete improvement tip (e.g. "Review the water cycle diagram in Chapter 3").
   Length guide: MCQ = 1–2 sentences. Short answer = 2–3 sentences. Essay/long = 3–4 sentences.
   For math: explain which step was wrong and what the correct working should have been.

7. OVERALL FEEDBACK must follow this structure:
   "[Performance band]: [Student] demonstrated [specific strengths].
   Areas needing attention: [2 specific weak concepts by name].
   Recommended focus: [one specific study action]."
   Performance bands: Excellent (≥85%) | Good (70–84%) | Developing (50–69%) | Needs Support (<50%)

8. totalMarksAwarded must equal the exact sum of all questions[].marksAwarded values.
   Treat null marksAwarded (illegible) as 0 in the total.

9. Use camelCase keys exactly as shown in the schema above.
`.trim();
}
