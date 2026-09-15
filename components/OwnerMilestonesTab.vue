<script setup lang="ts">
import { MILESTONE_STATUSES, MILESTONE_STATUS_LABEL } from '~~/shared/delivery';

const props = defineProps<{ projectId: string; milestones: any[]; overallProgress: number | null }>();
const emit = defineEmits<{ changed: [] }>();

const error = ref<string | null>(null);
const modal = ref(false);
const busy = ref(false);
const form = reactive({
	milestoneId: undefined as string | undefined,
	title: '',
	description: '',
	status: 'NOT_STARTED',
	progressPercentage: 0,
	weight: 10,
	startDate: '',
	dueDate: '',
	clientVisible: true,
	blockedReason: '',
});

function openNew() {
	Object.assign(form, { milestoneId: undefined, title: '', description: '', status: 'NOT_STARTED', progressPercentage: 0, weight: 10, startDate: '', dueDate: '', clientVisible: true, blockedReason: '' });
	modal.value = true;
}
function openEdit(m: any) {
	Object.assign(form, {
		milestoneId: m.id,
		title: m.title,
		description: m.description ?? '',
		status: m.status,
		progressPercentage: m.progressPercentage,
		weight: m.weight,
		startDate: m.startDate ? String(m.startDate).slice(0, 10) : '',
		dueDate: m.dueDate ? String(m.dueDate).slice(0, 10) : '',
		clientVisible: m.clientVisible,
		blockedReason: m.blockedReason ?? '',
	});
	modal.value = true;
}

// Mirror the server rules in the form so the Owner sees the effect immediately.
watch(
	() => form.status,
	(s) => {
		if (s === 'COMPLETED') form.progressPercentage = 100;
		if (s === 'NOT_STARTED') form.progressPercentage = 0;
	},
);

defineExpose({ openNew });

async function save() {
	busy.value = true;
	error.value = null;
	try {
		await $fetch(`/api/admin/projects/${props.projectId}/milestones`, {
			method: 'POST',
			body: { ...form, startDate: form.startDate || null, dueDate: form.dueDate || null },
		});
		modal.value = false;
		emit('changed');
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not save the milestone.';
	} finally {
		busy.value = false;
	}
}
async function remove(m: any) {
	if (!confirm(`Delete milestone "${m.title}"? Tasks attached to it are kept and detached.`)) return;
	try {
		await $fetch(`/api/admin/projects/${props.projectId}/milestones/${m.id}`, { method: 'DELETE' });
		emit('changed');
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not delete.';
	}
}
async function move(m: any, dir: -1 | 1) {
	const ids = props.milestones.map((x) => x.id);
	const i = ids.indexOf(m.id);
	const j = i + dir;
	if (j < 0 || j >= ids.length) return;
	[ids[i], ids[j]] = [ids[j], ids[i]];
	try {
		await $fetch(`/api/admin/projects/${props.projectId}/milestones/reorder`, { method: 'POST', body: { orderedIds: ids } });
		emit('changed');
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not reorder.';
	}
}
</script>

<template>
	<div class="space-y-4">
		<VAlert v-if="error" type="error">{{ error }}</VAlert>

		<section class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold text-slate-900">Overall progress</h2>
					<p class="mt-0.5 text-xs text-slate-500">Weighted by milestone. All milestones count, including internal ones; the client sees the same number.</p>
				</div>
				<UButton size="sm" icon="i-heroicons-plus" label="Add milestone" @click="openNew" />
			</div>
			<ProgressBar class="mt-4" :value="overallProgress" />
		</section>

		<section class="bg-white border shadow-sm border-slate-200 rounded-panel">
			<MilestoneList v-if="milestones.length" :milestones="milestones" editable @edit="openEdit" @remove="remove" @move="move" />
			<p v-else class="px-5 py-10 text-sm text-center text-slate-500">No milestones yet. Add the first one to start measuring progress.</p>
		</section>

		<UModal v-model="modal">
			<form class="p-6 space-y-4" @submit.prevent="save">
				<h3 class="text-base font-semibold text-slate-900">{{ form.milestoneId ? 'Edit milestone' : 'New milestone' }}</h3>
				<UFormGroup label="Title" required><UInput v-model="form.title" autofocus /></UFormGroup>
				<UFormGroup label="Description"><UTextarea v-model="form.description" :rows="2" autoresize /></UFormGroup>
				<div class="grid gap-4 sm:grid-cols-3">
					<UFormGroup label="Status" required>
						<USelect v-model="form.status" :options="MILESTONE_STATUSES.map((s) => ({ value: s, label: MILESTONE_STATUS_LABEL[s] }))" />
					</UFormGroup>
					<UFormGroup label="Progress %">
						<UInput v-model.number="form.progressPercentage" type="number" min="0" max="100" :disabled="form.status === 'COMPLETED' || form.status === 'NOT_STARTED'" />
					</UFormGroup>
					<UFormGroup label="Weight" help="Positive whole number">
						<UInput v-model.number="form.weight" type="number" min="1" max="1000" />
					</UFormGroup>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<UFormGroup label="Start date"><UInput v-model="form.startDate" type="date" /></UFormGroup>
					<UFormGroup label="Due date"><UInput v-model="form.dueDate" type="date" /></UFormGroup>
				</div>
				<UFormGroup v-if="form.status === 'BLOCKED'" label="Blocked reason" required>
					<UTextarea v-model="form.blockedReason" :rows="2" autoresize />
				</UFormGroup>
				<UCheckbox v-model="form.clientVisible" label="Visible to client" />
				<div class="flex justify-end gap-2 pt-2">
					<UButton color="white" label="Cancel" @click="modal = false" />
					<UButton type="submit" label="Save milestone" :loading="busy" :disabled="!form.title.trim()" />
				</div>
			</form>
		</UModal>
	</div>
</template>
