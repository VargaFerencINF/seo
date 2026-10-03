import type { AnalysisResult, RuleSet } from '../types';
import { scoreAnalysis } from './scoring';

/** A tárolt elemzés újrapontozása az aktuális szabályrendszerrel (hálózat nélkül, azonnal). */
export function rescore(a: AnalysisResult, rules: RuleSet): AnalysisResult {
  return { ...a, score: scoreAnalysis(a, rules) };
}
