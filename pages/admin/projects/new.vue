<script setup lang="ts">
useHead({ title: 'New Project' });

const route = useRoute();
const { data: clientData } = await useFetch('/api/admin/clients');
const organizations = computed(() => clientData.value?.organizations ?? []);

const STAGES = ['PLANNING', 'DESIGN', 'DEVELOPMENT', 'QA', 'CLIENT_REVIEW', 'DEPLOYMENT', 'COMPLETED', 'ON_HOLD'];

const form = reactive({
	organizationId: (route.query.organizationId as string) ?? '',
	name: '',
	description: '',
	currentStage: 'PLANNING',
	startDate: '',
	targetDate: '',
});

const saving = ref(false);
const error = ref<string | null>(null);
const canSubmit = computed(() => form.organizationId && form.name.trim());

async function submit() {
	saving.value = true;
	error.value = null;
	try {
		const res = await $fetch<{ project: { id: string } }>('/api/admin/projects', {
			method: 'POST',
			body: { ...form },
		});
		await navigateTo(`/admin/projects/${res.project.id}`);
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not create the project.';
	} finally {
		saving.value = false;
	}
}
</script>

<template>
	<div class="max-w-2xl mx-auto space-y-6">
		<header>
			<VBreadcrumbs :items="[{ title: 'Projects', href: '/admin/projects' }, { title: 'New Project' }]" />
			<h1 class="mt-1 text-2xl font-bold tracking-tight font-display text-slate-900">New Project</h1>
		</header>

		<form class="p-6 space-y-5 bg-white border shadow-sm border-slate-200 rounded-panel" @submit.prevent="submit">
			<VAlert v-if="error" type="error">{{ error }}</VAlert>

			<UFormGroup label="Client" required>
				<USelect
					v-model="form.organizationId"
					size="lg"
					:options="organizations.map((o) => ({ label: o.name, value: o.id }))"
					placeholder="Select a client"
					:disabled="saving"
				/>
			</UFormGroup>

			<UFormGroup label="Project name" required>
				<UInput v-model="form.name" size="lg" placeholder="Website redesign" :disabled="saving" />
			</UFormGroup>

			<UFormGroup label="Description">
				<UTextarea v-model="form.description" :rows="3" :disabled="saving" />
			</UFormGroup>

			<UFormGroup label="Current stage">
				<USelect v-model="form.currentStage" size="lg" :options="STAGES" :disabled="saving" />
			</UFormGroup>

			<div class="grid gap-5 sm:grid-cols-2">
				<UFormGroup label="Start date">
					<UInput v-model="form.startDate" type="date" size="lg" :disabled="saving" />
				</UFormGroup>
				<UFormGroup label="Target date">
					<UInput v-model="form.targetDate" type="date" size="lg" :disabled="saving" />
				</UFormGroup>
			</div>

			<div class="flex justify-end gap-3 pt-2">
				<UButton to="/admin/projects" color="white" size="lg" label="Cancel" />
				<UButton type="submit" size="lg" label="Create Project" :loading="saving" :disabled="!canSubmit" />
			</div>
		</form>
	</div>
</template>
