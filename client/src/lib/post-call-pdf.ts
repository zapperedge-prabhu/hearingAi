import jsPDF from "jspdf";

interface QaRow {
  category?: string;
  evidence?: string;
  result?: string;
}

interface TimelineEvent {
  timestamp?: string;
  label?: string;
  description?: string;
  behavior?: string;
  impact?: string;
}

interface PostCallAnalysisData {
  overview?: {
    call_id?: string;
    duration?: string;
    call_type?: string;
    agent_id?: string;
    customer_location?: string;
    primary_intent?: string;
    secondary_intents?: string[];
    outcome?: string;
    outcome_type?: string;
    call_health?: string;
  };
  customer?: {
    profile_signals?: {
      estimated_tech_comfort?: string;
      communication_style?: string;
      vulnerability_indicators?: string[];
      trust_level_toward_agent?: string;
    };
    sentiment?: {
      overall?: string;
      start_of_call?: string;
      end_of_call?: string;
      trajectory?: string;
      inflection_points?: Array<{ timestamp?: string; shift?: string; trigger?: string }>;
    };
    emotions_detected?: Array<{ emotion?: string; intensity?: string; timestamp_range?: string; evidence?: string }>;
    key_moments?: Array<{ timestamp?: string; moment_type?: string; quote?: string; significance?: string }>;
    unmet_needs?: string[];
    pain_points?: string[];
    questions_asked?: string[];
    questions_unanswered?: string[];
  };
  agent?: {
    communication?: Record<string, string>;
    behaviors_detected?: TimelineEvent[];
    techniques_used?: Array<{ technique?: string; timestamp?: string; intent?: string }>;
    missed_opportunities?: Array<{ timestamp?: string; what_was_missed?: string; impact?: string }>;
    strengths?: string[];
    weaknesses?: string[];
  };
  qa_scorecard?: QaRow[];
  conversation_dynamics?: {
    talk_ratio?: { agent_percent?: number; customer_percent?: number; assessment?: string };
    interruptions?: { agent_interrupted_customer?: number; customer_interrupted_agent?: number };
    rapport_level?: string;
    power_dynamic?: string;
  };
  language_intelligence?: {
    keywords_by_category?: {
      problem_words?: string[];
      trust_words?: string[];
      urgency_words?: string[];
      confusion_words?: string[];
      compliance_words?: string[];
      red_flag_words?: string[];
    };
    tone_markers?: string[];
    linguistic_patterns?: string[];
  };
  what_to_learn?: {
    for_agent_training?: Array<{ lesson?: string; reason?: string; priority?: string }>;
    for_process_improvement?: Array<{ gap?: string; suggestion?: string }>;
    patterns_to_watch?: string[];
  };
  risk_signals?: {
    fraud_risk?: string;
    compliance_risk?: string;
    churn_risk?: string;
    escalation_risk?: string;
    customer_harm_risk?: string;
    flags?: Array<{ type?: string; severity?: string; description?: string; timestamp?: string }>;
  };
  recommendations?: {
    immediate_actions?: Array<{ action?: string; owner?: string; urgency?: string }>;
    coaching_plan?: { overall_rating?: string; focus_areas?: string[]; suggested_training?: string[] };
    follow_up_required?: boolean;
    follow_up_details?: string;
  };
  verbatim_highlights?: Array<{ timestamp?: string; speaker?: string; quote?: string; category?: string; note?: string }>;
}

function computeQaScore(data: PostCallAnalysisData): number {
  const qa = data.qa_scorecard || [];
  if (qa.length === 0) {
    const rating = (data.recommendations?.coaching_plan?.overall_rating || "").toLowerCase();
    const base = rating.includes("excellent") ? 95 : rating.includes("good") ? 78 : rating.includes("needs") ? 42 : rating.includes("poor") ? 18 : rating.includes("terminated") ? 5 : 55;
    const fraudRisk = (data.risk_signals?.fraud_risk || "").toLowerCase();
    const fraudPenalty = fraudRisk === "critical" ? 30 : fraudRisk === "high" ? 20 : fraudRisk === "medium" ? 10 : 0;
    return Math.max(0, Math.min(100, base - fraudPenalty));
  }
  const criticals = qa.filter(r => r.result === "CRITICAL").length;
  const failures = qa.filter(r => r.result === "FAIL").length;
  const manipulation = qa.filter(r => r.result === "MANIPULATION").length;
  const passes = qa.filter(r => r.result === "PASS").length;
  const total = qa.length;
  const rawScore = ((passes) / total) * 100 - criticals * 15 - manipulation * 10 - failures * 5;
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

function computeComplianceScore(data: PostCallAnalysisData): number {
  const risk = (data.risk_signals?.compliance_risk || "").toLowerCase();
  return risk === "none" ? 100 : risk === "low" ? 82 : risk === "medium" ? 55 : risk === "high" ? 22 : risk === "critical" ? 0 : 70;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

function wrapText(doc: jsPDF, text: string, x: number, maxWidth: number, fontSize: number): string[] {
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(text, maxWidth);
}

export function downloadPostCallPDF(data: PostCallAnalysisData, fileName?: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const qaScore = computeQaScore(data);
  const complianceScore = computeComplianceScore(data);

  let y = 0;

  function checkPageBreak(needed: number) {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function drawSectionHeader(title: string) {
    checkPageBreak(10);
    doc.setFillColor(30, 41, 59);
    doc.rect(MARGIN, y, CONTENT_W, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(title.toUpperCase(), MARGIN + 3, y + 4.8);
    doc.setTextColor(0, 0, 0);
    y += 9;
  }

  function drawKV(key: string, value: string, indent = 0) {
    if (!value || value === "—") return;
    const lines = wrapText(doc, value, MARGIN + indent + 30, CONTENT_W - indent - 30, 8);
    checkPageBreak(5 + (lines.length - 1) * 4);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(key + ":", MARGIN + indent, y + 3.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(lines, MARGIN + indent + 30, y + 3.5);
    y += 4 + (lines.length - 1) * 4;
  }

  function drawBullet(text: string, indent = 3) {
    const lines = wrapText(doc, text, MARGIN + indent + 5, CONTENT_W - indent - 5, 8);
    checkPageBreak(4 + (lines.length - 1) * 3.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text("•", MARGIN + indent, y + 3.5);
    doc.text(lines, MARGIN + indent + 5, y + 3.5);
    y += 3.5 + (lines.length - 1) * 3.5;
  }

  function drawParagraph(text: string, indent = 0) {
    if (!text) return;
    const lines = wrapText(doc, text, MARGIN + indent, CONTENT_W - indent, 8);
    checkPageBreak(4 + (lines.length - 1) * 3.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    doc.text(lines, MARGIN + indent, y + 3.5);
    y += 3.5 + (lines.length - 1) * 3.5;
  }

  function spacer(h = 3) { y += h; }

  function drawScoreBox(score: number, label: string, x: number, boxW: number) {
    const color: [number, number, number] = score >= 70 ? [22, 163, 74] : score >= 40 ? [217, 119, 6] : [220, 38, 38];
    doc.setDrawColor(...color);
    doc.setLineWidth(0.5);
    doc.rect(x, y, boxW, 18);
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(label.toUpperCase(), x + boxW / 2, y + 5, { align: "center" });
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...color);
    doc.text(String(score), x + boxW / 2, y + 13, { align: "center" });
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("/100", x + boxW / 2 + 4, y + 13, { align: "left" });
  }

  // ── HEADER ──
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PAGE_W, 28, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(96, 165, 250);
  doc.text("POST-CALL ANALYSIS REPORT", MARGIN, 10);
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  const callId = data.overview?.call_id || (fileName ? fileName.replace(/\.[^/.]+$/, "").toUpperCase() : "UNKNOWN");
  doc.text(`Call ID: ${callId}`, MARGIN, 19);
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  const metaParts: string[] = [];
  if (data.overview?.duration) metaParts.push(data.overview.duration);
  if (data.overview?.call_type) metaParts.push(data.overview.call_type);
  if (data.overview?.customer_location) metaParts.push(data.overview.customer_location);
  if (data.overview?.agent_id && data.overview.agent_id !== "Unknown") metaParts.push(`Agent: ${data.overview.agent_id}`);
  metaParts.push(`Generated: ${new Date().toLocaleString()}`);
  doc.text(metaParts.join("   |   "), MARGIN, 25);
  y = 34;

  // ── FRAUD ALERT BANNER ──
  const fraudRisk = (data.risk_signals?.fraud_risk || "").toLowerCase();
  if (fraudRisk === "critical" || fraudRisk === "high") {
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.8);
    doc.rect(MARGIN, y, CONTENT_W, 12, "FD");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(185, 28, 28);
    const alertText = fraudRisk === "critical"
      ? "CRITICAL FRAUD ALERT — Social Engineering / Scam Call Detected"
      : "HIGH FRAUD RISK DETECTED";
    doc.text(alertText, MARGIN + 3, y + 5);
    const riskFlags = (data.risk_signals?.flags || []).filter(f => f.severity === "CRITICAL" || f.severity === "HIGH");
    if (riskFlags.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(153, 27, 27);
      const desc = riskFlags[0].description || "";
      doc.text(desc.slice(0, 110), MARGIN + 3, y + 10);
    }
    y += 15;
  }

  // ── SCORE CARDS ──
  const boxW = (CONTENT_W - 6) / 3;
  drawScoreBox(qaScore, "QA Score", MARGIN, boxW);
  drawScoreBox(complianceScore, "Compliance Audit", MARGIN + boxW + 3, boxW);

  const sentStart = data.customer?.sentiment?.start_of_call || "—";
  const sentEnd = data.customer?.sentiment?.end_of_call || "—";
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN + (boxW + 3) * 2, y, boxW, 18);
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("CUSTOMER SENTIMENT", MARGIN + (boxW + 3) * 2 + boxW / 2, y + 5, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(`${sentStart} → ${sentEnd}`, MARGIN + (boxW + 3) * 2 + boxW / 2, y + 12, { align: "center" });
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const traj = (data.customer?.sentiment?.trajectory || "").slice(0, 30);
  doc.text(traj, MARGIN + (boxW + 3) * 2 + boxW / 2, y + 16.5, { align: "center" });

  y += 22;

  // ── STATUS CARDS ──
  const ot = data.overview?.outcome_type || "—";
  const esc = data.risk_signals?.escalation_risk || "—";
  const ar = data.recommendations?.coaching_plan?.overall_rating || "—";
  const statusCards = [
    { label: "Call Resolution", value: ot },
    { label: "Escalation Urgency", value: esc },
    { label: "Agent Conduct", value: ar },
  ];
  statusCards.forEach((card, i) => {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN + i * (boxW + 3), y, boxW, 14);
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(card.label.toUpperCase(), MARGIN + i * (boxW + 3) + 2, y + 5);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    const val = card.value.slice(0, 22);
    doc.text(val, MARGIN + i * (boxW + 3) + 2, y + 11);
  });
  y += 18;

  // ── OVERALL ASSESSMENT ──
  drawSectionHeader("Overall Assessment");
  const outcome = data.overview?.outcome || data.overview?.primary_intent || "";
  if (outcome) drawParagraph(outcome);
  if ((data.overview?.secondary_intents || []).length > 0) {
    spacer(1);
    drawParagraph("Secondary intents: " + data.overview!.secondary_intents!.join(", "));
  }
  spacer(3);

  // ── QA SCORECARD ──
  const qaRows = data.qa_scorecard || [];
  if (qaRows.length > 0) {
    drawSectionHeader("QA Scorecard Breakdown");
    const colCat = 65;
    const colEv = CONTENT_W - 30;
    doc.setFillColor(240, 240, 240);
    doc.rect(MARGIN, y, CONTENT_W, 6, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text("Category", MARGIN + 2, y + 4);
    doc.text("Evidence", MARGIN + colCat + 2, y + 4);
    doc.text("Result", MARGIN + colEv + 2, y + 4);
    y += 7;
    qaRows.forEach((row) => {
      const evidenceLines = wrapText(doc, row.evidence || "—", MARGIN + colCat + 2, colEv - colCat, 7);
      const rowH = Math.max(6, 4 + evidenceLines.length * 3.5);
      checkPageBreak(rowH + 1);
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      const catLines = wrapText(doc, row.category || "", MARGIN + 2, colCat - 4, 7);
      doc.text(catLines, MARGIN + 2, y + 4);
      doc.setTextColor(80, 80, 80);
      doc.text(evidenceLines, MARGIN + colCat + 2, y + 4);

      const result = (row.result || "").toUpperCase();
      const resultColor: [number, number, number] =
        result === "PASS" ? [22, 163, 74] :
        result === "CRITICAL" || result === "MANIPULATION" ? [220, 38, 38] :
        result === "FAIL" ? [185, 28, 28] : [80, 80, 80];
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...resultColor);
      doc.text(result, MARGIN + colEv + 2, y + 4);
      y += rowH;
    });
    spacer(3);
  }

  // ── CALL EVENT TIMELINE ──
  const timelineEvents = (data.agent?.behaviors_detected || []).filter(e => e.timestamp || e.label || e.behavior);
  if (timelineEvents.length > 0) {
    drawSectionHeader("Call Event Timeline");
    timelineEvents.forEach((event) => {
      const label = event.label || event.behavior || "";
      const description = event.description || event.label || event.behavior || "";
      checkPageBreak(10);
      if (event.timestamp) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(80, 80, 80);
        doc.text(`[${event.timestamp}]`, MARGIN + 2, y + 3.5);
      }
      if (label) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 90);
        doc.text(label.toUpperCase(), MARGIN + 22, y + 3.5);
      }
      y += 4.5;
      if (description && description !== label) drawParagraph(description, 5);
      spacer(1.5);
    });
    spacer(2);
  }

  // ── RISK SIGNALS ──
  const riskFlags = data.risk_signals?.flags || [];
  if (riskFlags.length > 0 || data.risk_signals) {
    drawSectionHeader("Risk Signals");
    const rs = data.risk_signals;
    if (rs?.fraud_risk) drawKV("Fraud Risk", rs.fraud_risk);
    if (rs?.compliance_risk) drawKV("Compliance Risk", rs.compliance_risk);
    if (rs?.churn_risk) drawKV("Churn Risk", rs.churn_risk);
    if (rs?.escalation_risk) drawKV("Escalation Risk", rs.escalation_risk);
    if (rs?.customer_harm_risk) drawKV("Customer Harm Risk", rs.customer_harm_risk);
    if (riskFlags.length > 0) {
      spacer(2);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text("Risk Flags:", MARGIN, y + 3.5);
      y += 5;
      riskFlags.forEach((flag) => {
        checkPageBreak(10);
        const sev = (flag.severity || "").toUpperCase();
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        const sevColor: [number, number, number] = sev === "CRITICAL" ? [220, 38, 38] : sev === "HIGH" ? [234, 88, 12] : [80, 80, 80];
        doc.setTextColor(...sevColor);
        doc.text(`[${sev}] ${flag.type || ""}${flag.timestamp ? ` @ ${flag.timestamp}` : ""}`, MARGIN + 3, y + 3.5);
        y += 4.5;
        if (flag.description) drawParagraph(flag.description, 6);
        spacer(1);
      });
    }
    spacer(3);
  }

  // ── CUSTOMER PROFILE ──
  const cust = data.customer;
  if (cust) {
    drawSectionHeader("Customer Profile & Sentiment");
    const ps = cust.profile_signals;
    if (ps?.estimated_tech_comfort) drawKV("Tech Comfort", ps.estimated_tech_comfort);
    if (ps?.communication_style) drawKV("Comm. Style", ps.communication_style);
    if (ps?.trust_level_toward_agent) drawKV("Trust Level", ps.trust_level_toward_agent);
    if ((ps?.vulnerability_indicators || []).length > 0) {
      drawKV("Vulnerabilities", ps!.vulnerability_indicators!.join(", "));
    }
    const sent = cust.sentiment;
    if (sent) {
      spacer(2);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text("Sentiment:", MARGIN, y + 3.5);
      y += 5;
      if (sent.overall) drawKV("Overall", sent.overall, 5);
      if (sent.trajectory) drawKV("Trajectory", sent.trajectory, 5);
    }
    if ((cust.pain_points || []).length > 0) {
      spacer(2);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text("Pain Points:", MARGIN, y + 3.5);
      y += 5;
      cust.pain_points!.forEach(p => drawBullet(p, 5));
    }
    if ((cust.unmet_needs || []).length > 0) {
      spacer(2);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text("Unmet Needs:", MARGIN, y + 3.5);
      y += 5;
      cust.unmet_needs!.forEach(n => drawBullet(n, 5));
    }
    spacer(3);
  }

  // ── AGENT PERFORMANCE ──
  const agent = data.agent;
  if (agent) {
    drawSectionHeader("Agent Performance");
    if ((agent.strengths || []).length > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(22, 163, 74);
      doc.text("Strengths:", MARGIN, y + 3.5);
      y += 5;
      agent.strengths!.forEach(s => drawBullet(s, 5));
      spacer(2);
    }
    if ((agent.weaknesses || []).length > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(220, 38, 38);
      doc.text("Weaknesses:", MARGIN, y + 3.5);
      y += 5;
      agent.weaknesses!.forEach(w => drawBullet(w, 5));
      spacer(2);
    }
    if ((agent.missed_opportunities || []).length > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text("Missed Opportunities:", MARGIN, y + 3.5);
      y += 5;
      agent.missed_opportunities!.forEach(mo => {
        if (mo.what_was_missed) drawBullet(`${mo.timestamp ? `[${mo.timestamp}] ` : ""}${mo.what_was_missed}`, 5);
        if (mo.impact) drawParagraph(`Impact: ${mo.impact}`, 10);
        spacer(1);
      });
    }
    spacer(3);
  }

  // ── CONVERSATION DYNAMICS ──
  const cd = data.conversation_dynamics;
  if (cd) {
    drawSectionHeader("Conversation Dynamics");
    if (cd.talk_ratio) {
      drawKV("Talk Ratio", `Agent ${cd.talk_ratio.agent_percent ?? "?"}%  /  Customer ${cd.talk_ratio.customer_percent ?? "?"}%`);
      if (cd.talk_ratio.assessment) drawKV("Assessment", cd.talk_ratio.assessment);
    }
    if (cd.rapport_level) drawKV("Rapport Level", cd.rapport_level);
    if (cd.power_dynamic) drawKV("Power Dynamic", cd.power_dynamic);
    if (cd.interruptions) {
      drawKV("Interruptions", `Agent→Customer: ${cd.interruptions.agent_interrupted_customer ?? 0}  |  Customer→Agent: ${cd.interruptions.customer_interrupted_agent ?? 0}`);
    }
    spacer(3);
  }

  // ── RECOMMENDATIONS ──
  const rec = data.recommendations;
  if (rec) {
    drawSectionHeader("Recommendations");
    if ((rec.immediate_actions || []).length > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text("Immediate Actions:", MARGIN, y + 3.5);
      y += 5;
      rec.immediate_actions!.forEach(a => {
        if (a.action) drawBullet(`[${a.urgency || "?"}] ${a.action}${a.owner ? ` (Owner: ${a.owner})` : ""}`, 5);
      });
      spacer(2);
    }
    const cp = rec.coaching_plan;
    if (cp) {
      if (cp.overall_rating) drawKV("Overall Rating", cp.overall_rating);
      if ((cp.focus_areas || []).length > 0) drawKV("Focus Areas", cp.focus_areas!.join(", "));
      if ((cp.suggested_training || []).length > 0) {
        spacer(1);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60, 60, 60);
        doc.text("Suggested Training:", MARGIN, y + 3.5);
        y += 5;
        cp.suggested_training!.forEach(t => drawBullet(t, 5));
      }
    }
    if (rec.follow_up_required) {
      spacer(2);
      drawKV("Follow-Up Required", "Yes");
      if (rec.follow_up_details) drawParagraph(rec.follow_up_details, 5);
    }
    spacer(3);
  }

  // ── WHAT TO LEARN ──
  const wtl = data.what_to_learn;
  if (wtl) {
    drawSectionHeader("Learning & Improvement");
    if ((wtl.for_agent_training || []).length > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text("Agent Training:", MARGIN, y + 3.5);
      y += 5;
      wtl.for_agent_training!.forEach(item => {
        if (item.lesson) drawBullet(`[${item.priority || "?"}] ${item.lesson}`, 5);
        if (item.reason) drawParagraph(`Reason: ${item.reason}`, 10);
        spacer(1);
      });
      spacer(2);
    }
    if ((wtl.for_process_improvement || []).length > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text("Process Improvements:", MARGIN, y + 3.5);
      y += 5;
      wtl.for_process_improvement!.forEach(item => {
        if (item.gap) drawBullet(item.gap, 5);
        if (item.suggestion) drawParagraph(`Suggestion: ${item.suggestion}`, 10);
        spacer(1);
      });
    }
    spacer(3);
  }

  // ── VERBATIM HIGHLIGHTS ──
  const vh = data.verbatim_highlights || [];
  if (vh.length > 0) {
    drawSectionHeader("Verbatim Highlights");
    vh.forEach((h) => {
      checkPageBreak(16);
      if (h.quote) {
        doc.setFillColor(248, 248, 252);
        const quoteLines = wrapText(doc, `"${h.quote}"`, MARGIN + 4, CONTENT_W - 8, 8);
        const boxH = 6 + quoteLines.length * 3.8;
        doc.rect(MARGIN, y, CONTENT_W, boxH, "F");
        doc.setDrawColor(180, 180, 220);
        doc.setLineWidth(0.8);
        doc.line(MARGIN, y, MARGIN, y + boxH);
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(50, 50, 80);
        doc.text(quoteLines, MARGIN + 4, y + 4.5);
        y += boxH + 1;
        if (h.speaker || h.timestamp || h.category) {
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(100, 100, 100);
          const meta = [h.speaker, h.timestamp, h.category].filter(Boolean).join(" | ");
          doc.text(meta, MARGIN + 4, y + 3);
          y += 4;
        }
        if (h.note) drawParagraph(h.note, 4);
        spacer(3);
      }
    });
  }

  // ── FOOTER on each page ──
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Post-Call Analysis Report  |  ${callId}  |  Generated ${new Date().toLocaleString()}  |  Page ${i} of ${totalPages}`,
      PAGE_W / 2,
      PAGE_H - 6,
      { align: "center" }
    );
  }

  const safeName = (fileName ? fileName.replace(/\.[^/.]+$/, "") : callId).replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`post-call-analysis_${safeName}.pdf`);
}
