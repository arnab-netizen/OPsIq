/**
 * Persistent learning-artifact store (the controlled-learning memory).
 *
 * Defines the LearningStore contract plus two implementations:
 *   - InMemoryLearningStore — the DI default for fast unit tests and the validation runner,
 *   - PrismaLearningStore   — real persistence in `behavioral_learning_artifacts` (read back across
 *     processes; exercised by `[db]`-gated tests).
 *
 * Governance enforced HERE, not in callers:
 *   - Privacy: workspace_private artifacts are only ever returned to their own workspace. A
 *     workspace's artifacts NEVER leak into another workspace's advice.
 *   - Promotion: an artifact becomes cross-workspace/global ONLY when it is approved AND classified
 *     abstracted_shareable with archetype_level/global_template scope.
 *   - Versioning/revert: corrections supersede (never silently overwrite); revert restores the prior
 *     active version. Every state change appends to the artifact's audit trail.
 */
import {
  learningArtifactSchema,
  type BusinessArchetype,
  type DecisionCategory,
  type LearningArtifact,
} from "./schema";

export interface LearningQuery {
  archetype: BusinessArchetype;
  decisionCategory: DecisionCategory;
  locationKey: string; // abstracted country|tier
  workspaceId: string | null; // the workspace asking for advice
}

export interface LearningStore {
  save(a: LearningArtifact): Promise<LearningArtifact>;
  getById(id: string): Promise<LearningArtifact | null>;
  all(): Promise<LearningArtifact[]>;
  /** Active, in-scope, privacy-respecting artifacts the advisor may apply to this case. */
  findApplicable(q: LearningQuery): Promise<LearningArtifact[]>;
  approve(id: string, actor: string, at: string): Promise<LearningArtifact>;
  reject(id: string, actor: string, at: string): Promise<LearningArtifact>;
  /** Create a new version with corrected behavior; deactivates the prior version. */
  supersede(id: string, correctedBehavior: string, actor: string, at: string): Promise<LearningArtifact>;
  /** Restore the most recent superseded version, deactivating the current one. */
  revert(sourceCaseId: string, actor: string, at: string): Promise<LearningArtifact>;
  /** Promote an APPROVED artifact to a shareable/global template (cross-workspace). */
  promoteToGlobal(id: string, actor: string, at: string): Promise<LearningArtifact>;
}

function scopeMatches(a: LearningArtifact, q: LearningQuery): boolean {
  const s = a.applicabilityScope;
  if (s.archetype !== null && s.archetype !== q.archetype) return false;
  if (s.decisionCategory !== null && s.decisionCategory !== q.decisionCategory) return false;
  if (s.locationKey !== null && s.locationKey !== q.locationKey) return false;
  return true;
}

/** The privacy gate: is this artifact visible to the requesting workspace? */
export function isVisibleTo(a: LearningArtifact, workspaceId: string | null): boolean {
  if (!a.active) return false;
  if (a.privacyClassification === "workspace_private") {
    // Only the owning workspace ever sees a private artifact.
    return a.workspaceId !== null && a.workspaceId === workspaceId;
  }
  // abstracted_shareable: cross-workspace only once approved and promoted beyond local_only.
  return a.approvalStatus === "approved" && a.scope !== "local_only";
}

export function applicableArtifacts(arts: LearningArtifact[], q: LearningQuery): LearningArtifact[] {
  return arts
    .filter((a) => isVisibleTo(a, q.workspaceId) && scopeMatches(a, q))
    .sort((x, y) => (x.id < y.id ? -1 : 1));
}

// ─── In-memory store (DI default) ────────────────────────────────────────────────────────────────
export class InMemoryLearningStore implements LearningStore {
  private rows = new Map<string, LearningArtifact>();

  async save(a: LearningArtifact): Promise<LearningArtifact> {
    const parsed = learningArtifactSchema.parse(a);
    this.rows.set(parsed.id, parsed);
    return parsed;
  }
  async getById(id: string): Promise<LearningArtifact | null> {
    return this.rows.get(id) ?? null;
  }
  async all(): Promise<LearningArtifact[]> {
    return Array.from(this.rows.values());
  }
  async findApplicable(q: LearningQuery): Promise<LearningArtifact[]> {
    return applicableArtifacts(await this.all(), q);
  }
  private mustGet(id: string): LearningArtifact {
    const r = this.rows.get(id);
    if (!r) throw new Error(`learning artifact not found: ${id}`);
    return r;
  }
  async approve(id: string, actor: string, at: string): Promise<LearningArtifact> {
    const r = this.mustGet(id);
    const next: LearningArtifact = { ...r, approvalStatus: "approved", auditTrail: [...r.auditTrail, { at, actor, action: "approved" }] };
    return this.save(next);
  }
  async reject(id: string, actor: string, at: string): Promise<LearningArtifact> {
    const r = this.mustGet(id);
    const next: LearningArtifact = { ...r, approvalStatus: "rejected", active: false, auditTrail: [...r.auditTrail, { at, actor, action: "rejected" }] };
    return this.save(next);
  }
  async supersede(id: string, correctedBehavior: string, actor: string, at: string): Promise<LearningArtifact> {
    const r = this.mustGet(id);
    const newVersion = r.version + 1;
    const superseded: LearningArtifact = { ...r, active: false, supersededByVersion: newVersion, auditTrail: [...r.auditTrail, { at, actor, action: `superseded_by_v${newVersion}` }] };
    await this.save(superseded);
    const next: LearningArtifact = {
      ...r,
      id: `${r.sourceCaseId}::v${newVersion}`,
      correctedBehavior,
      version: newVersion,
      supersededByVersion: null,
      active: true,
      approvalStatus: "pending", // a new correction must be re-approved before global use
      scope: r.scope === "global_template" ? "archetype_level" : r.scope,
      auditTrail: [...r.auditTrail, { at, actor, action: `created_v${newVersion}_supersedes_v${r.version}` }],
    };
    return this.save(next);
  }
  async revert(sourceCaseId: string, actor: string, at: string): Promise<LearningArtifact> {
    const versions = (await this.all()).filter((a) => a.sourceCaseId === sourceCaseId).sort((x, y) => y.version - x.version);
    if (versions.length < 2) throw new Error(`nothing to revert for ${sourceCaseId}`);
    const current = versions[0];
    const prior = versions[1];
    await this.save({ ...current, active: false, auditTrail: [...current.auditTrail, { at, actor, action: `reverted_from_v${current.version}` }] });
    return this.save({ ...prior, active: true, supersededByVersion: null, auditTrail: [...prior.auditTrail, { at, actor, action: `restored_v${prior.version}` }] });
  }
  async promoteToGlobal(id: string, actor: string, at: string): Promise<LearningArtifact> {
    const r = this.mustGet(id);
    if (r.approvalStatus !== "approved") throw new Error(`cannot promote a non-approved artifact (${id})`);
    const next: LearningArtifact = {
      ...r,
      privacyClassification: "abstracted_shareable",
      scope: "global_template",
      workspaceId: null, // abstracted — no raw workspace ownership once global
      auditTrail: [...r.auditTrail, { at, actor, action: "promoted_to_global" }],
    };
    return this.save(next);
  }
}

// ─── Prisma-backed store (real persistence) ──────────────────────────────────────────────────────
type Row = {
  id: string; sourceCaseId: string; businessType: string; archetype: string; locationKey: string;
  failureLabel: string; originalFailedBehavior: string; correctedBehavior: string;
  scopeArchetype: string | null; scopeDecisionCategory: string | null; scopeLocationKey: string | null;
  riskLevel: string; approvalStatus: string; scope: string; privacyClassification: string;
  workspaceId: string | null; version: number; supersededByVersion: number | null; active: boolean;
  createdAt: string; auditTrail: unknown;
};

function toArtifact(r: Row): LearningArtifact {
  return learningArtifactSchema.parse({
    id: r.id, sourceCaseId: r.sourceCaseId, businessType: r.businessType,
    archetype: r.archetype as BusinessArchetype, locationKey: r.locationKey,
    failureLabel: r.failureLabel, originalFailedBehavior: r.originalFailedBehavior,
    correctedBehavior: r.correctedBehavior,
    applicabilityScope: {
      archetype: (r.scopeArchetype as BusinessArchetype | null) ?? null,
      decisionCategory: (r.scopeDecisionCategory as DecisionCategory | null) ?? null,
      locationKey: r.scopeLocationKey,
    },
    riskLevel: r.riskLevel, approvalStatus: r.approvalStatus, scope: r.scope,
    privacyClassification: r.privacyClassification, workspaceId: r.workspaceId,
    version: r.version, supersededByVersion: r.supersededByVersion, active: r.active,
    createdAt: r.createdAt, auditTrail: r.auditTrail,
  });
}

function toRow(a: LearningArtifact): Row {
  return {
    id: a.id, sourceCaseId: a.sourceCaseId, businessType: a.businessType, archetype: a.archetype,
    locationKey: a.locationKey, failureLabel: a.failureLabel, originalFailedBehavior: a.originalFailedBehavior,
    correctedBehavior: a.correctedBehavior, scopeArchetype: a.applicabilityScope.archetype,
    scopeDecisionCategory: a.applicabilityScope.decisionCategory, scopeLocationKey: a.applicabilityScope.locationKey,
    riskLevel: a.riskLevel, approvalStatus: a.approvalStatus, scope: a.scope,
    privacyClassification: a.privacyClassification, workspaceId: a.workspaceId, version: a.version,
    supersededByVersion: a.supersededByVersion, active: a.active, createdAt: a.createdAt,
    auditTrail: a.auditTrail,
  };
}

/** Minimal structural delegate — the generated Prisma model exposes exactly these methods. */
interface ArtifactDelegate {
  upsert(args: { where: { id: string }; create: Row; update: Row }): Promise<unknown>;
  findUnique(args: { where: { id: string } }): Promise<unknown | null>;
  findMany(): Promise<unknown[]>;
}
interface DbWithArtifacts {
  behavioralLearningArtifact: ArtifactDelegate;
}

export class PrismaLearningStore implements LearningStore {
  constructor(private readonly db: DbWithArtifacts) {}
  private get model(): ArtifactDelegate {
    // The delegate exists once `prisma generate` has run against the new model.
    return this.db.behavioralLearningArtifact;
  }
  async save(a: LearningArtifact): Promise<LearningArtifact> {
    const parsed = learningArtifactSchema.parse(a);
    const row = toRow(parsed);
    await this.model.upsert({ where: { id: row.id }, create: row, update: row });
    return parsed;
  }
  async getById(id: string): Promise<LearningArtifact | null> {
    const r = await this.model.findUnique({ where: { id } });
    return r ? toArtifact(r as Row) : null;
  }
  async all(): Promise<LearningArtifact[]> {
    const rows = (await this.model.findMany()) as Row[];
    return rows.map(toArtifact);
  }
  async findApplicable(q: LearningQuery): Promise<LearningArtifact[]> {
    return applicableArtifacts(await this.all(), q);
  }
  private async mustGet(id: string): Promise<LearningArtifact> {
    const r = await this.getById(id);
    if (!r) throw new Error(`learning artifact not found: ${id}`);
    return r;
  }
  async approve(id: string, actor: string, at: string): Promise<LearningArtifact> {
    const r = await this.mustGet(id);
    return this.save({ ...r, approvalStatus: "approved", auditTrail: [...r.auditTrail, { at, actor, action: "approved" }] });
  }
  async reject(id: string, actor: string, at: string): Promise<LearningArtifact> {
    const r = await this.mustGet(id);
    return this.save({ ...r, approvalStatus: "rejected", active: false, auditTrail: [...r.auditTrail, { at, actor, action: "rejected" }] });
  }
  async supersede(id: string, correctedBehavior: string, actor: string, at: string): Promise<LearningArtifact> {
    const r = await this.mustGet(id);
    const newVersion = r.version + 1;
    await this.save({ ...r, active: false, supersededByVersion: newVersion, auditTrail: [...r.auditTrail, { at, actor, action: `superseded_by_v${newVersion}` }] });
    return this.save({
      ...r, id: `${r.sourceCaseId}::v${newVersion}`, correctedBehavior, version: newVersion,
      supersededByVersion: null, active: true, approvalStatus: "pending",
      scope: r.scope === "global_template" ? "archetype_level" : r.scope,
      auditTrail: [...r.auditTrail, { at, actor, action: `created_v${newVersion}_supersedes_v${r.version}` }],
    });
  }
  async revert(sourceCaseId: string, actor: string, at: string): Promise<LearningArtifact> {
    const versions = (await this.all()).filter((a) => a.sourceCaseId === sourceCaseId).sort((x, y) => y.version - x.version);
    if (versions.length < 2) throw new Error(`nothing to revert for ${sourceCaseId}`);
    const [current, prior] = versions;
    await this.save({ ...current, active: false, auditTrail: [...current.auditTrail, { at, actor, action: `reverted_from_v${current.version}` }] });
    return this.save({ ...prior, active: true, supersededByVersion: null, auditTrail: [...prior.auditTrail, { at, actor, action: `restored_v${prior.version}` }] });
  }
  async promoteToGlobal(id: string, actor: string, at: string): Promise<LearningArtifact> {
    const r = await this.mustGet(id);
    if (r.approvalStatus !== "approved") throw new Error(`cannot promote a non-approved artifact (${id})`);
    return this.save({ ...r, privacyClassification: "abstracted_shareable", scope: "global_template", workspaceId: null, auditTrail: [...r.auditTrail, { at, actor, action: "promoted_to_global" }] });
  }
}
