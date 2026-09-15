<script setup lang="ts">
import { SRS_STATUS_LABEL } from '~~/shared/srs-template';

const props = defineProps<{ status?: string | null; fallback?: string }>();

const STYLES: Record<string, string> = {
	DRAFT: 'bg-slate-100 text-slate-600',
	INTERNAL_REVIEW: 'bg-slate-100 text-slate-600',
	CLIENT_REVIEW: 'bg-blue-50 text-blue-700',
	CHANGES_REQUESTED: 'bg-amber-50 text-amber-700',
	READY_FOR_APPROVAL: 'bg-indigo-50 text-indigo-700',
	APPROVED: 'bg-green-50 text-green-700',
	// Scope statuses share this badge.
	IN_PROGRESS: 'bg-blue-50 text-blue-700',
	SUBMITTED: 'bg-indigo-50 text-indigo-700',
	NOT_STARTED: 'bg-slate-100 text-slate-500',
};

const label = computed(() => {
	if (!props.status) return props.fallback ?? 'Not started';
	return SRS_STATUS_LABEL[props.status] ?? props.status.replaceAll('_', ' ').toLowerCase();
});

const style = computed(() => STYLES[props.status ?? ''] ?? 'bg-slate-100 text-slate-500');
</script>

<template>
	<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize" :class="style">
		{{ label }}
	</span>
</template>
