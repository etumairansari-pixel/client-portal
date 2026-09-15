<script setup lang="ts">
/** Dashboard card driven entirely by real Scope state — never a placeholder. */
const { data, pending } = await useFetch<{
	scope: { status: string; completionPercentage: number; submittedAt: string | null; approvedAt: string | null };
}>('/api/portal/scope');

const scope = computed(() => data.value?.scope ?? null);

const card = computed(() => {
	const s = scope.value;
	if (!s) {
		return { label: 'Project Scope', headline: 'Complete Project Scope', body: 'Tell us about your project so our team can prepare the plan.', cta: 'Start Scope' };
	}

	switch (s.status) {
		case 'DRAFT':
			return {
				label: 'Project Scope',
				headline: `Continue Scope — ${s.completionPercentage}% Complete`,
				body: 'Pick up where you left off. Your answers save automatically.',
				cta: 'Continue Scope',
				percent: s.completionPercentage,
			};
		case 'CLARIFICATION_REQUIRED':
			return { label: 'Action Required', headline: 'Scope Clarification', body: 'Our team needs a little more information before planning can continue.', cta: 'Answer Questions' };
		case 'READY_FOR_APPROVAL':
			return { label: 'Project Scope', headline: 'Scope Ready for Approval', body: 'Please review the final scope and confirm you are happy to proceed.', cta: 'Review & Approve' };
		case 'APPROVED':
			return { label: 'Project Scope', headline: 'Scope Approved', body: 'Your scope is agreed and locked. We are moving into planning.', cta: 'View Scope' };
		default:
			return { label: 'Project Scope', headline: 'Scope Under Review', body: 'Our team is reviewing your requirements.', cta: 'View Scope' };
	}
});
</script>

<template>
	<section v-if="!pending" class="flex flex-col p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
		<div class="flex items-center gap-2">
			<UIcon name="material-symbols:description-outline-rounded" class="w-4 h-4 text-slate-400" />
			<h2 class="text-sm font-medium text-slate-500">{{ card.label }}</h2>
		</div>

		<p class="mt-2 text-lg font-semibold tracking-tight text-slate-900">{{ card.headline }}</p>
		<p class="mt-1 text-sm text-slate-500">{{ card.body }}</p>

		<div v-if="typeof card.percent === 'number'" class="w-full h-2 mt-4 overflow-hidden rounded-full bg-slate-100">
			<div class="h-full rounded-full bg-blue-600" :style="{ width: card.percent + '%' }" />
		</div>

		<div class="mt-4">
			<UButton to="/portal/scope" size="sm" :label="card.cta" trailing-icon="material-symbols:arrow-forward-rounded" />
		</div>
	</section>
</template>
