// ============================================
// CLAUDE SUPERVISOR - SUPERVISORS MODULE
// ============================================

// Core supervisor hierarchy
export { SupervisorNode } from './supervisor-node';
export { Router } from './router';
export { Coordinator } from './coordinator';
export { Specialist } from './specialist';
export { SupervisorHierarchy } from './hierarchy';
export { ConfigLoader } from './config-loader';
export { EscalationManager, escalationManager } from './escalation-manager';

// Fixed supervisors (Haiku-based, standardized structure)
export {
    scopeDetector,
    ScopeDetectorSupervisor,
    behaviorDetector,
    BehaviorDetectorSupervisor,
    routerClassifier,
    RouterClassifier,
    ruleChecker,
    RuleChecker
} from './fixed';

// Types from fixed supervisors
export type {
    ScopeDetectionResult,
    CompletionDetectionResult,
    BehaviorDetectionResult,
    ClassificationResult,
    RuleCheckResult
} from './fixed';

// Legacy export (for backward compatibility - will be removed)
export { ScopeDetectorSupervisor as LegacyScopeDetector, scopeDetector as legacyScopeDetector } from './scope-detector';
