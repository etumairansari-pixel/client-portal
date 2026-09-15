/**
 * Eiretech Scope questionnaire.
 *
 * Shared by the client form (rendering + progress) and the server (validation +
 * completion percentage), so the two can never disagree about what is required.
 */

export type ScopeQuestionType =
	| 'text'
	| 'textarea'
	| 'radio'
	| 'checkbox'
	| 'yesno'
	| 'date'
	| 'url'
	| 'email'
	| 'files';

export interface ScopeQuestion {
	key: string;
	label: string;
	type: ScopeQuestionType;
	required?: boolean;
	description?: string;
	placeholder?: string;
	options?: string[];
	/** Only shown (and only counted) when another answer matches. */
	dependsOn?: { key: string; equals: string };
}

export interface ScopeSection {
	key: string;
	number: string;
	title: string;
	description?: string;
	questions: ScopeQuestion[];
}

export type ScopeAnswers = Record<string, string | string[] | null>;

export const SCOPE_SECTIONS: ScopeSection[] = [
	{
		key: 'overview',
		number: '01',
		title: 'Project Overview',
		description: 'Tell us what you want to build and why.',
		questions: [
			{ key: 'project_name', label: 'Project Name', type: 'text', required: true, placeholder: 'e.g. Candy Cloud Online Store' },
			{
				key: 'project_type',
				label: 'Project Type',
				type: 'radio',
				required: true,
				options: ['Website', 'E-commerce Store', 'Mobile Application', 'Web Application', 'Internal Business System', 'CMS', 'API / Backend', 'Automation', 'Other'],
			},
			{ key: 'project_description', label: 'Briefly describe your project', type: 'textarea', required: true },
			{ key: 'problem_solved', label: 'What problem should this project solve?', type: 'textarea', required: true },
			{ key: 'business_objectives', label: 'What are the main business objectives?', type: 'textarea', required: true },
			{ key: 'project_stage', label: 'Is this a new project or an existing system?', type: 'radio', options: ['New Project', 'Existing Project', 'Redesign / Upgrade'] },
		],
	},
	{
		key: 'business',
		number: '02',
		title: 'Business Requirements',
		description: 'Help us understand your organisation and who this is for.',
		questions: [
			{ key: 'business_description', label: 'Describe your business / organisation', type: 'textarea', required: true },
			{ key: 'target_users', label: 'Who are your target users or customers?', type: 'textarea', required: true },
			{ key: 'expected_outcomes', label: 'What are the main outcomes expected from this project?', type: 'textarea', required: true },
			{ key: 'business_processes', label: 'Are there specific business processes the system must support?', type: 'textarea', description: 'For example: order approval, stock reconciliation, patient intake.' },
		],
	},
	{
		key: 'features',
		number: '03',
		title: 'Features & Functionality',
		description: 'What the system needs to do.',
		questions: [
			{ key: 'main_features', label: 'List the main features required', type: 'textarea', required: true, description: 'Examples: user login, admin panel, product management, booking, notifications, reports, search, payments, inventory, chat.' },
			{ key: 'first_release_features', label: 'Which features are essential for the first release?', type: 'textarea', required: true },
			{ key: 'future_features', label: 'Features you would like in a future phase', type: 'textarea' },
		],
	},
	{
		key: 'users',
		number: '04',
		title: 'Users & Access',
		description: 'These are the user types inside YOUR software — they do not affect who can access this Eiretech portal.',
		questions: [
			{ key: 'system_users', label: "Who will use the system you're asking us to build?", type: 'checkbox', options: ['Customers', 'Employees', 'Managers', 'Administrators', 'Vendors', 'Doctors', 'Patients', 'Students', 'Other'] },
			{ key: 'needs_roles', label: 'Does the system require different user roles?', type: 'yesno' },
			{ key: 'roles_description', label: 'Please describe the roles and what each role should access', type: 'textarea', dependsOn: { key: 'needs_roles', equals: 'Yes' } },
		],
	},
	{
		key: 'design',
		number: '05',
		title: 'Design & Branding',
		questions: [
			{ key: 'has_branding', label: 'Do you already have branding?', type: 'radio', options: ['Yes', 'Partially', 'No'] },
			{ key: 'logo_files', label: 'Logo', type: 'files', description: 'Upload your logo files if you have them.' },
			{ key: 'brand_colors', label: 'Brand colours', type: 'text', placeholder: 'e.g. #0F172A, #2563EB' },
			{ key: 'brand_guidelines', label: 'Brand guidelines', type: 'files' },
			{ key: 'design_style', label: 'Preferred design style', type: 'radio', options: ['Minimal', 'Corporate', 'Modern', 'Luxury', 'Colorful', 'Technical', 'Other'] },
			{ key: 'design_notes', label: 'Additional design notes', type: 'textarea' },
		],
	},
	{
		key: 'references',
		number: '06',
		title: 'Reference Websites / Applications',
		description: 'Showing us examples is the fastest way to align on direction.',
		questions: [
			{ key: 'reference_1_url', label: 'Reference 1 — URL', type: 'url', placeholder: 'https://' },
			{ key: 'reference_1_likes', label: 'Reference 1 — What do you like about it?', type: 'textarea' },
			{ key: 'reference_2_url', label: 'Reference 2 — URL', type: 'url', placeholder: 'https://' },
			{ key: 'reference_2_likes', label: 'Reference 2 — What do you like about it?', type: 'textarea' },
			{ key: 'reference_3_url', label: 'Reference 3 — URL', type: 'url', placeholder: 'https://' },
			{ key: 'reference_3_likes', label: 'Reference 3 — What do you like about it?', type: 'textarea' },
			{ key: 'competitors', label: 'Competitors or similar products', type: 'textarea' },
		],
	},
	{
		key: 'integrations',
		number: '07',
		title: 'Integrations',
		description: 'Systems your project needs to connect to. This is about your software, not about paying Eiretech.',
		questions: [
			{ key: 'needs_integrations', label: 'Does the project require integrations?', type: 'yesno' },
			{ key: 'integration_types', label: 'Which integrations apply?', type: 'checkbox', options: ['Payment Gateway', 'Email', 'SMS', 'WhatsApp', 'ERP', 'CRM', 'POS', 'Accounting', 'Maps', 'Social Media', 'Analytics', 'Other API'], dependsOn: { key: 'needs_integrations', equals: 'Yes' } },
			{ key: 'integration_details', label: 'Describe the required integrations', type: 'textarea', dependsOn: { key: 'needs_integrations', equals: 'Yes' } },
		],
	},
	{
		key: 'content',
		number: '08',
		title: 'Content & Assets',
		questions: [
			{ key: 'content_availability', label: 'Will you provide the content?', type: 'radio', options: ['All content available', 'Some content available', 'Content needs to be prepared', 'Not applicable'] },
			{ key: 'content_files', label: 'Upload available assets', type: 'files', description: 'Images, videos, documents, product data, brand guide, existing content.' },
		],
	},
	{
		key: 'technical',
		number: '09',
		title: 'Technical Information',
		description: 'Never enter passwords, API secrets, database credentials or private keys here. We will arrange a secure channel when access is actually needed.',
		questions: [
			{ key: 'has_domain', label: 'Do you already have a domain?', type: 'yesno' },
			{ key: 'domain_url', label: 'Domain', type: 'url', placeholder: 'https://', dependsOn: { key: 'has_domain', equals: 'Yes' } },
			{ key: 'has_hosting', label: 'Do you already have hosting?', type: 'yesno' },
			{ key: 'hosting_details', label: 'Who is your hosting provider?', type: 'text', dependsOn: { key: 'has_hosting', equals: 'Yes' } },
			{ key: 'has_existing_system', label: 'Is there an existing website or system?', type: 'yesno' },
			{ key: 'existing_system_url', label: 'Existing system URL', type: 'url', placeholder: 'https://', dependsOn: { key: 'has_existing_system', equals: 'Yes' } },
			{ key: 'has_database', label: 'Is there an existing database?', type: 'yesno' },
			{ key: 'has_api', label: 'Is there an existing API?', type: 'yesno' },
			{ key: 'third_party_software', label: 'Third-party software already in use', type: 'textarea' },
		],
	},
	{
		key: 'dependencies',
		number: '10',
		title: 'Client Dependencies',
		description: 'What we will need from your side to keep the project moving.',
		questions: [
			{ key: 'client_provides', label: 'What information or assets will your team provide?', type: 'textarea', required: true },
			{ key: 'contact_name', label: 'Main contact — Name', type: 'text', required: true },
			{ key: 'contact_role', label: 'Main contact — Role', type: 'text' },
			{ key: 'contact_email', label: 'Main contact — Email', type: 'email', required: true },
			{ key: 'desired_date', label: 'Desired deadline or launch date', type: 'date', description: 'This is a requested date. Eiretech confirms the final timeline after review.' },
			{ key: 'date_notes', label: 'Notes about timing', type: 'textarea' },
		],
	},
	{
		key: 'additional',
		number: '11',
		title: 'Additional Information',
		questions: [
			{ key: 'anything_else', label: 'Anything else our team should know?', type: 'textarea' },
			{ key: 'additional_files', label: 'Upload additional documents', type: 'files' },
		],
	},
	{
		key: 'review',
		number: '12',
		title: 'Review & Submit',
		description: 'Check your answers before submitting.',
		questions: [],
	},
];

function isVisible(q: ScopeQuestion, answers: ScopeAnswers) {
	return !q.dependsOn || answers[q.dependsOn.key] === q.dependsOn.equals;
}

export function isAnswered(q: ScopeQuestion, answers: ScopeAnswers) {
	const v = answers[q.key];
	if (Array.isArray(v)) return v.length > 0;
	return typeof v === 'string' ? v.trim().length > 0 : false;
}

/** Required questions that currently apply, given conditional visibility. */
export function applicableRequired(answers: ScopeAnswers): ScopeQuestion[] {
	return SCOPE_SECTIONS.flatMap((s) => s.questions.filter((q) => q.required && isVisible(q, answers)));
}

/** Completion counts REQUIRED questions only; optional answers never move it. */
export function calculateCompletion(answers: ScopeAnswers): number {
	const required = applicableRequired(answers);
	if (!required.length) return 100;
	const done = required.filter((q) => isAnswered(q, answers)).length;
	return Math.round((done / required.length) * 100);
}

export function missingRequired(answers: ScopeAnswers): ScopeQuestion[] {
	return applicableRequired(answers).filter((q) => !isAnswered(q, answers));
}

export function visibleQuestions(sectionKey: string, answers: ScopeAnswers): ScopeQuestion[] {
	const section = SCOPE_SECTIONS.find((s) => s.key === sectionKey);
	if (!section) return [];
	return section.questions.filter((q) => isVisible(q, answers));
}

export function sectionProgress(section: ScopeSection, answers: ScopeAnswers) {
	const req = section.questions.filter((q) => q.required && isVisible(q, answers));
	if (!req.length) return { total: 0, done: 0, complete: true };
	const done = req.filter((q) => isAnswered(q, answers)).length;
	return { total: req.length, done, complete: done === req.length };
}
