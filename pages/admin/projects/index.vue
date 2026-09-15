<script setup lang="ts">
useHead({ title: 'Projects' });

const { data, pending } = await useFetch('/api/admin/projects');
const projects = computed(() => data.value?.projects ?? []);

function formatDate(v?: string | null) {
	if (!v) return 'No target date';
	return new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
</script>

<template>
	<div class="space-y-6">
		<header class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold tracking-tight font-display text-slate-900">Projects</h1>
				<p class="mt-1 text-sm text-slate-500">All client engagements.</p>
			</div>
			<UButton to="/admin/projects/new" size="sm" label="New Project" icon="material-symbols:add-rounded" />
		</header>

		<div class="bg-white border shadow-sm border-slate-200 rounded-panel">
			<div v-if="pending" class="px-5 py-10 text-sm text-center text-slate-500">Loading projects…</div>
			<ul v-else-if="projects.length" class="divide-y divide-slate-100">
				<li v-for="p in projects" :key="p.id" class="flex flex-wrap items-center gap-3 px-5 py-4">
					<div class="min-w-0 grow">
						<NuxtLink :to="`/admin/projects/${p.id}`" class="text-sm font-semibold text-slate-900 hover:text-blue-700">
							{{ p.name }}
						</NuxtLink>
						<p class="mt-0.5 text-xs text-slate-500">{{ p.organization?.name }}</p>
					</div>
					<UBadge variant="subtle" size="xs" color="blue">{{ p.currentStage }}</UBadge>
					<UBadge variant="subtle" size="xs" :color="p.status === 'ACTIVE' ? 'green' : 'gray'">{{ p.status }}</UBadge>
					<span class="text-xs text-slate-400">{{ formatDate(p.targetDate) }}</span>
				</li>
			</ul>
			<p v-else class="px-5 py-10 text-sm text-center text-slate-500">No projects yet.</p>
		</div>
	</div>
</template>
