<script setup lang="ts">
definePageMeta({ layout: 'blank' });

const { organization } = useAuth();

// Modules arriving in later phases stay out of the sidebar until they work.
const mainNav = [
	{ name: 'Dashboard', href: '/portal', icon: 'material-symbols:home-outline-rounded' },
	{ name: 'Projects', href: '/portal/projects', icon: 'material-symbols:tab-group-outline-rounded' },
	{ name: 'Scope', href: '/portal/scope', icon: 'material-symbols:description-outline-rounded' },
];
const footerNav = [{ name: 'Account', href: '/portal/account', icon: 'material-symbols:account-circle-outline' }];
</script>

<template>
	<AppShell
		:main-nav="mainNav"
		:footer-nav="footerNav"
		root-path="/portal"
		:context-label="organization?.name ?? 'Eiretech'"
	>
		<NuxtPage />
	</AppShell>
</template>
