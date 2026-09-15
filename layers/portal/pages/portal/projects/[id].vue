<script setup lang="ts">
/**
 * Client PROJECT WORKSPACE. Everything shown here comes from the client
 * workspace endpoint, which already filters to client-visible rows and strips
 * every internal field. Nothing on this page can change stage, progress or
 * status - the client's only write actions are change requests and replies.
 */
import type { WorkspaceTab } from '~/components/WorkspaceTabs.vue';
import { STAGE_LABEL, HEALTH_LABEL, TEAM_LABEL, CHANGE_REQUEST_TYPES, CR_TYPE_LABEL, PRIORITIES, PRIORITY_LABEL } from '~~/shared/delivery';

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;

const { data, pending, error, refresh } = await useFetch(`/api/portal/projects/${id}/workspace`, {
	headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
});
const project = computed<any>(() => data.value?.project);
const scope = computed<any>(() => data.value?.scope);
const srs = computed<any>(() => data.value?.srs);
const milestones = computed<any[]>(() => data.value?.milestones ?? []);
const tasks = computed<any[]>(() => data.value?.tasks ?? []);
const updates = computed<any[]>(() => data.value?.updates ?? []);
const changeRequests = computed<any[]>(() => data.value?.changeRequests ?? []);
const files = computed<any[]>(() => data.value?.files ?? []);
const actions = computed<any[]>(() => data.value?.actionsRequired ?? []);
const overallProgress = computed<number | null>(() => data.value?.overallProgress ?? null);
const nextMilestone = computed<any>(() => data.value?.nextMilestone ?? null);

useHead({ title: () => project.value?.name ?? 'Project' });

const SCOPE_LABEL: Record<string, string> = {
	DRAFT: 'In progress',
	SUBMITTED: 'Submitted',
	UNDER_REVIEW: 'Under review',
	CLARIFICATION_REQUIRED: 'Clarification required',
	READY_FOR_APPROVAL: 'Ready for approval',
	APPROVED: 'Approved',
};

const TABS: WorkspaceTab[] = [
	{ key: 'overview', label: 'Overview' },
	{ key: 'scope', label: 'Scope' },
	{ key: 'requirements', label: 'Requirements' },
	{ key: 'milestones', label: 'Milestones' },
	{ key: 'updates', label: 'Updates' },
	{ key: 'changes', label: 'Change Requests' },
	{ key: 'files', label: 'Files' },
];
const enabledKeys = TABS.map((t) => t.key);
const tab = computed({
	get: () => (enabledKeys.includes(String(route.query.tab)) ? String(route.query.tab) : 'overview'),
	set: (v: string) => router.replace({ query: { ...route.query, tab: v === 'overview' ? undefined : v } }),
});

// ---- Ongoing work (client-visible tasks only, already filtered server-side)
const ongoing = computed(() => tasks.value.filter((t) => t.status !== 'COMPLETED').slice(0, 8));
const recentlyDone = computed(() => tasks.value.filter((t) => t.status === 'COMPLETED').slice(-3));

// ---- Request a change -----------------------------------------------------
const crError = ref<string | null>(null);
const crModal = ref(false);
const crBusy = ref(false);
const crForm = reactive({ type: 'CHANGE_REQUEST', title: '', description: '', priority: 'MEDIUM', relatedMilestoneId: '' });
const crFile = ref<File | null>(null);
function openRequest() {
	Object.assign(crForm, { type: 'CHANGE_REQUEST', title: '', description: '', priority: 'MEDIUM', relatedMilestoneId: '' });
	crFile.value = null;
	crModal.value = true;
}
async function submitRequest() {
	crBusy.value = true;
	crError.value = null;
	try {
		const r = await $fetch<{ changeRequest: { id: string } }>(`/api/portal/projects/${id}/change-requests`, {
			method: 'POST',
			body: { ...crForm, relatedMilestoneId: crForm.relatedMilestoneId || null },
		});
		if (crFile.value) {
			const fd = new FormData();
			fd.append('file', crFile.value);
			await $fetch(`/api/portal/change-requests/${r.changeRequest.id}/attachments`, { method: 'POST', body: fd });
		}
		crModal.value = false;
		await refresh();
		router.replace({ query: { tab: 'changes', cr: r.changeRequest.id } });
	} catch (e: any) {
		crError.value = e?.data?.statusMessage ?? 'Could not submit the request.';
	} finally {
		crBusy.value = false;
	}
}
async function reply(crId: string, body: string) {
	try {
		await $fetch(`/api/portal/change-requests/${crId}/reply`, { method: 'POST', body: { body } });
		await refresh();
	} catch (e: any) {
		crError.value = e?.data?.statusMessage ?? 'Could not send the reply.';
	}
}
async function attach(crId: string, file: File) {
	try {
		const fd = new FormData();
		fd.append('file', file);
		await $fetch(`/api/portal/change-requests/${crId}/attachments`, { method: 'POST', body: fd });
		await refresh();
	} catch (e: any) {
		crError.value = e?.data?.statusMessage ?? 'Upload failed.';
	}
}
const selectedCrId = computed({
	get: () => (route.query.cr as string) || changeRequests.value[0]?.id || null,
	set: (v) => router.replace({ query: { ...route.query, cr: v ?? undefined } }),
});
const selectedCr = computed(() => changeRequests.value.find((c) => c.id === selectedCrId.value) ?? null);

function fmtDate(v?: string | null) {
	if (!v) return null;
	return new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtShort(v?: string | null) {
	return v ? new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
}
function fmtSize(n: number) {
	return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}
</script>

<template>
	<div v-if="pending" class="py-16 text-sm text-center text-slate-500">Loading project…</div>

	<div v-else-if="error || !project" class="py-16 text-center">
		<p class="text-sm text-slate-500">This project could not be found.</p>
		<UButton to="/portal/projects" class="mt-4" size="sm" color="white" label="Back to projects" />
	</div>

	<div v-else class="space-y-6">
		<PortalPageHeader :title="project.name" :breadcrumbs="[{ title: 'Portal', href: '/portal' }, { title: 'Projects', href: '/portal/projects' }]">
			<template #actions>
				<div class="flex flex-wrap items-center gap-2">
					<DeliveryBadge kind="stage" :value="project.currentStage" />
					<DeliveryBadge kind="health" :value="project.health" />
					<UButton size="sm" icon="i-heroicons-plus" label="Request a change" @click="openRequest" />
				</div>
			</template>
		</PortalPageHeader>

		<!-- Progress + key facts -->
		<div class="p-4 bg-white border border-slate-200 rounded-panel">
			<div class="flex items-center justify-between gap-3 text-xs">
				<span class="font-medium text-slate-500">{{ STAGE_LABEL[project.currentStage] }} · overall progress</span>
				<span class="text-slate-400">{{ HEALTH_LABEL[project.health] }}</span>
			</div>
			<ProgressBar class="mt-2" :value="overallProgress" />
			<p v-if="project.health !== 'ON_TRACK' && project.healthReason" class="mt-2 text-xs" :class="project.health === 'BLOCKED' ? 'text-red-700' : 'text-amber-700'">{{ project.healthReason }}</p>
		</div>

		<dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
			<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
				<dt class="text-xs font-medium text-slate-500">Next milestone</dt>
				<dd class="mt-1 font-medium truncate text-slate-900">{{ nextMilestone?.title ?? 'No upcoming milestone' }}</dd>
				<dd v-if="nextMilestone?.dueDate" class="text-xs text-slate-500">{{ fmtDate(nextMilestone.dueDate) }}</dd>
			</div>
			<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
				<dt class="text-xs font-medium text-slate-500">Target date</dt>
				<dd class="mt-1 font-medium text-slate-900">{{ fmtDate(project.targetDate) ?? 'Not set' }}</dd>
			</div>
			<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
				<dt class="text-xs font-medium text-slate-500">Scope</dt>
				<dd class="mt-1"><SrsStatusBadge :status="scope?.status" fallback="Not started" /></dd>
			</div>
			<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
				<dt class="text-xs font-medium text-slate-500">Requirements</dt>
				<dd class="mt-1"><SrsStatusBadge :status="srs?.status" fallback="Not shared yet" /></dd>
			</div>
		</dl>

		<WorkspaceTabs v-model="tab" :tabs="TABS" />

		<!-- OVERVIEW -->
		<div v-if="tab === 'overview'" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
			<div class="space-y-6 min-w-0">
				<!-- Action required -->
				<section v-if="actions.length" class="p-5 border border-amber-200 bg-amber-50 rounded-panel">
					<h2 class="text-sm font-semibold text-amber-900">Action required</h2>
					<ul class="mt-3 space-y-2">
						<li v-for="a in actions" :key="a.key" class="flex flex-wrap items-center justify-between gap-2 text-sm">
							<div class="min-w-0"><p class="font-medium text-amber-900">{{ a.title }}</p><p class="text-xs text-amber-800">{{ a.body }}</p></div>
							<UButton :to="a.link" size="xs" color="amber" variant="outline" label="Open" />
						</li>
					</ul>
				</section>

				<!-- Milestones -->
				<section class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
					<div class="flex items-center justify-between"><h2 class="text-sm font-semibold text-slate-900">Milestones</h2><button type="button" class="text-xs text-blue-700 hover:underline" @click="tab = 'milestones'">View all</button></div>
					<ul v-if="milestones.length" class="mt-3 space-y-3">
						<li v-for="m in milestones" :key="m.id" class="flex items-center gap-3 text-sm">
							<UIcon :name="m.status === 'COMPLETED' ? 'material-symbols:check-circle-rounded' : m.status === 'NOT_STARTED' ? 'material-symbols:circle-outline' : 'material-symbols:circle'" class="w-4 h-4 shrink-0" :class="m.status === 'COMPLETED' ? 'text-green-600' : m.status === 'BLOCKED' ? 'text-red-500' : m.status === 'NOT_STARTED' ? 'text-slate-300' : 'text-blue-600'" />
							<span class="truncate text-slate-800 grow">{{ m.title }}</span>
							<span class="text-xs text-slate-500 tabular-nums">{{ m.progressPercentage }}%</span>
						</li>
					</ul>
					<p v-else class="mt-3 text-sm text-slate-500">Milestones will appear here once planning is complete.</p>
				</section>

				<!-- Ongoing work -->
				<section class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
					<h2 class="text-sm font-semibold text-slate-900">Ongoing work</h2>
					<ul v-if="ongoing.length || recentlyDone.length" class="mt-3 space-y-3">
						<li v-for="t in recentlyDone" :key="t.id" class="flex items-start gap-3 text-sm">
							<UIcon name="material-symbols:check-circle-rounded" class="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
							<div class="min-w-0"><p class="text-slate-800">{{ t.title }}</p><p class="text-xs text-slate-500">Completed</p></div>
						</li>
						<li v-for="t in ongoing" :key="t.id" class="flex items-start gap-3 text-sm">
							<UIcon :name="t.status === 'TODO' ? 'material-symbols:circle-outline' : 'material-symbols:circle'" class="mt-0.5 h-4 w-4 shrink-0" :class="t.status === 'BLOCKED' ? 'text-red-500' : t.status === 'TODO' ? 'text-slate-300' : 'text-blue-600'" />
							<div class="min-w-0 grow">
								<p class="text-slate-800">{{ t.title }}</p>
								<p class="text-xs text-slate-500">{{ TEAM_LABEL[t.functionalTeam] }} · <DeliveryBadge kind="task" :value="t.status" /><template v-if="t.status !== 'TODO'"> — {{ t.progressPercentage }}%</template></p>
								<p v-if="t.status === 'BLOCKED' && t.blockedReason" class="text-xs text-red-700">{{ t.blockedReason }}</p>
							</div>
						</li>
					</ul>
					<p v-else class="mt-3 text-sm text-slate-500">No work items are shared yet.</p>
				</section>

				<!-- Latest updates -->
				<section class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
					<div class="flex items-center justify-between"><h2 class="text-sm font-semibold text-slate-900">Latest updates</h2><button type="button" class="text-xs text-blue-700 hover:underline" @click="tab = 'updates'">View all</button></div>
					<ul v-if="updates.length" class="mt-3 divide-y divide-slate-100">
						<li v-for="u in updates.slice(0, 3)" :key="u.id" class="py-3 first:pt-0 last:pb-0">
							<p class="text-xs text-slate-400">{{ fmtDate(u.createdAt) }}</p>
							<p class="text-sm font-medium text-slate-900">{{ u.title }}</p>
							<p class="mt-0.5 text-sm text-slate-600 line-clamp-3 whitespace-pre-line">{{ u.message }}</p>
						</li>
					</ul>
					<p v-else class="mt-3 text-sm text-slate-500">No updates yet.</p>
				</section>
			</div>

			<aside class="space-y-4">
				<section class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
					<h2 class="text-sm font-semibold text-slate-900">Details</h2>
					<dl class="mt-3 space-y-2 text-sm">
						<div class="flex justify-between gap-3"><dt class="text-slate-500">Stage</dt><dd class="text-slate-800">{{ STAGE_LABEL[project.currentStage] }}</dd></div>
						<div class="flex justify-between gap-3"><dt class="text-slate-500">Health</dt><dd><DeliveryBadge kind="health" :value="project.health" /></dd></div>
						<div class="flex justify-between gap-3"><dt class="text-slate-500">Start date</dt><dd class="text-slate-800">{{ fmtDate(project.startDate) ?? 'Not set' }}</dd></div>
						<div class="flex justify-between gap-3"><dt class="text-slate-500">Target date</dt><dd class="text-slate-800">{{ fmtDate(project.targetDate) ?? 'Not set' }}</dd></div>
						<div class="flex justify-between gap-3"><dt class="text-slate-500">Scope</dt><dd class="text-slate-800">{{ scope ? SCOPE_LABEL[scope.status] : 'Not started' }}</dd></div>
					</dl>
				</section>
				<section v-if="project.description" class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
					<h2 class="text-sm font-semibold text-slate-900">About this project</h2>
					<p class="mt-2 text-sm whitespace-pre-line text-slate-600">{{ project.description }}</p>
				</section>
				<UButton block size="lg" icon="i-heroicons-plus" label="Request a change" @click="openRequest" />
			</aside>
		</div>

		<!-- SCOPE -->
		<div v-else-if="tab === 'scope'" class="p-6 bg-white border shadow-sm border-slate-200 rounded-panel">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div><h2 class="text-sm font-semibold text-slate-900">Your Scope Document</h2><p class="mt-1 text-xs text-slate-500">Your scope applies to your whole engagement with Eiretech.</p></div>
				<SrsStatusBadge :status="scope?.status" fallback="Not started" />
			</div>
			<dl v-if="scope" class="grid grid-cols-2 gap-4 mt-5 text-sm sm:grid-cols-3">
				<div><dt class="text-xs text-slate-500">Completion</dt><dd class="font-medium text-slate-900">{{ scope.completionPercentage ?? 0 }}%</dd></div>
				<div><dt class="text-xs text-slate-500">Version</dt><dd class="font-medium text-slate-900">{{ scope.currentVersion ?? 0 }}</dd></div>
				<div><dt class="text-xs text-slate-500">Approved</dt><dd class="font-medium text-slate-900">{{ fmtDate(scope.approvedAt) ?? '—' }}</dd></div>
			</dl>
			<div class="mt-5"><UButton to="/portal/scope" size="sm" :label="scope ? 'Open scope document' : 'Start scope'" /></div>
		</div>

		<!-- REQUIREMENTS -->
		<div v-else-if="tab === 'requirements'"><SrsClientReview :project-id="id" @changed="refresh" /></div>

		<!-- MILESTONES -->
		<div v-else-if="tab === 'milestones'" class="space-y-4">
			<section class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
				<h2 class="text-sm font-semibold text-slate-900">Overall progress</h2>
				<ProgressBar class="mt-3" :value="overallProgress" />
			</section>
			<section class="bg-white border shadow-sm border-slate-200 rounded-panel">
				<MilestoneList v-if="milestones.length" :milestones="milestones" />
				<p v-else class="px-5 py-10 text-sm text-center text-slate-500">Milestones will appear here once planning is complete.</p>
			</section>
		</div>

		<!-- UPDATES -->
		<div v-else-if="tab === 'updates'" class="bg-white border shadow-sm border-slate-200 rounded-panel">
			<ul v-if="updates.length" class="divide-y divide-slate-100">
				<li v-for="u in updates" :key="u.id" class="px-5 py-4">
					<p class="text-xs text-slate-400">{{ fmtDate(u.createdAt) }}<template v-if="u.milestone"> · {{ u.milestone.title }}</template></p>
					<h3 class="mt-1 text-sm font-semibold text-slate-900">{{ u.title }}</h3>
					<p class="mt-1 text-sm whitespace-pre-line text-slate-600">{{ u.message }}</p>
				</li>
			</ul>
			<p v-else class="px-5 py-10 text-sm text-center text-slate-500">No updates yet.</p>
		</div>

		<!-- CHANGE REQUESTS -->
		<div v-else-if="tab === 'changes'" class="space-y-4">
			<VAlert v-if="crError" type="error">{{ crError }}</VAlert>
			<div v-if="!changeRequests.length" class="p-10 text-center bg-white border shadow-sm border-slate-200 rounded-panel">
				<p class="text-sm text-slate-500">You have not raised any requests for this project.</p>
				<UButton class="mt-4" size="sm" icon="i-heroicons-plus" label="Request a change" @click="openRequest" />
			</div>
			<div v-else class="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
				<div class="overflow-hidden bg-white border shadow-sm border-slate-200 rounded-panel">
					<ul class="divide-y divide-slate-100">
						<li v-for="c in changeRequests" :key="c.id">
							<button type="button" class="w-full px-4 py-3 text-left hover:bg-slate-50" :class="c.id === selectedCrId ? 'bg-blue-50/60' : ''" @click="selectedCrId = c.id">
								<p class="text-sm font-medium truncate text-slate-900">{{ c.title }}</p>
								<div class="flex flex-wrap items-center gap-1.5 mt-1"><DeliveryBadge kind="cr" :value="c.status" /><DeliveryBadge kind="crType" :value="c.type" /></div>
								<p class="mt-1 text-[11px] text-slate-400">{{ fmtDate(c.createdAt) }}</p>
							</button>
						</li>
					</ul>
					<div class="p-3 border-t border-slate-100"><UButton block size="xs" color="white" icon="i-heroicons-plus" label="New request" @click="openRequest" /></div>
				</div>
				<div class="min-w-0"><ChangeRequestThread v-if="selectedCr" :cr="selectedCr" side="CLIENT" can-attach @reply="reply" @attach="attach" /></div>
			</div>
		</div>

		<!-- FILES -->
		<div v-else-if="tab === 'files'" class="p-6 bg-white border shadow-sm border-slate-200 rounded-panel">
			<h2 class="text-sm font-semibold text-slate-900">Files</h2>
			<ul v-if="files.length" class="mt-4 text-sm divide-y divide-slate-100">
				<li v-for="f in files" :key="f.id" class="flex flex-wrap items-center justify-between gap-2 py-2.5">
					<div class="min-w-0"><a :href="f.url" class="font-medium text-blue-700 hover:underline">{{ f.originalName }}</a><p class="text-xs text-slate-400">{{ f.source }} · {{ fmtDate(f.createdAt) }}</p></div>
					<span class="text-xs text-slate-400">{{ fmtSize(f.sizeBytes) }}</span>
				</li>
			</ul>
			<p v-else class="mt-4 text-sm text-slate-500">No files have been shared for this project yet.</p>
		</div>

		<!-- Request a change modal -->
		<UModal v-model="crModal">
			<form class="p-6 space-y-4" @submit.prevent="submitRequest">
				<h3 class="text-base font-semibold text-slate-900">Request a change</h3>
				<VAlert v-if="crError" type="error">{{ crError }}</VAlert>
				<div class="grid gap-4 sm:grid-cols-2">
					<UFormGroup label="Request type" required><USelect v-model="crForm.type" :options="CHANGE_REQUEST_TYPES.map((t) => ({ value: t, label: CR_TYPE_LABEL[t] }))" /></UFormGroup>
					<UFormGroup label="Priority"><USelect v-model="crForm.priority" :options="PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))" /></UFormGroup>
				</div>
				<UFormGroup label="Title" required><UInput v-model="crForm.title" autofocus placeholder="Short summary" /></UFormGroup>
				<UFormGroup label="Description" required><UTextarea v-model="crForm.description" :rows="4" autoresize placeholder="What would you like changed, and why?" /></UFormGroup>
				<UFormGroup label="Related milestone">
					<USelect v-model="crForm.relatedMilestoneId" :options="[{ value: '', label: 'None' }, ...milestones.map((m) => ({ value: m.id, label: m.title }))]" />
				</UFormGroup>
				<UFormGroup label="Attachment (optional)">
					<input type="file" class="block w-full text-xs text-slate-500 file:mr-3 file:rounded-button file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-xs" @change="crFile = ($event.target as HTMLInputElement).files?.[0] ?? null" />
				</UFormGroup>
				<div class="flex justify-end gap-2 pt-2">
					<UButton color="white" label="Cancel" @click="crModal = false" />
					<UButton type="submit" label="Submit request" :loading="crBusy" :disabled="!crForm.title.trim() || !crForm.description.trim()" />
				</div>
			</form>
		</UModal>
	</div>
</template>
