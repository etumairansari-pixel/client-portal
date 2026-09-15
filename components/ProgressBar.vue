<script setup lang="ts">
/** Plain progress bar. `null` renders as "Not available yet" - never a fake 0%. */
// Boolean props default to `false` when absent, so the label must opt out
// explicitly rather than rely on `!== false`.
const props = withDefaults(
	defineProps<{ value: number | null | undefined; size?: 'sm' | 'md'; showLabel?: boolean }>(),
	{
		size: 'md',
		showLabel: true,
	},
);
const pct = computed(() => (props.value == null ? null : Math.min(100, Math.max(0, Math.round(props.value)))));
const tone = computed(() => (pct.value === 100 ? 'bg-green-500' : 'bg-blue-600'));
</script>

<template>
	<div class="flex items-center gap-3 min-w-0">
		<div class="overflow-hidden rounded-full grow bg-slate-100" :class="size === 'sm' ? 'h-1.5' : 'h-2.5'">
			<div v-if="pct !== null" class="h-full transition-all rounded-full" :class="tone" :style="{ width: pct + '%' }" />
		</div>
		<span
			v-if="showLabel"
			class="text-xs font-semibold tabular-nums shrink-0"
			:class="pct === null ? 'text-slate-400 font-normal' : 'text-slate-700'"
		>
			{{ pct === null ? 'Not available yet' : pct + '%' }}
		</span>
	</div>
</template>
