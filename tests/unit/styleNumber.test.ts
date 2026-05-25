import { describe, expect, it } from 'vitest';
import { parseStyleNumbers } from '../../src/main/services/styleNumber';

describe('parseStyleNumbers', () => {
  it('parses pasted style numbers and keeps order', () => {
    expect(parseStyleNumbers('24324\n24501 24548, 24422AB')).toEqual([
      '24324',
      '24501',
      '24548',
      '24422AB'
    ]);
  });

  it('removes duplicates but keeps first occurrence', () => {
    expect(parseStyleNumbers('24324\n24501\n24324\n80130短款')).toEqual([
      '24324',
      '24501',
      '80130短款'
    ]);
  });

  it('ignores empty tokens and normalizes full-width separators', () => {
    expect(parseStyleNumbers('  24324，24501、\n\n24548  ')).toEqual([
      '24324',
      '24501',
      '24548'
    ]);
  });
});
