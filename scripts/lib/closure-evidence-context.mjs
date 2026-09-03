/**
 * Factory Stage 7 — Closure-time protected evidence context (PR-G3).
 *
 * ─── The gap this closes ─────────────────────────────────────────────────────
 * `evaluateInvariantClosure` decides whether a cited artifact may back a PROVEN
 * invariant. It reaches that verdict through `loadEvidenceArtifactIndex`, and an
 * artifact only becomes ACCEPTED when its signature verified AND its provenance
 * verified. Both of those depend on context the evaluator cannot obtain itself:
 * the signing registry that was authoritative at the artifact's AUTH_SHA, and a
 * GitHub cross-check that needs the network and a token.
 *
 * Before PR-G3 neither production caller supplied it:
 *
 *   scripts/validate-stage-acceptance.mjs
 *     passed evidenceDir + manifestYaml but no signingKey and no provenance, so a
 *     cryptographically valid, correctly bound artifact resolved UNVERIFIED and
 *     could never close the stage. Observed verbatim:
 *       "proof reference evd_… is UNVERIFIED, not ACCEPTED — signature not checked
 *        (EVIDENCE_SIGNING_KEY not available to the validator); provenance not
 *        checked (run with --require-provenance and a GitHub token)"
 *
 *   scripts/validate-bundle-manifests.mjs
 *     passed only { bundleId }, so the evidence directory defaulted to the process
 *     cwd and the D-4/A4 guard had no contract text at all. Observed verbatim:
 *       "S7-I11 proof blocked by D-4 enforcement (MANIFEST_UNREADABLE)"
 *
 * A gate that refuses evidence it was never given the means to check is not
 * fail-closed, it is inoperable. This module is the single place both callers get
 * that context from, so the two can never hold different opinions about the same
 * artifact — the same reason the resolution layer itself lives in one file.
 *
 * ─── Why this is a separate module ───────────────────────────────────────────
 * scripts/lib/evidence-artifact.mjs is deliberately pure and I/O-free: callers
 * inject I/O so the rules stay unit-testable without git or network. Everything
 * here performs I/O — `git show`, `fetch` — so putting it there would break that
 * contract. This module owns the I/O; the rules stay where they are.
 *
 * ─── AUTH_SHA binding is preserved, never widened ────────────────────────────
 * Governance is authored on main, and a working tree sits at INF_SHA, which is not
 * where governance is authored. So the registry and the contract are read from the
 * commit the artifact itself names in `authorization_manifest_sha` — per artifact,
 * exactly as scripts/validate-evidence-artifacts.mjs already does in its
 * `--from-auth-sha-registry` mode, and never from the working tree.
 *
 * Note what is deliberately NOT done: the registries of several artifacts are
 * never merged into one key set. A union would let a key that is active at one
 * AUTH_SHA verify an artifact bound to a different AUTH_SHA, which is precisely
 * the binding the trusted verifier exists to enforce.
 */

import { spawnSync } from 'node:child_process';

import {
  CI_LANES,
  OWNER_LANES,
  PROVENANCE_STATE,
  evaluateOwnerProvenance,
  evaluateRunProvenance,
  parseKeyRegistryYaml,
} from './evidence-artifact.mjs';

const SHA40 = /^[0-9a-f]{40}$/;

/** Repository-relative path of the Ed25519 signing key registry. */
export const KEY_REGISTRY_PATH = '.governance/stage7-signing-keys.yaml';

/** Repository-relative path of the Stage 7 closure contract. */
export const CLOSURE_MANIFEST_PATH = 'docs/opsiq/bundles/factory-stage-7-closure.yaml';

/**
 * Read one repository-relative file at one commit.
 *
 * Returns null when the SHA is malformed or the blob cannot be read, so a caller
 * that cannot resolve governance gets nothing rather than a guess — the guards
 * downstream then fail closed on their own terms.
 *
 * @param {string|null} sha
 * @param {string} path
 * @param {string} repoRoot
 * @returns {string|null}
 */
function showAtSha(sha, path, repoRoot) {
  if (typeof sha !== 'string' || !SHA40.test(sha)) return null;
  const result = spawnSync('git', ['show', `${sha}:${path}`], { cwd: repoRoot, encoding: 'utf8' });
  return result.status === 0 ? result.stdout : null;
}

/**
 * Ed25519 public key registry as it stood at one AUTH_SHA.
 *
 * @param {string|null} authorizationManifestSha
 * @param {string} repoRoot
 * @returns {Map<string,string>|null} key_id → PEM, or null when unreadable
 */
export function resolveKeyRegistryAtSha(authorizationManifestSha, repoRoot) {
  const yamlContent = showAtSha(authorizationManifestSha, KEY_REGISTRY_PATH, repoRoot);
  if (yamlContent === null) return null;
  const registry = parseKeyRegistryYaml(yamlContent);
  // An empty registry is not "no key checking": it means this AUTH_SHA registered
  // no ACTIVE key, and an artifact claiming it cannot have been validly signed.
  // Returning null keeps the signature UNCHECKED rather than silently VERIFIED.
  return registry.size > 0 ? registry : null;
}

/**
 * Stage 7 closure contract text as it stood at one AUTH_SHA. The D-4/A4 guard
 * reads its authorized environment target out of this.
 *
 * @param {string|null} authorizationManifestSha
 * @param {string} repoRoot
 * @returns {string|null}
 */
export function resolveClosureManifestAtSha(authorizationManifestSha, repoRoot) {
  return showAtSha(authorizationManifestSha, CLOSURE_MANIFEST_PATH, repoRoot);
}

/**
 * Memoizing per-artifact resolvers for `loadEvidenceArtifactIndex`.
 *
 * @param {object} options
 * @param {string} options.repoRoot
 * @param {string|null} [options.manifestYaml]
 *   Raw text of the contract being evaluated. Used only as the fallback for an
 *   artifact whose own AUTH_SHA is unreadable in this clone, which is the case a
 *   shallow checkout produces. It never overrides an artifact's own AUTH_SHA.
 * @returns {{ resolveSigningKey: (sha: string|null) => (Map<string,string>|null),
 *             resolveClosureManifest: (sha: string|null) => (string|null) }}
 */
export function createAuthShaResolvers({ repoRoot, manifestYaml = null }) {
  const registryCache = new Map();
  const manifestCache = new Map();

  return {
    resolveSigningKey(sha) {
      const key = String(sha);
      if (!registryCache.has(key)) registryCache.set(key, resolveKeyRegistryAtSha(sha, repoRoot));
      return registryCache.get(key);
    },
    resolveClosureManifest(sha) {
      const key = String(sha);
      if (!manifestCache.has(key)) {
        const atSha = resolveClosureManifestAtSha(sha, repoRoot);
        manifestCache.set(key, atSha ?? manifestYaml);
      }
      return manifestCache.get(key);
    },
  };
}

/** `https://github.com/o/r/issues/12#issuecomment-345` → issue-comment API URL. */
function ownerCommentApiUrl(reference) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/\d+#issuecomment-(\d+)$/
    .exec(String(reference ?? ''));
  return match ? `https://api.github.com/repos/${match[1]}/issues/comments/${match[2]}` : null;
}

/**
 * Is `sha` a commit this clone holds, and an ancestor of main?
 *
 * The frozen standard invalidates any artifact whose subject_sha is not an
 * ancestor of main, and git is the retention layer, so an unknown commit cannot
 * be evidence.
 */
function checkAncestry(sha, repoRoot) {
  let mainRef = null;
  for (const ref of ['origin/main', 'main']) {
    const probe = spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: repoRoot, encoding: 'utf8' });
    if (probe.status === 0) { mainRef = ref; break; }
  }
  if (mainRef === null) {
    return [`subject_sha ${sha}: cannot verify ancestry — neither origin/main nor main is present in this clone (fetch-depth: 0 is required)`];
  }
  if (spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repoRoot, encoding: 'utf8' }).status !== 0) {
    return [`subject_sha ${sha} is not present in this clone — git is the retention layer for Stage 7 evidence, so an unknown commit cannot be evidence`];
  }
  if (spawnSync('git', ['merge-base', '--is-ancestor', sha, mainRef], { cwd: repoRoot, encoding: 'utf8' }).status !== 0) {
    return [`subject_sha ${sha} is not an ancestor of ${mainRef} — the frozen standard invalidates any artifact whose subject_sha is not an ancestor of main`];
  }
  return [];
}

/**
 * Cross-check every artifact against the GitHub run or owner comment it names.
 *
 * Fail-closed by construction: an artifact is only ever marked VERIFIED when the
 * cross-check ran and returned no violation. Without a token nothing is marked
 * verified, so closure cannot conclude that provenance holds — it reports that it
 * could not check.
 *
 * @param {object} options
 * @param {Array<{artifactId: string|null, absolutePath: string}>} options.records
 * @param {string} options.repoRoot
 * @param {string|null} options.githubToken
 * @param {string[]} [options.ownerLogins]
 * @param {(url: string) => Promise<unknown>} [options.fetchJson] injected for tests
 * @returns {Promise<{ provenance: Map<string,string>, checked: boolean, reasons: string[] }>}
 */
export async function resolveProvenanceStates({
  records,
  repoRoot,
  githubToken,
  ownerLogins = [],
  readArtifact,
  fetchJson = null,
}) {
  const provenance = new Map();
  const reasons = [];

  if (!githubToken) {
    return {
      provenance,
      checked: false,
      reasons: ['no GitHub token available — provenance was not checked, so no artifact may be treated as ACCEPTED (set GH_TOKEN or GITHUB_TOKEN)'],
    };
  }

  const request = fetchJson ?? (async (url) => {
    const response = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${githubToken}`,
        'user-agent': 'opsiq-stage7-closure-context',
        'x-github-api-version': '2022-11-28',
      },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub API ${response.status} for ${url}`);
    return response.json();
  });

  for (const record of records) {
    if (!record.artifactId) continue;
    let artifact;
    try {
      artifact = readArtifact(record);
    } catch (error) {
      provenance.set(record.artifactId, PROVENANCE_STATE.FAILED);
      reasons.push(`${record.artifactId}: could not be re-read for provenance — ${error.message}`);
      continue;
    }

    const violations = [];
    try {
      if (CI_LANES.includes(artifact.lane)) {
        const run = await request(
          `https://api.github.com/repos/${artifact.producer?.repository}/actions/runs/${artifact.producer?.run_id}`,
        );
        violations.push(...evaluateRunProvenance(artifact, run));
      } else if (OWNER_LANES.includes(artifact.lane)) {
        const apiUrl = ownerCommentApiUrl(artifact.producer?.owner_attestation_ref);
        if (apiUrl === null) {
          violations.push(`${artifact.artifact_id}: producer.owner_attestation_ref is not a GitHub issue- or PR-comment URL`);
        } else {
          const allowed = ownerLogins.length > 0
            ? ownerLogins
            : [String(artifact.producer?.repository ?? '').split('/')[0]].filter(Boolean);
          violations.push(...evaluateOwnerProvenance(artifact, await request(apiUrl), allowed));
        }
      }
    } catch (error) {
      violations.push(`${artifact.artifact_id}: provenance cross-check could not complete — ${error.message}`);
    }

    violations.push(...checkAncestry(artifact.subject_sha, repoRoot).map((v) => `${artifact.artifact_id}: ${v}`));

    provenance.set(record.artifactId, violations.length === 0 ? PROVENANCE_STATE.VERIFIED : PROVENANCE_STATE.FAILED);
    reasons.push(...violations);
  }

  return { provenance, checked: true, reasons };
}

/** GH token from the environment, under either of the two names CI uses. */
export function githubTokenFromEnv(env = process.env) {
  return env.GH_TOKEN?.trim() || env.GITHUB_TOKEN?.trim() || null;
}

/** Owner login allowlist for owner-lane provenance. */
export function ownerLoginsFromEnv(env = process.env) {
  return (env.EVIDENCE_OWNER_LOGINS ?? '')
    .split(',')
    .map((login) => login.trim())
    .filter((login) => login.length > 0);
}
