import { redirect } from "next/navigation";

// Sign-up lives on the landing page, in the same card stack as login —
// exactly as the app presents it. This route just takes you there.
export default function SignupPage() {
  redirect("/login");
}
