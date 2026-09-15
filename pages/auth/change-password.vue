<script setup lang="ts">
definePageMeta({ layout: 'auth' });
useHead({ title: 'Choose your password' });

const { user, fetchUser } = useAuth();

const form = reactive({ currentPassword: '', newPassword: '', confirm: '' });
const loading = ref(false);
const error = ref<string | null>(null);

const mismatch = computed(() => form.confirm.length > 0 && form.newPassword !== form.confirm);
const canSubmit = computed(
	() => !!form.currentPassword && form.newPassword.length >= 8 && form.newPassword === form.confirm && !loading.value,
);

async function submit() {
	loading.value = true;
	error.value = null;
	try {
		const res = await $fetch<{ redirect: string }>('/api/auth/change-initial-password', {
			method: 'POST',
			body: { currentPassword: form.currentPassword, newPassword: form.newPassword },
		});
		await fetchUser();
		await navigateTo(res.redirect);
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not update your password.';
	} finally {
		loading.value = false;
	}
}
</script>

<template>
	<div v-auto-animate class="space-y-6">
		<div class="space-y-1.5">
			<h1 class="text-xl font-bold tracking-tight font-display text-slate-900">Choose your password</h1>
			<p class="text-sm text-slate-500">
				You're signed in with a temporary password. Please set your own before continuing.
			</p>
		</div>

		<UAlert
			v-if="error"
			color="rose"
			variant="outline"
			icon="material-symbols:warning-outline-rounded"
			title="Could not update your password"
			:description="error"
		/>

		<form class="grid gap-4" @submit.prevent="submit">
			<UFormGroup label="Temporary password" required>
				<UInput
					v-model="form.currentPassword"
					type="password"
					name="currentPassword"
					size="lg"
					placeholder="The password you were given"
					:disabled="loading"
				/>
			</UFormGroup>
			<UFormGroup label="New password" required hint="At least 8 characters">
				<UInput v-model="form.newPassword" type="password" name="newPassword" size="lg" :disabled="loading" />
			</UFormGroup>
			<UFormGroup label="Confirm new password" required :error="mismatch && 'Passwords do not match'">
				<UInput v-model="form.confirm" type="password" name="confirmPassword" size="lg" :disabled="loading" />
			</UFormGroup>
			<UButton
				type="submit"
				size="lg"
				block
				label="Set password and continue"
				:loading="loading"
				:disabled="!canSubmit"
			/>
		</form>

		<p class="text-xs text-slate-400">Signed in as {{ user?.email }}</p>
	</div>
</template>
