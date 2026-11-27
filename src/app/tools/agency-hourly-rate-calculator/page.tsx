import { AgencyToolPage } from "@/components/tools/agency/AgencyToolPage";
import { buildToolMetadata } from "@/components/tools/agency/tool-metadata";

export const metadata = buildToolMetadata("hourly-rate");

export default function AgencyHourlyRateCalculatorPage() {
  return <AgencyToolPage id="hourly-rate" />;
}
