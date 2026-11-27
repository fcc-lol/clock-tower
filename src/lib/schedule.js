// Which visualization is on screen when. Time is cut into 15-minute slots on
// the quarter hour. The slots are dealt in rounds: each round shows every
// piece once, in an order shuffled differently every round, and a round never
// opens with the piece the last one closed with. It is a pure function of the
// time and the list of ids, so every screen showing the display agrees, and a
// reload changes nothing.

export const SLOT_MS = 15 * 60 * 1000;

export const slotOf = (ms) => Math.floor(ms / SLOT_MS);

function shuffled(ids, round) {
  let a = (Math.imul(round | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function orderOf(ids, round) {
  const order = shuffled(ids, round);
  // The swap below only touches the first two places, so the previous round's
  // last piece is the same whether or not that round was itself adjusted.
  if (ids.length > 2 && shuffled(ids, round - 1)[ids.length - 1] === order[0]) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

// The id for a slot (an integer from slotOf).
export function pieceFor(slot, ids) {
  const n = ids.length;
  if (!n) return null;
  if (n <= 2) return ids[((slot % n) + n) % n];
  const pos = ((slot % n) + n) % n;
  return orderOf(ids, Math.floor(slot / n))[pos];
}

// The id to show for a slot when some pieces are known to be broken on this
// machine (`skip`, a Set) or must not be repeated (`not`): the scheduled one if
// it is usable, otherwise the next usable one in the rotation.
export function pieceForSkipping(slot, ids, skip = new Set(), not = null) {
  for (let k = 0; k < ids.length; k++) {
    const id = pieceFor(slot + k, ids);
    if (!skip.has(id) && id !== not) return id;
  }
  return null;
}
