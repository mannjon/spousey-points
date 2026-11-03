import type { Version } from "@prisma/client";

export type Assessment = {
  kidsAtHome: boolean;
  ageBand: string; // under40 | 40-54 | 55-64 | 65plus
  workStatus: string; // working | retired | notworking
  freeTimeBand: string; // low | average | high
};

// The app's sign-up assessment, exactly as the app runs it: kids at home
// → Family; Silver is a combination of free time, age, and retirement —
// at least two of { 55 or older, retired, high free time }, with average
// free time counting alongside retirement; otherwise Spousey. Simple,
// and users can change their version later in Settings.
export function classify(a: Assessment): Version {
  if (a.kidsAtHome) return "FAMILY";
  let score = 0;
  if (a.ageBand === "55-64" || a.ageBand === "65plus") score++;
  if (a.workStatus === "retired") score++;
  if (a.freeTimeBand === "high") score++;
  if (a.freeTimeBand === "average" && a.workStatus === "retired") score++;
  return score >= 2 ? "SILVER" : "SPOUSEY";
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
