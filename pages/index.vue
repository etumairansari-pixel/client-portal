<script setup lang="ts">
// The app root simply routes people to where they belong.
definePageMeta({ layout: 'blank' });

const { user, fetchUser, homeRoute } = useAuth();
if (!user.value) await fetchUser();

await navigateTo(user.value ? homeRoute.value : '/auth/signin', { replace: true });
</script>

<template>
	<div class="flex items-center justify-center min-h-screen bg-slate-50">
		<p class="text-sm text-slate-500">Loading…</p>
	</div>
</template>
