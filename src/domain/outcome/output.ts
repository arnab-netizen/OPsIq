import { ImpactResult } from "./impact";
import { ConfidenceUpdateResult } from "./confidence";
import { FeedbackLoopResult } from "./feedback";

export enum OutputMode {
  NOVICE = "NOVICE",
  OPERATOR = "OPERATOR",
  EXECUTIVE = "EXECUTIVE",
}

export interface OutputFormatterInput {
  impact_result: ImpactResult;
  confidence_update: ConfidenceUpdateResult;
  feedback_action: FeedbackLoopResult;
  output_mode: OutputMode;
}

export interface FormattedOutput {
  mode: OutputMode;
  message: string;
  action: string;
}
