<script setup lang="ts">
useHead({ title: 'Projects' });

const { data, pending } = await useFetch('/api/portal/projects');
const projects = computed(() => data.value?.projects ?? []);

const STAGE_LABEL: Record<string, string> = {
	PLANNING: 'Planning',
	DESIGN: 'Design',
	DEVELOPMENT: 'Development',
	QA: 'QA',
	CLIENT_REVIEW: 'Client Review',
	DEPLOYMENT: 'Deployment',
	COMPLETED: 'Completed',
	ON_HOLD: 'On Hold',
};

function formatDate(v?: string | null) {
	if (!v) return null;
	return new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
</script>

<template>
	<div class="space-y-6">
		<PortalPageHeader title="Projects" :breadcrumbs="[{ title: 'Portal', href: '/portal' }, { title: 'Projects' }]" />

		<div class="bg-white border shadow-sm border-slate-200 rounded-panel">
			<div v-if="pending" class="px-5 py-10 text-sm text-center text-slate-500">Loading projects…</div>

			<ul v-else-if="projects.length" class="divide-y divide-slate-100">
				<li v-for="p in projects" :key="p.id" class="flex flex-wrap items-center gap-3 px-5 py-4">
					<div class="min-w-0 grow">
						<NuxtLink
							:to="`/portal/projects/${p.id}`"
							class="text-sm font-semibold text-slate-900 hover:text-blue-700"
						>
							{{ p.name }}
						</NuxtLink>
						<p v-if="p.description" class="mt-0.5 text-xs truncate text-slate-500">{{ p.description }}</p>
					</div>
					<UBadge variant="subtle" size="xs" color="blue">{{ STAGE_LABEL[p.currentStage] }}</UBadge>
					<span class="text-xs text-slate-400">
						{{ formatDate(p.targetDate) ?? 'No target date' }}
					</span>
					<UButton
						:to="`/portal/projects/${p.id}`"
						size="xs"
						color="primary"
						variant="outline"
						icon="i-heroicons-arrow-right"
					/>
				</li>
			</ul>

			<p v-else class="px-5 py-10 text-sm text-center text-slate-500">
				No projects yet. Your Eiretech team will add them here.
			</p>
		</div>
	</div>
</template>
