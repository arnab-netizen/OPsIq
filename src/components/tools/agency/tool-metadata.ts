import type { Metadata } from "next";
import { DEFAULT_SOCIAL_IMAGE } from "@/services/resources/resource-seo";
import { absoluteUrl } from "@/lib/site";
import { getAgencyTool, type AgencyToolId } from "@/services/tools/agency/registry";

/** Per-tool metadata: unique title and description, self-referencing canonical, indexable (no robots override). */
export function buildToolMetadata(id: AgencyToolId): Metadata {
  const tool = getAgencyTool(id);
  return {
    title: tool.title,
    description: tool.description,
    alternates: { canonical: absoluteUrl(tool.path) },
    openGraph: { title: tool.title, description: tool.description, url: absoluteUrl(tool.path), type: "website", siteName: "OpsIQ", images: [DEFAULT_SOCIAL_IMAGE] },
    twitter: { card: "summary_large_image", title: tool.title, description: tool.description, images: [{ url: DEFAULT_SOCIAL_IMAGE.url, alt: DEFAULT_SOCIAL_IMAGE.alt }] },
  };
}
