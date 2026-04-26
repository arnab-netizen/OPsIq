import { getSession } from "@/services/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/ui/shell";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return <AppShell userName={session.user.name}>{children}</AppShell>;
}
