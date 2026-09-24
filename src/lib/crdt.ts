// Per-property Last-Write-Wins registers stamped with a Lamport clock.
// Rule (mirrored in the database): highest clock wins, ties broken by actorId.
export type Reg = { v: unknown; c: number; a: string };
export type Props = Record<string, Reg>;

export function wins(cur: Reg | undefined, inc: Reg): boolean {
  if (!cur) return true;
  if (inc.c !== cur.c) return inc.c > cur.c;
  return inc.a > cur.a;
}

export function mergeProps(cur: Props, inc: Props): Props {
  const out: Props = { ...cur };
  for (const [k, r] of Object.entries(inc)) {
    if (wins(out[k], r)) out[k] = r;
  }
  return out;
}

export function maxClock(p: Props): number {
  let m = 0;
  for (const r of Object.values(p)) if (r.c > m) m = r.c;
  return m;
}

export function val<T>(p: Props | undefined, k: string, fallback: T): T {
  const r = p?.[k];
  return r === undefined || r.v === null || r.v === undefined ? fallback : (r.v as T);
}

// Fractional index keys (base-36) for ordering siblings in the tree.
const D = "0123456789abcdefghijklmnopqrstuvwxyz";
export function keyBetween(a: string | null, b: string | null): string {
  let lo = a ?? "";
  let hi = b ?? "";
  let res = "";
  let i = 0;
  for (;;) {
    const ca = i < lo.length ? D.indexOf(lo.charAt(i)) : 0;
    const cb = i < hi.length ? D.indexOf(hi.charAt(i)) : 36;
    if (ca === cb) {
      res += D.charAt(ca);
      i++;
      continue;
    }
    const mid = Math.floor((ca + cb) / 2);
    if (mid > ca) return res + D.charAt(mid) + D.charAt(Math.floor(Math.random() * 36));
    res += D.charAt(ca);
    i++;
    hi = "";
  }
}
