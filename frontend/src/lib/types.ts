/**
 * Data types matching backend src/models.py (ResearchState, Entity, etc.)
 * Used by API responses and UI.
 */

export type SearchPhase =
  | "baseline"
  | "breadth"
  | "depth"
  | "adversarial"
  | "triangulation"
  | "synthesis";

export type EntityType =
  | "person"
  | "organization"
  | "location"
  | "event"
  | "document"
  | "financial_instrument";

export type RelationshipType =
  | "WORKS_AT"
  | "BOARD_MEMBER_OF"
  | "FOUNDED"
  | "INVESTED_IN"
  | "SUBSIDIARY_OF"
  | "RELATED_TO"
  | "KNOWS"
  | "FAMILY_OF"
  | "SUED_BY"
  | "REGULATED_BY"
  | "MENTIONED_IN"
  | "PARTNER_OF"
  | "ADVISOR_TO"
  | "DONOR_TO"
  | "PREVIOUSLY_AT";

export type RiskCategory =
  | "regulatory"
  | "litigation"
  | "financial"
  | "reputational"
  | "association"
  | "inconsistency"
  | "sanctions"
  | "political_exposure";

export type RiskSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface SubjectProfile {
  full_name: string;
  aliases: string[];
  date_of_birth?: string | null;
  current_role?: string | null;
  current_organization?: string | null;
  education: Record<string, string>[];
  professional_history: Record<string, string>[];
  known_associations: string[];
  summary: string;
}

export interface Entity {
  id: string;
  name: string;
  entity_type: EntityType;
  aliases: string[];
  attributes: Record<string, unknown>;
  source_urls: string[];
  confidence: number;
  first_seen_iteration: number;
  description: string;
}

export interface Connection {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: RelationshipType;
  description: string;
  attributes: Record<string, unknown>;
  source_urls: string[];
  confidence: number;
  start_date?: string | null;
  end_date?: string | null;
}

export interface RiskFlag {
  id: string;
  category: RiskCategory;
  severity: RiskSeverity;
  title: string;
  description: string;
  evidence: string[];
  entity_ids: string[];
  confidence: number;
  mitigating_factors: string[];
}

export interface Hypothesis {
  id: string;
  description: string;
  status: string;
  priority: number;
  related_entity_ids: string[];
  search_queries_tried: string[];
  evidence_for: string[];
  evidence_against: string[];
}

export interface SearchRecord {
  query: string;
  provider: string;
  phase: SearchPhase;
  iteration: number;
  timestamp: string;
  num_results: number;
  result_urls: string[];
  raw_snippets: string[];
  was_useful: boolean;
}

export interface TemporalFact {
  id: string;
  claim: string;
  entity_id: string;
  date_range: [string | null, string | null];
  as_of_date?: string | null;
  source_urls: string[];
  confidence: number;
  category: string;
}

export interface TemporalContradiction {
  id: string;
  fact_a_id: string;
  fact_b_id: string;
  description: string;
  severity: RiskSeverity;
  confidence: number;
}

export interface RunMetadata {
  run_id: string;
  subject: string;
  started_at: string;
  completed_at?: string | null;
  duration_seconds: number;
  total_cost_usd: number;
  iterations: number;
  phases_executed: string[];
  entities_found: number;
  connections_found: number;
  risk_flags_count: number;
  sources_accessed: number;
  sources_failed: number;
  termination_reason: string;
  error_count: number;
}

export interface Investigation {
  id: string;
  target: string;
  status: "running" | "complete" | "failed";
  subject: SubjectProfile;
  entities: Entity[];
  connections: Connection[];
  risk_flags: RiskFlag[];
  search_history: SearchRecord[];
  hypotheses: Hypothesis[];
  current_phase: SearchPhase;
  iteration: number;
  max_iterations: number;
  confidence_scores: Record<string, number>;
  overall_confidence: number;
  total_llm_calls: number;
  total_search_calls: number;
  estimated_cost_usd: number;
  error_log: string[];
  /** Persistent investigation logs. */
  logs?: string[];
  final_report: string;
  redacted_report?: string;
  entities_summary?: { name: string; type: EntityType; confidence: number }[];
  /** Risk level extracted from report text when structured risk_flags are empty. */
  report_risk_level?: "critical" | "high" | "medium" | "low" | "clear" | null;
  /** Risk score derived from risk_flags or report analysis (0–100). */
  risk_score?: number;
  /** Key risk findings extracted from report text. */
  report_risk_findings?: { title: string; severity: RiskSeverity; description: string }[];
  /** Temporal intelligence: facts with date ranges. */
  temporal_facts?: TemporalFact[];
  /** Temporal contradictions (anomalies). */
  temporal_contradictions?: TemporalContradiction[];
  /** Adversarial risk debate transcript (role, argument, timestamp). */
  risk_debate_transcript?: { role: string; argument: string; timestamp: string }[];
  /** Graph insights (degree_centrality, shell_companies, etc.). */
  graph_insights?: { type: string; data: Record<string, unknown>[] }[];
  /** Run telemetry (duration, cost, phases). */
  run_metadata?: RunMetadata;
}

export interface CaseSummary {
  id: string;
  subject_name: string;
  updated_at: string;
  risk_score?: number;
  confidence?: number;
  status?: "running" | "complete" | "failed";
}

export interface InvestigateRequest {
  subject_name: string;
  current_role?: string;
  current_org?: string;
  max_iterations?: number;
}

export interface InvestigateResponse {
  case_id: string;
  status: "running";
}

export interface ProgressPayload {
  phase: SearchPhase;
  iteration: number;
  entity_count: number;
  connection_count: number;
  risk_count: number;
  last_node?: string;
}

export interface GraphResponse {
  nodes: { id: string; label: string; type: EntityType; data?: Record<string, unknown> }[];
  edges: { id: string; source: string; target: string; label: RelationshipType; confidence?: number }[];
}
