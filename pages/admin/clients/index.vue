<script setup lang="ts">
useHead({ title: 'Clients' });

const { data, pending, refresh } = await useFetch('/api/admin/clients');
const organizations = computed(() => data.value?.organizations ?? []);

const search = ref('');
const shown = computed(() => {
	const q = search.value.trim().toLowerCase();
	if (!q) return organizations.value;
	return organizations.value.filter(
		(o: any) =>
			o.name.toLowerCase().includes(q) ||
			(o.users ?? []).some((u: any) => (u.email ?? '').toLowerCase().includes(q)),
	);
});

const busyId = ref<string | null>(null);

async function setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
	busyId.value = id;
	try {
		await $fetch(`/api/admin/clients/${id}`, { method: 'PATCH', body: { status } });
		await refresh();
	} finally {
		busyId.value = null;
	}
}
</script>

<template>
	<div class="space-y-6">
		<header class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold tracking-tight font-display text-slate-900">Clients</h1>
				<p class="mt-1 text-sm text-slate-500">Companies you work with and their portal access.</p>
			</div>
			<UButton to="/admin/clients/new" size="sm" label="New Client" icon="material-symbols:add-rounded" />
		</header>

		<div class="bg-white border shadow-sm border-slate-200 rounded-panel">
			<div class="px-5 py-4 border-b border-slate-200">
				<UInput
					v-model="search"
					icon="material-symbols:search-rounded"
					placeholder="Search clients…"
					class="max-w-xs"
				/>
			</div>

			<div v-if="pending" class="px-5 py-10 text-sm text-center text-slate-500">Loading clients…</div>

			<ul v-else-if="shown.length" class="divide-y divide-slate-100">
				<li v-for="org in shown" :key="org.id" class="flex flex-wrap items-center gap-3 px-5 py-4">
					<div class="min-w-0 grow">
						<NuxtLink
							:to="`/admin/clients/${org.id}`"
							class="text-sm font-semibold text-slate-900 hover:text-blue-700"
						>
							{{ org.name }}
						</NuxtLink>
						<p class="mt-0.5 text-xs text-slate-500">
							<span v-if="org.users?.length">{{ org.users[0].email }}</span>
							<span v-else class="italic">no portal user</span>
							· {{ org._count.projects }} project(s)
						</p>
					</div>

					<UBadge :color="org.status === 'ACTIVE' ? 'green' : 'rose'" variant="subtle" size="xs">
						{{ org.status }}
					</UBadge>

					<UButton
						v-if="org.status === 'ACTIVE'"
						size="xs"
						color="white"
						label="Suspend"
						:loading="busyId === org.id"
						@click="setStatus(org.id, 'SUSPENDED')"
					/>
					<UButton
						v-else
						size="xs"
						color="white"
						label="Activate"
						:loading="busyId === org.id"
						@click="setStatus(org.id, 'ACTIVE')"
					/>
					<UButton :to="`/admin/clients/${org.id}`" size="xs" variant="ghost" label="View" />
				</li>
			</ul>

			<p v-else class="px-5 py-10 text-sm text-center text-slate-500">
				{{ search ? 'No clients match that search.' : 'No clients yet. Create your first one to get started.' }}
			</p>
		</div>
	</div>
</template>
