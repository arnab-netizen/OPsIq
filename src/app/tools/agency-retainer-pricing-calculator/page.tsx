import { AgencyToolPage } from "@/components/tools/agency/AgencyToolPage";
import { buildToolMetadata } from "@/components/tools/agency/tool-metadata";

export const metadata = buildToolMetadata("retainer-pricing");

export default function AgencyRetainerPricingCalculatorPage() {
  return <AgencyToolPage id="retainer-pricing" />;
}
