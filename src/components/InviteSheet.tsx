import { inviteSend, inviteDismiss } from "@/app/actions";

// Shown exactly once per user: it renders only while the user's
// invitePromptDone flag is false, and both Send and Cancel set it true
// server-side in the same flow.
export default function InviteSheet() {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div
        className="w-full max-w-md rounded-t-2xl p-[18px]"
        style={{ background: "var(--panel)", color: "var(--ink)" }}
      >
        <h2 className="font-script text-4xl">Invite your people</h2>
        <form action={inviteSend} className="mt-[18px] flex flex-col gap-[18px]">
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Screen names</span>
            <input name="invitees" className="input" />
          </label>
          <button type="submit" className="btn-accent w-full">
            Send
          </button>
        </form>
        <form action={inviteDismiss} className="mt-[18px]">
          <button type="submit" className="w-full py-2 text-center font-semibold">
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
