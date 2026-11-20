export interface LeaderboardEntry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

export interface LeaderboardFile {
  entries: LeaderboardEntry[];
}

export const LEADERBOARD_MAX_ENTRIES = 10;

// Supports 3-12 ASCII [A-Za-z0-9_] or Vietnamese letters with diacritics + digits + underscore
const NAME_REGEX = /^[A-Za-z0-9_\u00C0-\u024F\u1E00-\u1EFF]{3,12}$/;

export function isValidLeaderboardName(raw: string): boolean {
  return NAME_REGEX.test(raw.trim());
}

export function sortLeaderboardEntries(entries: ReadonlyArray<LeaderboardEntry>): LeaderboardEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = Date.parse(a.achieved_at);
      const tb = Date.parse(b.achieved_at);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
        return ta - tb;
      }
      return a.achieved_at < b.achieved_at ? -1 : a.achieved_at > b.achieved_at ? 1 : 0;
    })
    .slice(0, LEADERBOARD_MAX_ENTRIES);
}

export function addLeaderboardEntry(
  current: ReadonlyArray<LeaderboardEntry>,
  entry: LeaderboardEntry,
): LeaderboardEntry[] {
  const name = entry.name.trim();
  if (!isValidLeaderboardName(name)) {
    throw new Error('Name must be 3-12 characters (letters, digits, or _)');
  }
  const normalized: LeaderboardEntry = {
    name,
    score: Math.max(0, Math.floor(entry.score)),
    nights_won: Math.max(0, Math.min(3, Math.floor(entry.nights_won))),
    achieved_at: entry.achieved_at,
    seed: Math.floor(entry.seed),
  };
  return sortLeaderboardEntries([...current, normalized]);
}

export function normalizeLeaderboardFile(raw: unknown): LeaderboardFile {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as LeaderboardFile).entries)) {
    return { entries: [] };
  }
  const valid: LeaderboardEntry[] = [];
  for (const item of (raw as LeaderboardFile).entries) {
    if (
      typeof item === 'object' &&
      item !== null &&
      typeof item.name === 'string' &&
      isValidLeaderboardName(item.name) &&
      typeof item.score === 'number' &&
      Number.isFinite(item.score) &&
      typeof item.nights_won === 'number' &&
      Number.isFinite(item.nights_won) &&
      typeof item.achieved_at === 'string' &&
      typeof item.seed === 'number' &&
      Number.isFinite(item.seed)
    ) {
      valid.push({
        name: item.name.trim(),
        score: Math.max(0, Math.floor(item.score)),
        nights_won: Math.max(0, Math.min(3, Math.floor(item.nights_won))),
        achieved_at: item.achieved_at,
        seed: Math.floor(item.seed),
      });
    }
  }
  return { entries: sortLeaderboardEntries(valid) };
}
