<script setup lang="ts">
useHead({ title: 'New Client' });

const form = reactive({
	organizationName: '',
	firstName: '',
	lastName: '',
	email: '',
	phone: '',
	website: '',
});

const saving = ref(false);
const error = ref<string | null>(null);

/**
 * The temporary password comes back exactly once, at creation. It is never
 * stored in plaintext and cannot be retrieved again — only reset.
 */
const created = ref<{
	organization: { id: string; name: string };
	user: { email: string };
	temporaryPassword: string;
} | null>(null);

const canSubmit = computed(
	() => form.organizationName.trim() && form.firstName.trim() && form.lastName.trim() && form.email.trim(),
);

async function submit() {
	saving.value = true;
	error.value = null;
	try {
		created.value = await $fetch<{
			organization: { id: string; name: string };
			user: { email: string };
			temporaryPassword: string;
		}>('/api/admin/clients', { method: 'POST', body: { ...form } });
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? e?.message ?? 'Could not create the client.';
	} finally {
		saving.value = false;
	}
}

const copied = ref(false);
async function copyPassword() {
	if (!created.value) return;
	await navigator.clipboard.writeText(created.value.temporaryPassword).catch(() => undefined);
	copied.value = true;
	setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
	<div class="max-w-2xl mx-auto space-y-6">
		<header>
			<VBreadcrumbs :items="[{ title: 'Clients', href: '/admin/clients' }, { title: 'New Client' }]" />
			<h1 class="mt-1 text-2xl font-bold tracking-tight font-display text-slate-900">New Client</h1>
			<p class="mt-1 text-sm text-slate-500">
				Creates the company, the portal user, and their login in one step.
			</p>
		</header>

		<!-- credentials handover -->
		<section v-if="created" class="p-6 bg-white border shadow-sm border-slate-200 rounded-panel">
			<div class="flex items-start gap-3">
				<UIcon name="material-symbols:check-circle-outline-rounded" class="w-6 h-6 mt-0.5 text-green-600" />
				<div class="min-w-0">
					<h2 class="text-base font-semibold text-slate-900">{{ created.organization.name }} created</h2>
					<p class="mt-1 text-sm text-slate-500">
						Share these credentials with your client. The password is shown once and cannot be retrieved again —
						only reset.
					</p>
				</div>
			</div>

			<dl class="mt-5 space-y-3">
				<div>
					<dt class="text-xs font-medium text-slate-500">Email</dt>
					<dd class="mt-1 px-3 py-2 font-mono text-sm rounded-button bg-slate-50 text-slate-800">
						{{ created.user.email }}
					</dd>
				</div>
				<div>
					<dt class="text-xs font-medium text-slate-500">Temporary password</dt>
					<dd class="flex items-center gap-2 mt-1">
						<code class="px-3 py-2 font-mono text-sm rounded-button bg-slate-50 text-slate-800 grow">
							{{ created.temporaryPassword }}
						</code>
						<UButton size="sm" color="white" :label="copied ? 'Copied' : 'Copy'" @click="copyPassword" />
					</dd>
				</div>
			</dl>

			<p class="mt-4 text-xs text-slate-500">
				The client will be asked to choose their own password after signing in.
			</p>

			<div class="flex flex-wrap gap-3 mt-6">
				<UButton :to="`/admin/clients/${created.organization.id}`" label="Open client" />
				<UButton to="/admin/clients" color="white" label="Back to clients" />
			</div>
		</section>

		<!-- form -->
		<form v-else class="p-6 space-y-5 bg-white border shadow-sm border-slate-200 rounded-panel" @submit.prevent="submit">
			<VAlert v-if="error" type="error">{{ error }}</VAlert>

			<UFormGroup label="Company / Organisation name" required>
				<UInput v-model="form.organizationName" size="lg" placeholder="Candy Cloud Ltd" :disabled="saving" />
			</UFormGroup>

			<div class="grid gap-5 sm:grid-cols-2">
				<UFormGroup label="Client first name" required>
					<UInput v-model="form.firstName" size="lg" placeholder="Jane" :disabled="saving" />
				</UFormGroup>
				<UFormGroup label="Client last name" required>
					<UInput v-model="form.lastName" size="lg" placeholder="Doe" :disabled="saving" />
				</UFormGroup>
			</div>

			<UFormGroup label="Email" required hint="Used as their portal login">
				<UInput v-model="form.email" type="email" size="lg" placeholder="jane@candycloud.com" :disabled="saving" />
			</UFormGroup>

			<div class="grid gap-5 sm:grid-cols-2">
				<UFormGroup label="Phone">
					<UInput v-model="form.phone" size="lg" placeholder="Optional" :disabled="saving" />
				</UFormGroup>
				<UFormGroup label="Website">
					<UInput v-model="form.website" size="lg" placeholder="Optional" :disabled="saving" />
				</UFormGroup>
			</div>

			<div class="flex justify-end gap-3 pt-2">
				<UButton to="/admin/clients" color="white" size="lg" label="Cancel" />
				<UButton type="submit" size="lg" label="Create Client" :loading="saving" :disabled="!canSubmit" />
			</div>
		</form>
	</div>
</template>
