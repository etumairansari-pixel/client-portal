<script setup lang="ts">
definePageMeta({ layout: 'auth' });
useHead({ title: 'Sign in' });
</script>
<template>
	<div class="space-y-6">
		<div class="space-y-1.5">
			<h1 class="text-xl font-bold tracking-tight font-display text-slate-900">Sign in to your portal</h1>
			<p class="text-sm text-slate-500">Access your projects, documentation and delivery updates.</p>
		</div>
		<LoginForm />
	</div>
</template>
