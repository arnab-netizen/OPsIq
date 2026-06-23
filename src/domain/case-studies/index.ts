export * from "./contract";
export { CASE_STUDY_LIBRARY } from "./library";

import {
  CaseStudy,
  CaseStudyFilterOptions,
  BlindTestCaseStudy,
} from "./contract";
import { CASE_STUDY_LIBRARY } from "./library";

export function filterCaseStudies(
  options: CaseStudyFilterOptions,
  library: CaseStudy[] = CASE_STUDY_LIBRARY
): CaseStudy[] {
  return library.filter((cs) => {
    if (options.industry && cs.industry !== options.industry) return false;
    if (options.business_size && cs.business_size !== options.business_size)
      return false;
    if (options.confidence && cs.confidence !== options.confidence) return false;
    if (options.tags && options.tags.length > 0) {
      const hasAllTags = options.tags.every((tag) => cs.tags.includes(tag));
      if (!hasAllTags) return false;
    }
    return true;
  });
}

export function getCaseStudyById(
  id: string,
  library: CaseStudy[] = CASE_STUDY_LIBRARY
): CaseStudy | undefined {
  return library.find((cs) => cs.case_id === id);
}

export function toBlindTestCaseStudy(cs: CaseStudy): BlindTestCaseStudy {
  const { hidden_root_causes: _, actual_outcome: __, ...rest } = cs;
  return { ...rest, blind_mode: true as const };
}

export function listIndustries(
  library: CaseStudy[] = CASE_STUDY_LIBRARY
): string[] {
  return [...new Set(library.map((cs) => cs.industry))].sort();
}

export function listTags(library: CaseStudy[] = CASE_STUDY_LIBRARY): string[] {
  return [...new Set(library.flatMap((cs) => cs.tags))].sort();
}
