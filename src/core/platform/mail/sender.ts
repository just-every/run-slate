import type { RuntimeConfig } from '../config/runtime';

/**
 * MAIL_FROM's address under the app's name, so a mail's sender name and its
 * subject name the same app. Managed mail's relay names the sender from the
 * installation itself, which Managed also renders as APP_NAME.
 */
export function namedSender(config: Pick<RuntimeConfig, 'appName' | 'mailFrom'>): string | undefined {
  const from = config.mailFrom?.trim();
  if (!from) return undefined;
  const address = from.endsWith('>') ? from.slice(from.lastIndexOf('<') + 1, -1).trim() : from;
  return `"${config.appName}" <${address}>`;
}
