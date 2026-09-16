<script setup lang="ts">
/**
 * Owner-side SRS workspace: structured sections, requirements tables,
 * attachments, versions, discussions and the release actions.
 *
 * The approved Scope is shown alongside as reference only. Nothing is copied
 * from it automatically — the Owner authors every requirement.
 */
import {
	SRS_SECTIONS,
	REQUIREMENT_PRIORITIES,
	PRIORITY_LABEL,
	CLIENT_VISIBLE_SRS_STATUSES,
} from '~~/shared/srs-template';
import { UPLOAD_ACCEPT } from '~~/shared/uploads';
import { SCOPE_SECTIONS, visibleQuestions } from '~~/shared/scope-questionnaire';

const props = defineProps<{ srsId: string }>();
const emit = defineEmits<{ changed: [] }>();

const { data, pending, refresh } = await useFetch(`/api/admin/srs/${props.srsId}`, {
	headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
});
const doc = computed<any>(() => data.value?.document);
const scope = computed<any>(() => data.value?.scope);

const EDITABLE = ['DRAFT', 'INTERNAL_REVIEW', 'CHANGES_REQUESTED'];
const editable = computed(() => !!doc.value && !doc.value.lockedAt && EDITABLE.includes(doc.value.status));
const locked = computed(() => !!doc.value?.lockedAt || doc.value?.status === 'APPROVED');
const withClient = computed(() => !!doc.value && CLIENT_VISIBLE_SRS_STATUSES.includes(doc.value.status) && !locked.value);

const error = ref<string | null>(null);
const notice = ref<string | null>(null);

// ---- Section text with debounced autosave --------------------------------
const content = reactive<Record<string, string>>({});
const title = ref('');
watch(
	doc,
	(d) => {
		if (!d) return;
		title.value = d.title ?? '';
		for (const s of SRS_SECTIONS) content[s.key] = (d.content as any)?.[s.key] ?? '';
	},
	{ immediate: true },
);

const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

function queueSave() {
	if (!editable.value) return;
	dirty = true;
	saveState.value = 'idle';
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => flush(true), 1200);
}

async function flush(silent: boolean) {
	if (!dirty && silent) return;
	saveState.value = 'saving';
	try {
		await $fetch(`/api/admin/srs/${props.srsId}`, {
			method: 'PATCH',
			body: { title: title.value || undefined, content: { ...content }, silent },
		});
		dirty = false;
		saveState.value = 'saved';
		if (!silent) {
			notice.value = 'Draft saved.';
			await refresh();
		}
	} catch (e: any) {
		saveState.value = 'error';
		error.value = e?.data?.statusMessage ?? 'Could not save.';
	}
}

onBeforeUnmount(() => {
	if (timer) clearTimeout(timer);
	if (dirty) flush(true);
});

// ---- Requirements ---------------------------------------------------------
const reqs = computed<any[]>(() => (doc.value?.requirements ?? []).filter((r: any) => r.state !== 'REMOVED'));
const frs = computed(() => reqs.value.filter((r) => r.kind === 'FR'));
const nfrs = computed(() => reqs.value.filter((r) => r.kind === 'NFR'));

const reqModal = ref(false);
const reqBusy = ref(false);
const reqForm = reactive({
	requirementId: undefined as string | undefined,
	kind: 'FR' as 'FR' | 'NFR',
	title: '',
	description: '',
	module: '',
	priority: 'MUST_HAVE',
	state: 'DRAFT',
	acceptanceCriteria: '',
});

function openNewReq(kind: 'FR' | 'NFR') {
	Object.assign(reqForm, {
		requirementId: undefined,
		kind,
		title: '',
		description: '',
		module: '',
		priority: 'MUST_HAVE',
		state: 'DRAFT',
		acceptanceCriteria: '',
	});
	reqModal.value = true;
}
function openEditReq(r: any) {
	Object.assign(reqForm, {
		requirementId: r.id,
		kind: r.kind,
		title: r.title,
		description: r.description ?? '',
		module: r.module ?? '',
		priority: r.priority,
		state: r.state,
		acceptanceCriteria: r.acceptanceCriteria ?? '',
	});
	reqModal.value = true;
}
async function saveReq() {
	reqBusy.value = true;
	error.value = null;
	try {
		await $fetch(`/api/admin/srs/${props.srsId}/requirements`, { method: 'POST', body: { ...reqForm } });
		reqModal.value = false;
		await refresh();
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not save the requirement.';
	} finally {
		reqBusy.value = false;
	}
}
async function removeReq(r: any) {
	if (!confirm(`Remove ${r.ref}? Its reference will not be reused.`)) return;
	try {
		await $fetch(`/api/admin/srs/${props.srsId}/requirements`, {
			method: 'POST',
			body: { requirementId: r.id, title: r.title, state: 'REMOVED' },
		});
		await refresh();
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not remove the requirement.';
	}
}

// ---- Attachments ----------------------------------------------------------
const uploading = ref(false);
async function onFile(e: Event) {
	const input = e.target as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;
	uploading.value = true;
	error.value = null;
	try {
		const fd = new FormData();
		fd.append('file', file);
		await $fetch(`/api/admin/srs/${props.srsId}/attachments`, { method: 'POST', body: fd });
		await refresh();
	} catch (err: any) {
		error.value = err?.data?.statusMessage ?? 'Upload failed.';
	} finally {
		uploading.value = false;
		input.value = '';
	}
}

// ---- Release actions ------------------------------------------------------
const acting = ref(false);
async function act(path: 'send' | 'ready') {
	const msg =
		path === 'send'
			? 'Send this version to the client for review? The version is frozen and cannot be edited afterwards.'
			: 'Mark the current version ready for client approval?';
	if (!confirm(msg)) return;
	acting.value = true;
	error.value = null;
	try {
		if (dirty) await flush(true);
		await $fetch(`/api/admin/srs/${props.srsId}/${path}`, { method: 'POST' });
		await refresh();
		emit('changed');
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Action failed.';
	} finally {
		acting.value = false;
	}
}

// ---- Discussions ----------------------------------------------------------
const discussions = computed<any[]>(() => doc.value?.discussions ?? []);
const openCount = computed(() => discussions.value.filter((d) => d.status === 'OPEN').length);
async function reply(discussionId: string, body: string) {
	try {
		await $fetch('/api/admin/srs-discussions/reply', { method: 'POST', body: { discussionId, body } });
		await refresh();
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not post the reply.';
	}
}
async function resolve(discussionId: string) {
	try {
		await $fetch('/api/admin/srs-discussions/resolve', { method: 'POST', body: { discussionId } });
		await refresh();
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not resolve.';
	}
}
function sectionTitle(key?: string | null) {
	return SRS_SECTIONS.find((s) => s.key === key)?.title ?? null;
}

// ---- Scope reference ------------------------------------------------------
const showScope = ref(false);
const scopeAnswers = computed(() => (scope.value?.answers ?? {}) as Record<string, any>);
function fmtAnswer(v: any) {
	if (Array.isArray(v)) return v.join(', ');
	return v ?? '—';
}

const versionLabel = computed(() => (doc.value?.currentVersion ? `1.${doc.value.currentVersion - 1}` : null));
const nextLabel = computed(() => (doc.value?.currentVersion ? `1.${doc.value.currentVersion}` : '1.0'));

function fmtDate(v?: string | null) {
	return v
		? new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
		: '—';
}
function fmtSize(n: number) {
	return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}
</script>

<template>
	<div v-if="pending" class="py-10 text-center text-sm text-slate-500">Loading requirements…</div>

	<div v-else-if="doc" class="space-y-6">
		<VAlert v-if="error" type="error">{{ error }}</VAlert>
		<VAlert v-if="notice" type="success">{{ notice }}</VAlert>

		<!-- Status strip -->
		<section class="p-5 bg-white border border-slate-200 rounded-panel">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<SrsStatusBadge :status="doc.status" />
						<span class="text-xs text-slate-500">
							{{ versionLabel ? `Version ${versionLabel}` : 'Unreleased draft' }}
						</span>
						<span v-if="locked" class="text-xs font-semibold text-green-700">Locked {{ fmtDate(doc.lockedAt) }}</span>
					</div>
					<p class="mt-2 text-xs text-slate-500">
						<template v-if="editable">Draft is editable. Changes autosave.</template>
						<template v-else-if="withClient">
							This version is with the client. Editing reopens when they request changes.
						</template>
						<template v-else-if="locked">Requirements approved by the client and locked. No further edits.</template>
					</p>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<span v-if="saveState === 'saving'" class="text-xs text-slate-400">Saving…</span>
					<span v-else-if="saveState === 'saved'" class="text-xs text-slate-400">Saved</span>
					<UButton v-if="editable" size="sm" color="white" label="Save draft" @click="flush(false)" />
					<UButton
						v-if="editable"
						size="sm"
						:label="`Send version ${nextLabel} to client`"
						:loading="acting"
						@click="act('send')"
					/>
					<UButton
						v-if="doc.status === 'CLIENT_REVIEW'"
						size="sm"
						color="indigo"
						label="Mark ready for approval"
						:loading="acting"
						:disabled="openCount > 0"
						:title="openCount ? 'Resolve open discussion points first' : ''"
						@click="act('ready')"
					/>
				</div>
			</div>
		</section>

		<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
			<!-- Document body -->
			<div class="space-y-5 min-w-0">
				<section class="p-5 bg-white border border-slate-200 rounded-panel">
					<UFormGroup label="Document title">
						<UInput v-model="title" size="lg" :disabled="!editable" @input="queueSave" />
					</UFormGroup>
				</section>

				<section
					v-for="s in SRS_SECTIONS"
					:id="`srs-${s.key}`"
					:key="s.key"
					class="p-5 bg-white border border-slate-200 rounded-panel"
				>
					<header class="flex flex-wrap items-baseline justify-between gap-2">
						<h3 class="text-sm font-semibold text-slate-900">
							<span class="mr-2 text-slate-400">{{ s.number }}.</span>{{ s.title }}
						</h3>
						<UButton
							v-if="s.kind === 'requirements-fr' && editable"
							size="xs"
							color="white"
							icon="i-heroicons-plus"
							label="Add functional requirement"
							@click="openNewReq('FR')"
						/>
						<UButton
							v-else-if="s.kind === 'requirements-nfr' && editable"
							size="xs"
							color="white"
							icon="i-heroicons-plus"
							label="Add non-functional requirement"
							@click="openNewReq('NFR')"
						/>
					</header>
					<p v-if="s.hint" class="mt-1 text-xs text-slate-500">{{ s.hint }}</p>

					<!-- Requirements table -->
					<div v-if="s.kind" class="mt-4 overflow-x-auto">
						<table class="w-full min-w-[640px] text-sm">
							<thead class="text-xs tracking-wide text-left uppercase text-slate-500">
								<tr class="border-b border-slate-200">
									<th class="py-2 pr-3 font-semibold">Ref</th>
									<th class="py-2 pr-3 font-semibold">Title</th>
									<th class="py-2 pr-3 font-semibold">Module</th>
									<th class="py-2 pr-3 font-semibold">Priority</th>
									<th class="py-2 pr-3 font-semibold">State</th>
									<th v-if="editable" class="py-2 font-semibold"></th>
								</tr>
							</thead>
							<tbody class="divide-y divide-slate-100">
								<tr v-for="r in s.kind === 'requirements-fr' ? frs : nfrs" :key="r.id" class="align-top">
									<td class="py-2.5 pr-3 font-mono text-xs text-slate-600">{{ r.ref }}</td>
									<td class="py-2.5 pr-3">
										<p class="font-medium text-slate-900">{{ r.title }}</p>
										<p v-if="r.description" class="mt-0.5 whitespace-pre-line text-xs text-slate-500">
											{{ r.description }}
										</p>
										<p v-if="r.acceptanceCriteria" class="mt-1 text-xs text-slate-500">
											<span class="font-semibold">Acceptance:</span> {{ r.acceptanceCriteria }}
										</p>
									</td>
									<td class="py-2.5 pr-3 text-slate-600">{{ r.module || '—' }}</td>
									<td class="py-2.5 pr-3 text-slate-600">{{ PRIORITY_LABEL[r.priority] }}</td>
									<td class="py-2.5 pr-3">
										<span
											class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
											:class="r.state === 'CONFIRMED' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'"
										>
											{{ r.state === 'CONFIRMED' ? 'Confirmed' : 'Draft' }}
										</span>
									</td>
									<td v-if="editable" class="py-2.5 text-right whitespace-nowrap">
										<UButton size="2xs" color="white" label="Edit" @click="openEditReq(r)" />
										<UButton size="2xs" color="white" class="ml-1 text-red-600" label="Remove" @click="removeReq(r)" />
									</td>
								</tr>
								<tr v-if="!(s.kind === 'requirements-fr' ? frs : nfrs).length">
									<td :colspan="editable ? 6 : 5" class="py-6 text-xs text-center text-slate-400">
										No requirements yet.
									</td>
								</tr>
							</tbody>
						</table>
					</div>

					<!-- Free text -->
					<UTextarea
						v-else
						v-model="content[s.key]"
						class="mt-3"
						:rows="4"
						autoresize
						:disabled="!editable"
						:placeholder="editable ? 'Write this section…' : ''"
						@input="queueSave"
					/>
				</section>
			</div>

			<!-- Side rail -->
			<aside class="space-y-5 min-w-0">
				<section class="p-5 bg-white border border-slate-200 rounded-panel">
					<h3 class="text-sm font-semibold text-slate-900">Attachments</h3>
					<p class="mt-1 text-xs text-slate-500">Prepared SRS files (PDF/DOCX) or supporting material.</p>
					<ul v-if="doc.attachments?.length" class="mt-3 text-sm divide-y divide-slate-100">
						<li v-for="a in doc.attachments" :key="a.id" class="flex items-center justify-between gap-2 py-2">
							<a :href="`/api/srs-attachments/${a.id}`" class="min-w-0 text-blue-700 truncate hover:underline">
								{{ a.originalName }}
							</a>
							<span class="text-xs shrink-0 text-slate-400">{{ fmtSize(a.sizeBytes) }}</span>
						</li>
					</ul>
					<p v-else class="mt-3 text-xs text-slate-400">Nothing uploaded.</p>
					<label v-if="!locked" class="block mt-3">
						<span class="sr-only">Upload file</span>
						<input
							type="file"
							:accept="UPLOAD_ACCEPT"
							class="block w-full text-xs text-slate-500 file:mr-3 file:rounded-button file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium"
							:disabled="uploading"
							@change="onFile"
						/>
					</label>
				</section>

				<section class="p-5 bg-white border border-slate-200 rounded-panel">
					<h3 class="text-sm font-semibold text-slate-900">Versions</h3>
					<ul v-if="doc.versions?.length" class="mt-3 space-y-2 text-sm">
						<li v-for="v in doc.versions" :key="v.id" class="flex justify-between gap-2">
							<span class="font-medium text-slate-800">Version {{ v.versionLabel }}</span>
							<span class="text-xs text-slate-400">{{ fmtDate(v.sentAt) }}</span>
						</li>
					</ul>
					<p v-else class="mt-3 text-xs text-slate-400">No version sent yet.</p>
				</section>

				<section v-if="doc.approvals?.length" class="p-5 border border-green-200 bg-green-50 rounded-panel">
					<h3 class="text-sm font-semibold text-green-800">Approval</h3>
					<p class="mt-1 text-xs text-green-800">
						Version {{ doc.approvals[0].versionLabel }} approved by the client on
						{{ fmtDate(doc.approvals[0].clientApprovedAt) }}.
					</p>
					<p v-if="doc.approvals[0].clientStatement" class="mt-2 text-xs italic text-green-900">
						“{{ doc.approvals[0].clientStatement }}”
					</p>
				</section>

				<section class="p-5 bg-white border border-slate-200 rounded-panel">
					<button type="button" class="flex items-center justify-between w-full text-left" @click="showScope = !showScope">
						<h3 class="text-sm font-semibold text-slate-900">Approved Scope (reference)</h3>
						<UIcon
							:name="showScope ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
							class="w-4 h-4 text-slate-400"
						/>
					</button>
					<p class="mt-1 text-xs text-slate-500">Read-only. Nothing is copied automatically.</p>
					<div v-if="showScope && scope" class="mt-3 max-h-[60vh] space-y-4 overflow-y-auto pr-1 text-xs">
						<div v-for="sec in SCOPE_SECTIONS" :key="sec.key">
							<p class="font-semibold text-slate-700">{{ sec.number }}. {{ sec.title }}</p>
							<dl class="mt-1 space-y-1">
								<div v-for="q in visibleQuestions(sec.key, scopeAnswers)" :key="q.key">
									<dt class="text-slate-500">{{ q.label }}</dt>
									<dd class="whitespace-pre-line text-slate-800">{{ fmtAnswer(scopeAnswers[q.key]) }}</dd>
								</div>
							</dl>
						</div>
					</div>
					<p v-else-if="showScope" class="mt-3 text-xs text-slate-400">Scope not available.</p>
				</section>
			</aside>
		</div>

		<!-- Discussions -->
		<section class="space-y-3">
			<h3 class="text-sm font-semibold text-slate-900">
				Discussion
				<span
					v-if="openCount"
					class="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"
				>
					{{ openCount }} open
				</span>
			</h3>
			<p
				v-if="!discussions.length"
				class="p-6 text-xs text-center border border-dashed rounded-panel border-slate-200 text-slate-400"
			>
				No change requests or questions from the client yet.
			</p>
			<SrsDiscussionThread
				v-for="d in discussions"
				:key="d.id"
				:discussion="d"
				side="EIRETECH"
				can-resolve
				:view-only="locked"
				:section-title="sectionTitle(d.sectionKey)"
				@reply="reply"
				@resolve="resolve"
			/>
		</section>

		<!-- Requirement modal -->
		<UModal v-model="reqModal">
			<form class="p-6 space-y-4" @submit.prevent="saveReq">
				<h3 class="text-base font-semibold text-slate-900">
					{{
						reqForm.requirementId
							? 'Edit requirement'
							: `New ${reqForm.kind === 'FR' ? 'functional' : 'non-functional'} requirement`
					}}
				</h3>
				<UFormGroup label="Title" required>
					<UInput v-model="reqForm.title" autofocus />
				</UFormGroup>
				<UFormGroup label="Description">
					<UTextarea v-model="reqForm.description" :rows="3" autoresize />
				</UFormGroup>
				<div class="grid gap-4 sm:grid-cols-2">
					<UFormGroup label="Module">
						<UInput v-model="reqForm.module" placeholder="e.g. Authentication" />
					</UFormGroup>
					<UFormGroup label="Priority">
						<USelect
							v-model="reqForm.priority"
							:options="REQUIREMENT_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))"
						/>
					</UFormGroup>
				</div>
				<UFormGroup label="State">
					<USelect
						v-model="reqForm.state"
						:options="[
							{ value: 'DRAFT', label: 'Draft' },
							{ value: 'CONFIRMED', label: 'Confirmed' },
						]"
					/>
				</UFormGroup>
				<UFormGroup label="Acceptance criteria">
					<UTextarea v-model="reqForm.acceptanceCriteria" :rows="2" autoresize />
				</UFormGroup>
				<div class="flex justify-end gap-2 pt-2">
					<UButton color="white" label="Cancel" @click="reqModal = false" />
					<UButton type="submit" label="Save requirement" :loading="reqBusy" :disabled="!reqForm.title.trim()" />
				</div>
			</form>
		</UModal>
	</div>
</template>
