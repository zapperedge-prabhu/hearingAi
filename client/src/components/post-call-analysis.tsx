import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShieldAlert,
  Phone,
  Clock,
  MapPin,
  User,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  Brain,
  AlertTriangle,
  Zap,
} from "lucide-react";

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

interface PostCallAnalysisProps {
  data: PostCallAnalysisData;
  fileName?: string;
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

function getQaResultStyle(result?: string) {
  const r = (result || "").toUpperCase();
  if (r === "PASS") return { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-800 dark:text-green-300", border: "border-green-300 dark:border-green-700" };
  if (r === "CRITICAL") return { bg: "bg-red-600", text: "text-white", border: "border-red-700", solid: true };
  if (r === "MANIPULATION") return { bg: "bg-purple-600", text: "text-white", border: "border-purple-700", solid: true };
  if (r === "FAIL") return { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300", border: "border-red-300 dark:border-red-700" };
  return { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
}

function getTimelineLabelStyle(label?: string) {
  const l = (label || "").toUpperCase();
  if (l.includes("FRAUD") || l.includes("SCAM") || l.includes("SOCIAL ENGINEERING")) return "bg-red-600 text-white";
  if (l.includes("REMOTE ACCESS") || l.includes("COMPUTER")) return "bg-red-700 text-white";
  if (l.includes("DECEPTION") || l.includes("IMPERSONATION") || l.includes("IDENTITY")) return "bg-orange-600 text-white";
  if (l.includes("MANIPULAT") || l.includes("COACHING")) return "bg-purple-600 text-white";
  if (l.includes("FINANCIAL") || l.includes("TRANSFER") || l.includes("PAYMENT")) return "bg-amber-600 text-white";
  if (l.includes("COMPLIANCE")) return "bg-indigo-600 text-white";
  if (l.includes("CONFUSION") || l.includes("OBJECTION")) return "bg-amber-500 text-white";
  if (l.includes("RESOLUTION") || l.includes("ABRUPT") || l.includes("TERMINATED")) return "bg-slate-600 text-white";
  return "bg-blue-600 text-white";
}

function getHealthColor(health?: string) {
  const h = (health || "").toLowerCase();
  if (h === "fraudulent" || h === "critical") return { bg: "bg-red-600", text: "text-white", ringBg: "bg-red-600", ringText: "text-white" };
  if (h === "poor") return { bg: "bg-orange-600", text: "text-white", ringBg: "bg-orange-600", ringText: "text-white" };
  if (h === "needs improvement") return { bg: "bg-amber-500", text: "text-white", ringBg: "bg-amber-500", ringText: "text-white" };
  if (h === "good") return { bg: "bg-blue-600", text: "text-white", ringBg: "bg-blue-600", ringText: "text-white" };
  return { bg: "bg-green-600", text: "text-white", ringBg: "bg-green-600", ringText: "text-white" };
}

function ScoreCard({ score, label, sublabel }: { score: number; label: string; sublabel?: string }) {
  const color = score >= 70 ? "#16a34a" : score >= 40 ? "#d97706" : "#dc2626";
  const bgClass = score >= 70 ? "bg-green-50 dark:bg-green-950/20" : score >= 40 ? "bg-amber-50 dark:bg-amber-950/20" : "bg-red-50 dark:bg-red-950/20";
  return (
    <div className={`border rounded-lg p-4 ${bgClass} flex flex-col gap-2`}>
      <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{label}</div>
      <div className="flex items-end gap-1">
        <span className="text-4xl font-black leading-none" style={{ color }}>{score}</span>
        <span className="text-lg font-semibold text-muted-foreground leading-6">/100</span>
      </div>
      {sublabel && <div className="text-[11px] text-muted-foreground leading-tight">{sublabel}</div>}
    </div>
  );
}

function TalkRatioBar({ agentPct, customerPct }: { agentPct: number; customerPct: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="font-medium">Agent {agentPct}%</span>
        <span className="font-medium">Customer {customerPct}%</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden border border-border">
        <div className="bg-primary/80" style={{ width: `${agentPct}%` }} />
        <div className="bg-blue-400/60" style={{ width: `${customerPct}%` }} />
      </div>
    </div>
  );
}

export function PostCallAnalysis({ data, fileName }: PostCallAnalysisProps) {
  const qaScore = computeQaScore(data);
  const complianceScore = computeComplianceScore(data);

  const fraudRisk = (data.risk_signals?.fraud_risk || "").toLowerCase();
  const showFraudAlert = fraudRisk === "critical" || fraudRisk === "high";
  const callHealth = data.overview?.call_health || "";
  const healthStyle = getHealthColor(callHealth);
  const isCriticalHealth = callHealth.toLowerCase() === "critical" || callHealth.toLowerCase() === "fraudulent";

  const sentTrajectory = data.customer?.sentiment?.trajectory || "";
  const SentimentIcon = sentTrajectory.toLowerCase().includes("improv") ? TrendingUp : sentTrajectory.toLowerCase().includes("declin") ? TrendingDown : Minus;
  const sentColor = sentTrajectory.toLowerCase().includes("improv") ? "text-green-600" : sentTrajectory.toLowerCase().includes("declin") ? "text-red-600" : "text-amber-500";

  const outcomeType = data.overview?.outcome_type || "—";
  const escalation = data.risk_signals?.escalation_risk || "—";
  const agentRating = data.recommendations?.coaching_plan?.overall_rating || "—";

  const escalationColor = escalation.toLowerCase() === "high" || escalation.toLowerCase() === "critical" ? "text-red-600" : escalation.toLowerCase() === "medium" ? "text-amber-600" : "text-blue-600";
  const outcomeColor = outcomeType.toLowerCase().includes("unresolved") || outcomeType.toLowerCase().includes("incomplete") ? "text-red-600" : outcomeType.toLowerCase().includes("partial") ? "text-amber-600" : "text-green-600";
  const agentRatingColor = agentRating.toLowerCase().includes("terminated") ? "text-red-700" : agentRating.toLowerCase().includes("poor") ? "text-orange-600" : agentRating.toLowerCase().includes("needs") ? "text-amber-600" : agentRating.toLowerCase().includes("good") ? "text-blue-600" : "text-green-600";

  const qaRows = data.qa_scorecard || [];
  const timelineEvents = (data.agent?.behaviors_detected || []).filter(e => e.timestamp || e.label || e.behavior);
  const riskFlags = data.risk_signals?.flags || [];
  const immediateActions = data.recommendations?.immediate_actions || [];

  const overallDescription = data.overview?.outcome || data.overview?.primary_intent || "";

  return (
    <ScrollArea className="h-full w-full">
      <div className="pb-8 text-[13px]">

        {/* ── Dark header ── */}
        <div className="bg-slate-900 dark:bg-slate-950 text-white">
          <div className="px-5 pt-4 pb-1">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-blue-400">Post-Call Analysis Report</span>
            </div>
            <div className="text-xl font-extrabold tracking-tight">
              Call ID: {data.overview?.call_id || (fileName ? fileName.replace(/\.[^/.]+$/, "").toUpperCase() : "UNKNOWN")}
            </div>
          </div>
          <div className="bg-slate-800 dark:bg-slate-900 mt-1 px-5 py-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-400">
            {data.overview?.duration && (
              <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" />{data.overview.duration}</span>
            )}
            {data.overview?.call_type && (
              <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{data.overview.call_type}</span>
            )}
            {data.overview?.customer_location && (
              <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{data.overview.customer_location}</span>
            )}
            {data.overview?.agent_id && data.overview.agent_id !== "Unknown" && (
              <span className="flex items-center gap-1.5"><User className="h-3 w-3" />Agent: {data.overview.agent_id}</span>
            )}
            <span className="flex items-center gap-1.5 ml-auto">
              <Brain className="h-3 w-3 text-blue-400" />
              <span className="text-blue-400">Analyzed by: Content Understanding Engine</span>
            </span>
          </div>
        </div>

        <div className="p-4 space-y-4">

          {/* ── Fraud / Risk Alert Banner ── */}
          {showFraudAlert && (
            <div className="border-2 border-red-500 rounded-lg bg-red-50 dark:bg-red-950/30 p-3.5">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-red-700 dark:text-red-300 mb-1">
                    {fraudRisk === "critical"
                      ? "Critical Fraud Alert — Social Engineering / Scam Call Detected"
                      : "High Fraud Risk Detected"}
                  </p>
                  {riskFlags.filter(f => f.severity === "CRITICAL" || f.severity === "HIGH").map((f, i) => (
                    <p key={i} className="text-[11px] text-red-800 dark:text-red-300 leading-snug mt-0.5">{f.description}</p>
                  ))}
                  {riskFlags.length === 0 && (
                    <p className="text-[11px] text-red-800 dark:text-red-300 leading-snug">This call exhibits documented patterns of social engineering or fraud activity. Escalation is required.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Score Cards Row ── */}
          <div className="grid grid-cols-3 gap-3">
            <ScoreCard
              score={qaScore}
              label="QA Score"
              sublabel={qaScore < 30 ? "Critical Issues + Fraud Indicators" : qaScore < 60 ? "Multiple Issues Detected" : qaScore < 80 ? "Needs Improvement" : "Strong Performance"}
            />
            <ScoreCard
              score={complianceScore}
              label="Compliance Audit"
              sublabel={complianceScore < 30 ? "Multiple violations" : complianceScore < 60 ? "Violations detected" : complianceScore < 80 ? "Minor compliance issues" : "Compliant"}
            />
            <div className="border rounded-lg p-4 bg-card flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Customer Sentiment</div>
              <div className="flex items-center gap-1.5">
                <SentimentIcon className={`h-5 w-5 ${sentColor} shrink-0`} />
                <span className="text-base font-bold">
                  {data.customer?.sentiment?.start_of_call || "—"} → {data.customer?.sentiment?.end_of_call || "—"}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                {data.customer?.sentiment?.trajectory || "Unknown trajectory"}
              </div>
            </div>
          </div>

          {/* ── Status Cards Row ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="border rounded-lg p-3.5 bg-card">
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Call Resolution</div>
              <div className={`text-xl font-black uppercase leading-tight mb-1 ${outcomeColor}`}>{outcomeType}</div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                {(data.overview?.outcome || "").slice(0, 55)}{(data.overview?.outcome || "").length > 55 ? "…" : ""}
              </div>
            </div>
            <div className="border rounded-lg p-3.5 bg-card">
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Escalation Urgency</div>
              <div className={`text-xl font-black uppercase leading-tight mb-1 ${escalationColor}`}>{escalation}</div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                {immediateActions.slice(0, 1).map(a => a.owner).join(" + ") || (riskFlags.length > 0 ? "Compliance + Management" : "—")}
              </div>
            </div>
            <div className="border rounded-lg p-3.5 bg-card">
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Agent Conduct</div>
              <div className={`text-xl font-black uppercase leading-tight mb-1 ${agentRatingColor}`}>{agentRating}</div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                {(data.agent?.weaknesses || []).slice(0, 1)[0]?.slice(0, 50) || "—"}
              </div>
            </div>
          </div>

          {/* ── Overall Assessment ── */}
          <div className="border rounded-lg overflow-hidden bg-card">
            <div className="bg-muted/40 px-4 py-2 border-b">
              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Overall Assessment</span>
            </div>
            <div className="p-4 flex items-start gap-4">
              {/* Score Circle */}
              <div className={`w-14 h-14 rounded-full flex flex-col items-center justify-center shrink-0 ${healthStyle.ringBg}`}>
                <span className={`text-2xl font-black leading-none ${healthStyle.ringText}`}>{qaScore}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {isCriticalHealth && <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />}
                  <span className={`text-sm font-bold ${isCriticalHealth ? "text-red-700 dark:text-red-400" : "text-foreground"}`}>
                    {callHealth.toUpperCase()}{callHealth ? " — " : ""}
                    {data.overview?.primary_intent || "Call Health Assessment"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{overallDescription}</p>
                {(data.overview?.secondary_intents || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(data.overview!.secondary_intents!).map((intent, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border">{intent}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── QA Scorecard Breakdown ── */}
          {qaRows.length > 0 && (
            <div className="border rounded-lg overflow-hidden bg-card">
              <div className="bg-muted/40 px-4 py-2 border-b">
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">QA Scorecard Breakdown</span>
              </div>
              <div className="divide-y">
                {qaRows.map((row, i) => {
                  const style = getQaResultStyle(row.result);
                  return (
                    <div key={i} className="flex items-start">
                      <div className="px-4 py-3 w-[32%] shrink-0 border-r border-border">
                        <span className="text-xs font-semibold leading-snug">{row.category}</span>
                      </div>
                      <div className="px-4 py-3 flex-1 min-w-0">
                        <span className="text-xs text-muted-foreground leading-snug italic">
                          {row.evidence ? `"${row.evidence}"` : "—"}
                        </span>
                      </div>
                      <div className="px-3 py-3 shrink-0 flex items-start justify-end">
                        <span className={`text-[10px] font-black px-2 py-1 rounded border whitespace-nowrap ${style.bg} ${style.text} ${style.border}`}>
                          {(row.result || "").toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Call Event Timeline ── */}
          {timelineEvents.length > 0 && (
            <div className="border rounded-lg overflow-hidden bg-card">
              <div className="bg-muted/40 px-4 py-2 border-b">
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Call Event Timeline</span>
              </div>
              <div className="divide-y">
                {timelineEvents.map((event, i) => {
                  const label = event.label || event.behavior || "";
                  const description = event.description || event.label || event.behavior || "";
                  return (
                    <div key={i} className="flex items-start gap-3 px-4 py-3">
                      <div className="shrink-0 mt-0.5">
                        {event.timestamp && (
                          <span className="text-[10px] font-mono bg-muted border border-border rounded px-1.5 py-0.5 whitespace-nowrap">
                            {event.timestamp}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        {label && (
                          <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded whitespace-nowrap ${getTimelineLabelStyle(label)}`}>
                            {label.toUpperCase()}
                          </span>
                        )}
                        <p className="text-xs text-foreground leading-snug">{description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Risk Flags ── */}
          {riskFlags.length > 0 && (
            <div className="border rounded-lg overflow-hidden bg-card">
              <div className="bg-muted/40 px-4 py-2 border-b flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Critical Risk Flags</span>
                <div className="ml-auto flex gap-2 text-[10px]">
                  {(["fraud_risk", "compliance_risk", "escalation_risk"] as const).map(key => {
                    const val = (data.risk_signals as any)?.[key];
                    if (!val || val.toLowerCase() === "none") return null;
                    const label = key.replace("_risk", "").replace("_", " ");
                    const colorClass = val.toLowerCase() === "critical" ? "bg-red-600 text-white" : val.toLowerCase() === "high" ? "bg-orange-500 text-white" : val.toLowerCase() === "medium" ? "bg-amber-500 text-white" : "bg-blue-500 text-white";
                    return (
                      <span key={key} className={`px-1.5 py-0.5 rounded font-bold uppercase ${colorClass}`}>
                        {label}: {val}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="divide-y">
                {riskFlags.map((flag, i) => {
                  const severityColor = flag.severity === "CRITICAL" ? "text-red-600" : flag.severity === "HIGH" ? "text-orange-500" : "text-amber-500";
                  const rowBg = flag.severity === "CRITICAL" ? "bg-red-50 dark:bg-red-950/20" : flag.severity === "HIGH" ? "bg-orange-50 dark:bg-orange-950/20" : "";
                  return (
                    <div key={i} className={`px-4 py-2.5 flex items-start gap-3 ${rowBg}`}>
                      <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${severityColor}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] font-black uppercase ${severityColor}`}>{flag.severity}</span>
                          {flag.type && <span className="text-[10px] font-semibold text-muted-foreground uppercase">{flag.type}</span>}
                          {flag.timestamp && <span className="text-[10px] text-muted-foreground ml-auto">{flag.timestamp}</span>}
                        </div>
                        <p className="text-xs text-foreground leading-snug">{flag.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Conversation Dynamics ── */}
          {data.conversation_dynamics?.talk_ratio && (
            <div className="border rounded-lg overflow-hidden bg-card">
              <div className="bg-muted/40 px-4 py-2 border-b">
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Conversation Dynamics</span>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold mb-2">Talk Ratio
                    {data.conversation_dynamics.talk_ratio.assessment && (
                      <span className="ml-2 font-normal text-muted-foreground">— {data.conversation_dynamics.talk_ratio.assessment}</span>
                    )}
                  </p>
                  <TalkRatioBar
                    agentPct={data.conversation_dynamics.talk_ratio.agent_percent || 50}
                    customerPct={data.conversation_dynamics.talk_ratio.customer_percent || 50}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {data.conversation_dynamics.rapport_level && (
                    <div className="bg-muted/40 rounded p-2.5">
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase">Rapport</span>
                      <p className="text-xs font-bold mt-0.5">{data.conversation_dynamics.rapport_level}</p>
                    </div>
                  )}
                  {data.conversation_dynamics.power_dynamic && (
                    <div className="bg-muted/40 rounded p-2.5">
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase">Power Dynamic</span>
                      <p className="text-xs font-bold mt-0.5">{data.conversation_dynamics.power_dynamic}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Language Intelligence ── */}
          {(() => {
            const kwc = data.language_intelligence?.keywords_by_category;
            const cats = [
              { key: "red_flag_words", label: "Red Flag Words", colorClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800" },
              { key: "urgency_words", label: "Urgency Words", colorClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800" },
              { key: "compliance_words", label: "Compliance Words", colorClass: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800" },
            ] as const;
            const hasAny = cats.some(c => ((kwc as any)?.[c.key] || []).length > 0);
            if (!hasAny) return null;
            return (
              <div className="border rounded-lg overflow-hidden bg-card">
                <div className="bg-muted/40 px-4 py-2 border-b">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Language Intelligence</span>
                </div>
                <div className="p-4 space-y-3">
                  {cats.map(({ key, label, colorClass }) => {
                    const words = ((kwc as any)?.[key] || []) as string[];
                    if (!words.length) return null;
                    return (
                      <div key={key}>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5">{label}</p>
                        <div className="flex flex-wrap gap-1">
                          {words.map((w, i) => (
                            <span key={i} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${colorClass}`}>{w}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Recommendations ── */}
          {(immediateActions.length > 0 || (data.recommendations?.coaching_plan?.focus_areas || []).length > 0) && (
            <div className="border rounded-lg overflow-hidden bg-card">
              <div className="bg-muted/40 px-4 py-2 border-b flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Recommendations</span>
              </div>
              <div className="p-4 space-y-4">
                {immediateActions.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Immediate Actions</p>
                    <div className="space-y-2">
                      {immediateActions.map((a, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded mt-0.5 ${
                            (a.urgency || "").toLowerCase() === "immediate" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                            (a.urgency || "").toLowerCase() === "today" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                            "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          }`}>{(a.urgency || "Soon").toUpperCase()}</span>
                          <span>{a.action}{a.owner && <span className="text-muted-foreground"> → {a.owner}</span>}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(data.recommendations?.coaching_plan?.focus_areas || []).length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Coaching Focus Areas</p>
                    <div className="space-y-1.5">
                      {(data.recommendations!.coaching_plan!.focus_areas!).map((area, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                          <span>{area}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {data.recommendations?.follow_up_required && data.recommendations.follow_up_details && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-3">
                    <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400 mb-1">Follow-Up Required</p>
                    <p className="text-xs text-amber-800 dark:text-amber-300">{data.recommendations.follow_up_details}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Agent Strengths & Weaknesses ── */}
          {((data.agent?.strengths || []).length > 0 || (data.agent?.weaknesses || []).length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded-lg overflow-hidden bg-card">
                <div className="bg-green-50 dark:bg-green-950/20 px-3 py-2 border-b flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-green-700 dark:text-green-400">Strengths</span>
                </div>
                <div className="p-3 space-y-1.5">
                  {(data.agent?.strengths || []).slice(0, 4).map((s, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs">
                      <div className="w-1 h-1 rounded-full bg-green-500 mt-1.5 shrink-0" />
                      <span>{s}</span>
                    </div>
                  ))}
                  {(data.agent?.strengths || []).length === 0 && <p className="text-xs text-muted-foreground">None identified</p>}
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden bg-card">
                <div className="bg-red-50 dark:bg-red-950/20 px-3 py-2 border-b flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Weaknesses</span>
                </div>
                <div className="p-3 space-y-1.5">
                  {(data.agent?.weaknesses || []).slice(0, 4).map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs">
                      <div className="w-1 h-1 rounded-full bg-red-500 mt-1.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                  {(data.agent?.weaknesses || []).length === 0 && <p className="text-xs text-muted-foreground">None identified</p>}
                </div>
              </div>
            </div>
          )}

          {/* ── Customer Pain Points & Unmet Needs ── */}
          {((data.customer?.pain_points || []).length > 0 || (data.customer?.unmet_needs || []).length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {(data.customer?.pain_points || []).length > 0 && (
                <div className="border rounded-lg overflow-hidden bg-card">
                  <div className="bg-orange-50 dark:bg-orange-950/20 px-3 py-2 border-b">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-400">Customer Pain Points</span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {(data.customer.pain_points || []).slice(0, 4).map((p, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        <div className="w-1 h-1 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                        <span>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(data.customer?.unmet_needs || []).length > 0 && (
                <div className="border rounded-lg overflow-hidden bg-card">
                  <div className="bg-blue-50 dark:bg-blue-950/20 px-3 py-2 border-b">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400">Unmet Needs</span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {(data.customer.unmet_needs || []).slice(0, 4).map((n, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        <div className="w-1 h-1 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                        <span>{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Unanswered Questions ── */}
          {(data.customer?.questions_unanswered || []).length > 0 && (
            <div className="border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden bg-amber-50 dark:bg-amber-950/20">
              <div className="px-4 py-2 border-b border-amber-200 dark:border-amber-800">
                <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Unanswered Customer Questions</span>
              </div>
              <div className="p-3 space-y-1">
                {(data.customer.questions_unanswered).map((q, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-amber-900 dark:text-amber-200">
                    <span className="shrink-0 font-bold">?</span>
                    <span>{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </ScrollArea>
  );
}
