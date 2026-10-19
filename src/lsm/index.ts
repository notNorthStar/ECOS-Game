/**
 * ecos-lsm — módulo de reconocimiento del alfabeto manual de LSM para ECOS (Listick Games).
 * No depende de Phaser ni de ningún motor. Ver README.md.
 */
export { LsmEngine, type DetectionMode, type LsmEngineOptions } from './core/LsmEngine';
export { HandTracker } from './core/HandTracker';
export { SignClassifier, type StablePrediction, type StrategyMode } from './core/SignClassifier';
export { SpellSession, DEFAULT_SPELL_OPTIONS, type SpellOptions, type SpellResult, type SpellOutcome, type LetterResult } from './core/SpellSession';
export { HoldDetector } from './core/HoldDetector';
export { SampleRecorder } from './core/SampleRecorder';
export { CameraView } from './core/CameraView';
export { LETTERS, SUPPORTED_LETTERS, MOTION_LETTERS, spellLetters, checkWord, type LetterDef, type FingerState, type WordCheck } from './core/letters';
export { RulesStrategy, analyzeHand, scoreLetters, explain } from './core/rules';
export { KnnStrategy, type SampleBank } from './core/knn';
export { ZTracker } from './core/motion';
export { normalizeLandmarks } from './core/features';
export type { Landmark, HandFrame, Prediction, TrackerStatus, LetterStrategy } from './core/types';
export { LM, HAND_CONNECTIONS } from './core/types';
