<script setup lang="ts">
/**
 * Client-side requirements review. Read-only document with the two client
 * actions — Request Changes and Approve Requirements — plus the discussion.
 *
 * The client never edits the document. Every change goes through a thread and
 * the Owner authors the next version.
 */
import { SRS_SECTIONS, PRIORITY_LABEL } from '~~/shared/srs-template';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ changed: [] }>();

const { data, pending, refresh } = await useFetch('/api/portal/requirements', {
	query: { projectId: props.projectId },
	headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
});
const doc = computed<any>(() => data.value?.document);
const requirements = computed<any[]>(() => data.value?.requirements ?? []);
const discussions = computed<any[]>(() => data.value?.discussions ?? []);
const versions = computed<any[]>(() => data.value?.versions ?? []);
const attachments = computed<any[]>(() => data.value?.attachments ?? []);

const frs = computed(() => requirements.value.filter((r) => r.kind === 'FR'));
const nfrs = computed(() => requirements.value.filter((r) => r.kind === 'NFR'));
const content = computed<Record<string, string>>(() => (doc.value?.content ?? {}) as Record<string, string>);

const locked = computed(() => doc.value?.status === 'APPROVED' || !!doc.value?.lockedAt);
const canApprove = computed(() => doc.value?.status === 'READY_FOR_APPROVAL');
const canRequest = computed(() => !!doc.value && !locked.value);
const openCount = computed(() => discussions.value.filter((d) => d.status === 'OPEN').length);
const versionLabel = computed(() => versions.value[0]?.versionLabel ?? null);

const error = ref<string | null>(null);
const notice = ref<string | null>(null);

// ---- Request changes ------------------------------------------------------
const changeModal = ref(false);
const changeBusy = ref(false);
const changeForm = reactive({ subject: '', body: '', anchor: 'document' as string });

const anchorOptions = computed(() => [
	{ value: 'document', label: 'Whole document' },
	...SRS_SECTIONS.filter((s) => !s.kind).map((s) => ({ value: `section:${s.key}`, label: `Section ${s.number} — ${s.title}` })),
	...requirements.value.map((r) => ({ value: `req:${r.ref}`, label: `${r.ref} — ${r.title}` })),
]);

function openChange(anchor = 'document') {
	changeForm.subject = '';
	changeForm.body = '';
	changeForm.anchor = anchor;
	changeModal.value = true;
}
async function submitChange() {
	changeBusy.value = true;
	error.value = null;
	try {
		const [kind, key] = changeForm.anchor.split(':');
		await $fetch('/api/portal/requirements/request-changes', {
			method: 'POST',
			body: {
				projectId: props.projectId,
				subject: changeForm.subject,
				body: changeForm.body,
				sectionKey: kind === 'section' ? key : null,
				requirementRef: kind === 'req' ? key : null,
			},
		});
		changeModal.value = false;
		notice.value = 'Your change request has been sent to Eiretech.';
		await refresh();
		emit('changed');
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not send the request.';
	} finally {
		changeBusy.value = false;
	}
}

// ---- Approve --------------------------------------------------------------
const approveModal = ref(false);
const approveBusy = ref(false);
const approveConfirm = ref(false);
const statement = ref('');

async function approve() {
	approveBusy.value = true;
	error.value = null;
	try {
		await $fetch('/api/portal/requirements/approve', {
			method: 'POST',
			body: { projectId: props.projectId, statement: statement.value || undefined },
		});
		approveModal.value = false;
		notice.value = 'Requirements approved and locked. Thank you.';
		await refresh();
		emit('changed');
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not approve.';
	} finally {
		approveBusy.value = false;
	}
}

// ---- Discussion -----------------------------------------------------------
async function reply(discussionId: string, body: string) {
	try {
		await $fetch('/api/portal/requirements/reply', { method: 'POST', body: { discussionId, body } });
		await refresh();
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not post the reply.';
	}
}
function sectionTitle(key?: string | null) {
	return SRS_SECTIONS.find((s) => s.key === key)?.title ?? null;
}

function fmtDate(v?: string | null) {
	return v ? new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
}
function fmtSize(n: number) {
	return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}

const STATUS_COPY: Record<string, string> = {
	CLIENT_REVIEW: 'Please read through the requirements. Request changes if anything is missing or unclear.',
	CHANGES_REQUESTED: 'Eiretech is working on your requested changes. You will be notified when a new version is ready.',
	READY_FOR_APPROVAL: 'All discussion points are resolved. Approve the requirements to move into planning.',
	APPROVED: 'These requirements are approved and locked. Any future change goes through a change request.',
};
</script>

<template>
	<div v-if="pending" class="py-10 text-center text-sm text-slate-500">Loading requirements…</div>

	<div v-else-if="!doc" class="p-8 text-center bg-white border shadow-sm border-slate-200 rounded-panel">
		<h2 class="text-sm font-semibold text-slate-900">Requirements not shared yet</h2>
		<p class="max-w-md mx-auto mt-2 text-sm text-slate-500">
			Once your scope is approved, Eiretech prepares the Software Requirements Specification and shares it here for your review.
		</p>
	</div>

	<div v-else class="space-y-6">
		<VAlert v-if="error" type="error">{{ error }}</VAlert>
		<VAlert v-if="notice" type="success">{{ notice }}</VAlert>

		<!-- Status header -->
		<section class="p-5 bg-white border border-slate-200 rounded-panel">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<SrsStatusBadge :status="doc.status" />
						<span v-if="versionLabel" class="text-xs text-slate-500">Version {{ versionLabel }}</span>
						<span v-if="doc.submittedForReviewAt" class="text-xs text-slate-400">· shared {{ fmtDate(doc.submittedForReviewAt) }}</span>
					</div>
					<h2 class="mt-2 text-base font-semibold text-slate-900">{{ doc.title }}</h2>
					<p class="mt-1 text-sm text-slate-500">{{ STATUS_COPY[doc.status] }}</p>
				</div>
				<div class="flex flex-wrap gap-2">
					<UButton v-if="canRequest" size="sm" color="white" label="Request changes" @click="openChange()" />
					<UButton
						v-if="canApprove"
						size="sm"
						color="green"
						label="Approve requirements"
						:disabled="openCount > 0"
						:title="openCount ? 'Open discussion points must be resolved first' : ''"
						@click="approveModal = true"
					/>
				</div>
			</div>
		</section>

		<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
			<!-- Document -->
			<div class="space-y-4 min-w-0">
				<section v-for="s in SRS_SECTIONS" :key="s.key" class="p-5 bg-white border border-slate-200 rounded-panel">
					<header class="flex flex-wrap items-baseline justify-between gap-2">
						<h3 class="text-sm font-semibold text-slate-900">
							<span class="mr-2 text-slate-400">{{ s.number }}.</span>{{ s.title }}
						</h3>
						<button
							v-if="canRequest && !s.kind"
							type="button"
							class="text-xs text-blue-700 hover:underline"
							@click="openChange(`section:${s.key}`)"
						>
							Comment on this section
						</button>
					</header>

					<div v-if="s.kind" class="mt-3 overflow-x-auto">
						<table class="w-full min-w-[560px] text-sm">
							<thead class="text-xs tracking-wide text-left uppercase text-slate-500">
								<tr class="border-b border-slate-200">
									<th class="py-2 pr-3 font-semibold">Ref</th>
									<th class="py-2 pr-3 font-semibold">Requirement</th>
									<th class="py-2 pr-3 font-semibold">Module</th>
									<th class="py-2 pr-3 font-semibold">Priority</th>
									<th v-if="canRequest" class="py-2"></th>
								</tr>
							</thead>
							<tbody class="divide-y divide-slate-100">
								<tr v-for="r in s.kind === 'requirements-fr' ? frs : nfrs" :key="r.id" class="align-top">
									<td class="py-2.5 pr-3 font-mono text-xs text-slate-600">{{ r.ref }}</td>
									<td class="py-2.5 pr-3">
										<p class="font-medium text-slate-900">{{ r.title }}</p>
										<p v-if="r.description" class="mt-0.5 whitespace-pre-line text-xs text-slate-500">{{ r.description }}</p>
										<p v-if="r.acceptanceCriteria" class="mt-1 text-xs text-slate-500">
											<span class="font-semibold">Acceptance:</span> {{ r.acceptanceCriteria }}
										</p>
									</td>
									<td class="py-2.5 pr-3 text-slate-600">{{ r.module || '—' }}</td>
									<td class="py-2.5 pr-3 text-slate-600">{{ PRIORITY_LABEL[r.priority] }}</td>
									<td v-if="canRequest" class="py-2.5 text-right whitespace-nowrap">
										<button type="button" class="text-xs text-blue-700 hover:underline" @click="openChange(`req:${r.ref}`)">
											Comment
										</button>
									</td>
								</tr>
								<tr v-if="!(s.kind === 'requirements-fr' ? frs : nfrs).length">
									<td :colspan="canRequest ? 5 : 4" class="py-5 text-xs text-center text-slate-400">None listed.</td>
								</tr>
							</tbody>
						</table>
					</div>

					<p v-else-if="content[s.key]" class="mt-3 text-sm whitespace-pre-line text-slate-700">{{ content[s.key] }}</p>
					<p v-else class="mt-3 text-xs italic text-slate-400">Not provided.</p>
				</section>
			</div>

			<!-- Side rail -->
			<aside class="space-y-4 min-w-0">
				<section class="p-5 bg-white border border-slate-200 rounded-panel">
					<h3 class="text-sm font-semibold text-slate-900">Versions</h3>
					<ul v-if="versions.length" class="mt-3 space-y-2 text-sm">
						<li v-for="v in versions" :key="v.id" class="flex justify-between gap-2">
							<span class="font-medium text-slate-800">Version {{ v.versionLabel }}</span>
							<span class="text-xs text-slate-400">{{ fmtDate(v.sentAt) }}</span>
						</li>
					</ul>
				</section>

				<section class="p-5 bg-white border border-slate-200 rounded-panel">
					<h3 class="text-sm font-semibold text-slate-900">Attachments</h3>
					<ul v-if="attachments.length" class="mt-3 text-sm divide-y divide-slate-100">
						<li v-for="a in attachments" :key="a.id" class="flex items-center justify-between gap-2 py-2">
							<a :href="`/api/srs-attachments/${a.id}`" class="min-w-0 text-blue-700 truncate hover:underline">{{ a.originalName }}</a>
							<span class="text-xs shrink-0 text-slate-400">{{ fmtSize(a.sizeBytes) }}</span>
						</li>
					</ul>
					<p v-else class="mt-3 text-xs text-slate-400">No files attached.</p>
				</section>

				<section v-if="locked" class="p-5 border border-green-200 bg-green-50 rounded-panel">
					<h3 class="text-sm font-semibold text-green-800">Approved &amp; locked</h3>
					<p class="mt-1 text-xs text-green-800">Approved on {{ fmtDate(doc.approvedAt) }}.</p>
				</section>
			</aside>
		</div>

		<!-- Discussion -->
		<section class="space-y-3">
			<h3 class="text-sm font-semibold text-slate-900">
				Discussion
				<span v-if="openCount" class="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{{ openCount }} open</span>
			</h3>
			<p v-if="!discussions.length" class="p-6 text-xs text-center border border-dashed rounded-panel border-slate-200 text-slate-400">
				No discussion yet. Use “Request changes” or the comment links to raise a point.
			</p>
			<SrsDiscussionThread
				v-for="d in discussions"
				:key="d.id"
				:discussion="d"
				side="CLIENT"
				:view-only="locked"
				:section-title="sectionTitle(d.sectionKey)"
				@reply="reply"
			/>
		</section>

		<!-- Request changes modal -->
		<UModal v-model="changeModal">
			<form class="p-6 space-y-4" @submit.prevent="submitChange">
				<h3 class="text-base font-semibold text-slate-900">Request changes</h3>
				<p class="text-sm text-slate-500">Tell Eiretech what needs to change. A new version will be prepared for you.</p>
				<UFormGroup label="Relates to">
					<USelect v-model="changeForm.anchor" :options="anchorOptions" />
				</UFormGroup>
				<UFormGroup label="Subject" required>
					<UInput v-model="changeForm.subject" placeholder="Short summary" />
				</UFormGroup>
				<UFormGroup label="Details" required>
					<UTextarea v-model="changeForm.body" :rows="4" autoresize placeholder="Describe the change you need" />
				</UFormGroup>
				<div class="flex justify-end gap-2 pt-2">
					<UButton color="white" label="Cancel" @click="changeModal = false" />
					<UButton type="submit" label="Send request" :loading="changeBusy" :disabled="!changeForm.subject.trim() || !changeForm.body.trim()" />
				</div>
			</form>
		</UModal>

		<!-- Approve modal -->
		<UModal v-model="approveModal">
			<form class="p-6 space-y-4" @submit.prevent="approve">
				<h3 class="text-base font-semibold text-slate-900">Approve requirements {{ versionLabel }}</h3>
				<p class="text-sm text-slate-500">
					Approval locks this document. Eiretech will build against these requirements; later changes go through a formal change request.
				</p>
				<UFormGroup label="Note (optional)">
					<UTextarea v-model="statement" :rows="2" autoresize placeholder="Anything to note with your approval" />
				</UFormGroup>
				<UCheckbox v-model="approveConfirm" label="I have read the requirements and approve this version." />
				<div class="flex justify-end gap-2 pt-2">
					<UButton color="white" label="Cancel" @click="approveModal = false" />
					<UButton type="submit" color="green" label="Approve and lock" :loading="approveBusy" :disabled="!approveConfirm" />
				</div>
			</form>
		</UModal>
	</div>
</template>
