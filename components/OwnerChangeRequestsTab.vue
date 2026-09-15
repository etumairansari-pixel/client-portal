<script setup lang="ts">
import { CR_TRANSITIONS, CR_STATUS_LABEL } from '~~/shared/delivery';

const props = defineProps<{ changeRequests: any[]; organizationName?: string }>();
const emit = defineEmits<{ changed: [] }>();

const route = useRoute();
const router = useRouter();
const error = ref<string | null>(null);

const selectedId = computed({
	get: () => (route.query.cr as string) || props.changeRequests[0]?.id || null,
	set: (v) => router.replace({ query: { ...route.query, cr: v ?? undefined } }),
});
const selected = computed(() => props.changeRequests.find((c) => c.id === selectedId.value) ?? null);

const ACTION_LABEL: Record<string, string> = {
	UNDER_REVIEW: 'Start review',
	CLARIFICATION_REQUIRED: 'Request clarification',
	ACCEPTED: 'Accept',
	DECLINED: 'Decline',
	IN_PROGRESS: 'Mark in progress',
	COMPLETED: 'Complete',
};
const NEEDS_NOTE = new Set(['CLARIFICATION_REQUIRED', 'DECLINED']);
const OPTIONAL_NOTE = new Set(['ACCEPTED', 'COMPLETED']);

const noteModal = ref(false);
const pendingTo = ref<string | null>(null);
const note = ref('');
const busy = ref(false);

function act(to: string) {
	pendingTo.value = to;
	note.value = '';
	if (NEEDS_NOTE.has(to) || OPTIONAL_NOTE.has(to)) {
		noteModal.value = true;
	} else {
		void submit();
	}
}
async function submit() {
	if (!selected.value || !pendingTo.value) return;
	busy.value = true;
	error.value = null;
	try {
		await $fetch(`/api/admin/change-requests/${selected.value.id}/transition`, {
			method: 'POST',
			body: { to: pendingTo.value, note: note.value || null },
		});
		noteModal.value = false;
		emit('changed');
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not update the request.';
	} finally {
		busy.value = false;
	}
}
async function reply(id: string, body: string) {
	try {
		await $fetch(`/api/admin/change-requests/${id}/reply`, { method: 'POST', body: { body } });
		emit('changed');
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not send the reply.';
	}
}
function fmt(v: string) {
	return new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
</script>

<template>
	<div class="space-y-4">
		<VAlert v-if="error" type="error">{{ error }}</VAlert>

		<div v-if="!changeRequests.length" class="p-10 text-sm text-center bg-white border shadow-sm border-slate-200 rounded-panel text-slate-500">
			No change requests for this project yet.
		</div>

		<div v-else class="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
			<!-- List -->
			<div class="overflow-hidden bg-white border shadow-sm border-slate-200 rounded-panel">
				<ul class="divide-y divide-slate-100">
					<li v-for="c in changeRequests" :key="c.id">
						<button type="button" class="w-full px-4 py-3 text-left hover:bg-slate-50" :class="c.id === selectedId ? 'bg-blue-50/60' : ''" @click="selectedId = c.id">
							<p class="text-sm font-medium truncate text-slate-900">{{ c.title }}</p>
							<div class="flex flex-wrap items-center gap-1.5 mt-1">
								<DeliveryBadge kind="cr" :value="c.status" />
								<DeliveryBadge kind="priority" :value="c.priority" />
							</div>
							<p class="mt-1 text-[11px] text-slate-400">{{ fmt(c.createdAt) }}<template v-if="c.relatedMilestone"> · {{ c.relatedMilestone.title }}</template></p>
						</button>
					</li>
				</ul>
			</div>

			<!-- Detail -->
			<div class="min-w-0">
				<ChangeRequestThread v-if="selected" :cr="{ ...selected, organization: organizationName ? { name: organizationName } : undefined }" side="EIRETECH" @reply="reply">
					<template #actions>
						<UButton
							v-for="to in CR_TRANSITIONS[selected.status] ?? []"
							:key="to"
							size="xs"
							:color="to === 'DECLINED' ? 'red' : to === 'ACCEPTED' || to === 'COMPLETED' ? 'green' : 'white'"
							:variant="to === 'DECLINED' ? 'outline' : 'solid'"
							:label="ACTION_LABEL[to]"
							:loading="busy && pendingTo === to"
							@click="act(to)"
						/>
					</template>
				</ChangeRequestThread>
			</div>
		</div>

		<UModal v-model="noteModal">
			<form class="p-6 space-y-4" @submit.prevent="submit">
				<h3 class="text-base font-semibold text-slate-900">{{ ACTION_LABEL[pendingTo ?? ''] }} — {{ selected?.title }}</h3>
				<p class="text-sm text-slate-500">
					<template v-if="pendingTo === 'CLARIFICATION_REQUIRED'">Tell the client what you need. This is sent as a message and shown as an action for them.</template>
					<template v-else-if="pendingTo === 'DECLINED'">Give the client a clear reason. This closes the request.</template>
					<template v-else>Optional note to the client.</template>
				</p>
				<UFormGroup :label="NEEDS_NOTE.has(pendingTo ?? '') ? 'Message to client' : 'Note (optional)'" :required="NEEDS_NOTE.has(pendingTo ?? '')">
					<UTextarea v-model="note" :rows="4" autoresize autofocus />
				</UFormGroup>
				<div class="flex justify-end gap-2 pt-2">
					<UButton color="white" label="Cancel" @click="noteModal = false" />
					<UButton type="submit" :label="`Confirm: ${CR_STATUS_LABEL[pendingTo ?? '']}`" :loading="busy" :disabled="NEEDS_NOTE.has(pendingTo ?? '') && !note.trim()" />
				</div>
			</form>
		</UModal>
	</div>
</template>
