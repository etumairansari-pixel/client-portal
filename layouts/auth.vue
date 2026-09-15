<script setup lang="ts">
// NOTE: definePageMeta only works in pages, not layouts - the `guest`
// middleware here was a no-op. Authenticated users are already redirected away
// from /auth/* by the global `common` middleware.
const points = [
	'Track project stages, milestones and target dates',
	'Review and approve deliverables',
	'Share files and project documentation securely',
	'Raise change and support requests',
];
</script>

<template>
	<div class="flex min-h-full antialiased bg-slate-50">
		<!-- Form column -->
		<div class="flex flex-col justify-center flex-1 min-w-0 px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
			<div class="w-full max-w-md mx-auto lg:w-96">
				<Logo class="w-auto h-8 mb-10 text-slate-900" />
				<div class="p-6 bg-white border shadow-sm border-slate-200 rounded-panel sm:p-8">
					<slot />
				</div>
				<p class="mt-6 text-xs text-slate-500">
					&copy; {{ new Date().getFullYear() }} Eiretech. All rights reserved.
				</p>
			</div>
		</div>

		<!-- Brand column -->
		<div class="relative flex-1 hidden bg-white border-l border-slate-200 lg:block">
			<div class="flex flex-col justify-center h-full px-16 xl:px-24">
				<p class="text-xs font-semibold tracking-widest text-blue-600 uppercase">Client Portal</p>
				<h2 class="mt-4 text-3xl font-bold leading-tight font-display text-slate-900">
					Everything about your project, in one place.
				</h2>
				<ul class="mt-8 space-y-4">
					<li v-for="point in points" :key="point" class="flex items-start gap-3">
						<UIcon name="material-symbols:check-circle-outline-rounded" class="w-5 h-5 mt-0.5 text-blue-600" />
						<span class="text-sm text-slate-600">{{ point }}</span>
					</li>
				</ul>
			</div>
		</div>
	</div>
</template>

<style>
html {
	@apply h-full;
}
body {
	@apply h-full;
}
#__nuxt {
	@apply h-full;
	@apply overflow-y-auto !important;
}
</style>
