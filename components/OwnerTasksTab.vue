<script setup lang="ts">
import { TASK_STATUSES, TASK_STATUS_LABEL, PRIORITIES, PRIORITY_LABEL, FUNCTIONAL_TEAMS, TEAM_LABEL } from '~~/shared/delivery';

const props = defineProps<{ projectId: string; tasks: any[]; updates: any[]; milestones: any[] }>();
const emit = defineEmits<{ changed: [] }>();

const error = ref<string | null>(null);

// ---- Tasks ----------------------------------------------------------------
const taskModal = ref(false);
const taskBusy = ref(false);
const task = reactive({
	taskId: undefined as string | undefined,
	milestoneId: '' as string,
	title: '',
	description: '',
	status: 'TODO',
	progressPercentage: 0,
	priority: 'MEDIUM',
	functionalTeam: 'DEVELOPMENT',
	clientVisible: false,
	startDate: '',
	dueDate: '',
	blockedReason: '',
});
const milestoneOptions = computed(() => [{ value: '', label: 'No milestone' }, ...props.milestones.map((m) => ({ value: m.id, label: m.title }))]);

function openNewTask() {
	Object.assign(task, { taskId: undefined, milestoneId: '', title: '', description: '', status: 'TODO', progressPercentage: 0, priority: 'MEDIUM', functionalTeam: 'DEVELOPMENT', clientVisible: false, startDate: '', dueDate: '', blockedReason: '' });
	taskModal.value = true;
}
function openEditTask(t: any) {
	Object.assign(task, {
		taskId: t.id,
		milestoneId: t.milestoneId ?? '',
		title: t.title,
		description: t.description ?? '',
		status: t.status,
		progressPercentage: t.progressPercentage,
		priority: t.priority,
		functionalTeam: t.functionalTeam,
		clientVisible: t.clientVisible,
		startDate: t.startDate ? String(t.startDate).slice(0, 10) : '',
		dueDate: t.dueDate ? String(t.dueDate).slice(0, 10) : '',
		blockedReason: t.blockedReason ?? '',
	});
	taskModal.value = true;
}
watch(
	() => task.status,
	(s) => {
		if (s === 'COMPLETED') task.progressPercentage = 100;
		if (s === 'TODO') task.progressPercentage = 0;
	},
);
async function saveTask() {
	taskBusy.value = true;
	error.value = null;
	try {
		await $fetch(`/api/admin/projects/${props.projectId}/tasks`, {
			method: 'POST',
			body: { ...task, milestoneId: task.milestoneId || null, startDate: task.startDate || null, dueDate: task.dueDate || null },
		});
		taskModal.value = false;
		emit('changed');
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not save the task.';
	} finally {
		taskBusy.value = false;
	}
}
async function removeTask(t: any) {
	if (!confirm(`Delete task "${t.title}"?`)) return;
	try {
		await $fetch(`/api/admin/projects/${props.projectId}/tasks/${t.id}`, { method: 'DELETE' });
		emit('changed');
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not delete.';
	}
}
async function moveTask(t: any, dir: -1 | 1) {
	const ids = props.tasks.map((x) => x.id);
	const i = ids.indexOf(t.id);
	const j = i + dir;
	if (j < 0 || j >= ids.length) return;
	[ids[i], ids[j]] = [ids[j], ids[i]];
	try {
		await $fetch(`/api/admin/projects/${props.projectId}/tasks/reorder`, { method: 'POST', body: { orderedIds: ids } });
		emit('changed');
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not reorder.';
	}
}

// ---- Updates --------------------------------------------------------------
const updateModal = ref(false);
const updateBusy = ref(false);
const update = reactive({ title: '', message: '', milestoneId: '', clientVisible: true });
function openUpdate() {
	Object.assign(update, { title: '', message: '', milestoneId: '', clientVisible: true });
	updateModal.value = true;
}
async function postUpdate() {
	updateBusy.value = true;
	error.value = null;
	try {
		await $fetch(`/api/admin/projects/${props.projectId}/updates`, { method: 'POST', body: { ...update, milestoneId: update.milestoneId || null } });
		updateModal.value = false;
		emit('changed');
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not post the update.';
	} finally {
		updateBusy.value = false;
	}
}

defineExpose({ openNewTask, openUpdate });

function fmt(v?: string | null, time = false) {
	return v ? new Date(v).toLocaleString(undefined, { day: '2-digit', month: 'short', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }) : '—';
}
</script>

<template>
	<div class="space-y-6">
		<VAlert v-if="error" type="error">{{ error }}</VAlert>

		<!-- Tasks -->
		<section class="bg-white border shadow-sm border-slate-200 rounded-panel">
			<div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
				<div>
					<h2 class="text-sm font-semibold text-slate-900">Tasks</h2>
					<p class="mt-0.5 text-xs text-slate-500">Internal tasks never reach the client. Client-visible tasks show only title, team, status and progress.</p>
				</div>
				<UButton size="sm" icon="i-heroicons-plus" label="Add task" @click="openNewTask" />
			</div>
			<div v-if="tasks.length" class="overflow-x-auto">
				<table class="w-full min-w-[820px] text-sm">
					<thead class="text-xs tracking-wide text-left uppercase text-slate-500">
						<tr class="border-b border-slate-200">
							<th class="px-5 py-2 font-semibold">Task</th>
							<th class="py-2 pr-3 font-semibold">Team</th>
							<th class="py-2 pr-3 font-semibold">Status</th>
							<th class="py-2 pr-3 font-semibold w-44">Progress</th>
							<th class="py-2 pr-3 font-semibold">Priority</th>
							<th class="py-2 pr-3 font-semibold">Due</th>
							<th class="py-2 pr-3 font-semibold">Client</th>
							<th class="py-2 pr-5"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100">
						<tr v-for="(t, i) in tasks" :key="t.id" class="align-top">
							<td class="px-5 py-3">
								<p class="font-medium text-slate-900">{{ t.title }}</p>
								<p v-if="t.milestone" class="text-xs text-slate-400">{{ t.milestone.title }}</p>
								<p v-if="t.status === 'BLOCKED' && t.blockedReason" class="text-xs text-red-700">Blocked: {{ t.blockedReason }}</p>
							</td>
							<td class="py-3 pr-3 text-slate-600 whitespace-nowrap">{{ TEAM_LABEL[t.functionalTeam] }}</td>
							<td class="py-3 pr-3"><DeliveryBadge kind="task" :value="t.status" /></td>
							<td class="py-3 pr-3"><ProgressBar size="sm" :value="t.progressPercentage" /></td>
							<td class="py-3 pr-3"><DeliveryBadge kind="priority" :value="t.priority" /></td>
							<td class="py-3 pr-3 text-slate-600 whitespace-nowrap">{{ fmt(t.dueDate) }}</td>
							<td class="py-3 pr-3 text-xs" :class="t.clientVisible ? 'text-green-700' : 'text-slate-400'">{{ t.clientVisible ? 'Visible' : 'Internal' }}</td>
							<td class="py-3 pr-5 text-right whitespace-nowrap">
								<UButton size="2xs" color="white" icon="i-heroicons-chevron-up" :disabled="i === 0" @click="moveTask(t, -1)" />
								<UButton size="2xs" color="white" icon="i-heroicons-chevron-down" :disabled="i === tasks.length - 1" @click="moveTask(t, 1)" />
								<UButton size="2xs" color="white" class="ml-1" label="Edit" @click="openEditTask(t)" />
								<UButton size="2xs" color="white" class="ml-1 text-red-600" label="Delete" @click="removeTask(t)" />
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<p v-else class="px-5 py-10 text-sm text-center text-slate-500">No tasks yet.</p>
		</section>

		<!-- Updates -->
		<section class="bg-white border shadow-sm border-slate-200 rounded-panel">
			<div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
				<div>
					<h2 class="text-sm font-semibold text-slate-900">Project updates</h2>
					<p class="mt-0.5 text-xs text-slate-500">Newest first. Client-visible updates notify the client.</p>
				</div>
				<UButton size="sm" color="white" icon="i-heroicons-megaphone" label="Post update" @click="openUpdate" />
			</div>
			<ul v-if="updates.length" class="divide-y divide-slate-100">
				<li v-for="u in updates" :key="u.id" class="px-5 py-4">
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-xs text-slate-400">{{ fmt(u.createdAt, true) }}</span>
						<span v-if="!u.clientVisible" class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Internal</span>
						<span v-if="u.milestone" class="text-xs text-slate-400">· {{ u.milestone.title }}</span>
					</div>
					<h3 class="mt-1 text-sm font-semibold text-slate-900">{{ u.title }}</h3>
					<p class="mt-1 text-sm whitespace-pre-line text-slate-600">{{ u.message }}</p>
				</li>
			</ul>
			<p v-else class="px-5 py-10 text-sm text-center text-slate-500">No updates posted yet.</p>
		</section>

		<!-- Task modal -->
		<UModal v-model="taskModal">
			<form class="p-6 space-y-4" @submit.prevent="saveTask">
				<h3 class="text-base font-semibold text-slate-900">{{ task.taskId ? 'Edit task' : 'New task' }}</h3>
				<UFormGroup label="Title" required><UInput v-model="task.title" autofocus /></UFormGroup>
				<UFormGroup label="Description (internal)"><UTextarea v-model="task.description" :rows="2" autoresize /></UFormGroup>
				<div class="grid gap-4 sm:grid-cols-2">
					<UFormGroup label="Milestone"><USelect v-model="task.milestoneId" :options="milestoneOptions" /></UFormGroup>
					<UFormGroup label="Functional team">
						<USelect v-model="task.functionalTeam" :options="FUNCTIONAL_TEAMS.map((t) => ({ value: t, label: TEAM_LABEL[t] }))" />
					</UFormGroup>
				</div>
				<div class="grid gap-4 sm:grid-cols-3">
					<UFormGroup label="Status" required>
						<USelect v-model="task.status" :options="TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))" />
					</UFormGroup>
					<UFormGroup label="Progress %">
						<UInput v-model.number="task.progressPercentage" type="number" min="0" max="100" :disabled="task.status === 'COMPLETED' || task.status === 'TODO'" />
					</UFormGroup>
					<UFormGroup label="Priority">
						<USelect v-model="task.priority" :options="PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))" />
					</UFormGroup>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<UFormGroup label="Start date"><UInput v-model="task.startDate" type="date" /></UFormGroup>
					<UFormGroup label="Due date"><UInput v-model="task.dueDate" type="date" /></UFormGroup>
				</div>
				<UFormGroup v-if="task.status === 'BLOCKED'" label="Blocked reason" required>
					<UTextarea v-model="task.blockedReason" :rows="2" autoresize />
				</UFormGroup>
				<UCheckbox v-model="task.clientVisible" label="Visible to client (title, team, status, progress only)" />
				<div class="flex justify-end gap-2 pt-2">
					<UButton color="white" label="Cancel" @click="taskModal = false" />
					<UButton type="submit" label="Save task" :loading="taskBusy" :disabled="!task.title.trim()" />
				</div>
			</form>
		</UModal>

		<!-- Update modal -->
		<UModal v-model="updateModal">
			<form class="p-6 space-y-4" @submit.prevent="postUpdate">
				<h3 class="text-base font-semibold text-slate-900">Post project update</h3>
				<UFormGroup label="Title" required><UInput v-model="update.title" autofocus placeholder="e.g. Development Update" /></UFormGroup>
				<UFormGroup label="Message" required><UTextarea v-model="update.message" :rows="5" autoresize /></UFormGroup>
				<UFormGroup label="Related milestone"><USelect v-model="update.milestoneId" :options="milestoneOptions" /></UFormGroup>
				<UCheckbox v-model="update.clientVisible" label="Visible to client" />
				<div class="flex justify-end gap-2 pt-2">
					<UButton color="white" label="Cancel" @click="updateModal = false" />
					<UButton type="submit" label="Post update" :loading="updateBusy" :disabled="!update.title.trim() || !update.message.trim()" />
				</div>
			</form>
		</UModal>
	</div>
</template>
