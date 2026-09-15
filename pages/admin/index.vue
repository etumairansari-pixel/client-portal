<script setup lang="ts">
useHead({ title: 'Admin Dashboard' });

const { data, pending } = await useFetch('/api/admin/dashboard');

const stats = computed(() => data.value?.stats);
const recent = computed(() => data.value?.recentClients ?? []);

const cards = computed(() => [
	{ label: 'Total Clients', value: stats.value?.totalClients, icon: 'material-symbols:apartment-rounded' },
	{ label: 'Active Clients', value: stats.value?.activeClients, icon: 'material-symbols:check-circle-outline-rounded' },
	{ label: 'Active Projects', value: stats.value?.activeProjects, icon: 'material-symbols:tab-group-outline-rounded' },
	{ label: 'Awaiting Setup', value: stats.value?.awaitingSetup, icon: 'material-symbols:pending-outline-rounded' },
]);
</script>

<template>
	<div class="space-y-6">
		<header class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold tracking-tight font-display text-slate-900">Dashboard</h1>
				<p class="mt-1 text-sm text-slate-500">Overview of your clients and delivery.</p>
			</div>
			<UButton to="/admin/clients/new" size="sm" label="New Client" icon="material-symbols:add-rounded" />
		</header>

		<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
			<section
				v-for="card in cards"
				:key="card.label"
				class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel"
			>
				<div class="flex items-center gap-2">
					<UIcon :name="card.icon" class="w-4 h-4 text-slate-400" />
					<h2 class="text-sm font-medium text-slate-500">{{ card.label }}</h2>
				</div>
				<p class="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
					{{ pending ? '—' : (card.value ?? 0) }}
				</p>
			</section>
		</div>

		<section class="bg-white border shadow-sm border-slate-200 rounded-panel">
			<header class="flex items-center justify-between px-5 py-4 border-b border-slate-200">
				<h2 class="text-sm font-semibold text-slate-900">Recent Clients</h2>
				<UButton to="/admin/clients" size="xs" variant="ghost" label="View all" />
			</header>
			<ul v-if="recent.length" class="divide-y divide-slate-100">
				<li v-for="org in recent" :key="org.id" class="flex items-center justify-between gap-3 px-5 py-3">
					<NuxtLink :to="`/admin/clients/${org.id}`" class="text-sm font-medium text-slate-700 hover:text-blue-700">
						{{ org.name }}
					</NuxtLink>
					<div class="flex items-center gap-3">
						<span class="text-xs text-slate-400">{{ org._count.projects }} project(s)</span>
						<UBadge :color="org.status === 'ACTIVE' ? 'green' : 'rose'" variant="subtle" size="xs">
							{{ org.status }}
						</UBadge>
					</div>
				</li>
			</ul>
			<p v-else-if="!pending" class="px-5 py-8 text-sm text-center text-slate-500">
				No clients yet. Create your first one to get started.
			</p>
		</section>
	</div>
</template>
