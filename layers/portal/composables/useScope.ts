import {
	SCOPE_SECTIONS,
	calculateCompletion,
	missingRequired,
	sectionProgress as computeSectionProgress,
	visibleQuestions as computeVisible,
	type ScopeAnswers,
	type ScopeSection,
} from '~~/shared/scope-questionnaire';

export type ScopeStatus =
	| 'DRAFT'
	| 'SUBMITTED'
	| 'UNDER_REVIEW'
	| 'CLARIFICATION_REQUIRED'
	| 'READY_FOR_APPROVAL'
	| 'APPROVED';

export interface ScopeRecord {
	id: string;
	status: ScopeStatus;
	answers: ScopeAnswers | null;
	completionPercentage: number;
	currentVersion: number;
	lastSavedAt: string | null;
	submittedAt: string | null;
	clientApprovedAt: string | null;
	approvedAt: string | null;
	lockedAt: string | null;
}

export interface ScopeDiscussionRecord {
	id: string;
	subject: string;
	status: 'OPEN' | 'RESOLVED';
	requiresClientResponse: boolean;
	sectionKey: string | null;
	questionKey: string | null;
	createdAt: string;
	messages: { id: string; authorSide: 'EIRETECH' | 'CLIENT'; body: string; createdAt: string }[];
}

export interface ScopeFileRecord {
	id: string;
	originalName: string;
	mimeType: string;
	sizeBytes: number;
	questionKey: string | null;
	sectionKey: string | null;
}

export default function useScope() {
	const scope = useState<ScopeRecord | null>('eiretech-scope', () => null);
	const answers = useState<ScopeAnswers>('eiretech-scope-answers', () => ({}));
	const files = useState<ScopeFileRecord[]>('eiretech-scope-files', () => []);
	const discussions = useState<ScopeDiscussionRecord[]>('eiretech-scope-discussions', () => []);
	const versions = useState<{ id: string; versionNumber: number; submittedAt: string }[]>(
		'eiretech-scope-versions',
		() => [],
	);

	const sections = SCOPE_SECTIONS as ScopeSection[];

	const loading = ref(false);
	const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
	const lastSavedAt = ref<string | null>(null);

	const status = computed<ScopeStatus>(() => scope.value?.status ?? 'DRAFT');
	const isEditable = computed(() => status.value === 'DRAFT');
	const isLocked = computed(() => status.value === 'APPROVED');
	const needsClarification = computed(() => status.value === 'CLARIFICATION_REQUIRED');
	const readyForApproval = computed(() => status.value === 'READY_FOR_APPROVAL');
	const awaitingOwnerApproval = computed(() => readyForApproval.value && !!scope.value?.clientApprovedAt);

	// Progress is computed locally from the same shared module the server uses,
	// so the bar reacts instantly without a round trip and can never disagree.
	const completion = computed(() => calculateCompletion(answers.value));
	const missing = computed(() => missingRequired(answers.value));
	const canSubmit = computed(() => completion.value === 100 && isEditable.value);

	const openClarifications = computed(() =>
		discussions.value.filter((d) => d.status === 'OPEN' && d.requiresClientResponse),
	);

	function visibleQuestions(sectionKey: string) {
		return computeVisible(sectionKey, answers.value);
	}

	function sectionProgress(section: ScopeSection) {
		return computeSectionProgress(section, answers.value);
	}

	function filesFor(questionKey: string) {
		return files.value.filter((f) => f.questionKey === questionKey);
	}

	async function load() {
		loading.value = true;
		try {
			const data = await $fetch<{
				scope: ScopeRecord;
				versions: typeof versions.value;
				files: ScopeFileRecord[];
				discussions: ScopeDiscussionRecord[];
			}>('/api/portal/scope', {
				// During SSR the session cookie must be forwarded explicitly,
				// otherwise the API sees an anonymous request and 401s.
				headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
			});

			scope.value = data.scope;
			answers.value = (data.scope.answers ?? {}) as ScopeAnswers;
			versions.value = data.versions;
			files.value = data.files;
			discussions.value = data.discussions;
			lastSavedAt.value = data.scope.lastSavedAt;
		} finally {
			loading.value = false;
		}
	}

	// ------------------------------------------------------------ saving
	let timer: ReturnType<typeof setTimeout> | null = null;

	async function persist(silent: boolean) {
		if (!isEditable.value) return;
		saveState.value = 'saving';
		try {
			const res = await $fetch<{ scope: Partial<ScopeRecord> }>('/api/portal/scope/save', {
				method: 'POST',
				body: { answers: answers.value, silent },
			});
			lastSavedAt.value = res.scope.lastSavedAt ?? new Date().toISOString();
			saveState.value = 'saved';
		} catch {
			// The user's typing is never discarded on a failed save.
			saveState.value = 'error';
		}
	}

	/** Debounced autosave. Deliberately raises no toast. */
	function scheduleSave(delay = 1200) {
		if (!isEditable.value) return;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => persist(true), delay);
	}

	async function saveDraft() {
		if (timer) clearTimeout(timer);
		await persist(false);
	}

	function setAnswer(key: string, value: string | string[] | null) {
		answers.value = { ...answers.value, [key]: value };
		scheduleSave();
	}

	// --------------------------------------------------------- lifecycle
	async function submit() {
		if (timer) clearTimeout(timer);
		await persist(false);
		const res = await $fetch<{ scope: ScopeRecord }>('/api/portal/scope/submit', { method: 'POST' });
		scope.value = res.scope;
		await load();
	}

	async function approve(statement?: string) {
		const res = await $fetch<{ scope: ScopeRecord }>('/api/portal/scope/approve', {
			method: 'POST',
			body: { statement },
		});
		scope.value = res.scope;
		await load();
	}

	async function reply(discussionId: string, body: string) {
		await $fetch('/api/portal/scope/reply', { method: 'POST', body: { discussionId, body } });
		await load();
	}

	async function uploadFile(file: File, questionKey: string, sectionKey: string) {
		const form = new FormData();
		form.append('file', file);
		form.append('questionKey', questionKey);
		form.append('sectionKey', sectionKey);
		const res = await $fetch<{ file: ScopeFileRecord }>('/api/portal/scope/files', { method: 'POST', body: form });
		files.value = [...files.value, res.file];
		return res.file;
	}

	async function removeFile(id: string) {
		await $fetch(`/api/portal/scope/files/${id}` as string, { method: 'DELETE' });
		files.value = files.value.filter((f) => f.id !== id);
	}

	return {
		scope,
		answers,
		files,
		discussions,
		versions,
		sections,
		loading,
		saveState,
		lastSavedAt,
		status,
		isEditable,
		isLocked,
		needsClarification,
		readyForApproval,
		awaitingOwnerApproval,
		completion,
		missing,
		canSubmit,
		openClarifications,
		visibleQuestions,
		sectionProgress,
		filesFor,
		load,
		setAnswer,
		saveDraft,
		submit,
		approve,
		reply,
		uploadFile,
		removeFile,
	};
}
