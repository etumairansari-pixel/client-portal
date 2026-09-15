<script setup lang="ts">
useHead({ title: 'Dashboard' });

const { user } = useAuth();
const { data, pending } = await useFetch('/api/portal/dashboard');

const projects = computed(() => data.value?.projects ?? []);
const activeProjects = computed(() => data.value?.stats?.activeProjects ?? 0);

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

const nextTarget = computed(() => {
	const dated = projects.value.filter((p: any) => p.targetDate);
	if (!dated.length) return null;
	return dated[0];
});

function formatDate(v?: string | null) {
	if (!v) return null;
	return new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
</script>

<template>
	<div class="space-y-6">
		<header>
			<h1 class="text-2xl font-bold tracking-tight font-display text-slate-900">
				{{ greetUser() }}, {{ user?.firstName ?? 'there' }}
			</h1>
			<p class="mt-1 text-sm text-slate-500">Here's the latest on your projects with our team.</p>
		</header>

		<div class="grid w-full grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
			<PortalScopeStatusCard />

			<section class="flex flex-col p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
				<div class="flex items-center gap-2">
					<UIcon name="material-symbols:tab-group-outline-rounded" class="w-4 h-4 text-slate-400" />
					<h2 class="text-sm font-medium text-slate-500">Active Projects</h2>
				</div>
				<p class="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
					{{ pending ? '—' : activeProjects }}
				</p>
				<ul v-if="projects.length" class="mt-4 divide-y divide-slate-100">
					<li v-for="p in projects" :key="p.id" class="flex items-center justify-between gap-3 py-2.5">
						<NuxtLink
							:to="`/portal/projects/${p.id}`"
							class="min-w-0 text-sm font-medium truncate text-slate-700 hover:text-blue-700"
						>
							{{ p.name }}
						</NuxtLink>
						<span class="text-xs whitespace-nowrap text-slate-400">{{ STAGE_LABEL[p.currentStage] }}</span>
					</li>
				</ul>
				<p v-else-if="!pending" class="mt-4 text-sm text-slate-500">
					No projects yet. Your Eiretech team will add them here.
				</p>
			</section>

			<section class="flex flex-col p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
				<div class="flex items-center gap-2">
					<UIcon name="material-symbols:flag-outline-rounded" class="w-4 h-4 text-slate-400" />
					<h2 class="text-sm font-medium text-slate-500">Current Stage</h2>
				</div>
				<p class="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
					{{ pending ? '—' : (projects.length ? STAGE_LABEL[projects[0].currentStage] : 'Not started') }}
				</p>
				<p v-if="projects.length" class="mt-4 text-sm text-slate-500">{{ projects[0].name }}</p>
				<p v-else-if="!pending" class="mt-4 text-sm text-slate-500">
					Your project stage will appear here once work begins.
				</p>
			</section>

			<section class="flex flex-col p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
				<div class="flex items-center gap-2">
					<UIcon name="material-symbols:calendar-month-outline-rounded" class="w-4 h-4 text-slate-400" />
					<h2 class="text-sm font-medium text-slate-500">Next Target Date</h2>
				</div>
				<p class="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
					{{ pending ? '—' : (formatDate(nextTarget?.targetDate) ?? 'Not set') }}
				</p>
				<p v-if="nextTarget" class="mt-4 text-sm text-slate-500">{{ nextTarget.name }}</p>
				<p v-else-if="!pending" class="mt-4 text-sm text-slate-500">
					No target date has been set yet.
				</p>
			</section>
		</div>
	</div>
</template>
