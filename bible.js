// bible.js
// 70-day plan: 3 chapters/day, starting Gen 1–3 (Day 1), Gen 4–6 (Day 2), etc.
// Rolls: Genesis -> Exodus -> Leviticus -> Numbers -> Deuteronomy -> Joshua -> Judges
// Offline, translation-agnostic cloze (fill-in) for verse 1 of each chapter.

export const BOOKS = [
  { name: 'Genesis', chapters: 50 },
  { name: 'Exodus', chapters: 40 },
  { name: 'Leviticus', chapters: 27 },
  { name: 'Numbers', chapters: 36 },
  { name: 'Deuteronomy', chapters: 34 },
  { name: 'Joshua', chapters: 24 },
  { name: 'Judges', chapters: 21 }
];

// Build plan: 70 * 3 = 210 chapters
export const plan = Array.from({ length: 70 }, (_, d) => {
  const base = d * 3; // 0..209
  const refs = [base, base + 1, base + 2].map(globalChapToRef);
  return { day: d + 1, refs };
});

function globalChapToRef(idx) {
  let i = idx;
  for (const b of BOOKS) {
    if (i < b.chapters) return { book: b.name, chapter: i + 1 };
    i -= b.chapters;
  }
  const last = BOOKS[BOOKS.length - 1];
  return { book: last.name, chapter: last.chapters };
}

/**
 * Translation-aware cloze prompts for verse 1 (no verse text displayed).
 * role: "michael" | "luis" | "sister"
 */
export function promptsForDay(day, role) {
  const refs = plan[day - 1].refs;
  return refs.map(ref => clozeForRef(ref, role));
}

// Known stable keywords (NOT verse text; just single-word targets)
const CLOZE_KEYS = {
  "Genesis 1:1": { blanks: 2, answers: [["heaven","heavens"], ["earth"]] },
  "Genesis 2:1": { blanks: 1, answers: [["hosts","host"]] },
  "Genesis 3:1": { blanks: 1, answers: [["serpent"]] },
  "Genesis 4:1": { blanks: 1, answers: [["cain"]] },
  "Genesis 5:1": { blanks: 1, answers: [["adam"]] },
  "Genesis 6:1": { blanks: 1, answers: [["men","mankind","humanity","people"]] },
  // Extend as desired; fallback covers the rest.
};

function roleHint(role) {
  return (role === 'sister') ? "Use your NLT wording." : "Use your NASB 1995 wording.";
}

function clozeForRef(ref, role) {
  const key = `${ref.book} ${ref.chapter}:1`;
  const base = CLOZE_KEYS[key] ?? { blanks: 1, answers: [[defaultKeyFor(ref).toLowerCase()]] };
  return {
    ref: key,
    prompt: `${key} — enter ${base.blanks} key word${base.blanks>1?'s':''} (${roleHint(role)})`,
    blanks: base.blanks,
    answers: base.answers
  };
}

function defaultKeyFor(ref) {
  const fallbacks = ["lord","god","king","israel","word","earth"];
  const h = (ref.book.length * 31 + ref.chapter) % fallbacks.length;
  return fallbacks[h];
}

export function validateCloze(inputs, spec) {
  const norm = s => (s||"").trim().toLowerCase();
  const wish = spec.answers.map(group => group.map(norm));
  const got  = inputs.map(norm);

  const used = new Array(wish.length).fill(false);
  const which = got.map(g => {
    let hit = false;
    for (let i=0;i<wish.length;i++){
      if (used[i]) continue;
      if (wish[i].includes(g)) { used[i] = true; hit = true; break; }
    }
    return hit;
  });

  const ok = which.every(Boolean);
  return { ok, which };
}
