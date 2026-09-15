<script setup lang="ts">
useHead({ title: 'Scopes' });

const { data, pending } = await useFetch<{ scopes: any[] }>('/api/admin/scopes');
const scopes = computed(() => data.value?.scopes ?? []);

const STATUS_COLOR: Record<string, string> = {
	DRAFT: 'gray',
	SUBMITTED: 'blue',
	UNDER_REVIEW: 'blue',
	CLARIFICATION_REQUIRED: 'amber',
	READY_FOR_APPROVAL: 'violet',
	APPROVED: 'green',
};

function label(s: string) {
	return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(v?: string | null) {
	if (!v) return 'Not submitted';
	return new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
</script>

<template>
	<div class="space-y-6">
		<header>
			<h1 class="text-2xl font-bold tracking-tight font-display text-slate-900">Scopes</h1>
			<p class="mt-1 text-sm text-slate-500">Client scope documents awaiting review and approval.</p>
		</header>

		<div class="bg-white border shadow-sm border-slate-200 rounded-panel">
			<div v-if="pending" class="px-5 py-10 text-sm text-center text-slate-500">Loading scopes…</div>
			<ul v-else-if="scopes.length" class="divide-y divide-slate-100">
				<li v-for="sc in scopes" :key="sc.id" class="flex flex-wrap items-center gap-3 px-5 py-4">
					<div class="min-w-0 grow">
						<NuxtLink :to="`/admin/scopes/${sc.id}`" class="text-sm font-semibold text-slate-900 hover:text-blue-700">
							{{ sc.organization?.name }}
						</NuxtLink>
						<p class="mt-0.5 text-xs text-slate-500">
							{{ sc.completionPercentage }}% complete · v{{ sc.currentVersion }} ·
							{{ sc._count.discussions }} discussion(s) · {{ sc._count.files }} file(s)
						</p>
					</div>
					<UBadge :color="STATUS_COLOR[sc.status] ?? 'gray'" variant="subtle" size="xs">
						{{ label(sc.status) }}
					</UBadge>
					<span class="text-xs text-slate-400">{{ fmt(sc.submittedAt) }}</span>
					<UButton :to="`/admin/scopes/${sc.id}`" size="xs" variant="outline" icon="i-heroicons-arrow-right" />
				</li>
			</ul>
			<p v-else class="px-5 py-10 text-sm text-center text-slate-500">No scopes yet.</p>
		</div>
	</div>
</template>
