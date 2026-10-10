/** Server-side lookup of the public presentation. Fails closed to the INVITE_ONLY copy on any error. */
import { readEffectiveSettings } from "@/services/beta/platform-settings.service";
import { presentationForAdmissionMode, type PublicBetaPresentation } from "@/domain/beta/public-presentation";

export async function getPublicBetaPresentation(): Promise<PublicBetaPresentation> {
  try {
    const settings = await readEffectiveSettings();
    return presentationForAdmissionMode(settings.admissionMode);
  } catch {
    return presentationForAdmissionMode(null);
  }
}

/** The effective admission mode for display, or null when it cannot be read (callers then show the stricter wording). */
export async function getPublicAdmissionMode(): Promise<string | null> {
  try {
    return (await readEffectiveSettings()).admissionMode;
  } catch {
    return null;
  }
}
