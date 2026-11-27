import { AgencyToolPage } from "@/components/tools/agency/AgencyToolPage";
import { buildToolMetadata } from "@/components/tools/agency/tool-metadata";

export const metadata = buildToolMetadata("client-profitability");

export default function ClientProfitabilityCalculatorPage() {
  return <AgencyToolPage id="client-profitability" />;
}
