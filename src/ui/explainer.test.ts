import { describe, expect, it } from 'vitest';
import spec from '../../docs/SPEC.md?raw';
import { OPEN_QUESTIONS } from '../offer/offer';
import { EXPLAINER } from './explainer';

const section = (from: string, to: string) => spec.slice(spec.indexOf(from), spec.indexOf(to));

describe('explainer wording', () => {
  it('matches SPEC section 3 exactly', () => {
    const quoted = section('## 3.', '## 4.')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('>'))
      .map((line) => line.replace(/^>\s?/, ''))
      .filter((line) => line !== '');

    expect(quoted[0]).toBe(`**${EXPLAINER.title}**`);
    expect(quoted.slice(1, -1)).toEqual(EXPLAINER.points.map((p) => `- ${p}`));
    expect(quoted[quoted.length - 1]).toBe(EXPLAINER.footer);
  });
});

describe('open questions', () => {
  it('match SPEC section 2 exactly', () => {
    const listed = section('Open questions', '## 3.')
      .split(/\r?\n/)
      .filter((line) => /^\d\. /.test(line))
      .map((line) => line.replace(/^\d\. /, ''));
    expect(listed).toEqual([...OPEN_QUESTIONS]);
  });
});
