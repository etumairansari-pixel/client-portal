<script setup lang="ts">
/**
 * One change request in detail: header, description, attachments, discussion,
 * reply box. Owner actions are passed in through the `actions` slot.
 *
 * Author labels are "Eiretech" / "Client" only. Employee identity never renders.
 */
import { UPLOAD_ACCEPT } from '~~/shared/uploads';
const props = defineProps<{
	cr: any;
	side: 'EIRETECH' | 'CLIENT';
	/** Client may upload attachments while the request is open. */
	canAttach?: boolean;
}>();
const emit = defineEmits<{ reply: [id: string, body: string]; attach: [id: string, file: File] }>();

const closed = computed(() => props.cr.status === 'DECLINED' || props.cr.status === 'COMPLETED');
const reply = ref('');
const busy = ref(false);

async function send() {
	if (!reply.value.trim()) return;
	busy.value = true;
	try {
		emit('reply', props.cr.id, reply.value.trim());
		reply.value = '';
	} finally {
		busy.value = false;
	}
}
function onFile(e: Event) {
	const input = e.target as HTMLInputElement;
	const f = input.files?.[0];
	if (f) emit('attach', props.cr.id, f);
	input.value = '';
}
function when(v: string) {
	return new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtSize(n: number) {
	return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}
</script>

<template>
	<article class="bg-white border border-slate-200 rounded-panel">
		<header class="px-5 py-4 border-b border-slate-100">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<DeliveryBadge kind="crType" :value="cr.type" />
						<DeliveryBadge kind="priority" :value="cr.priority" />
						<DeliveryBadge kind="cr" :value="cr.status" />
					</div>
					<h3 class="mt-2 text-base font-semibold text-slate-900">{{ cr.title }}</h3>
					<p class="mt-0.5 text-xs text-slate-500">
						Submitted {{ when(cr.createdAt) }}
						<template v-if="cr.relatedMilestone"> · Milestone: {{ cr.relatedMilestone.title }}</template>
						<template v-if="cr.organization"> · {{ cr.organization.name }}</template>
					</p>
				</div>
				<div class="flex flex-wrap gap-2"><slot name="actions" /></div>
			</div>
			<p class="mt-3 text-sm whitespace-pre-line text-slate-700">{{ cr.description }}</p>
			<p v-if="cr.resolutionNote && closed" class="p-3 mt-3 text-sm border rounded-panel" :class="cr.status === 'DECLINED' ? 'border-red-100 bg-red-50 text-red-800' : 'border-green-100 bg-green-50 text-green-800'">
				{{ cr.resolutionNote }}
			</p>
		</header>

		<section v-if="cr.attachments?.length || canAttach" class="px-5 py-3 border-b border-slate-100">
			<h4 class="text-xs font-semibold tracking-wide uppercase text-slate-500">Attachments</h4>
			<ul v-if="cr.attachments?.length" class="mt-2 space-y-1 text-sm">
				<li v-for="a in cr.attachments" :key="a.id" class="flex items-center justify-between gap-2">
					<a :href="`/api/cr-attachments/${a.id}`" class="min-w-0 text-blue-700 truncate hover:underline">{{ a.originalName }}</a>
					<span class="text-xs shrink-0 text-slate-400">{{ fmtSize(a.sizeBytes) }}</span>
				</li>
			</ul>
			<label v-if="canAttach && !closed" class="block mt-2">
				<input type="file" :accept="UPLOAD_ACCEPT" class="block w-full text-xs text-slate-500 file:mr-3 file:rounded-button file:border file:border-slate-200 file:bg-white file:px-3 file:py-1 file:text-xs" @change="onFile" />
			</label>
		</section>

		<ol class="px-5 py-4 space-y-3">
			<li v-if="!cr.messages?.length" class="text-xs text-center text-slate-400">No messages yet.</li>
			<li v-for="m in cr.messages" :key="m.id" class="flex" :class="m.authorSide === side ? 'justify-end' : ''">
				<div class="max-w-[85%] rounded-lg px-3 py-2 text-sm" :class="m.authorSide === 'EIRETECH' ? 'bg-blue-50 text-slate-800' : 'bg-slate-100 text-slate-800'">
					<p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
						{{ m.authorSide === 'EIRETECH' ? 'Eiretech' : 'Client' }} · {{ when(m.createdAt) }}
					</p>
					<p class="whitespace-pre-line">{{ m.body }}</p>
				</div>
			</li>
		</ol>

		<footer v-if="!closed" class="px-5 py-3 border-t border-slate-100">
			<form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="send">
				<UTextarea v-model="reply" :rows="2" autoresize class="grow" placeholder="Write a reply…" :disabled="busy" />
				<UButton type="submit" size="sm" label="Reply" :loading="busy" :disabled="!reply.trim()" class="self-end" />
			</form>
		</footer>
		<p v-else class="px-5 py-3 text-xs border-t border-slate-100 text-slate-400">This request is closed.</p>
	</article>
</template>
