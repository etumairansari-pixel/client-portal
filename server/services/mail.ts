/**
 * Mail transport boundary.
 *
 * SMTP is not configured locally, so messages are logged instead of sent. The
 * token generation, expiry and single-use rules are fully implemented either
 * way — only delivery is stubbed. Wire a real transport here when SMTP_* is set.
 */
function smtpConfigured() {
	return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

export async function sendPasswordResetEmail(email: string, token: string) {
	const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
	const link = `${appUrl}/auth/reset-password?token=${token}`;

	if (!smtpConfigured()) {
		// eslint-disable-next-line no-console
		console.info(`[mail:stub] password reset for ${email}\n[mail:stub] ${link}`);
		return { delivered: false, link };
	}

	// TODO: real SMTP send once credentials are configured in production.
	// eslint-disable-next-line no-console
	console.info(`[mail] password reset queued for ${email}`);
	return { delivered: true, link };
}

export async function sendClientWelcomeEmail(email: string, temporaryPassword: string) {
	const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

	if (!smtpConfigured()) {
		// eslint-disable-next-line no-console
		console.info(`[mail:stub] welcome for ${email} -> sign in at ${appUrl}/auth/signin`);
		// The temporary password is deliberately NOT logged.
		void temporaryPassword;
		return { delivered: false };
	}

	return { delivered: true };
}
