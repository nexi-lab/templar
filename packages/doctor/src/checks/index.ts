import type { DoctorCheck } from "../types.js";
import { BudgetLeakDetectionCheck } from "./budget-leak-detection.js";
import { ChannelSecurityCheck } from "./channel-security.js";
import { FilesystemPermissionsCheck } from "./filesystem-permissions.js";
import { GatewayExposureCheck } from "./gateway-exposure.js";
import { MultiTenantIsolationCheck } from "./multi-tenant-isolation.js";
import { SecretsScanningCheck } from "./secrets-scanning.js";
import { SkillCodeSafetyCheck } from "./skill-code-safety.js";

export { generateAttackSurfaceSummary } from "./attack-surface-summary.js";
export { BudgetLeakDetectionCheck } from "./budget-leak-detection.js";
export { ChannelSecurityCheck } from "./channel-security.js";
export { FilesystemPermissionsCheck } from "./filesystem-permissions.js";
export { GatewayExposureCheck } from "./gateway-exposure.js";
export { MultiTenantIsolationCheck } from "./multi-tenant-isolation.js";
export { SecretsScanningCheck } from "./secrets-scanning.js";
export { SkillCodeSafetyCheck } from "./skill-code-safety.js";

/**
 * Returns all built-in security check instances.
 */
export function getBuiltinChecks(): readonly DoctorCheck[] {
  return [
    new FilesystemPermissionsCheck(),
    new ChannelSecurityCheck(),
    new SecretsScanningCheck(),
    new GatewayExposureCheck(),
    new MultiTenantIsolationCheck(),
    new BudgetLeakDetectionCheck(),
    new SkillCodeSafetyCheck(),
  ];
}
