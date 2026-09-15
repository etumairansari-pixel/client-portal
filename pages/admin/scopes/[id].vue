<script setup lang="ts">
import { SCOPE_SECTIONS, visibleQuestions, type ScopeAnswers } from '~~/shared/scope-questionnaire';

const route = useRoute();
const id = route.params.id as string;

const { data, pending, refresh } = await useFetch<{ scope: any }>(`/api/admin/scopes/${id}`);
const scope = computed(() => data.value?.scope);
const answers = computed<ScopeAnswers>(() => (scope.value?.answers ?? {}) as ScopeAnswers);

useHead({ title: () => scope.value?.organization?.name ?? 'Scope' });

const busy = ref(false);
const error = ref<string | null>(null);

async function call(path: string, body?: Record<string, unknown>) {
	busy.value = true;
	error.value = null;
	try {
		await $fetch(path as string, { method: 'POST', body });
		await refresh();
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Action failed.';
	} finally {
		busy.value = false;
	}
}

const startReview = () => call(`/api/admin/scopes/${id}/status`, { status: 'UNDER_REVIEW' });
const markReady = () => call(`/api/admin/scopes/${id}/status`, { status: 'READY_FOR_APPROVAL' });
const finalApprove = () => call(`/api/admin/scopes/${id}/approve`);

// ---- clarification ----
const showAsk = ref(false);
const ask = reactive({ subject: '', body: '', requiresClientResponse: true });

async function sendClarification() {
	if (!ask.subject.trim() || !ask.body.trim()) return;
	await call(`/api/admin/scopes/${id}/discussions`, { ...ask });
	ask.subject = '';
	ask.body = '';
	showAsk.value = false;
}

const replies = reactive<Record<string, string>>({});
async function sendReply(discussionId: string) {
	if (!replies[discussionId]?.trim()) return;
	await call('/api/admin/scope-discussions/reply', { discussionId, body: replies[discussionId] });
	replies[discussionId] = '';
}
const resolve = (discussionId: string) => call('/api/admin/scope-discussions/resolve', { discussionId });

const STATUS_COLOR: Record<string, string> = {
	DRAFT: 'gray',
	SUBMITTED: 'blue',
	UNDER_REVIEW: 'blue',
	CLARIFICATION_REQUIRED: 'amber',
	READY_FOR_APPROVAL: 'violet',
	APPROVED: 'green',
};

function label(s?: string) {
	if (!s) return '';
	return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmt(v?: string | null) {
	if (!v) return '—';
	return new Date(v).toLocaleString();
}
function formatSize(b: number) {
	return b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

const isLocked = computed(() => scope.value?.status === 'APPROVED');
</script>

<template>
	<div v-if="pending" class="py-16 text-sm text-center text-slate-500">Loading scope…</div>

	<div v-else-if="scope" class="space-y-6">
		<header class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<VBreadcrumbs :items="[{ title: 'Scopes', href: '/admin/scopes' }, { title: scope.organization?.name }]" />
				<h1 class="mt-1 text-2xl font-bold tracking-tight font-display text-slate-900">
					{{ scope.organization?.name }}
				</h1>
				<div class="flex flex-wrap items-center gap-2 mt-2">
					<UBadge :color="STATUS_COLOR[scope.status]" variant="subtle" size="xs">{{ label(scope.status) }}</UBadge>
					<span class="text-xs text-slate-400">
						{{ scope.completionPercentage }}% complete · v{{ scope.currentVersion }}
						<span v-if="scope.project"> · {{ scope.project.name }}</span>
					</span>
				</div>
			</div>

			<div class="flex flex-wrap gap-2">
				<UButton
					v-if="scope.status === 'SUBMITTED'"
					size="sm"
					label="Start Review"
					:loading="busy"
					@click="startReview"
				/>
				<UButton
					v-if="!isLocked && scope.status !== 'DRAFT'"
					size="sm"
					color="white"
					label="Request Clarification"
					:loading="busy"
					@click="showAsk = !showAsk"
				/>
				<UButton
					v-if="scope.status === 'UNDER_REVIEW'"
					size="sm"
					color="white"
					label="Mark Ready for Approval"
					:loading="busy"
					@click="markReady"
				/>
				<UButton
					v-if="scope.status === 'READY_FOR_APPROVAL' && scope.clientApprovedAt"
					size="sm"
					label="Final Approve & Lock"
					:loading="busy"
					@click="finalApprove"
				/>
			</div>
		</header>

		<VAlert v-if="error" type="error">{{ error }}</VAlert>

		<section v-if="isLocked" class="p-5 border shadow-sm bg-green-50 border-green-200 rounded-panel">
			<h2 class="text-sm font-semibold text-green-900">Scope approved and locked</h2>
			<p class="mt-1 text-sm text-green-800">
				Approved {{ fmt(scope.approvedAt) }} at version {{ scope.currentVersion }}. Neither side can edit it now —
				further changes go through a change request.
			</p>
		</section>

		<section
			v-else-if="scope.status === 'READY_FOR_APPROVAL' && !scope.clientApprovedAt"
			class="p-5 border shadow-sm bg-violet-50 border-violet-200 rounded-panel"
		>
			<h2 class="text-sm font-semibold text-violet-900">Waiting on the client</h2>
			<p class="mt-1 text-sm text-violet-800">The client has been asked to review and approve this scope.</p>
		</section>

		<!-- ask clarification -->
		<section v-if="showAsk" class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
			<h2 class="text-sm font-semibold text-slate-900">Request clarification</h2>
			<div class="mt-3 space-y-3">
				<UFormGroup label="Subject" required>
					<UInput v-model="ask.subject" size="lg" placeholder="e.g. Inventory sync between POS and store" />
				</UFormGroup>
				<UFormGroup label="Question" required>
					<UTextarea v-model="ask.body" :rows="3" placeholder="What do you need the client to clarify?" />
				</UFormGroup>
				<label class="flex items-center gap-2 text-sm text-slate-600">
					<input v-model="ask.requiresClientResponse" type="checkbox" class="text-blue-600 rounded" />
					Block the scope until the client replies
				</label>
				<div class="flex justify-end gap-2">
					<UButton color="white" size="sm" label="Cancel" @click="showAsk = false" />
					<UButton
						size="sm"
						label="Send to client"
						:loading="busy"
						:disabled="!ask.subject.trim() || !ask.body.trim()"
						@click="sendClarification"
					/>
				</div>
			</div>
		</section>

		<!-- discussions -->
		<section v-if="scope.discussions?.length" class="space-y-4">
			<h2 class="text-sm font-semibold text-slate-900">Discussion</h2>
			<article
				v-for="d in scope.discussions"
				:key="d.id"
				class="bg-white border shadow-sm border-slate-200 rounded-panel"
			>
				<header class="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
					<p class="text-sm font-medium text-slate-900">{{ d.subject }}</p>
					<div class="flex items-center gap-2">
						<UBadge :color="d.status === 'OPEN' ? 'amber' : 'green'" variant="subtle" size="xs">
							{{ d.status === 'OPEN' ? 'Open' : 'Resolved' }}
						</UBadge>
						<UButton
							v-if="d.status === 'OPEN' && !isLocked"
							size="xs"
							variant="ghost"
							label="Resolve"
							:loading="busy"
							@click="resolve(d.id)"
						/>
					</div>
				</header>

				<ul class="px-5 py-3 space-y-3">
					<li v-for="m in d.messages" :key="m.id" class="flex gap-3">
						<span
							class="flex-shrink-0 rounded-button px-2 py-0.5 text-xs font-semibold h-fit"
							:class="m.authorSide === 'EIRETECH' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'"
						>
							{{ m.authorSide === 'EIRETECH' ? 'Eiretech' : 'Client' }}
						</span>
						<div class="min-w-0">
							<p class="text-sm whitespace-pre-line text-slate-700">{{ m.body }}</p>
							<p class="mt-0.5 text-xs text-slate-400">{{ fmt(m.createdAt) }}</p>
						</div>
					</li>
				</ul>

				<div v-if="d.status === 'OPEN' && !isLocked" class="px-5 py-3 border-t border-slate-100">
					<UTextarea v-model="replies[d.id]" :rows="2" placeholder="Reply to the client…" />
					<div class="flex justify-end mt-2">
						<UButton size="sm" label="Send" :loading="busy" :disabled="!replies[d.id]?.trim()" @click="sendReply(d.id)" />
					</div>
				</div>
			</article>
		</section>

		<div class="grid gap-5 lg:grid-cols-2">
			<section class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
				<h2 class="text-sm font-semibold text-slate-900">Version history</h2>
				<ul v-if="scope.versions?.length" class="mt-3 divide-y divide-slate-100">
					<li v-for="v in scope.versions" :key="v.id" class="flex justify-between gap-3 py-2 text-sm">
						<span class="text-slate-700">Version {{ v.versionNumber }}</span>
						<span class="text-xs text-slate-400">{{ fmt(v.submittedAt) }}</span>
					</li>
				</ul>
				<p v-else class="mt-3 text-sm text-slate-500">Not submitted yet.</p>
			</section>

			<section class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
				<h2 class="text-sm font-semibold text-slate-900">Uploads</h2>
				<ul v-if="scope.files?.length" class="mt-3 divide-y divide-slate-100">
					<li v-for="f in scope.files" :key="f.id" class="flex items-center justify-between gap-3 py-2">
						<a
							:href="`/api/portal/scope/files/${f.id}`"
							class="min-w-0 text-sm truncate text-slate-700 hover:text-blue-700"
						>
							{{ f.originalName }}
						</a>
						<span class="text-xs whitespace-nowrap text-slate-400">{{ formatSize(f.sizeBytes) }}</span>
					</li>
				</ul>
				<p v-else class="mt-3 text-sm text-slate-500">No uploads.</p>
			</section>
		</div>

		<!-- answers -->
		<section class="space-y-4">
			<h2 class="text-sm font-semibold text-slate-900">Submitted answers</h2>
			<article
				v-for="section in SCOPE_SECTIONS.filter((x) => x.questions.length)"
				:key="section.key"
				class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel"
			>
				<h3 class="text-sm font-semibold text-slate-900">
					<span class="mr-2 text-slate-400">{{ section.number }}</span>{{ section.title }}
				</h3>
				<dl class="mt-3 space-y-3">
					<div v-for="q in visibleQuestions(section.key, answers)" :key="q.key">
						<dt class="text-xs font-medium text-slate-500">{{ q.label }}</dt>
						<dd class="mt-0.5 text-sm whitespace-pre-line text-slate-800">
							<template v-if="Array.isArray(answers[q.key])">
								{{ (answers[q.key] as string[]).join(', ') || '—' }}
							</template>
							<template v-else-if="answers[q.key]">{{ answers[q.key] }}</template>
							<span v-else class="italic text-slate-400">Not answered</span>
						</dd>
					</div>
				</dl>
			</article>
		</section>
	</div>
</template>
