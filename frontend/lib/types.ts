// Domain types matching the backend Prisma models

export interface Agent {
  id: string;
  name: string;
  useCase: string | null;
  persona: string | null;
  goal: string | null;
  openingLine: string | null;
  guidelines: string[];
  knowledge: string[];
  scoringNotes: string[];
  language: string;
  evaluationTarget: string | null;
  passThreshold: number;
  createdAt: string;
  updatedAt: string;
  criteria: Criterion[];
  hardRules: HardRule[];
  _count?: { calls: number; evaluations: number };
}

export interface Criterion {
  id: string;
  agentId: string;
  name: string;
  weight: number;
  description: string;
  goodLooksLike: string | null;
  badLooksLike: string | null;
}

export type HardRuleType =
  | "criterion_below"
  | "any_below"
  | "not_assessable_fail"
  | "failure_tag_any";

export interface HardRule {
  id: string;
  agentId: string;
  type: HardRuleType;
  criterionId: string | null;
  threshold: number | null;
  tags: string[];
  description: string | null;
}

export interface TranscriptTurn {
  index: number;
  speaker: "agent" | "user";
  text: string;
  startTime: number | null;
  endTime: number | null;
}

export interface Call {
  id: string;
  agentId: string;
  source: "dataset" | "upload" | "vapi";
  externalId: string | null;
  language: string | null;
  durationSeconds: number | null;
  transcript: TranscriptTurn[];
  createdAt: string;
  agent: { id: string; name: string };
  evaluations?: Evaluation[];
  _count?: { evaluations: number };
}

export interface CriterionEvaluation {
  id: string;
  evaluationId: string;
  criterionId: string;
  score: number | null;
  status: "SCORED" | "NOT_ASSESSABLE";
  reasoning: string;
  evidenceTurns: number[];
  failureTags: string[];
  criterion?: { id: string; name: string; weight: number; description: string } | null;
}

export interface Evaluation {
  id: string;
  callId: string;
  agentId: string;
  overallScore: number;
  result: "PASS" | "FAIL";
  unusualThings: string[];
  model: string;
  promptVersion: string;
  agentConfigSnapshot: Record<string, unknown>;
  createdAt: string;
  criterionEvaluations: CriterionEvaluation[];
  call?: Call;
  agent?: { id: string; name: string };
}

export interface AgentAnalytics {
  agent: { id: string; name: string; passThreshold: number };
  totalEvaluations: number;
  totalCalls: number;
  passRate: number;
  averageScore: number;
  criterionStats: {
    criterionId: string;
    criterionName: string;
    averageScore: number | null;
    minScore: number | null;
    maxScore: number | null;
    totalEvaluated: number;
    notAssessableCount: number;
  }[];
  commonFailureTags: { tag: string; count: number }[];
  recentEvaluations: {
    id: string;
    callId: string;
    overallScore: number;
    result: string;
    createdAt: string;
  }[];
}

export interface DashboardSummary {
  agentCount: number;
  callCount: number;
  evaluationCount: number;
  overallPassRate: number;
  recentEvaluations: {
    id: string;
    agentName: string;
    agentId: string;
    callId: string;
    overallScore: number;
    result: string;
    createdAt: string;
  }[];
}

// Form types for creating/updating
export interface AgentFormData {
  name: string;
  useCase: string;
  persona: string;
  goal: string;
  openingLine: string;
  guidelines: string[];
  knowledge: string[];
  scoringNotes: string[];
  language: string;
  evaluationTarget: string;
  passThreshold: number;
  criteria: CriterionFormData[];
  hardRules: HardRuleFormData[];
}

export interface CriterionFormData {
  id?: string;
  name: string;
  weight: number;
  description: string;
  goodLooksLike: string;
  badLooksLike: string;
}

export interface HardRuleFormData {
  id?: string;
  type: HardRuleType;
  criterionId: string;
  threshold: number | null;
  tags: string[];
  description: string;
}

export interface HumanCriterionLabel {
  callId: string;
  criterionId: string;
  humanScore: number;
  notes?: string;
}

export interface HumanCallLabel {
  callId: string;
  humanResult?: "PASS" | "FAIL";
  criteria: HumanCriterionLabel[];
}

export interface CriterionComparison {
  callId: string;
  criterionId: string;
  criterionName?: string;
  humanScore: number;
  aiScore: number | null;
  delta: number | null;
  isExactMatch: boolean;
  isWithinOne: boolean;
  aiReasoning?: string;
  aiEvidenceTurns?: number[];
  aiFailureTags?: string[];
}

export interface CriterionAccuracyBreakdown {
  criterionId: string;
  criterionName?: string;
  totalPairs: number;
  exactMatches: number;
  exactAgreementPct: number;
  mae: number;
}

export interface ComparisonMetrics {
  totalPairs: number;
  exactMatches: number;
  exactAgreementPct: number;
  withinOneMatches: number;
  withinOneAgreementPct: number;
  mae: number;
  passFailEvaluated: number;
  passFailAgreements: number;
  passFailAgreementPct: number;
  mismatches: CriterionComparison[];
  failurePatterns: { tag: string; count: number }[];
  unmatchedCallIds: string[];
  criterionBreakdown: CriterionAccuracyBreakdown[];
}

export interface ValidationComparisonResponse {
  metrics: ComparisonMetrics;
  csv: string;
}

export interface ConsistencyCriterionStat {
  criterionId: string;
  criterionName?: string;
  scores: (number | null)[];
  range: number | null;
  stdev: number | null;
  allAssessable: boolean;
}

export interface ConsistencyMetrics {
  runs: number;
  overallScores: number[];
  results: ("PASS" | "FAIL")[];
  resultIsStable: boolean;
  overallScoreRange: number;
  criteria: ConsistencyCriterionStat[];
}

export interface ConsistencyCheckResponse {
  evaluations: Evaluation[];
  metrics: ConsistencyMetrics;
}

// Vapi assistant config as built by backend's voice.service.ts, ready to pass into
// the Vapi Web SDK's vapi.start(). Kept loose (matches Vapi's own inline-assistant shape).
export interface VapiAssistantConfig {
  name: string;
  firstMessage?: string;
  model: { provider: string; model: string; messages: { role: string; content: string }[] };
  voice: { provider: string; voiceId: string };
  transcriber: { provider: string; model: string };
}

