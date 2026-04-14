import { redirect } from "next/navigation";
import { getSession } from "@/services/auth";

export default async function HomePage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
