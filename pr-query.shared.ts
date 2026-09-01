const WHOLE_QUERY = /^(?:(?:pr|mr)\s*)?[#!]?(\d+)$/i;
const GITHUB_PULL_URL = /github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/i;
const NUMBER_TOKEN = /^[#!]?(\d+)$/;

export function parsePullRequestNumber(query: string): number | null {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;

  const fromUrl = GITHUB_PULL_URL.exec(trimmed);
  if (fromUrl) return parsePositiveInt(fromUrl[1]);

  const whole = WHOLE_QUERY.exec(trimmed);
  if (whole) return parsePositiveInt(whole[1]);

  const numbers: number[] = [];
  for (const token of trimmed.split(/\s+/u)) {
    const match = NUMBER_TOKEN.exec(token);
    if (!match) continue;
    const number = parsePositiveInt(match[1]);
    if (number !== null) numbers.push(number);
  }
  if (numbers.length === 1) return numbers[0];
  return numbers.at(-1) ?? null;
}

/**
 * One compact digit string so Command Center can match `42` without allocating
 * 100k `#n` keywords. Length 5 covers typical GitHub PR numbers.
 */
export function commandCenterDigitKeyword(): string {
  return deBruijnDigits(5);
}

function parsePositiveInt(text: string): number | null {
  const number = Number.parseInt(text, 10);
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
}

function deBruijnDigits(length: number): string {
  const alphabet = 10;
  const a = new Array<number>(alphabet * length).fill(0);
  const seq: number[] = [];

  const visit = (t: number, p: number) => {
    if (t > length) {
      if (length % p === 0) {
        for (let j = 1; j <= p; j += 1) seq.push(a[j]);
      }
      return;
    }
    a[t] = a[t - p];
    visit(t + 1, p);
    for (let j = a[t - p] + 1; j < alphabet; j += 1) {
      a[t] = j;
      visit(t + 1, t);
    }
  };

  visit(1, 1);
  const wrap = seq.slice(0, Math.max(length - 1, 0));
  return `${seq.join("")}${wrap.join("")}`;
}
