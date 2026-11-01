import type { Version } from "@prisma/client";

export type Assessment = {
  kidsAtHome: boolean;
  age: number | null;
  retired: boolean;
  freeTimeHours: number | null;
};

// Classification rule (Jonathan, 2026-10-31):
// - kids at home -> Family
// - Silver needs at least 2 of { age >= 60, retired, free time >= 28 hrs/week }
// - otherwise Spousey
export function classify(a: Assessment): Version {
  if (a.kidsAtHome) return "FAMILY";
  let silverSignals = 0;
  if (a.age !== null && a.age >= 60) silverSignals++;
  if (a.retired) silverSignals++;
  if (a.freeTimeHours !== null && a.freeTimeHours >= 28) silverSignals++;
  if (silverSignals >= 2) return "SILVER";
  return "SPOUSEY";
}

export function brandName(version: Version): string {
  switch (version) {
    case "SILVER":
      return "Silver Points";
    case "FAMILY":
      return "Family Points";
    default:
      return "Spousey Points";
  }
}
