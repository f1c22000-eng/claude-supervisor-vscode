// ============================================
// CLAUDE SUPERVISOR - FIXED SUPERVISORS
// ============================================
// All Haiku-based fixed supervisors with consistent structure
// Each supervisor:
// 1. Has its own prompt constant
// 2. Uses debouncing for efficiency
// 3. Returns structured results
// 4. Emits events for monitoring

// Re-export from individual files
export { scopeDetector, ScopeDetectorSupervisor } from './scope-detector';
export { behaviorDetector, BehaviorDetectorSupervisor } from './behavior-detector';
export { routerClassifier, RouterClassifier } from './router-classifier';
export { ruleChecker, RuleChecker } from './rule-checker';

// Types
export type { ScopeDetectionResult, CompletionDetectionResult } from './scope-detector';
export type { BehaviorDetectionResult } from './behavior-detector';
export type { ClassificationResult } from './router-classifier';
export type { RuleCheckResult } from './rule-checker';
