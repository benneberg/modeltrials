export type EventLifecycle =
  | 'DRAFT'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export type VisibilityMode = 'ISOLATED' | 'BLIND' | 'OPEN';

export type ModelProvider =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'openrouter'
  | 'custom'
  | 'manual';

export type ConnectionStatus =
  | 'untested'
  | 'ready'
  | 'cors_fallback'
  | 'auth_error';

export interface ModelDefinition {
  id: string;
  name: string;
  provider: ModelProvider;
  modelId: string;
  endpoint: string;
  credentialId?: string;
  costPer1kInput: number;
  costPer1kOutput: number;
  connectionStatus: ConnectionStatus;
  lastTestedAt?: string;
  statusMessage?: string;
  temperature?: number;
}

export interface EncryptedCredential {
  id: string;
  provider: ModelProvider;
  label: string;
  cipherTextBase64: string;
  ivBase64: string;
  saltBase64: string;
  maskedPreview: string;
  createdAt: string;
  /** Key-derivation version. Absent = legacy (hardcoded device secret, 100k iterations). */
  v?: 2;
  iterations?: number;
}

export interface EvaluationCriterion {
  id: string;
  name: string;
  description: string;
  weight: number; // Must sum to 100 across criteria
}

export interface RuleAmendment {
  id: string;
  timestamp: string;
  reason: string;
  previousRules: string;
  newRules: string;
}

export interface PortfolioPosition {
  ticker: string;
  assetName: string;
  direction: 'LONG' | 'SHORT' | 'CASH_YIELD';
  allocationPct: number;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  pnlUsd: number;
  pnlPct: number;
  thesis: string;
}

export interface PortfolioSnapshot {
  id: string;
  timestamp: string;
  milestoneId?: string;
  totalEquityUsd: number;
  cashUsd: number;
  cumulativeReturnPct: number;
  maxDrawdownPct: number;
  sharpeEstimate: number;
  positions: PortfolioPosition[];
  recentTradesSummary: string;
  rationale: string;
}

export type ChatMessageType =
  | 'USER_PROMPT'
  | 'SCHEDULED_CHECKIN'
  | 'SYSTEM_INSTRUCTION'
  | 'EVALUATION_FEEDBACK'
  | 'MODEL_RESPONSE';

export interface ChatMessage {
  id: string;
  participantId: string;
  role: 'user' | 'assistant' | 'system';
  messageType: ChatMessageType;
  content: string;
  timestamp: string;
  tokensInput?: number;
  tokensOutput?: number;
  estimatedCostUsd?: number;
  executionMode?: 'direct_api' | 'simulated_sandbox' | 'manual_entry' | 'failed';
  relatedMilestoneId?: string;
}

export type DeliverableType =
  | 'PORTFOLIO_SNAPSHOT'
  | 'RESEARCH_REPORT'
  | 'CODE_ARTIFACT'
  | 'STRATEGY_MEMO';

export interface SubmissionVersion {
  id: string;
  version: number;
  milestoneId: string;
  participantId: string;
  submittedAt: string;
  title: string;
  deliverableType: DeliverableType;
  content: string;
  structuredData?: string;
  portfolioSnapshot?: PortfolioSnapshot;
  notes: string;
}

export interface EvaluationScore {
  id: string;
  participantId: string;
  milestoneId: string;
  submissionVersion: number;
  judgeType: 'HUMAN' | 'AI_JUDGE' | 'HYBRID';
  judgeModelName?: string;
  criteriaScores: Record<string, number>; // criterionId -> 0-100
  weightedTotal: number; // 0-100
  evidenceNotes: string;
  evaluatedAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  deadline: string;
  requiredDeliverable: string;
  deliverableType: DeliverableType;
  status: 'UPCOMING' | 'DUE' | 'COMPLETED' | 'MISSED';
  order: number;
}

export interface ScheduledCheckIn {
  id: string;
  title: string;
  promptTemplate: string;
  frequency: 'ONE_OFF' | 'DAILY' | 'WEEKLY' | 'MILESTONE_LINKED';
  nextRunAt: string;
  lastRunAt?: string;
  status: 'PENDING' | 'MISSED' | 'EXECUTED' | 'PAUSED';
  missedCount: number;
  targetParticipantIds: string[]; // ['ALL'] or specific IDs
}

export interface EquityPoint {
  date: string;
  label: string;
  value: number; // Equity in USD for real-money, or Composite Score (0-100) for standard
  score: number; // Composite score at that point
}

export interface Participant {
  id: string;
  modelDefId: string;
  modelName: string;
  provider: ModelProvider;
  pseudonym: string;
  colorHex: string;
  colorName: string;
  status: 'IDLE' | 'THINKING' | 'SUBMITTED' | 'AWAITING_MANUAL' | 'ERROR';
  startingCapitalUsd: number;
  currentEquityUsd: number;
  equityCurve: EquityPoint[];
  messages: ChatMessage[];
  submissions: Record<string, SubmissionVersion[]>; // milestoneId -> versions[]
  evaluations: Record<string, EvaluationScore>; // milestoneId -> score
  portfolioHistory: PortfolioSnapshot[];
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  category:
    | 'LIFECYCLE'
    | 'SUBMISSION'
    | 'EVALUATION'
    | 'SCHEDULE'
    | 'RULE_AMENDMENT'
    | 'PORTFOLIO'
    | 'SYSTEM';
  actor: string;
  summary: string;
  details?: string;
}

export interface TrialEvent {
  id: string;
  title: string;
  category: string;
  templateId?: string;
  status: EventLifecycle;
  objective: string;
  rules: string;
  ruleAmendments: RuleAmendment[];
  visibilityMode: VisibilityMode;
  isRealMoney: boolean;
  startingCapitalPerParticipant: number;
  currency: string;
  startDate: string;
  endDate: string;
  successConditions: string;
  tieBreakerRule: string;
  criteria: EvaluationCriterion[];
  participants: Participant[];
  milestones: Milestone[];
  schedules: ScheduledCheckIn[];
  auditLog: AuditLogEntry[];
  winnerParticipantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionTemplate {
  id: string;
  name: string;
  tagline: string;
  category: string;
  isRealMoney: boolean;
  defaultStartingCapital: number;
  visibilityMode: VisibilityMode;
  objective: string;
  rules: string;
  successConditions: string;
  tieBreakerRule: string;
  criteria: Omit<EvaluationCriterion, 'id'>[];
  milestones: {
    title: string;
    description: string;
    daysOffset: number;
    requiredDeliverable: string;
    deliverableType: DeliverableType;
  }[];
  schedules: {
    title: string;
    promptTemplate: string;
    frequency: 'ONE_OFF' | 'DAILY' | 'WEEKLY' | 'MILESTONE_LINKED';
  }[];
}

export const NORDIC_PARTICIPANT_PALETTE = [
  { hex: '#3B6E8C', name: 'Fjord Blue', bgLight: 'rgba(59, 110, 140, 0.10)' },
  { hex: '#C48B37', name: 'Amber Ochre', bgLight: 'rgba(196, 139, 55, 0.12)' },
  { hex: '#7A5980', name: 'Heather Plum', bgLight: 'rgba(122, 89, 128, 0.10)' },
  { hex: '#4D7C6A', name: 'Sage Lichen', bgLight: 'rgba(77, 124, 106, 0.11)' },
  { hex: '#B85A4B', name: 'Rust Coral', bgLight: 'rgba(184, 90, 75, 0.10)' },
] as const;
