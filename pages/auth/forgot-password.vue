<script setup lang="ts">
definePageMeta({ layout: 'auth' });
useHead({ title: 'Reset your password' });

const { requestPasswordReset } = useAuth();

const email = ref('');
const loading = ref(false);
const submitted = ref(false);
const error = ref<string | null>(null);

async function onSubmit() {
	loading.value = true;
	error.value = null;

	try {
		await requestPasswordReset(email.value);
		// The API responds the same way whether or not the account exists -
		// never confirm which email addresses are registered.
		submitted.value = true;
	} catch (err: any) {
		error.value = err?.message ?? 'Something went wrong. Please try again.';
	} finally {
		loading.value = false;
	}
}
</script>

<template>
	<div v-auto-animate class="space-y-6">
		<div class="space-y-1.5">
			<h1 class="text-xl font-bold tracking-tight font-display text-slate-900">Reset your password</h1>
			<p class="text-sm text-slate-500">
				Enter the email address for your Eiretech portal account and we'll send you a reset link.
			</p>
		</div>

		<UAlert
			v-if="submitted"
			color="blue"
			variant="subtle"
			icon="material-symbols:mark-email-read-outline-rounded"
			title="Check your inbox"
			description="If an account exists for that address, a password reset link is on its way."
		/>

		<template v-else>
			<UAlert
				v-if="error"
				color="rose"
				variant="outline"
				icon="material-symbols:warning-outline-rounded"
				title="Something went wrong"
				:description="error"
			/>

			<form class="grid gap-4" @submit.prevent="onSubmit">
				<UFormGroup label="Email" required>
					<UInput
						v-model="email"
						type="email"
						name="email"
						size="lg"
						placeholder="you@company.com"
						:disabled="loading"
					/>
				</UFormGroup>
				<UButton type="submit" size="lg" block label="Send reset link" :loading="loading" :disabled="!email" />
			</form>
		</template>

		<NuxtLink to="/auth/signin" class="inline-flex items-center gap-1 text-sm text-blue-700 hover:text-blue-800">
			<UIcon name="material-symbols:arrow-back-rounded" class="w-4 h-4" />
			Back to sign in
		</NuxtLink>
	</div>
</template>
