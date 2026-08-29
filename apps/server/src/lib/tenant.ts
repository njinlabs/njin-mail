/**
 * Multi-tenant domain enforcement: each tenant is reached through its own
 * webmail hostname (e.g. mail.j3company.com, mail.jadiweb.id), all pointing
 * at this same app instance. The IMAP/SMTP backend itself is a single fixed
 * server (env.IMAP_HOST / env.SMTP_HOST, e.g. mail.njin.run) shared by every
 * tenant — only the *allowed login domain* varies, derived per-request from
 * the Host header the browser actually used.
 */
export function getTenantDomainFromHost(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(":")[0]!.toLowerCase();
  return host.startsWith("mail.") ? host.slice("mail.".length) : host;
}

export function emailMatchesTenantDomain(email: string, tenantDomain: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain === tenantDomain.toLowerCase();
}
