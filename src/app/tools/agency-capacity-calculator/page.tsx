import { AgencyToolPage } from "@/components/tools/agency/AgencyToolPage";
import { buildToolMetadata } from "@/components/tools/agency/tool-metadata";

export const metadata = buildToolMetadata("capacity");

export default function AgencyCapacityCalculatorPage() {
  return <AgencyToolPage id="capacity" />;
}
