import { z } from "zod";

export const CaseStudySourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url().optional(),
  publisher: z.string().min(1),
  year: z.number().int().min(1900).max(2100).optional(),
  license_or_allowed_use: z.string().min(1),
});

export const CaseStudySchema = z.object({
  case_id: z.string().min(1),
  industry: z.string().min(1),
  business_size: z.enum(["micro", "small", "medium", "large", "enterprise"]),
  symptoms: z.array(z.string()).min(1),
  available_data: z.array(z.string()).min(1),
  hidden_root_causes: z.array(z.string()).min(1),
  expert_identified_causes: z.array(z.string()).min(1),
  actions_taken: z.array(z.string()).min(1),
  actual_outcome: z.string().min(1),
  sources: z.array(CaseStudySourceSchema).min(1),
  confidence: z.enum(["high", "medium", "low"]),
  tags: z.array(z.string()).default([]),
});

export type CaseStudySource = z.infer<typeof CaseStudySourceSchema>;
export type CaseStudy = z.infer<typeof CaseStudySchema>;

export type CaseStudyFilterOptions = {
  industry?: string;
  business_size?: CaseStudy["business_size"];
  confidence?: CaseStudy["confidence"];
  tags?: string[];
};

export type BlindTestCaseStudy = Omit<
  CaseStudy,
  "hidden_root_causes" | "actual_outcome"
> & {
  blind_mode: true;
};
