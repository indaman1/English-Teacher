import type { EnglishLevel } from '@/types';

// Short optional placement quiz. It gives a SUGGESTED level only; students can always change it.
// It is a quick estimate of grammar knowledge, not a certified test.

export interface PlacementQuestion {
  id: string;
  /** Difficulty band 1 (easiest) to 5 (hardest). Two questions per band. */
  band: 1 | 2 | 3 | 4 | 5;
  prompt: string;
  options: string[];
  answer: number;
}

export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  { id: 'q1', band: 1, prompt: 'My sister ___ a teacher.', options: ['am', 'is', 'are', 'be'], answer: 1 },
  { id: 'q2', band: 1, prompt: '___ you like tea?', options: ['Do', 'Does', 'Are', 'Is'], answer: 0 },
  { id: 'q3', band: 2, prompt: 'Yesterday we ___ to the market.', options: ['go', 'goes', 'went', 'gone'], answer: 2 },
  { id: 'q4', band: 2, prompt: 'There ___ two books on the table.', options: ['is', 'are', 'be', 'am'], answer: 1 },
  { id: 'q5', band: 3, prompt: 'I have lived in Abuja ___ 2019.', options: ['for', 'since', 'from', 'during'], answer: 1 },
  { id: 'q6', band: 3, prompt: 'If it rains tomorrow, we ___ at home.', options: ['stay', 'stayed', 'will stay', 'would stay'], answer: 2 },
  { id: 'q7', band: 4, prompt: 'If I ___ more time, I would learn French.', options: ['have', 'had', 'will have', 'having'], answer: 1 },
  { id: 'q8', band: 4, prompt: 'She suggested ___ earlier to avoid the traffic.', options: ['to leave', 'leaving', 'leave', 'left'], answer: 1 },
  { id: 'q9', band: 5, prompt: 'Hardly ___ the office when the meeting began.', options: ['I had left', 'had I left', 'I left', 'did I leave'], answer: 1 },
  { id: 'q10', band: 5, prompt: 'The report, ___ was long, contained several errors.', options: ['that', 'what', 'which', 'who'], answer: 2 },
];

export interface PlacementResult {
  level: EnglishLevel;
  correct: number;
  total: number;
  /** How many bands in a row were answered fully correctly, starting from the easiest. */
  bandsPassed: number;
}

const LEVELS: EnglishLevel[] = ['beginner', 'elementary', 'intermediate', 'upper_intermediate', 'advanced'];

/**
 * Level = number of consecutive bands fully passed from the easiest upwards (capped at Advanced).
 * Requiring a clean run from the bottom means lucky guesses on hard questions cannot inflate the result.
 */
export function scorePlacement(answers: Record<string, number>, questions: PlacementQuestion[] = PLACEMENT_QUESTIONS): PlacementResult {
  let correct = 0;
  const bands = new Map<number, { right: number; total: number }>();
  for (const q of questions) {
    const entry = bands.get(q.band) ?? { right: 0, total: 0 };
    entry.total += 1;
    if (answers[q.id] === q.answer) {
      entry.right += 1;
      correct += 1;
    }
    bands.set(q.band, entry);
  }

  let bandsPassed = 0;
  for (let band = 1; band <= 5; band++) {
    const e = bands.get(band);
    if (!e || e.right !== e.total) break;
    bandsPassed += 1;
  }

  return { level: LEVELS[Math.min(LEVELS.length - 1, bandsPassed)], correct, total: questions.length, bandsPassed };
}
