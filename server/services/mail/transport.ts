import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import nodemailer from 'nodemailer';
import type { RenderedEmail } from './templates.ts';

/**
 * Transport boundary. Business code composes a RenderedEmail and hands it to
 * `MailTransport.send`; which wire it goes over is decided once, from config.
 */

export interface OutgoingMail extends RenderedEmail {
	to: string;
}

export interface MailTransport {
	readonly name: string;
	send(mail: OutgoingMail): Promise<void>;
}

export interface SmtpOptions {
	host: string;
	port: number;
	secure: boolean;
	user?: string;
	pass?: string;
	from: string;
}

/** Real delivery through SMTP via Nodemailer. */
export function createSmtpTransport(o: SmtpOptions): MailTransport {
	const transporter = nodemailer.createTransport({
		host: o.host,
		port: o.port,
		secure: o.secure, // true for 465, false for STARTTLS on 587
		auth: o.user && o.pass ? { user: o.user, pass: o.pass } : undefined,
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 20_000,
	});

	return {
		name: 'smtp',
		async send(mail) {
			await transporter.sendMail({
				from: o.from,
				to: mail.to,
				subject: mail.subject,
				text: mail.text,
				html: mail.html,
			});
		},
	};
}

/**
 * Development fallback. Records that a message *would* have gone out, without
 * its body — links in the body are single-use secrets and must not land in
 * logs. Pair with the file outbox to inspect the real content locally.
 */
export function createLogTransport(sink: (line: string) => void): MailTransport {
	return {
		name: 'log',
		async send(mail) {
			sink(`would send "${mail.subject}" to ${mail.to}`);
		},
	};
}

/** Appends each message as one JSON line. Development and tests only. */
export function createFileOutboxTransport(path: string): MailTransport {
	return {
		name: 'file',
		async send(mail) {
			await mkdir(dirname(path), { recursive: true });
			await appendFile(path, JSON.stringify({ at: new Date().toISOString(), ...mail }) + '\n', 'utf8');
		},
	};
}

/** In-process capture for unit tests. */
export function createMemoryTransport(): MailTransport & { sent: OutgoingMail[] } {
	const sent: OutgoingMail[] = [];
	return {
		name: 'memory',
		sent,
		async send(mail) {
			sent.push(mail);
		},
	};
}

/** Fan out to several transports (e.g. log + file outbox). */
export function combineTransports(...transports: MailTransport[]): MailTransport {
	return {
		name: transports.map((t) => t.name).join('+'),
		async send(mail) {
			for (const t of transports) await t.send(mail);
		},
	};
}
