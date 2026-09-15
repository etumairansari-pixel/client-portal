<script setup lang="ts">
/** One badge for every delivery enum (stage, health, milestone/task/CR status, priority). */
import {
	STAGE_LABEL,
	HEALTH_LABEL,
	MILESTONE_STATUS_LABEL,
	TASK_STATUS_LABEL,
	PRIORITY_LABEL,
	CR_STATUS_LABEL,
	CR_TYPE_LABEL,
	TEAM_LABEL,
} from '~~/shared/delivery';

const props = defineProps<{
	value?: string | null;
	kind: 'stage' | 'health' | 'milestone' | 'task' | 'priority' | 'cr' | 'crType' | 'team';
}>();

const LABELS: Record<string, Record<string, string>> = {
	stage: STAGE_LABEL,
	health: HEALTH_LABEL,
	milestone: MILESTONE_STATUS_LABEL,
	task: TASK_STATUS_LABEL,
	priority: PRIORITY_LABEL,
	cr: CR_STATUS_LABEL,
	crType: CR_TYPE_LABEL,
	team: TEAM_LABEL,
};

const TONES: Record<string, string> = {
	// neutral
	NOT_STARTED: 'bg-slate-100 text-slate-600',
	TODO: 'bg-slate-100 text-slate-600',
	SUBMITTED: 'bg-slate-100 text-slate-600',
	LOW: 'bg-slate-100 text-slate-600',
	// blue
	IN_PROGRESS: 'bg-blue-50 text-blue-700',
	UNDER_REVIEW: 'bg-indigo-50 text-indigo-700',
	ACCEPTED: 'bg-blue-50 text-blue-700',
	MEDIUM: 'bg-blue-50 text-blue-700',
	// amber
	AT_RISK: 'bg-amber-50 text-amber-700',
	CLARIFICATION_REQUIRED: 'bg-amber-50 text-amber-700',
	HIGH: 'bg-amber-50 text-amber-700',
	// red
	BLOCKED: 'bg-red-50 text-red-700',
	DECLINED: 'bg-red-50 text-red-700',
	URGENT: 'bg-red-50 text-red-700',
	// green
	COMPLETED: 'bg-green-50 text-green-700',
	ON_TRACK: 'bg-green-50 text-green-700',
};

const label = computed(() => (props.value ? (LABELS[props.kind]?.[props.value] ?? props.value) : '—'));
const tone = computed(() =>
	props.kind === 'stage' || props.kind === 'crType' || props.kind === 'team'
		? 'bg-blue-50 text-blue-700'
		: (TONES[props.value ?? ''] ?? 'bg-slate-100 text-slate-600'),
);
</script>

<template>
	<span class="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="tone">
		{{ label }}
	</span>
</template>
