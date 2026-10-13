export const setupAdvice: string;
export const settings: { file: string; originKey: string; generate: string[]; values: (context: {input: {email: string}; origin: string}) => Record<string, string> };
export function settingsFor(env?: NodeJS.ProcessEnv): typeof settings;
export function validateLocalSettings(vars: Record<string, string>): URL;
export function loadLocalSettings(root: string, env?: NodeJS.ProcessEnv): Promise<Record<string, string>>;
export function localPaths(env?: NodeJS.ProcessEnv): { configPath: string; persistPath: string };
export function migrationCommand(env?: NodeJS.ProcessEnv): [string, string[]];
