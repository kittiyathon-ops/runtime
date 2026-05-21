import { pressureRecommendation, type PressureRecommendation, type PressureSignal } from "./pressure-types.js";

export interface SurvivabilityPressureState {
  adaptationPressure: PressureSignal;
  epistemicStress: PressureSignal;
  governanceSaturation: PressureSignal;
  contradictionDensity: PressureSignal;
  trustFracture: PressureSignal;
  identityInstability: PressureSignal;
  operationalFatigue: PressureSignal;
  uncertaintyPressure: PressureSignal;
  coherenceDecay: PressureSignal;
}

export interface SurvivabilityIndex {
  systemicPressure: number;
  survivabilityIndex: number;
  recommendation: PressureRecommendation;
  evidenceIds: string[];
  explanation: string[];
}

export class SurvivabilityIndexEvaluator {
  evaluate(state: SurvivabilityPressureState): SurvivabilityIndex {
    const signals = Object.values(state);
    const systemicPressure = signals.reduce((sum, signal) => sum + signal.score, 0) / signals.length;
    return {
      systemicPressure,
      survivabilityIndex: 1 - systemicPressure,
      recommendation: pressureRecommendation(systemicPressure),
      evidenceIds: Array.from(new Set(signals.flatMap((signal) => signal.evidenceIds))),
      explanation: signals.map((signal) => `${signal.name}=${signal.score.toFixed(4)}`)
    };
  }
}
