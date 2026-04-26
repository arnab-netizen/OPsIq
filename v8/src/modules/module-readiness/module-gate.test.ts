import { describe, expect, it } from 'vitest';
import { OPSIQ_MODULE_CATALOG } from './module-catalog';
import { evaluateModuleImplementationGate, getRecommendedImplementationOrder } from './module-gate';
describe('OPSIQ module readiness catalog', () => {
  it('contains exactly 45 planned platform modules', () => { expect(OPSIQ_MODULE_CATALOG).toHaveLength(45); });
  it('has unique module keys and pack numbers', () => { expect(new Set(OPSIQ_MODULE_CATALOG.map((moduleSpec) => moduleSpec.key)).size).toBe(45); expect(new Set(OPSIQ_MODULE_CATALOG.map((moduleSpec) => moduleSpec.packNumber)).size).toBe(45); });
  it('keeps planned modules contract-only by default', () => { const plannedModules = OPSIQ_MODULE_CATALOG.filter((moduleSpec) => moduleSpec.status === 'planned'); expect(plannedModules.length).toBeGreaterThan(20); for (const moduleSpec of plannedModules) expect(moduleSpec.runtimePolicy).toBe('contract-only-do-not-call-at-runtime'); });
  it('returns implementation order from pack 01 to pack 45', () => { const order = getRecommendedImplementationOrder(); expect(order[0]).toBe('foundation'); expect(order[44]).toBe('business-development-growth-toolkit'); });
  it('evaluates implementation gate without unknown dependencies', () => { for (const moduleSpec of OPSIQ_MODULE_CATALOG) { const result = evaluateModuleImplementationGate(moduleSpec.key); expect(result.findings.some((finding) => finding.message.includes('Missing dependency declaration'))).toBe(false); } });
});
