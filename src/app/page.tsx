import { redirect } from "next/navigation";
import { getSession } from "@/services/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
