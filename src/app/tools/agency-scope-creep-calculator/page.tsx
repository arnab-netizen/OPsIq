import { AgencyToolPage } from "@/components/tools/agency/AgencyToolPage";
import { buildToolMetadata } from "@/components/tools/agency/tool-metadata";

export const metadata = buildToolMetadata("scope-creep");

export default function AgencyScopeCreepCalculatorPage() {
  return <AgencyToolPage id="scope-creep" />;
}
