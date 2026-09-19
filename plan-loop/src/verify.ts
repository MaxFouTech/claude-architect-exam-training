/**
 * Code verifier: the main agent never grades its own workers.
 * A step passes when every number in expected_result appears in the answer in the same order
 * (tolerance 0.005, commas ignored, "30.32%" == "30.32"), and every label token
 * (capitalised names, ids like C007, months like 2026-03) appears case-insensitively.
 */
export interface Verdict {
  pass: boolean;
  missing_numbers: number[];
  missing_labels: string[];
  numbers_expected: number;
}

const NUM = /-?\d+(?:\.\d+)?/g;
const LABEL = /\b(?:[A-Z][A-Za-z]{2,}|C\d{3}|20\d\d-\d\d|n\/a)\b/g;

function numbers(text: string): number[] {
  return (text.replace(/(\d),(?=\d{3}\b)/g, "$1").match(NUM) ?? []).map(Number);
}

export function verifyAnswer(expected: string, answer: string | null): Verdict {
  const exp = numbers(expected);
  const got = numbers(answer ?? "");
  const missing_numbers: number[] = [];
  let cursor = 0;
  for (const n of exp) {
    let found = -1;
    for (let i = cursor; i < got.length; i++) {
      if (Math.abs(got[i] - n) <= 0.005) { found = i; break; }
    }
    if (found === -1) missing_numbers.push(n);
    else cursor = found + 1;
  }
  const labels = [...new Set(expected.match(LABEL) ?? [])];
  const lower = (answer ?? "").toLowerCase();
  const missing_labels = labels.filter((l) => !lower.includes(l.toLowerCase()));
  return { pass: missing_numbers.length === 0 && missing_labels.length === 0, missing_numbers, missing_labels, numbers_expected: exp.length };
}
