<script setup lang="ts">
const route = useRoute();
const id = route.params.id as string;

const { data, pending, refresh } = await useFetch<{ organization: any }>(`/api/admin/clients/${id}`);
const organization = computed(() => data.value?.organization);
const users = computed(() => organization.value?.users ?? []);
const projects = computed(() => organization.value?.projects ?? []);

useHead({ title: () => organization.value?.name ?? 'Client' });

const busy = ref(false);
const resetResult = ref<{ email: string; temporaryPassword: string } | null>(null);
const error = ref<string | null>(null);

async function setStatus(status: 'ACTIVE' | 'SUSPENDED') {
	busy.value = true;
	error.value = null;
	try {
		await $fetch(`/api/admin/clients/${id}`, { method: 'PATCH', body: { status } });
		await refresh();
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not update the client.';
	} finally {
		busy.value = false;
	}
}

async function resetAccess() {
	busy.value = true;
	error.value = null;
	try {
		// Typed explicitly: the template-literal URL otherwise makes Nuxt's
		// generated route union exceed TypeScript's instantiation depth.
		resetResult.value = await $fetch<{ email: string; temporaryPassword: string }>(
			`/api/admin/clients/${id}/reset-access` as string,
			{ method: 'POST' },
		);
		await refresh();
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not reset access.';
	} finally {
		busy.value = false;
	}
}

function formatDate(value?: string | null) {
	if (!value) return '—';
	return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
</script>

<template>
	<div v-if="pending" class="py-16 text-sm text-center text-slate-500">Loading client…</div>

	<div v-else-if="organization" class="space-y-6">
		<header class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<VBreadcrumbs :items="[{ title: 'Clients', href: '/admin/clients' }, { title: organization.name }]" />
				<h1 class="mt-1 text-2xl font-bold tracking-tight font-display text-slate-900">{{ organization.name }}</h1>
				<div class="flex items-center gap-2 mt-2">
					<UBadge :color="organization.status === 'ACTIVE' ? 'green' : 'rose'" variant="subtle" size="xs">
						{{ organization.status }}
					</UBadge>
					<span class="text-xs text-slate-400">Client since {{ formatDate(organization.createdAt) }}</span>
				</div>
			</div>
			<div class="flex flex-wrap gap-2">
				<UButton
					v-if="organization.status === 'ACTIVE'"
					color="white"
					size="sm"
					label="Suspend"
					:loading="busy"
					@click="setStatus('SUSPENDED')"
				/>
				<UButton v-else color="white" size="sm" label="Activate" :loading="busy" @click="setStatus('ACTIVE')" />
				<UButton color="white" size="sm" label="Reset Access" :loading="busy" @click="resetAccess" />
				<UButton :to="`/admin/projects/new?organizationId=${organization.id}`" size="sm" label="New Project" />
			</div>
		</header>

		<VAlert v-if="error" type="error">{{ error }}</VAlert>

		<section v-if="resetResult" class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
			<h2 class="text-sm font-semibold text-slate-900">New temporary password</h2>
			<p class="mt-1 text-sm text-slate-500">
				Shown once. All existing sessions for {{ resetResult.email }} have been signed out.
			</p>
			<code class="inline-block px-3 py-2 mt-3 font-mono text-sm rounded-button bg-slate-50 text-slate-800">
				{{ resetResult.temporaryPassword }}
			</code>
		</section>

		<div class="grid gap-5 lg:grid-cols-2">
			<section class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
				<h2 class="text-sm font-semibold text-slate-900">Company</h2>
				<dl class="mt-3 space-y-2 text-sm">
					<div class="flex justify-between gap-3">
						<dt class="text-slate-500">Email</dt>
						<dd class="text-slate-800">{{ organization.email ?? '—' }}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class="text-slate-500">Phone</dt>
						<dd class="text-slate-800">{{ organization.phone ?? '—' }}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class="text-slate-500">Website</dt>
						<dd class="truncate text-slate-800">{{ organization.website ?? '—' }}</dd>
					</div>
				</dl>
			</section>

			<section class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
				<h2 class="text-sm font-semibold text-slate-900">Portal users</h2>
				<ul v-if="users.length" class="mt-3 divide-y divide-slate-100">
					<li v-for="u in users" :key="u.id" class="py-2">
						<p class="text-sm font-medium text-slate-800">
							{{ [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email }}
						</p>
						<p class="text-xs text-slate-500">{{ u.email }}</p>
						<p class="mt-0.5 text-xs text-slate-400">
							{{ u.status }} · last login {{ formatDate(u.lastLoginAt) }}
							<span v-if="u.mustChangePassword"> · must change password</span>
						</p>
					</li>
				</ul>
				<p v-else class="mt-3 text-sm text-slate-500">No portal user.</p>
			</section>
		</div>

		<section class="bg-white border shadow-sm border-slate-200 rounded-panel">
			<header class="flex items-center justify-between px-5 py-4 border-b border-slate-200">
				<h2 class="text-sm font-semibold text-slate-900">Projects</h2>
				<UButton :to="`/admin/projects/new?organizationId=${organization.id}`" size="xs" variant="ghost" label="Add project" />
			</header>
			<ul v-if="projects.length" class="divide-y divide-slate-100">
				<li v-for="p in projects" :key="p.id" class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
					<NuxtLink :to="`/admin/projects/${p.id}`" class="text-sm font-medium text-slate-700 hover:text-blue-700">
						{{ p.name }}
					</NuxtLink>
					<div class="flex items-center gap-3">
						<UBadge variant="subtle" size="xs" color="blue">{{ p.currentStage }}</UBadge>
						<span class="text-xs text-slate-400">Target {{ formatDate(p.targetDate) }}</span>
					</div>
				</li>
			</ul>
			<p v-else class="px-5 py-8 text-sm text-center text-slate-500">No projects yet for this client.</p>
		</section>
	</div>
</template>
