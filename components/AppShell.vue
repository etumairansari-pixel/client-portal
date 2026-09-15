<script setup lang="ts">
import { Dialog, DialogPanel, TransitionChild, TransitionRoot } from '@headlessui/vue';

/**
 * Shared Eiretech application shell — white sidebar, white top bar, light
 * content area, mobile drawer. Used by both the Owner admin panel and the
 * Client portal so there is one responsive layout to maintain, not two.
 */
export interface ShellNavItem {
	name: string;
	href: string;
	icon: string;
	enabled?: boolean;
}

const props = defineProps<{
	mainNav: ShellNavItem[];
	footerNav: ShellNavItem[];
	contextLabel?: string | null;
	rootPath: string;
}>();

const route = useRoute();
const { displayName, logout } = useAuth();

const nav = computed(() => ({
	main: props.mainNav.filter((i) => i.enabled !== false),
	footer: props.footerNav.filter((i) => i.enabled !== false),
}));

function isActive(href: string) {
	// The root path would otherwise match every child route.
	if (href === props.rootPath) return route.path === props.rootPath;
	return route.path.startsWith(href);
}

const linkClass = (href: string) => [
	isActive(href) ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900',
	'group flex items-center gap-3 rounded-button px-3 py-2 text-sm font-medium transition-colors',
];

const iconClass = (href: string) => [
	isActive(href) ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600',
	'h-5 w-5',
];

const userNavigation = [
	[{ label: 'Sign out', icon: 'i-heroicons-arrow-left-on-rectangle', click: () => logout() }],
];

const mobileMenuOpen = ref(false);
watch(
	() => route.path,
	() => (mobileMenuOpen.value = false),
);
</script>

<template>
	<div class="flex h-full bg-slate-50">
		<!-- Sidebar (desktop) -->
		<aside class="hidden border-r border-slate-200 bg-white md:flex md:w-64 md:flex-col">
			<div class="flex items-center h-16 px-5 border-b border-slate-200">
				<NuxtLink :to="rootPath" class="flex items-center">
					<Logo class="w-auto h-7 text-slate-900" />
				</NuxtLink>
			</div>
			<nav class="flex flex-col justify-between flex-1 px-3 py-4 overflow-y-auto">
				<ul class="space-y-1">
					<li v-for="item in nav.main" :key="item.name">
						<NuxtLink :to="item.href" :class="linkClass(item.href)" :aria-current="isActive(item.href) ? 'page' : undefined">
							<UIcon :name="item.icon" :class="iconClass(item.href)" aria-hidden="true" />
							<span>{{ item.name }}</span>
						</NuxtLink>
					</li>
				</ul>
				<ul v-if="nav.footer.length" class="pt-4 mt-4 space-y-1 border-t border-slate-200">
					<li v-for="item in nav.footer" :key="item.name">
						<NuxtLink :to="item.href" :class="linkClass(item.href)" :aria-current="isActive(item.href) ? 'page' : undefined">
							<UIcon :name="item.icon" :class="iconClass(item.href)" aria-hidden="true" />
							<span>{{ item.name }}</span>
						</NuxtLink>
					</li>
				</ul>
			</nav>
		</aside>

		<!-- Sidebar (mobile drawer) -->
		<TransitionRoot as="template" :show="mobileMenuOpen">
			<Dialog as="div" class="relative z-40 md:hidden" @close="mobileMenuOpen = false">
				<TransitionChild
					as="template"
					enter="transition-opacity ease-linear duration-200"
					enter-from="opacity-0"
					enter-to="opacity-100"
					leave="transition-opacity ease-linear duration-200"
					leave-from="opacity-100"
					leave-to="opacity-0"
				>
					<div class="fixed inset-0 bg-slate-900/40" />
				</TransitionChild>

				<div class="fixed inset-0 z-40 flex">
					<TransitionChild
						as="template"
						enter="transition ease-in-out duration-200 transform"
						enter-from="-translate-x-full"
						enter-to="translate-x-0"
						leave="transition ease-in-out duration-200 transform"
						leave-from="translate-x-0"
						leave-to="-translate-x-full"
					>
						<DialogPanel class="relative flex flex-col flex-1 w-full max-w-xs bg-white">
							<div class="flex items-center justify-between h-16 px-5 border-b border-slate-200">
								<Logo class="w-auto h-7 text-slate-900" />
								<button
									type="button"
									class="p-2 -mr-2 rounded-button text-slate-500 hover:bg-slate-100 hover:text-slate-900"
									@click="mobileMenuOpen = false"
								>
									<UIcon name="heroicons:x-mark" class="w-5 h-5" aria-hidden="true" />
									<span class="sr-only">Close menu</span>
								</button>
							</div>
							<nav class="flex flex-col justify-between flex-1 px-3 py-4 overflow-y-auto">
								<ul class="space-y-1">
									<li v-for="item in nav.main" :key="item.name">
										<NuxtLink :to="item.href" :class="linkClass(item.href)">
											<UIcon :name="item.icon" :class="iconClass(item.href)" aria-hidden="true" />
											<span>{{ item.name }}</span>
										</NuxtLink>
									</li>
								</ul>
								<ul v-if="nav.footer.length" class="pt-4 mt-4 space-y-1 border-t border-slate-200">
									<li v-for="item in nav.footer" :key="item.name">
										<NuxtLink :to="item.href" :class="linkClass(item.href)">
											<UIcon :name="item.icon" :class="iconClass(item.href)" aria-hidden="true" />
											<span>{{ item.name }}</span>
										</NuxtLink>
									</li>
								</ul>
							</nav>
						</DialogPanel>
					</TransitionChild>
					<div class="flex-shrink-0 w-14" aria-hidden="true" />
				</div>
			</Dialog>
		</TransitionRoot>

		<!-- Main column -->
		<div class="flex flex-col flex-1 min-w-0">
			<header
				class="sticky top-0 z-20 flex items-center justify-between flex-shrink-0 h-16 gap-3 px-4 bg-white border-b border-slate-200 sm:px-6"
			>
				<div class="flex items-center min-w-0 gap-2">
					<button
						type="button"
						class="p-2 -ml-2 rounded-button text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:hidden"
						@click="mobileMenuOpen = true"
					>
						<UIcon name="heroicons:bars-3" class="w-5 h-5" aria-hidden="true" />
						<span class="sr-only">Open menu</span>
					</button>
					<span v-if="contextLabel" class="text-sm font-semibold truncate text-slate-900">{{ contextLabel }}</span>
				</div>

				<div class="flex items-center gap-1">
				<NotificationBell />
				<UDropdown :items="userNavigation" :popper="{ placement: 'bottom-end' }">
					<button class="flex items-center gap-2 p-1 rounded-button hover:bg-slate-100">
						<span class="sr-only">Open user menu</span>
						<UAvatar :alt="displayName" size="sm" />
						<span class="hidden text-sm font-medium text-slate-700 sm:block">{{ displayName }}</span>
						<UIcon name="material-symbols:expand-more-rounded" class="w-4 h-4 text-slate-400" aria-hidden="true" />
					</button>
				</UDropdown>
				</div>
			</header>

			<main class="flex-1 overflow-y-auto">
				<NuxtErrorBoundary>
					<template #error="{ error, clearError }">
						<div class="w-full max-w-5xl p-4 mx-auto sm:p-6">
							<VAlert type="error">{{ error }}</VAlert>
							<button class="mt-4 text-sm underline text-slate-500" @click="clearError">Try again</button>
						</div>
					</template>
					<div class="w-full max-w-5xl p-4 mx-auto sm:p-6">
						<slot />
					</div>
				</NuxtErrorBoundary>
			</main>
		</div>

		<UNotifications />
	</div>
</template>

<style>
html {
	@apply h-full;
}
body {
	@apply h-full antialiased;
}
#__nuxt {
	@apply h-full;
}
</style>
