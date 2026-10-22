export type SamlConfiguration = {
  idpEntityId: string;
  ssoUrl: string;
  certificateConfigured: boolean;
  emailDomain: string;
  allowedEmails: string[];
  enforced: boolean;
  breakGlassOwnerId: string | null;
  enabled: boolean;
  domainVerifiedAt: number | null;
  domainCheckedAt: number | null;
  domainStatus: 'pending' | 'verified' | 'failed';
  domainFailure?: string | null;
  domainFailedAt?: number | null;
};

export type SamlSettingsView = {
  config: SamlConfiguration | null;
  entityId: string;
  acsUrl: string;
  metadataUrl: string;
  txtName: string | null;
  txtValue: string | null;
  owners: { id: string; email: string; displayName: string }[];
};

export type SamlSettingsInput = {
  idpEntityId: string;
  ssoUrl: string;
  certificate?: string;
  emailDomain: string;
  allowedEmails: string[];
  enforced: boolean;
  breakGlassOwnerId: string | null;
  enabled: boolean;
};

export function savedSamlInput(config: SamlConfiguration): SamlSettingsInput {
  return {
    idpEntityId: config.idpEntityId,
    ssoUrl: config.ssoUrl,
    emailDomain: config.emailDomain,
    allowedEmails: config.allowedEmails,
    enforced: config.enforced,
    breakGlassOwnerId: config.breakGlassOwnerId,
    enabled: config.enabled,
  };
}
