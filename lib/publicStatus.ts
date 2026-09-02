import { getSubmissionRows } from "./db";
import { categorizeInvalidRows } from "./waMessage";
import type { SubmissionRecord } from "../types/index";

export interface PublicSubmissionStatus {
  submissionId: string;
  timestamp: string;
  status: "processed" | "failed";
  errorMessage: string | null;
  validCount: number;
  invalidCount: number;
  locationMismatch: boolean;
  invalidCategories: { category: string; count: number }[];
}

/** Shapes a submission for the public dashboard — shared between the email+captcha lookup and the WA magic-link lookup so both report the exact same fields, with no row-level agent name/NIK. */
export async function toPublicSubmissionStatus(s: SubmissionRecord): Promise<PublicSubmissionStatus> {
  const rows = s.status === "processed" ? await getSubmissionRows(s.id) : [];
  return {
    submissionId: s.id,
    timestamp: s.timestamp,
    status: s.status,
    errorMessage: s.status === "failed" ? s.errorMessage : null,
    validCount: s.validCount,
    invalidCount: s.invalidCount,
    locationMismatch: s.locationMismatch,
    invalidCategories: categorizeInvalidRows(rows),
  };
}
