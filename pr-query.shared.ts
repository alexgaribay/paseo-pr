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

function parsePositiveInt(text: string): number | null {
  const number = Number.parseInt(text, 10);
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
}
