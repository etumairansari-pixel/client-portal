<script setup lang="ts">
/** Top-bar bell: unread count, recent list, mark read, navigate. Kept small on purpose. */
const open = ref(false);
const { data, refresh } = await useFetch('/api/notifications', {
	headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
	lazy: true,
	server: false,
});
const notifications = computed<any[]>(() => data.value?.notifications ?? []);
const unread = computed(() => data.value?.unread ?? 0);

// Light polling so the badge stays honest without a websocket.
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
	timer = setInterval(() => refresh(), 60_000);
});
onBeforeUnmount(() => {
	if (timer) clearInterval(timer);
});

const router = useRouter();
async function openNotification(n: any) {
	open.value = false;
	if (!n.readAt) {
		await $fetch(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
		refresh();
	}
	if (n.link) router.push(n.link);
}
async function markAll() {
	await $fetch('/api/notifications/read', { method: 'POST' }).catch(() => undefined);
	refresh();
}
function when(v: string) {
	return new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
	<UPopover v-model:open="open" :popper="{ placement: 'bottom-end' }">
		<button type="button" class="relative p-2 rounded-button text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Notifications">
			<UIcon name="i-heroicons-bell" class="w-5 h-5" />
			<span
				v-if="unread"
				class="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white"
			>
				{{ unread > 99 ? '99+' : unread }}
			</span>
		</button>

		<template #panel>
			<div class="w-80 max-w-[calc(100vw-2rem)]">
				<div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
					<span class="text-sm font-semibold text-slate-900">Notifications</span>
					<button v-if="unread" type="button" class="text-xs text-blue-700 hover:underline" @click="markAll">Mark all read</button>
				</div>
				<ul v-if="notifications.length" class="overflow-y-auto divide-y max-h-96 divide-slate-100">
					<li v-for="n in notifications" :key="n.id">
						<button type="button" class="w-full px-4 py-3 text-left hover:bg-slate-50" @click="openNotification(n)">
							<div class="flex items-start gap-2">
								<span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :class="n.readAt ? 'bg-transparent' : 'bg-blue-600'" />
								<div class="min-w-0">
									<p class="text-sm truncate" :class="n.readAt ? 'text-slate-600' : 'font-semibold text-slate-900'">{{ n.title }}</p>
									<p v-if="n.body" class="text-xs text-slate-500 line-clamp-2">{{ n.body }}</p>
									<p class="mt-0.5 text-[11px] text-slate-400">{{ when(n.createdAt) }}</p>
								</div>
							</div>
						</button>
					</li>
				</ul>
				<p v-else class="px-4 py-8 text-xs text-center text-slate-400">You're all caught up.</p>
			</div>
		</template>
	</UPopover>
</template>
