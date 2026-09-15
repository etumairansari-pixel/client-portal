<script setup lang="ts">
/**
 * Milestone rows, shared by Owner and Client. The Owner gets edit/delete and
 * up/down reorder controls; the client gets a read-only list.
 */
defineProps<{ milestones: any[]; editable?: boolean }>();
const emit = defineEmits<{ edit: [m: any]; remove: [m: any]; move: [m: any, dir: -1 | 1] }>();

function fmt(v?: string | null) {
	return v ? new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '—';
}
</script>

<template>
	<ul class="divide-y divide-slate-100">
		<li v-for="(m, i) in milestones" :key="m.id" class="px-5 py-4">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0 grow">
					<div class="flex flex-wrap items-center gap-2">
						<h3 class="text-sm font-semibold text-slate-900">{{ m.title }}</h3>
						<DeliveryBadge kind="milestone" :value="m.status" />
						<span v-if="editable && !m.clientVisible" class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Internal</span>
					</div>
					<p v-if="m.description" class="mt-1 text-xs whitespace-pre-line text-slate-500">{{ m.description }}</p>
					<p v-if="m.status === 'BLOCKED' && m.blockedReason" class="mt-1 text-xs text-red-700">Blocked: {{ m.blockedReason }}</p>
				</div>
				<div v-if="editable" class="flex items-center gap-1 shrink-0">
					<UButton size="2xs" color="white" icon="i-heroicons-chevron-up" :disabled="i === 0" @click="emit('move', m, -1)" />
					<UButton size="2xs" color="white" icon="i-heroicons-chevron-down" :disabled="i === milestones.length - 1" @click="emit('move', m, 1)" />
					<UButton size="2xs" color="white" label="Edit" @click="emit('edit', m)" />
					<UButton size="2xs" color="white" class="text-red-600" label="Delete" @click="emit('remove', m)" />
				</div>
			</div>

			<ProgressBar class="mt-3" :value="m.progressPercentage" />

			<dl class="flex flex-wrap mt-2 text-xs gap-x-5 gap-y-1 text-slate-500">
				<div><dt class="inline">Start: </dt><dd class="inline text-slate-700">{{ fmt(m.startDate) }}</dd></div>
				<div><dt class="inline">Due: </dt><dd class="inline text-slate-700">{{ fmt(m.dueDate) }}</dd></div>
				<div v-if="editable"><dt class="inline">Weight: </dt><dd class="inline text-slate-700">{{ m.weight }}</dd></div>
				<div v-if="editable"><dt class="inline">Client visible: </dt><dd class="inline text-slate-700">{{ m.clientVisible ? 'Yes' : 'No' }}</dd></div>
			</dl>
		</li>
	</ul>
</template>
