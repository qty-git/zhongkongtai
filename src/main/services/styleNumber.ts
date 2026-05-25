export function parseStyleNumbers(input: string): string[] {
  const seen = new Set<string>();
  const tokens = input
    .replace(/[，、；;]/g, '\n')
    .split(/[\s,\n\r\t]+/g)
    .map((token) => token.trim())
    .filter(Boolean);

  const styleNumbers: string[] = [];

  for (const token of tokens) {
    if (seen.has(token)) {
      continue;
    }

    seen.add(token);
    styleNumbers.push(token);
  }

  return styleNumbers;
}
