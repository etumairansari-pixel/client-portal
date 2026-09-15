<script setup lang="ts">
/**
 * Project workspace tab bar, shared by the Owner and Client project pages.
 *
 * Tabs declared `enabled: false` are rendered as disabled with a "Soon" hint
 * rather than linking anywhere — the tab shape is visible so the workspace
 * reads as a workspace, but there is no dead navigation.
 */
export interface WorkspaceTab {
	key: string;
	label: string;
	enabled?: boolean;
}

defineProps<{ tabs: WorkspaceTab[]; modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();
</script>

<template>
	<nav class="-mx-1 overflow-x-auto border-b border-slate-200">
		<ul class="flex gap-1 px-1">
			<li v-for="tab in tabs" :key="tab.key">
				<button
					v-if="tab.enabled !== false"
					type="button"
					class="relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors"
					:class="
						modelValue === tab.key
							? 'text-blue-700 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-blue-600'
							: 'text-slate-500 hover:text-slate-800'
					"
					@click="emit('update:modelValue', tab.key)"
				>
					{{ tab.label }}
				</button>

				<span
					v-else
					class="flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium text-slate-300"
					:title="`${tab.label} arrives in a later phase`"
				>
					{{ tab.label }}
					<span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">SOON</span>
				</span>
			</li>
		</ul>
	</nav>
</template>
