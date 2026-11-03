import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAppData } from "@/lib/data";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await getAppData(user);

  return (
    <AppShell
      initialData={data}
      version={user.version}
      invitePromptDone={user.invitePromptDone}
    />
  );
}
