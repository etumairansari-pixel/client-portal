<script setup lang="ts">
const { login } = useAuth();
const route = useRoute();

const credentials = reactive({ email: '', password: '' });
const loading = ref(false);
const error = ref<string | null>(null);

async function attemptLogin() {
	loading.value = true;
	error.value = null;

	try {
		const { redirect } = await login(credentials.email, credentials.password);
		// Honour ?redirect= only for in-app paths, never an absolute URL.
		const requested = route.query.redirect?.toString();
		const target = requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : redirect;
		await navigateTo(target);
	} catch (err: any) {
		error.value = err?.data?.statusMessage ?? 'Invalid email or password.';
	} finally {
		loading.value = false;
	}
}
</script>

<template>
	<div v-auto-animate>
		<UAlert
			v-if="error"
			class="mb-4"
			title="Could not sign you in"
			:description="error"
			color="rose"
			variant="outline"
			icon="material-symbols:warning-outline-rounded"
		/>

		<form class="grid gap-4" @submit.prevent="attemptLogin">
			<UFormGroup label="Email" required>
				<UInput
					v-model="credentials.email"
					type="email"
					name="email"
					size="lg"
					placeholder="you@company.com"
					:disabled="loading"
				/>
			</UFormGroup>
			<UFormGroup label="Password" required>
				<UInput
					v-model="credentials.password"
					type="password"
					name="password"
					size="lg"
					placeholder="Your password"
					:disabled="loading"
				/>
			</UFormGroup>
			<UButton
				type="submit"
				:loading="loading"
				:disabled="!credentials.email || !credentials.password"
				size="lg"
				label="Sign In"
				trailing-icon="material-symbols:arrow-forward"
				block
			/>
		</form>

		<div class="mt-4 text-right">
			<NuxtLink to="/auth/forgot-password" class="text-sm text-blue-700 hover:text-blue-800">
				Forgot password?
			</NuxtLink>
		</div>
	</div>
</template>
