<script setup lang="ts">
definePageMeta({ layout: 'auth' });
useHead({ title: 'Choose a new password' });

const route = useRoute();
const { resetPassword } = useAuth();

// The reset link carries ?token=...
const token = computed(() => (route.query.token as string | undefined) ?? '');

const password = ref('');
const confirm = ref('');
const loading = ref(false);
const done = ref(false);
const error = ref<string | null>(null);

const mismatch = computed(() => confirm.value.length > 0 && password.value !== confirm.value);
const canSubmit = computed(
	() => !!token.value && password.value.length >= 8 && password.value === confirm.value && !loading.value,
);

async function onSubmit() {
	loading.value = true;
	error.value = null;

	try {
		await resetPassword(token.value, password.value);
		done.value = true;
	} catch (err: any) {
		error.value = err?.message ?? 'That reset link is invalid or has expired. Please request a new one.';
	} finally {
		loading.value = false;
	}
}
</script>

<template>
	<div v-auto-animate class="space-y-6">
		<div class="space-y-1.5">
			<h1 class="text-xl font-bold tracking-tight font-display text-slate-900">Choose a new password</h1>
			<p class="text-sm text-slate-500">Your new password must be at least 8 characters.</p>
		</div>

		<UAlert
			v-if="done"
			color="blue"
			variant="subtle"
			icon="material-symbols:check-circle-outline-rounded"
			title="Password updated"
			description="You can now sign in with your new password."
		/>

		<UAlert
			v-else-if="!token"
			color="rose"
			variant="outline"
			icon="material-symbols:warning-outline-rounded"
			title="Missing reset token"
			description="Open the link from your reset email, or request a new one."
		/>

		<template v-else>
			<UAlert
				v-if="error"
				color="rose"
				variant="outline"
				icon="material-symbols:warning-outline-rounded"
				title="Could not reset password"
				:description="error"
			/>

			<form class="grid gap-4" @submit.prevent="onSubmit">
				<UFormGroup label="New password" required>
					<UInput v-model="password" type="password" size="lg" placeholder="At least 8 characters" :disabled="loading" />
				</UFormGroup>
				<UFormGroup label="Confirm new password" required :error="mismatch && 'Passwords do not match'">
					<UInput v-model="confirm" type="password" size="lg" placeholder="Re-enter your password" :disabled="loading" />
				</UFormGroup>
				<UButton type="submit" size="lg" block label="Update password" :loading="loading" :disabled="!canSubmit" />
			</form>
		</template>

		<NuxtLink to="/auth/signin" class="inline-flex items-center gap-1 text-sm text-blue-700 hover:text-blue-800">
			<UIcon name="material-symbols:arrow-back-rounded" class="w-4 h-4" />
			Back to sign in
		</NuxtLink>
	</div>
</template>
