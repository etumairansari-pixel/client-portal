<script setup lang="ts">
definePageMeta({ layout: 'blank' });

const mainNav = [
	{ name: 'Dashboard', href: '/admin', icon: 'material-symbols:home-outline-rounded' },
	{ name: 'Clients', href: '/admin/clients', icon: 'material-symbols:apartment-rounded' },
	{ name: 'Projects', href: '/admin/projects', icon: 'material-symbols:tab-group-outline-rounded' },
	{ name: 'Scopes', href: '/admin/scopes', icon: 'material-symbols:description-outline-rounded' },
];
const footerNav = [{ name: 'Settings', href: '/admin/settings', icon: 'material-symbols:settings-outline-rounded' }];
</script>

<template>
	<AppShell :main-nav="mainNav" :footer-nav="footerNav" root-path="/admin" context-label="Eiretech Admin">
		<NuxtPage />
	</AppShell>
</template>
