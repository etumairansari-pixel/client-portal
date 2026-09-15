<script setup lang="ts">
/**
 * Owner PROJECT WORKSPACE - the hub every project lives in.
 * Stage and health are Owner decisions; progress is calculated from milestones.
 */
import type { WorkspaceTab } from '~/components/WorkspaceTabs.vue';
import { PROJECT_STAGES, PROJECT_STATUSES, PROJECT_HEALTHS, STAGE_LABEL, HEALTH_LABEL } from '~~/shared/delivery';

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;

const SCOPE_LABEL: Record<string, string> = {
	DRAFT: 'In progress',
	SUBMITTED: 'Submitted',
	UNDER_REVIEW: 'Under review',
	CLARIFICATION_REQUIRED: 'Clarification required',
	READY_FOR_APPROVAL: 'Ready for approval',
	APPROVED: 'Approved',
};

const { data, pending, error, refresh } = await useFetch(`/api/admin/projects/${id}`, {
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
const activity = computed<any[]>(() => data.value?.activity ?? []);
const counts = computed<any>(() => data.value?.counts ?? {});
const overallProgress = computed<number | null>(() => data.value?.overallProgress ?? null);
const nextMilestone = computed<any>(() => data.value?.nextMilestone ?? null);

useHead({ title: () => project.value?.name ?? 'Project' });

const TABS: WorkspaceTab[] = [
	{ key: 'overview', label: 'Overview' },
	{ key: 'scope', label: 'Scope' },
	{ key: 'requirements', label: 'Requirements / SRS' },
	{ key: 'milestones', label: 'Milestones' },
	{ key: 'tasks', label: 'Tasks & Updates' },
	{ key: 'changes', label: 'Change Requests' },
	{ key: 'files', label: 'Files' },
	{ key: 'activity', label: 'Activity' },
];
const enabledKeys = TABS.map((t) => t.key);
const tab = computed({
	get: () => (enabledKeys.includes(String(route.query.tab)) ? String(route.query.tab) : 'overview'),
	set: (v: string) => router.replace({ query: { ...route.query, tab: v === 'overview' ? undefined : v } }),
});

// ---- Overview: project details form -------------------------------------
const saving = ref(false);
const saved = ref(false);
const formError = ref<string | null>(null);
const form = reactive({ name: '', description: '', currentStage: 'PLANNING', status: 'ACTIVE', health: 'ON_TRACK', healthReason: '', targetDate: '' });

watch(
	project,
	(p) => {
		if (!p) return;
		form.name = p.name ?? '';
		form.description = p.description ?? '';
		form.currentStage = p.currentStage ?? 'PLANNING';
		form.status = p.status ?? 'ACTIVE';
		form.health = p.health ?? 'ON_TRACK';
		form.healthReason = p.healthReason ?? '';
		form.targetDate = p.targetDate ? String(p.targetDate).slice(0, 10) : '';
	},
	{ immediate: true },
);

async function save() {
	saving.value = true;
	formError.value = null;
	saved.value = false;
	try {
		await $fetch(`/api/admin/projects/${id}`, {
			method: 'PATCH',
			body: { ...form, healthReason: form.healthReason || null, targetDate: form.targetDate || null },
		});
		await refresh();
		saved.value = true;
	} catch (e: any) {
		formError.value = e?.data?.statusMessage ?? 'Could not save the project.';
	} finally {
		saving.value = false;
	}
}

// ---- Requirements: create against approved scope --------------------------
const creating = ref(false);
const createError = ref<string | null>(null);
const scopeApproved = computed(() => scope.value?.status === 'APPROVED');
async function createSrs() {
	creating.value = true;
	createError.value = null;
	try {
		await $fetch('/api/admin/srs', { method: 'POST', body: { projectId: id } });
		await refresh();
	} catch (e: any) {
		createError.value = e?.data?.statusMessage ?? 'Could not create the requirements document.';
	} finally {
		creating.value = false;
	}
}

// Quick actions from the overview open the right tab, then the right modal.
const tasksTab = ref<any>(null);
const milestonesTab = ref<any>(null);
async function quick(action: 'milestone' | 'task' | 'update' | 'changes') {
	tab.value = action === 'changes' ? 'changes' : action === 'milestone' ? 'milestones' : 'tasks';
	await nextTick();
	if (action === 'task') tasksTab.value?.openNewTask?.();
	if (action === 'update') tasksTab.value?.openUpdate?.();
	if (action === 'milestone') milestonesTab.value?.openNew?.();
}

function fmtDate(v?: string | null, withTime = false) {
	if (!v) return null;
	return new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
}
function fmtSize(n: number) {
	return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}
function actionLabel(a: string) {
	return a.replaceAll('_', ' ').toLowerCase();
}
</script>

<template>
	<div v-if="pending" class="py-16 text-sm text-center text-slate-500">Loading project…</div>

	<div v-else-if="error || !project" class="py-16 text-center">
		<p class="text-sm text-slate-500">Project not found.</p>
		<UButton to="/admin/projects" class="mt-4" size="sm" color="white" label="Back to projects" />
	</div>

	<div v-else class="space-y-6">
		<!-- Workspace header -->
		<header class="space-y-4">
			<VBreadcrumbs :items="[{ title: 'Projects', href: '/admin/projects' }, { title: project.name }]" />
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="min-w-0">
					<h1 class="text-2xl font-bold tracking-tight font-display text-slate-900">{{ project.name }}</h1>
					<p class="mt-1 text-sm text-slate-500">
						<NuxtLink :to="`/admin/clients/${project.organization?.id}`" class="hover:text-blue-700">{{ project.organization?.name }}</NuxtLink>
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<DeliveryBadge kind="stage" :value="project.currentStage" />
					<DeliveryBadge kind="health" :value="project.health" />
					<UBadge variant="subtle" :color="project.status === 'ACTIVE' ? 'green' : 'gray'" size="sm">{{ project.status }}</UBadge>
					<UBadge v-if="project.readyForDeliveryAt" variant="solid" color="green" size="sm">Ready for delivery</UBadge>
				</div>
			</div>

			<div class="p-4 bg-white border border-slate-200 rounded-panel">
				<div class="flex items-center justify-between gap-3 text-xs">
					<span class="font-medium text-slate-500">Overall progress</span>
					<span class="text-slate-400">{{ counts.total ? `${counts.total} milestone${counts.total === 1 ? '' : 's'}` : 'No milestones yet' }}</span>
				</div>
				<ProgressBar class="mt-2" :value="overallProgress" />
			</div>

			<dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
				<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
					<dt class="text-xs font-medium text-slate-500">Target date</dt>
					<dd class="mt-1 font-medium text-slate-900">{{ fmtDate(project.targetDate) ?? 'Not set' }}</dd>
				</div>
				<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
					<dt class="text-xs font-medium text-slate-500">Next milestone</dt>
					<dd class="mt-1 font-medium truncate text-slate-900">{{ nextMilestone?.title ?? 'No upcoming milestone' }}</dd>
					<dd v-if="nextMilestone?.dueDate" class="text-xs text-slate-500">{{ fmtDate(nextMilestone.dueDate) }}</dd>
				</div>
				<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
					<dt class="text-xs font-medium text-slate-500">Scope</dt>
					<dd class="mt-1"><SrsStatusBadge :status="scope?.status" fallback="Not started" /></dd>
				</div>
				<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
					<dt class="text-xs font-medium text-slate-500">Requirements</dt>
					<dd class="mt-1"><SrsStatusBadge :status="srs?.status" fallback="Not created" /></dd>
				</div>
				<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
					<dt class="text-xs font-medium text-slate-500">Delivery readiness</dt>
					<dd class="mt-1 font-medium text-slate-900">{{ project.readyForDeliveryAt ? fmtDate(project.readyForDeliveryAt) : 'Awaiting approvals' }}</dd>
				</div>
			</dl>
		</header>

		<WorkspaceTabs v-model="tab" :tabs="TABS" />

		<!-- OVERVIEW -->
		<div v-if="tab === 'overview'" class="space-y-6">
			<dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
				<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
					<dt class="text-xs text-slate-500">Active milestones</dt>
					<dd class="mt-1 text-xl font-semibold text-slate-900">{{ counts.active ?? 0 }}</dd>
				</div>
				<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
					<dt class="text-xs text-slate-500">Completed milestones</dt>
					<dd class="mt-1 text-xl font-semibold text-slate-900">{{ counts.completed ?? 0 }}</dd>
				</div>
				<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
					<dt class="text-xs text-slate-500">Ongoing tasks</dt>
					<dd class="mt-1 text-xl font-semibold text-slate-900">{{ counts.ongoingTasks ?? 0 }}</dd>
				</div>
				<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
					<dt class="text-xs text-slate-500">Blocked tasks</dt>
					<dd class="mt-1 text-xl font-semibold" :class="counts.blockedTasks ? 'text-red-700' : 'text-slate-900'">{{ counts.blockedTasks ?? 0 }}</dd>
				</div>
				<div class="px-4 py-3 bg-white border border-slate-200 rounded-panel">
					<dt class="text-xs text-slate-500">Open change requests</dt>
					<dd class="mt-1 text-xl font-semibold text-slate-900">{{ counts.openChangeRequests ?? 0 }}</dd>
				</div>
			</dl>

			<div class="flex flex-wrap gap-2">
				<UButton size="sm" icon="i-heroicons-plus" label="Add milestone" @click="quick('milestone')" />
				<UButton size="sm" color="white" icon="i-heroicons-plus" label="Add task" @click="quick('task')" />
				<UButton size="sm" color="white" icon="i-heroicons-megaphone" label="Post update" @click="quick('update')" />
				<UButton size="sm" color="white" icon="i-heroicons-inbox" label="Change requests" @click="quick('changes')" />
			</div>

			<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<form class="p-6 space-y-5 bg-white border shadow-sm border-slate-200 rounded-panel" @submit.prevent="save">
					<h2 class="text-sm font-semibold text-slate-900">Project details</h2>
					<VAlert v-if="formError" type="error">{{ formError }}</VAlert>
					<VAlert v-if="saved" type="success">Project updated.</VAlert>
					<UFormGroup label="Project name" required><UInput v-model="form.name" size="lg" :disabled="saving" /></UFormGroup>
					<UFormGroup label="Description"><UTextarea v-model="form.description" :rows="3" :disabled="saving" /></UFormGroup>
					<div class="grid gap-5 sm:grid-cols-3">
						<UFormGroup label="Stage" help="Owner decision, not derived from progress">
							<USelect v-model="form.currentStage" size="lg" :options="PROJECT_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))" :disabled="saving" />
						</UFormGroup>
						<UFormGroup label="Health">
							<USelect v-model="form.health" size="lg" :options="PROJECT_HEALTHS.map((h) => ({ value: h, label: HEALTH_LABEL[h] }))" :disabled="saving" />
						</UFormGroup>
						<UFormGroup label="Status">
							<USelect v-model="form.status" size="lg" :options="[...PROJECT_STATUSES]" :disabled="saving" />
						</UFormGroup>
					</div>
					<UFormGroup v-if="form.health !== 'ON_TRACK'" label="Health note (client visible)">
						<UTextarea v-model="form.healthReason" :rows="2" autoresize :disabled="saving" placeholder="Why is the project at risk / blocked?" />
					</UFormGroup>
					<UFormGroup label="Target date"><UInput v-model="form.targetDate" type="date" size="lg" :disabled="saving" /></UFormGroup>
					<div class="flex justify-end pt-2"><UButton type="submit" size="lg" label="Save changes" :loading="saving" /></div>
				</form>

				<aside class="space-y-4">
					<section class="p-5 bg-white border border-slate-200 rounded-panel">
						<h2 class="text-sm font-semibold text-slate-900">Path to delivery</h2>
						<ol class="mt-3 space-y-3 text-sm">
							<li class="flex items-start gap-2">
								<UIcon :name="scopeApproved ? 'material-symbols:check-circle-rounded' : 'material-symbols:circle-outline'" class="mt-0.5 h-4 w-4 shrink-0" :class="scopeApproved ? 'text-green-600' : 'text-slate-300'" />
								<div><p class="font-medium text-slate-800">Scope approved</p><p class="text-xs text-slate-500">{{ scope ? SCOPE_LABEL[scope.status] : 'Client has not started the scope' }}</p></div>
							</li>
							<li class="flex items-start gap-2">
								<UIcon :name="srs?.status === 'APPROVED' ? 'material-symbols:check-circle-rounded' : 'material-symbols:circle-outline'" class="mt-0.5 h-4 w-4 shrink-0" :class="srs?.status === 'APPROVED' ? 'text-green-600' : 'text-slate-300'" />
								<div><p class="font-medium text-slate-800">Requirements approved &amp; locked</p><p class="text-xs text-slate-500">{{ srs ? (srs.currentVersion ? `Version 1.${srs.currentVersion - 1}` : 'Draft not yet sent') : 'Not created' }}</p></div>
							</li>
							<li class="flex items-start gap-2">
								<UIcon :name="project.readyForDeliveryAt ? 'material-symbols:check-circle-rounded' : 'material-symbols:circle-outline'" class="mt-0.5 h-4 w-4 shrink-0" :class="project.readyForDeliveryAt ? 'text-green-600' : 'text-slate-300'" />
								<div><p class="font-medium text-slate-800">Ready for delivery</p><p class="text-xs text-slate-500">{{ project.readyForDeliveryAt ? fmtDate(project.readyForDeliveryAt) : 'Unlocks when both approvals are in' }}</p></div>
							</li>
						</ol>
					</section>
					<section v-if="milestones.length" class="p-5 bg-white border border-slate-200 rounded-panel">
						<h2 class="text-sm font-semibold text-slate-900">Milestones</h2>
						<ul class="mt-3 space-y-2">
							<li v-for="m in milestones" :key="m.id" class="text-sm">
								<div class="flex justify-between gap-2"><span class="truncate text-slate-800">{{ m.title }}</span><span class="text-xs text-slate-500 tabular-nums">{{ m.progressPercentage }}%</span></div>
								<ProgressBar size="sm" :value="m.progressPercentage" :show-label="false" class="mt-1" />
							</li>
						</ul>
					</section>
				</aside>
			</div>
		</div>

		<!-- SCOPE -->
		<div v-else-if="tab === 'scope'" class="p-6 bg-white border shadow-sm border-slate-200 rounded-panel">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold text-slate-900">Client Scope Document</h2>
					<p class="mt-1 text-xs text-slate-500">The scope belongs to the client organization and is shared across its projects.</p>
				</div>
				<SrsStatusBadge :status="scope?.status" fallback="Not started" />
			</div>
			<dl v-if="scope" class="grid grid-cols-2 gap-4 mt-5 text-sm sm:grid-cols-4">
				<div><dt class="text-xs text-slate-500">Completion</dt><dd class="font-medium text-slate-900">{{ scope.completionPercentage ?? 0 }}%</dd></div>
				<div><dt class="text-xs text-slate-500">Version</dt><dd class="font-medium text-slate-900">{{ scope.currentVersion ?? 0 }}</dd></div>
				<div><dt class="text-xs text-slate-500">Submitted</dt><dd class="font-medium text-slate-900">{{ fmtDate(scope.submittedAt) ?? '—' }}</dd></div>
				<div><dt class="text-xs text-slate-500">Approved</dt><dd class="font-medium text-slate-900">{{ fmtDate(scope.approvedAt) ?? '—' }}</dd></div>
			</dl>
			<p v-else class="mt-5 text-sm text-slate-500">The client has not started their scope document yet.</p>
			<div v-if="scope" class="mt-5"><UButton :to="`/admin/scopes/${scope.id}`" size="sm" label="Open scope review" /></div>
		</div>

		<!-- REQUIREMENTS / SRS -->
		<div v-else-if="tab === 'requirements'">
			<SrsAuthoring v-if="srs?.id" :srs-id="srs.id" @changed="refresh" />
			<div v-else class="p-8 text-center bg-white border shadow-sm border-slate-200 rounded-panel">
				<h2 class="text-sm font-semibold text-slate-900">No requirements document yet</h2>
				<p class="max-w-md mx-auto mt-2 text-sm text-slate-500">
					<template v-if="scopeApproved">The client scope is approved. Create the Software Requirements Specification to start authoring.</template>
					<template v-else>Requirements are authored against an <strong>approved</strong> scope. The client scope is currently <span class="font-medium">{{ scope ? SCOPE_LABEL[scope.status] : 'not started' }}</span>.</template>
				</p>
				<VAlert v-if="createError" type="error" class="max-w-md mx-auto mt-4">{{ createError }}</VAlert>
				<UButton class="mt-5" size="lg" label="Create requirements document" :disabled="!scopeApproved" :loading="creating" @click="createSrs" />
			</div>
		</div>

		<!-- MILESTONES -->
		<OwnerMilestonesTab v-else-if="tab === 'milestones'" ref="milestonesTab" :project-id="id" :milestones="milestones" :overall-progress="overallProgress" @changed="refresh" />

		<!-- TASKS & UPDATES -->
		<OwnerTasksTab v-else-if="tab === 'tasks'" ref="tasksTab" :project-id="id" :tasks="tasks" :updates="updates" :milestones="milestones" @changed="refresh" />

		<!-- CHANGE REQUESTS -->
		<OwnerChangeRequestsTab v-else-if="tab === 'changes'" :change-requests="changeRequests" :organization-name="project.organization?.name" @changed="refresh" />

		<!-- FILES -->
		<div v-else-if="tab === 'files'" class="p-6 bg-white border shadow-sm border-slate-200 rounded-panel">
			<h2 class="text-sm font-semibold text-slate-900">Files</h2>
			<p class="mt-1 text-xs text-slate-500">Scope files, requirements attachments and change request attachments. Downloads are authorised per request; no public links.</p>
			<ul v-if="files.length" class="mt-4 text-sm divide-y divide-slate-100">
				<li v-for="f in files" :key="f.id" class="flex flex-wrap items-center justify-between gap-2 py-2.5">
					<div class="min-w-0">
						<a :href="f.url" class="font-medium text-blue-700 hover:underline">{{ f.originalName }}</a>
						<p class="text-xs text-slate-400">{{ f.source }} · {{ fmtDate(f.createdAt) }}</p>
					</div>
					<span class="text-xs text-slate-400">{{ fmtSize(f.sizeBytes) }}</span>
				</li>
			</ul>
			<p v-else class="mt-4 text-sm text-slate-500">No files on this project yet.</p>
		</div>

		<!-- ACTIVITY -->
		<div v-else-if="tab === 'activity'" class="bg-white border shadow-sm border-slate-200 rounded-panel">
			<ul v-if="activity.length" class="divide-y divide-slate-100">
				<li v-for="a in activity" :key="a.id" class="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
					<div class="min-w-0">
						<p class="font-medium capitalize text-slate-800">{{ actionLabel(a.action) }}</p>
						<p class="text-xs text-slate-400">
							{{ a.entityType?.replaceAll('_', ' ') }}<template v-if="a.metadata?.title"> · {{ a.metadata.title }}</template>
						</p>
					</div>
					<span class="text-xs text-slate-400">{{ fmtDate(a.createdAt, true) }}</span>
				</li>
			</ul>
			<p v-else class="px-5 py-10 text-sm text-center text-slate-500">No activity recorded yet.</p>
		</div>
	</div>
</template>
