/**
 * Eiretech SRS section template.
 *
 * These are empty headings for the Owner to author into. Nothing is generated
 * from the Scope automatically — the approved Scope is reference material shown
 * alongside, not a source for fabricated requirements.
 */

export interface SrsSection {
	key: string;
	number: string;
	title: string;
	hint?: string;
	/** Rendered by the requirements table rather than a free-text editor. */
	kind?: 'text' | 'requirements-fr' | 'requirements-nfr';
}

export const SRS_SECTIONS: SrsSection[] = [
	{ key: 'document_info', number: '1', title: 'Document Information', hint: 'Prepared by, date, distribution, revision notes.' },
	{ key: 'project_overview', number: '2', title: 'Project Overview', hint: 'A short description of what is being built.' },
	{ key: 'objectives', number: '3', title: 'Project Objectives', hint: 'The business outcomes this project must achieve.' },
	{ key: 'scope', number: '4', title: 'Scope', hint: 'What this engagement covers, drawn from the approved Scope document.' },
	{ key: 'user_roles', number: '5', title: 'User Types / Roles', hint: 'The roles inside the delivered system and what each can do.' },
	{ key: 'functional', number: '6', title: 'Functional Requirements', kind: 'requirements-fr' },
	{ key: 'non_functional', number: '7', title: 'Non-Functional Requirements', kind: 'requirements-nfr' },
	{ key: 'modules', number: '8', title: 'Modules', hint: 'The major modules or areas of the system.' },
	{ key: 'integrations', number: '9', title: 'Integrations', hint: 'Third-party systems and APIs this project must connect to.' },
	{ key: 'business_rules', number: '10', title: 'Business Rules', hint: 'Rules the system must enforce.' },
	{ key: 'data_content', number: '11', title: 'Data / Content Requirements', hint: 'Data models, migrations, content the client supplies.' },
	{ key: 'technical_constraints', number: '12', title: 'Technical Constraints', hint: 'Platform, hosting, browser or performance constraints.' },
	{ key: 'dependencies', number: '13', title: 'Dependencies', hint: 'What delivery depends on, including client-side inputs.' },
	{ key: 'acceptance', number: '14', title: 'Acceptance Criteria', hint: 'How completion will be judged.' },
	{ key: 'out_of_scope', number: '15', title: 'Out of Scope', hint: 'Explicitly excluded, to prevent later ambiguity.' },
	{ key: 'assumptions', number: '16', title: 'Assumptions', hint: 'What is being assumed true at time of writing.' },
	{ key: 'final_approval', number: '17', title: 'Final Approval', hint: 'Sign-off notes.' },
];

export type SrsContent = Record<string, string>;

export const REQUIREMENT_PRIORITIES = ['MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE', 'WONT_HAVE'] as const;
export const REQUIREMENT_STATES = ['DRAFT', 'CONFIRMED', 'REMOVED'] as const;

export const PRIORITY_LABEL: Record<string, string> = {
	MUST_HAVE: 'Must Have',
	SHOULD_HAVE: 'Should Have',
	COULD_HAVE: 'Could Have',
	WONT_HAVE: "Won't Have",
};

export const SRS_STATUS_LABEL: Record<string, string> = {
	DRAFT: 'Draft',
	INTERNAL_REVIEW: 'Internal Review',
	CLIENT_REVIEW: 'Client Review',
	CHANGES_REQUESTED: 'Changes Requested',
	READY_FOR_APPROVAL: 'Ready for Approval',
	APPROVED: 'Approved',
};

/** Statuses in which the client can see the document at all. */
export const CLIENT_VISIBLE_SRS_STATUSES = ['CLIENT_REVIEW', 'CHANGES_REQUESTED', 'READY_FOR_APPROVAL', 'APPROVED'];

/** Next stable reference for a requirement kind, e.g. FR-001 → FR-002. */
export function nextRequirementRef(kind: 'FR' | 'NFR', existing: { ref: string }[]): string {
	const prefix = kind === 'FR' ? 'FR' : 'NFR';
	const numbers = existing
		.filter((r) => r.ref.startsWith(prefix + '-'))
		.map((r) => Number.parseInt(r.ref.slice(prefix.length + 1), 10))
		.filter((n) => Number.isFinite(n));
	const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
	return `${prefix}-${String(next).padStart(3, '0')}`;
}

/** 1.0 → 1.1 on each send to the client. */
export function nextVersionLabel(currentVersionNumber: number): string {
	if (currentVersionNumber < 1) return '1.0';
	return `1.${currentVersionNumber}`;
}
