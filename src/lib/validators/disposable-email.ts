import { disposableEmailDomains } from './disposable-email-domains';

/**
 * Whether an address belongs to a known throwaway-mail provider.
 *
 * Exact domain match against the bundled list — subdomains are deliberately not
 * matched, since the upstream list enumerates the exact domains in use.
 */
export function isDisposableEmail(email: string): boolean {
	const domain = email.split('@')[1]?.toLowerCase().trim();
	return domain ? disposableEmailDomains.has(domain) : false;
}
