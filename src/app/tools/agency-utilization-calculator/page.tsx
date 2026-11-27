import { AgencyToolPage } from "@/components/tools/agency/AgencyToolPage";
import { buildToolMetadata } from "@/components/tools/agency/tool-metadata";

export const metadata = buildToolMetadata("utilization");

export default function AgencyUtilizationCalculatorPage() {
  return <AgencyToolPage id="utilization" />;
}
