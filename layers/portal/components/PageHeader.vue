<script setup lang="ts">
export interface PageHeaderProps {
	breadcrumbs?: Array<{
		title: string;
		href?: string | null | undefined;
	}>;
	title?: string;
}

defineProps<PageHeaderProps>();
</script>
<template>
	<header class="pb-4 border-b border-slate-200 md:flex md:items-center md:justify-between">
		<div class="flex-shrink-0 min-w-0">
			<VBreadcrumbs v-if="breadcrumbs" :items="breadcrumbs" />
			<TypographyHeadline v-if="title" :content="title" />
			<slot />
		</div>
		<slot name="center" />
		<div class="flex mt-4 md:ml-4 md:mt-0">
			<slot name="actions" />
		</div>
	</header>
</template>
