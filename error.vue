<script setup lang="ts">
const props = defineProps<{ error: { statusCode?: number; statusMessage?: string } }>();
const { user, homeRoute } = useAuth();
const handleError = () => clearError({ redirect: user.value ? homeRoute.value : '/auth/signin' });
</script>

<template>
	<div class="flex items-center justify-center min-h-screen px-4 bg-slate-50">
		<div class="w-full max-w-md p-8 text-center bg-white border shadow-sm border-slate-200 rounded-panel">
			<Logo class="w-auto h-8 mx-auto text-slate-900" />
			<p class="mt-6 text-4xl font-bold font-display text-slate-900">{{ props.error?.statusCode ?? 500 }}</p>
			<p class="mt-2 text-sm text-slate-500">
				{{ props.error?.statusMessage || 'Something went wrong.' }}
			</p>
			<UButton class="mt-6" size="lg" label="Go back" @click="handleError" />
		</div>
	</div>
</template>
