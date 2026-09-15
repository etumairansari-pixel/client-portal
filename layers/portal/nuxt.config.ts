export default defineNuxtConfig({
	components: [
		// Portal-specific components are prefixed to avoid clashing with the
		// shared component set.
		{ path: './components/', prefix: 'Portal' },
	],
});
