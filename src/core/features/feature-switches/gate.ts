import type {AppBindings} from '../../app/types';
import {ApiProblem} from '../../app/problems';
import {readLaunchProfile, switchForJob, switchForPath, isFlagshipPath} from '../../platform/config/launch-profile';
import {featureAvailability} from './state';

export async function pathEnabled(env: AppBindings, workspaceId: string, path: string) {
  if (readLaunchProfile(env.SLATE_PROFILE) === 'flagship' || !isFlagshipPath(path)) return true;
  const key = switchForPath(path);
  return key ? (await featureAvailability(env.DB, workspaceId, env))[key] : false;
}

export async function jobEnabled(env: AppBindings, job: unknown) {
  if (readLaunchProfile(env.SLATE_PROFILE) === 'flagship') return true;
  const key = switchForJob(job);
  if (!key || !job || typeof job !== 'object' || !('workspaceId' in job) || typeof job.workspaceId !== 'string') return false;
  return (await featureAvailability(env.DB, job.workspaceId, env))[key];
}

/** MCP transport availability does not grant Ask or flagship production effects. */
export async function requireAgentTool(env: AppBindings, workspaceId: string, tool: string) {
  if (readLaunchProfile(env.SLATE_PROFILE) === 'flagship') return;
  const key = ['ask', 'read_evidence', 'run_status', 'refine_run', 'successor_run', 'pause_run', 'resume_run', 'cancel_run', 'review_run', 'accept_changes'].includes(tool) ? 'ask' : null;
  if (!key || !(await featureAvailability(env.DB, workspaceId, env))[key]) throw new ApiProblem(403, 'FEATURE_DISABLED', 'This tool is unavailable.');
}
