import { env } from "../config/env";

export function stagingAutomationPaused(): boolean {
  return (env.DIEWISH_ENVIRONMENT ?? env.NODE_ENV) === "staging" && !env.STAGING_AUTOMATION_ENABLED;
}
