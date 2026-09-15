<script setup lang="ts">
import type { ScopeQuestion } from '~~/shared/scope-questionnaire';

const props = defineProps<{
	question: ScopeQuestion;
	modelValue: string | string[] | null;
	viewOnly?: boolean;
	sectionKey: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [string | string[] | null] }>();

const { filesFor, uploadFile, removeFile } = useScope();

const asString = computed({
	get: () => (typeof props.modelValue === 'string' ? props.modelValue : ''),
	set: (v: string) => emit('update:modelValue', v),
});

const asArray = computed<string[]>(() => (Array.isArray(props.modelValue) ? props.modelValue : []));

function toggleChoice(option: string) {
	if (props.viewOnly) return;
	const next = asArray.value.includes(option) ? asArray.value.filter((o) => o !== option) : [...asArray.value, option];
	emit('update:modelValue', next);
}

const inputType = computed(() => {
	if (props.question.type === 'email') return 'email';
	if (props.question.type === 'url') return 'url';
	if (props.question.type === 'date') return 'date';
	return 'text';
});

// ---- uploads ----
const attached = computed(() => filesFor(props.question.key));
const uploading = ref(false);
const uploadError = ref<string | null>(null);

async function onSelect(event: Event) {
	const input = event.target as HTMLInputElement;
	const selected = Array.from(input.files ?? []);
	if (!selected.length) return;

	uploading.value = true;
	uploadError.value = null;
	try {
		for (const file of selected) {
			await uploadFile(file, props.question.key, props.sectionKey);
		}
	} catch (e: any) {
		uploadError.value = e?.data?.statusMessage ?? 'Upload failed. Please try again.';
	} finally {
		uploading.value = false;
		input.value = '';
	}
}

function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
	<div class="py-5 border-b border-slate-100 last:border-b-0">
		<label class="block text-sm font-medium text-slate-900">
			{{ question.label }}
			<span v-if="question.required" class="text-rose-500" aria-hidden="true">*</span>
		</label>
		<p v-if="question.description" class="mt-1 text-sm text-slate-500">{{ question.description }}</p>

		<div class="mt-3">
			<!-- file questions render their attachments in both modes -->
			<template v-if="question.type === 'files'">
				<label
					v-if="!viewOnly"
					class="flex flex-col items-center justify-center w-full px-4 py-6 text-center transition-colors border-2 border-dashed cursor-pointer rounded-panel border-slate-300 hover:border-blue-400 hover:bg-slate-50"
				>
					<UIcon name="material-symbols:cloud-upload-outline-rounded" class="w-6 h-6 mb-1 text-slate-400" />
					<span class="text-sm font-medium text-slate-600">
						{{ uploading ? 'Uploading…' : 'Click to upload files' }}
					</span>
					<span class="mt-0.5 text-xs text-slate-400">Up to 15 MB each</span>
					<input type="file" multiple class="hidden" :disabled="uploading" @change="onSelect" />
				</label>

				<VAlert v-if="uploadError" type="error" class="mt-3">{{ uploadError }}</VAlert>

				<ul v-if="attached.length" class="mt-3 divide-y divide-slate-100">
					<li v-for="f in attached" :key="f.id" class="flex items-center justify-between gap-3 py-2">
						<a
							:href="`/api/portal/scope/files/${f.id}`"
							class="flex items-center min-w-0 gap-2 text-sm text-slate-700 hover:text-blue-700"
						>
							<UIcon name="material-symbols:description-outline-rounded" class="flex-shrink-0 w-4 h-4 text-slate-400" />
							<span class="truncate">{{ f.originalName }}</span>
							<span class="flex-shrink-0 text-xs text-slate-400">{{ formatSize(f.sizeBytes) }}</span>
						</a>
						<button
							v-if="!viewOnly"
							type="button"
							class="text-xs text-slate-400 hover:text-rose-600"
							@click="removeFile(f.id)"
						>
							Remove
						</button>
					</li>
				</ul>
				<p v-else-if="viewOnly" class="text-sm italic text-slate-400">No files uploaded</p>
			</template>

			<!-- read-only rendering -->
			<template v-else-if="viewOnly">
				<p v-if="Array.isArray(modelValue) && modelValue.length" class="text-sm whitespace-pre-line text-slate-700">
					{{ modelValue.join(', ') }}
				</p>
				<p v-else-if="typeof modelValue === 'string' && modelValue" class="text-sm whitespace-pre-line text-slate-700">
					{{ modelValue }}
				</p>
				<p v-else class="text-sm italic text-slate-400">Not answered</p>
			</template>

			<template v-else>
				<UTextarea
					v-if="question.type === 'textarea'"
					v-model="asString"
					:rows="4"
					:placeholder="question.placeholder"
					size="lg"
				/>

				<div v-else-if="question.type === 'radio' || question.type === 'yesno'" class="space-y-2">
					<label
						v-for="option in question.type === 'yesno' ? ['Yes', 'No'] : (question.options ?? [])"
						:key="option"
						class="flex items-center gap-3 px-3 py-2 border cursor-pointer rounded-button border-slate-200 hover:bg-slate-50"
						:class="asString === option ? 'border-blue-400 bg-blue-50' : ''"
					>
						<input v-model="asString" type="radio" :value="option" :name="question.key" class="text-blue-600" />
						<span class="text-sm text-slate-700">{{ option }}</span>
					</label>
				</div>

				<div v-else-if="question.type === 'checkbox'" class="space-y-2">
					<label
						v-for="option in question.options ?? []"
						:key="option"
						class="flex items-center gap-3 px-3 py-2 border cursor-pointer rounded-button border-slate-200 hover:bg-slate-50"
						:class="asArray.includes(option) ? 'border-blue-400 bg-blue-50' : ''"
					>
						<input
							type="checkbox"
							:checked="asArray.includes(option)"
							class="text-blue-600 rounded"
							@change="toggleChoice(option)"
						/>
						<span class="text-sm text-slate-700">{{ option }}</span>
					</label>
				</div>

				<UInput v-else v-model="asString" :type="inputType" :placeholder="question.placeholder" size="lg" />
			</template>
		</div>
	</div>
</template>
