<script setup lang="ts">
useHead({ title: 'Project Scope' });

const s = useScope();
await s.load();

const activeIndex = ref(0);
const activeSection = computed(() => s.sections[activeIndex.value]);
const isReviewStep = computed(() => activeIndex.value === s.sections.length - 1);

const confirmed = ref(false);
const submitting = ref(false);
const submitError = ref<string | null>(null);

function goTo(i: number) {
	activeIndex.value = Math.max(0, Math.min(i, s.sections.length - 1));
	if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' });
}

const savedLabel = computed(() => {
	if (s.saveState.value === 'saving') return 'Saving…';
	if (s.saveState.value === 'error') return 'Could not save — your answers are still here';
	if (!s.lastSavedAt.value) return '';
	return `Saved ${new Date(s.lastSavedAt.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
});

async function onSubmit() {
	submitting.value = true;
	submitError.value = null;
	try {
		await s.submit();
	} catch (e: any) {
		submitError.value = e?.data?.statusMessage ?? 'Something went wrong submitting your scope.';
	} finally {
		submitting.value = false;
	}
}

// ----- clarifications -----
const drafts = reactive<Record<string, string>>({});
const replyingId = ref<string | null>(null);

async function sendReply(id: string) {
	if (!drafts[id]?.trim()) return;
	replyingId.value = id;
	try {
		await s.reply(id, drafts[id]);
		drafts[id] = '';
	} finally {
		replyingId.value = null;
	}
}

// ----- approval -----
const agreeing = ref(false);
const agreed = ref(false);
const approveError = ref<string | null>(null);

async function onApprove() {
	agreeing.value = true;
	approveError.value = null;
	try {
		await s.approve();
	} catch (e: any) {
		approveError.value = e?.data?.statusMessage ?? 'Could not record your approval.';
	} finally {
		agreeing.value = false;
	}
}

const STATUS_LABEL: Record<string, string> = {
	DRAFT: 'Draft',
	SUBMITTED: 'Submitted',
	UNDER_REVIEW: 'Under Review',
	CLARIFICATION_REQUIRED: 'Action Required',
	READY_FOR_APPROVAL: 'Ready for Approval',
	APPROVED: 'Approved',
};
const STATUS_COLOR: Record<string, string> = {
	DRAFT: 'bg-slate-100 text-slate-700',
	SUBMITTED: 'bg-blue-50 text-blue-700',
	UNDER_REVIEW: 'bg-blue-50 text-blue-700',
	CLARIFICATION_REQUIRED: 'bg-amber-50 text-amber-800',
	READY_FOR_APPROVAL: 'bg-violet-50 text-violet-700',
	APPROVED: 'bg-green-50 text-green-700',
};

function fmt(v?: string | null) {
	if (!v) return '';
	return new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}
</script>

<template>
	<div class="max-w-3xl mx-auto">
		<PortalPageHeader
			title="Project Scope Document"
			:breadcrumbs="[{ title: 'Portal', href: '/portal' }, { title: 'Scope' }]"
		/>

		<div v-if="s.loading.value" class="py-16 text-sm text-center text-slate-500">Loading your scope…</div>

		<template v-else>
			<!-- status header -->
			<section class="p-5 mt-6 bg-white border shadow-sm border-slate-200 rounded-panel">
				<p class="text-sm text-slate-500">
					Please provide the following information so our team can understand your requirements and prepare the
					project plan.
				</p>
				<div class="flex flex-wrap items-center gap-3 mt-4">
					<span class="rounded-button px-2.5 py-1 text-xs font-semibold" :class="STATUS_COLOR[s.status.value]">
						{{ STATUS_LABEL[s.status.value] }}
					</span>
					<span v-if="s.isEditable.value && savedLabel" class="text-xs text-slate-400">{{ savedLabel }}</span>
					<span v-else-if="s.scope.value?.submittedAt" class="text-xs text-slate-400">
						Submitted {{ fmt(s.scope.value.submittedAt) }}
					</span>
					<span v-if="s.scope.value?.currentVersion" class="text-xs text-slate-400">
						· Version {{ s.scope.value.currentVersion }}
					</span>
				</div>

				<div v-if="s.isEditable.value" class="mt-4">
					<div class="flex items-center justify-between mb-1.5">
						<span class="text-xs font-medium text-slate-500">
							{{ s.completion.value === 100 ? 'Ready to submit' : 'Completion' }}
						</span>
						<span class="text-xs font-semibold text-slate-700">{{ s.completion.value }}%</span>
					</div>
					<div class="w-full h-2 overflow-hidden rounded-full bg-slate-100">
						<div
							class="h-full transition-all duration-500 rounded-full"
							:class="s.completion.value === 100 ? 'bg-green-500' : 'bg-blue-600'"
							:style="{ width: s.completion.value + '%' }"
						/>
					</div>
				</div>
			</section>

			<!-- approved -->
			<section
				v-if="s.isLocked.value"
				class="p-6 mt-6 text-center bg-white border shadow-sm border-slate-200 rounded-panel"
			>
				<UIcon name="material-symbols:verified-outline-rounded" class="w-10 h-10 mx-auto text-green-600" />
				<h2 class="mt-3 text-lg font-semibold font-display text-slate-900">Scope Approved</h2>
				<p class="mt-1 text-sm text-slate-500">Approved {{ fmt(s.scope.value?.approvedAt) }}</p>
				<p class="max-w-md mx-auto mt-3 text-sm text-slate-600">
					This scope is agreed and locked. Any further changes will be handled as a change request.
				</p>
			</section>

			<!-- ready for approval -->
			<section
				v-else-if="s.readyForApproval.value"
				class="p-6 mt-6 border shadow-sm bg-violet-50 border-violet-200 rounded-panel"
			>
				<h2 class="text-sm font-semibold text-violet-900">Ready for your approval</h2>
				<p class="mt-1 text-sm text-violet-800">
					Our team has finished reviewing your scope. Please read it through below and confirm you're happy for us
					to proceed.
				</p>

				<VAlert v-if="approveError" type="error" class="mt-4">{{ approveError }}</VAlert>

				<template v-if="s.awaitingOwnerApproval.value">
					<p class="mt-4 text-sm font-medium text-violet-900">
						Thank you — you approved this scope on {{ fmt(s.scope.value?.clientApprovedAt) }}. We're finalising it now.
					</p>
				</template>
				<template v-else>
					<label class="flex items-start gap-3 mt-4 cursor-pointer">
						<input v-model="agreed" type="checkbox" class="mt-1 text-blue-600 rounded" />
						<span class="text-sm text-violet-900">
							I confirm that the information in this Scope Document is accurate and I agree for Eiretech to proceed
							on this basis.
						</span>
					</label>
					<div class="flex justify-end mt-4">
						<UButton size="lg" label="Agree & Approve" :disabled="!agreed" :loading="agreeing" @click="onApprove" />
					</div>
				</template>
			</section>

			<!-- clarification -->
			<section
				v-else-if="s.needsClarification.value"
				class="p-5 mt-6 border shadow-sm bg-amber-50 border-amber-200 rounded-panel"
			>
				<div class="flex items-start gap-3">
					<UIcon name="material-symbols:info-outline-rounded" class="w-5 h-5 mt-0.5 text-amber-600" />
					<div>
						<h2 class="text-sm font-semibold text-amber-900">Action Required — Scope Clarification</h2>
						<p class="mt-1 text-sm text-amber-800">
							Our team needs a little more information before planning can continue. Just answer the questions
							below — you don't need to complete the whole scope again.
						</p>
					</div>
				</div>
			</section>

			<!-- submitted -->
			<section
				v-else-if="!s.isEditable.value"
				class="p-6 mt-6 text-center bg-white border shadow-sm border-slate-200 rounded-panel"
			>
				<UIcon name="material-symbols:check-circle-outline-rounded" class="w-10 h-10 mx-auto text-green-600" />
				<h2 class="mt-3 text-lg font-semibold font-display text-slate-900">Scope Submitted</h2>
				<p class="mt-1 text-sm text-slate-500">Submitted {{ fmt(s.scope.value?.submittedAt) }}</p>
				<p class="max-w-md mx-auto mt-3 text-sm text-slate-600">
					Our team is reviewing your requirements. We will notify you if any additional information is required.
				</p>
			</section>

			<!-- discussion threads -->
			<section v-if="s.discussions.value.length" class="mt-6 space-y-4">
				<h2 class="text-sm font-semibold text-slate-900">Discussion</h2>
				<article
					v-for="d in s.discussions.value"
					:key="d.id"
					class="bg-white border shadow-sm border-slate-200 rounded-panel"
				>
					<header class="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
						<p class="text-sm font-medium text-slate-900">{{ d.subject }}</p>
						<UBadge :color="d.status === 'OPEN' ? 'amber' : 'green'" variant="subtle" size="xs">
							{{ d.status === 'OPEN' ? 'Open' : 'Resolved' }}
						</UBadge>
					</header>

					<ul class="px-5 py-3 space-y-3">
						<li v-for="m in d.messages" :key="m.id" class="flex gap-3">
							<span
								class="flex-shrink-0 rounded-button px-2 py-0.5 text-xs font-semibold h-fit"
								:class="m.authorSide === 'EIRETECH' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'"
							>
								{{ m.authorSide === 'EIRETECH' ? 'Eiretech' : 'You' }}
							</span>
							<div class="min-w-0">
								<p class="text-sm whitespace-pre-line text-slate-700">{{ m.body }}</p>
								<p class="mt-0.5 text-xs text-slate-400">
									{{ new Date(m.createdAt).toLocaleString() }}
								</p>
							</div>
						</li>
					</ul>

					<div v-if="d.status === 'OPEN' && !s.isLocked.value" class="px-5 py-3 border-t border-slate-100">
						<UTextarea v-model="drafts[d.id]" :rows="2" placeholder="Write a reply…" />
						<div class="flex justify-end mt-2">
							<UButton
								size="sm"
								label="Send reply"
								:loading="replyingId === d.id"
								:disabled="!drafts[d.id]?.trim()"
								@click="sendReply(d.id)"
							/>
						</div>
					</div>
				</article>
			</section>

			<!-- read-only answers -->
			<section v-if="!s.isEditable.value" class="mt-6 space-y-4">
				<article
					v-for="section in s.sections.filter((x) => x.questions.length)"
					:key="section.key"
					class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel"
				>
					<h3 class="text-sm font-semibold text-slate-900">
						<span class="mr-2 text-slate-400">{{ section.number }}</span>{{ section.title }}
					</h3>
					<div class="mt-2">
						<PortalScopeQuestion
							v-for="q in s.visibleQuestions(section.key)"
							:key="q.key"
							:question="q"
							:model-value="s.answers.value[q.key] ?? null"
							:section-key="section.key"
							view-only
						/>
					</div>
				</article>
			</section>

			<!-- editable questionnaire -->
			<template v-else>
				<nav class="mt-6 -mx-1 overflow-x-auto">
					<ul class="flex gap-2 px-1 pb-2">
						<li v-for="(section, i) in s.sections" :key="section.key">
							<button
								type="button"
								class="flex items-center gap-2 whitespace-nowrap rounded-button border px-3 py-1.5 text-xs font-medium transition-colors"
								:class="
									i === activeIndex
										? 'border-blue-500 bg-blue-50 text-blue-700'
										: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
								"
								@click="goTo(i)"
							>
								<span class="tabular-nums">{{ section.number }}</span>
								<span class="hidden sm:inline">{{ section.title }}</span>
								<UIcon
									v-if="section.questions.length && s.sectionProgress(section).complete"
									name="material-symbols:check-circle-rounded"
									class="w-3.5 h-3.5 text-green-600"
								/>
							</button>
						</li>
					</ul>
				</nav>

				<!-- review step -->
				<section v-if="isReviewStep" class="mt-4 space-y-4">
					<article
						v-for="section in s.sections.filter((x) => x.questions.length)"
						:key="section.key"
						class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel"
					>
						<div class="flex items-start justify-between gap-3">
							<h3 class="text-sm font-semibold text-slate-900">
								<span class="mr-2 text-slate-400">{{ section.number }}</span>{{ section.title }}
							</h3>
							<UButton
								size="xs"
								variant="ghost"
								label="Edit"
								@click="goTo(s.sections.findIndex((x) => x.key === section.key))"
							/>
						</div>
						<div class="mt-2">
							<PortalScopeQuestion
								v-for="q in s.visibleQuestions(section.key)"
								:key="q.key"
								:question="q"
								:model-value="s.answers.value[q.key] ?? null"
								:section-key="section.key"
								view-only
							/>
						</div>
					</article>

					<div class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
						<label class="flex items-start gap-3 cursor-pointer">
							<input v-model="confirmed" type="checkbox" class="mt-1 text-blue-600 rounded" />
							<span class="text-sm text-slate-700">
								I confirm that the information provided in this Scope Document is accurate to the best of my
								knowledge.
							</span>
						</label>

						<VAlert v-if="submitError" type="error" class="mt-4">{{ submitError }}</VAlert>

						<p v-if="s.completion.value < 100" class="mt-4 text-sm text-amber-700">
							{{ s.completion.value }}% complete — {{ s.missing.value.length }} required question(s) remaining.
						</p>

						<div class="flex flex-col gap-3 mt-5 sm:flex-row sm:justify-end">
							<UButton size="lg" color="white" label="Save Draft" @click="s.saveDraft" />
							<UButton
								size="lg"
								label="Submit Scope"
								:disabled="!s.canSubmit.value || !confirmed"
								:loading="submitting"
								@click="onSubmit"
							/>
						</div>
					</div>
				</section>

				<!-- question step -->
				<section
					v-else-if="activeSection"
					class="p-5 mt-4 bg-white border shadow-sm border-slate-200 rounded-panel sm:p-6"
				>
					<header class="pb-2 border-b border-slate-100">
						<p class="text-xs font-semibold tracking-widest text-blue-600 uppercase">
							Section {{ activeSection.number }}
						</p>
						<h2 class="mt-1 text-lg font-semibold font-display text-slate-900">{{ activeSection.title }}</h2>
						<p v-if="activeSection.description" class="mt-1 text-sm text-slate-500">
							{{ activeSection.description }}
						</p>
					</header>

					<PortalScopeQuestion
						v-for="q in s.visibleQuestions(activeSection.key)"
						:key="q.key"
						:question="q"
						:model-value="s.answers.value[q.key] ?? null"
						:section-key="activeSection.key"
						@update:model-value="(v) => s.setAnswer(q.key, v)"
					/>
				</section>

				<div class="flex items-center justify-between gap-3 mt-5">
					<UButton
						color="white"
						size="lg"
						label="Back"
						icon="material-symbols:arrow-back-rounded"
						:disabled="activeIndex === 0"
						@click="goTo(activeIndex - 1)"
					/>
					<UButton color="white" size="lg" label="Save Draft" @click="s.saveDraft" />
					<UButton
						v-if="!isReviewStep"
						size="lg"
						label="Next"
						trailing-icon="material-symbols:arrow-forward-rounded"
						@click="goTo(activeIndex + 1)"
					/>
					<div v-else class="w-[88px]" aria-hidden="true" />
				</div>
			</template>
		</template>
	</div>
</template>
