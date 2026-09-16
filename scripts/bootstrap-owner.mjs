/**
 * Create the first production OWNER.
 *
 *   OWNER_EMAIL=you@company.com OWNER_NAME="Your Name" OWNER_PASSWORD='…' pnpm bootstrap:owner
 *
 * Any variable that is missing is asked for on the terminal (the password is
 * read without echo). Refuses to create a second account for an existing
 * email. Nothing is hard-coded and nothing secret is printed.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { bootstrapOwner } from './lib/bootstrap-owner.mjs';

async function ask(question, { hidden = false } = {}) {
	if (!stdin.isTTY) {
		throw new Error(`${question} is required (set it in the environment when not running interactively)`);
	}
	const rl = createInterface({ input: stdin, output: stdout, terminal: true });
	if (hidden) {
		// Suppress echo while the password is typed.
		const write = rl._writeToOutput;
		rl._writeToOutput = (s) => (s.includes('\n') ? write.call(rl, s) : undefined);
		stdout.write(`${question}: `);
		const answer = await rl.question('');
		rl._writeToOutput = write;
		stdout.write('\n');
		rl.close();
		return answer;
	}
	const answer = await rl.question(`${question}: `);
	rl.close();
	return answer;
}

const email = process.env.OWNER_EMAIL || (await ask('Owner email'));
const name = process.env.OWNER_NAME || (await ask('Owner full name'));
const password = process.env.OWNER_PASSWORD || (await ask('Owner password (min 12 chars, not echoed)', { hidden: true }));

const prisma = new PrismaClient();
try {
	const result = await bootstrapOwner({ email, name, password }, { prisma, hash });
	if (!result.ok) {
		console.error(`Owner not created (${result.reason}):`);
		for (const p of result.problems) console.error(`  - ${p}`);
		process.exitCode = 1;
	} else {
		console.log(`Owner created: ${result.user.email} (${result.user.id})`);
	}
} finally {
	await prisma.$disconnect();
}
