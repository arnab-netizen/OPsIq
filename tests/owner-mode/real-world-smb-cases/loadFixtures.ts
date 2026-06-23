import { readFileSync } from "fs";
import { join } from "path";
import { parseAndValidateFixtures, type SmbFixture } from "./fixtureSchema";

const FIXTURES_PATH = join(__dirname, "opsiq_real_world_smb_case_fixtures.jsonl");

let _cached: SmbFixture[] | null = null;

export function loadRealWorldSmbFixtures(): SmbFixture[] {
  if (_cached !== null) return _cached;
  const content = readFileSync(FIXTURES_PATH, "utf-8");
  _cached = parseAndValidateFixtures(content);
  return _cached;
}

export function getRealWorldSmbCaseById(caseId: string): SmbFixture {
  const fixtures = loadRealWorldSmbFixtures();
  const found = fixtures.find((f) => f.case_id === caseId);
  if (!found) {
    throw new Error(
      `SMB fixture with case_id "${caseId}" not found. Available IDs: ${fixtures.map((f) => f.case_id).join(", ")}`
    );
  }
  return found;
}

export function listRealWorldSmbCaseIds(): string[] {
  return loadRealWorldSmbFixtures().map((f) => f.case_id);
}
