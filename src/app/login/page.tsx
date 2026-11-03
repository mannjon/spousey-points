import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Landing from "@/components/Landing";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const { error } = await searchParams;
  return <Landing error={error} />;
}
