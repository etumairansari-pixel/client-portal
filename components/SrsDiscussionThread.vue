<script setup lang="ts">
/**
 * One requirements discussion thread. Used by both sides.
 *
 * Author names are never rendered: messages carry only `authorSide`, which is
 * labelled "Eiretech" or "Client". Employee identity never reaches the client.
 */
interface Message {
	id: string;
	authorSide: 'EIRETECH' | 'CLIENT';
	body: string;
	createdAt: string;
}
interface Discussion {
	id: string;
	subject: string;
	status: 'OPEN' | 'RESOLVED';
	sectionKey?: string | null;
	requirementRef?: string | null;
	openedSide: 'EIRETECH' | 'CLIENT';
	createdAt: string;
	messages: Message[];
}

const props = defineProps<{
	discussion: Discussion;
	/** Which side the current viewer writes as. */
	side: 'EIRETECH' | 'CLIENT';
	/** Owner only. */
	canResolve?: boolean;
	/** Locked document: no more replies. */
	viewOnly?: boolean;
	sectionTitle?: string | null;
}>();

const emit = defineEmits<{ reply: [discussionId: string, body: string]; resolve: [discussionId: string] }>();

const reply = ref('');
const busy = ref(false);

async function send() {
	if (!reply.value.trim()) return;
	busy.value = true;
	try {
		emit('reply', props.discussion.id, reply.value.trim());
		reply.value = '';
	} finally {
		busy.value = false;
	}
}

function when(v: string) {
	return new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const anchor = computed(() => {
	if (props.discussion.requirementRef) return `Requirement ${props.discussion.requirementRef}`;
	if (props.sectionTitle) return `Section: ${props.sectionTitle}`;
	return 'Whole document';
});
</script>

<template>
	<article class="rounded-panel border border-slate-200 bg-white">
		<header class="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
			<div class="min-w-0">
				<h4 class="text-sm font-semibold text-slate-900">{{ discussion.subject }}</h4>
				<p class="mt-0.5 text-xs text-slate-500">{{ anchor }} · opened {{ when(discussion.createdAt) }}</p>
			</div>
			<div class="flex items-center gap-2">
				<span
					class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
					:class="discussion.status === 'OPEN' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'"
				>
					{{ discussion.status === 'OPEN' ? 'Open' : 'Resolved' }}
				</span>
				<UButton
					v-if="canResolve && discussion.status === 'OPEN' && !viewOnly"
					size="2xs"
					color="white"
					label="Mark resolved"
					@click="emit('resolve', discussion.id)"
				/>
			</div>
		</header>

		<ol class="space-y-3 px-4 py-3">
			<li v-for="m in discussion.messages" :key="m.id" class="flex" :class="m.authorSide === side ? 'justify-end' : ''">
				<div
					class="max-w-[85%] rounded-lg px-3 py-2 text-sm"
					:class="m.authorSide === 'EIRETECH' ? 'bg-blue-50 text-slate-800' : 'bg-slate-100 text-slate-800'"
				>
					<p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
						{{ m.authorSide === 'EIRETECH' ? 'Eiretech' : 'Client' }} · {{ when(m.createdAt) }}
					</p>
					<p class="whitespace-pre-line">{{ m.body }}</p>
				</div>
			</li>
		</ol>

		<footer v-if="!viewOnly && discussion.status === 'OPEN'" class="border-t border-slate-100 px-4 py-3">
			<form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="send">
				<UTextarea v-model="reply" :rows="2" autoresize class="grow" placeholder="Write a reply…" :disabled="busy" />
				<UButton type="submit" size="sm" label="Reply" :loading="busy" :disabled="!reply.trim()" class="self-end" />
			</form>
		</footer>
	</article>
</template>
