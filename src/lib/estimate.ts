// Value estimator, ported from the app: built-in average times matched
// against the favor text; value = (task time ÷ weekly downtime) × 100.
// Under 1 rounds UP to 1; over 1 rounds to nearest. Strenuous/gross jobs
// carry a ×1.5 multiplier.

export type TimeEstimate = {
  keys: string[];
  label: string;
  minutes: number;
  hard?: boolean;
};

export const TIME_ESTIMATES: TimeEstimate[] = [
  { keys: ["lasagna", "lasagne"], label: "Cook a lasagna", minutes: 85 },
  { keys: ["propel", "water +", "get me a water", "glass of water", "a water", "drink packet", "fetch a drink", "get a drink"], label: "Fetch a water + drink packet", minutes: 3 },
  { keys: ["pick up piper", "pickup piper", "pick piper", "school pickup", "school pick-up", "pick up from school", "collect piper"], label: "School pickup", minutes: 30 },
  { keys: ["drive out", "drive to", "go get", "go fetch", "fetch something", "run out to", "run an errand", "errand"], label: "Drive out / run an errand", minutes: 35 },
  { keys: ["groceries", "grocery shopping", "grocery run", "food shop"], label: "Grocery shopping trip", minutes: 60 },
  { keys: ["fridge", "refrigerator", "clean out the fridge"], label: "Clean out the fridge", minutes: 45, hard: true },
  { keys: ["garage"], label: "Clean / tidy the garage", minutes: 120 },
  { keys: ["bathroom", "toilet", "shower scrub"], label: "Clean a bathroom", minutes: 30, hard: true },
  { keys: ["dishes", "wash up", "washing up"], label: "Do the dishes", minutes: 15 },
  { keys: ["laundry", "fold clothes", "folding"], label: "Laundry (wash + fold)", minutes: 35 },
  { keys: ["vacuum", "hoover"], label: "Vacuum the house", minutes: 25 },
  { keys: ["mow", "lawn", "yard work", "garden"], label: "Mow the lawn / yard work", minutes: 60, hard: true },
  { keys: ["trash", "garbage", "bins out", "take out the trash"], label: "Take the trash out", minutes: 5 },
  { keys: ["dog", "walk the dog"], label: "Walk the dog", minutes: 20 },
  { keys: ["cook dinner", "make dinner", "cook a meal", "cook "], label: "Cook a meal", minutes: 45 },
  { keys: ["coffee", "make tea", "cup of tea"], label: "Make a coffee / tea", minutes: 5 },
  { keys: ["back rub", "massage", "foot rub"], label: "Back / foot rub", minutes: 15 },
  { keys: ["ironing", "iron "], label: "Ironing", minutes: 25 },
  { keys: ["car wash", "wash the car", "clean the car"], label: "Wash the car", minutes: 40 },
  { keys: ["change a tyre", "change a tire", "flat tyre", "flat tire"], label: "Change a tire", minutes: 30, hard: true },
  { keys: ["unclog", "blocked drain", "plunge"], label: "Unclog a drain", minutes: 20, hard: true },
  { keys: ["diaper", "nappy", "change the baby"], label: "Change a diaper", minutes: 5, hard: true },
  { keys: ["snack"], label: "Fetch / make a snack", minutes: 7 },
];

// First key match wins (substring match on the lowercased, space-padded text).
export function lookupTime(text: string): TimeEstimate | null {
  if (!text) return null;
  const t = " " + text.toLowerCase() + " ";
  for (const e of TIME_ESTIMATES) {
    for (const k of e.keys) {
      if (t.includes(k)) return e;
    }
  }
  return null;
}

export function computePoints(
  minutes: number | null,
  hard: boolean,
  downtimeHours: number
): number | null {
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const dt = downtimeHours > 0 ? downtimeHours : 20;
  const raw = ((mins / 60) / dt) * 100 * (hard ? 1.5 : 1);
  let points = raw < 1 ? 1 : Math.round(raw);
  if (points < 1) points = 1;
  return points;
}

// Estimated-time fields speak 00:00 (hours:minutes) as a right-aligned
// digit buffer: "45" → 00:45, "130" → 01:30.
export function parseEstTime(str: string | null | undefined): number | null {
  if (str === null || str === undefined) return null;
  const s = String(str).trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  const d = digits.slice(-4);
  const mins = Number(d.slice(-2));
  const hrs = d.length > 2 ? Number(d.slice(0, -2)) : 0;
  const total = hrs * 60 + mins;
  return total > 0 ? total : null;
}

export function fmtEstTime(totalMins: number): string {
  const t = Math.max(0, Math.floor(Number(totalMins) || 0));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

export function hardScale(n: number): number {
  n = Math.floor(Number(n) || 0);
  if (n <= 0) return 0;
  const r = Math.round(n * 1.5);
  return r < 1 ? 1 : r;
}

export function hardUnscale(n: number): number {
  n = Math.floor(Number(n) || 0);
  if (n <= 0) return 0;
  const r = Math.round(n / 1.5);
  return r < 1 ? 1 : r;
}

export function digitsOf(n: number): number[] {
  return [
    Math.floor(n / 1000) % 10,
    Math.floor(n / 100) % 10,
    Math.floor(n / 10) % 10,
    n % 10,
  ];
}

export function valueOf(d: number[]): number {
  return d[0] * 1000 + d[1] * 100 + d[2] * 10 + d[3];
}
