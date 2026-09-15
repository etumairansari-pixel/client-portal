<script setup lang="ts">
useHead({ title: 'Settings' });

const { user, changePassword } = useAuth();

const form = reactive({ currentPassword: '', newPassword: '', confirm: '' });
const saving = ref(false);
const done = ref(false);
const error = ref<string | null>(null);

const mismatch = computed(() => form.confirm.length > 0 && form.newPassword !== form.confirm);
const canSubmit = computed(
	() => !!form.currentPassword && form.newPassword.length >= 8 && form.newPassword === form.confirm && !saving.value,
);

async function submit() {
	saving.value = true;
	error.value = null;
	done.value = false;
	try {
		await changePassword(form.currentPassword, form.newPassword);
		done.value = true;
		form.currentPassword = '';
		form.newPassword = '';
		form.confirm = '';
	} catch (e: any) {
		error.value = e?.data?.statusMessage ?? 'Could not change your password.';
	} finally {
		saving.value = false;
	}
}
</script>

<template>
	<div class="max-w-2xl space-y-6">
		<header>
			<h1 class="text-2xl font-bold tracking-tight font-display text-slate-900">Settings</h1>
			<p class="mt-1 text-sm text-slate-500">Your Eiretech owner account.</p>
		</header>

		<section class="p-5 bg-white border shadow-sm border-slate-200 rounded-panel">
			<h2 class="text-sm font-semibold text-slate-900">Profile</h2>
			<dl class="mt-3 space-y-2 text-sm">
				<div class="flex justify-between gap-3">
					<dt class="text-slate-500">Name</dt>
					<dd class="text-slate-800">{{ [user?.firstName, user?.lastName].filter(Boolean).join(' ') || '—' }}</dd>
				</div>
				<div class="flex justify-between gap-3">
					<dt class="text-slate-500">Email</dt>
					<dd class="text-slate-800">{{ user?.email }}</dd>
				</div>
				<div class="flex justify-between gap-3">
					<dt class="text-slate-500">Role</dt>
					<dd class="text-slate-800">{{ user?.role }}</dd>
				</div>
			</dl>
		</section>

		<form class="p-5 space-y-4 bg-white border shadow-sm border-slate-200 rounded-panel" @submit.prevent="submit">
			<h2 class="text-sm font-semibold text-slate-900">Change password</h2>
			<VAlert v-if="error" type="error">{{ error }}</VAlert>
			<VAlert v-if="done" type="success">Your password has been updated.</VAlert>

			<UFormGroup label="Current password" required>
				<UInput v-model="form.currentPassword" type="password" size="lg" :disabled="saving" />
			</UFormGroup>
			<UFormGroup label="New password" required hint="At least 8 characters">
				<UInput v-model="form.newPassword" type="password" size="lg" :disabled="saving" />
			</UFormGroup>
			<UFormGroup label="Confirm new password" required :error="mismatch && 'Passwords do not match'">
				<UInput v-model="form.confirm" type="password" size="lg" :disabled="saving" />
			</UFormGroup>

			<div class="flex justify-end pt-1">
				<UButton type="submit" size="lg" label="Update password" :loading="saving" :disabled="!canSubmit" />
			</div>
		</form>
	</div>
</template>
