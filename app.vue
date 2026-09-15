<script setup lang="ts">
import { borderRadiusMap } from '~/theme';

const { theme } = useAppConfig();

useHead({
	style: [
		{
			id: 'border-radius',
			innerHTML: `:root {${Object.entries(borderRadiusMap[theme.borderRadius])
				.map(([key, value]) => `--border-radius-${key}: ${value};`)
				.join('\n')}\n${Object.entries(theme.fonts)
				.map(([key, value]) => `--font-${key}: ${value};`)
				.join('\n')}`,
		},
	],
});
</script>
<template>
	<NuxtLayout>
		<NuxtLoadingIndicator color="#2563eb" />
		<NuxtPage />
	</NuxtLayout>
</template>
