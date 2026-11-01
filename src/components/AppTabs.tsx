"use client";

import { useState } from "react";

const TABS = ["Balances", "Spend", "Bounties", "Family", "Log"] as const;

export default function AppTabs({ balances }: { balances: React.ReactNode }) {
  const [active, setActive] = useState<(typeof TABS)[number]>("Balances");

  return (
    <div>
      <div className="mt-[18px]">
        {active === "Balances" ? (
          balances
        ) : (
          <h2 className="text-center text-2xl font-semibold">{active}</h2>
        )}
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 flex justify-around border-t py-2"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className="px-2 py-2 text-sm font-semibold"
            style={
              active === tab
                ? { color: "var(--accent)", borderBottom: "3px solid var(--accent)" }
                : { color: "var(--ink)" }
            }
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
  );
}
