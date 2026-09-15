import { theme } from './theme';

export default defineNuxtConfig({
	// https://nuxt.com/docs/api/configuration/nuxt-config

	extends: [
		'./layers/portal', // Client portal module
	],

	components: [
		// Disable prefixing base components with `Base`
		{ path: '~/components/base', pathPrefix: false },
		'~/components',
	],

	css: ['~/assets/css/tailwind.css', '~/assets/css/main.css'],

	modules: [
		'@nuxt/image',
		'@nuxt/ui', // https://ui.nuxt.com
		'@nuxtjs/color-mode', // https://color-mode.nuxtjs.org
		'@nuxtjs/google-fonts', // https://google-fonts.nuxtjs.org
		'@formkit/auto-animate/nuxt',
		'@vueuse/nuxt', // https://vueuse.org/
		'@nuxt/icon', // https://github.com/nuxt-modules/icon
	],

	experimental: {
		asyncContext: true,
	},

	runtimeConfig: {
		sessionSecret: process.env.SESSION_SECRET,
		public: {
			appUrl: process.env.APP_URL || 'http://localhost:3000',
		},
	},

	app: {
		head: {
			titleTemplate: '%s - Eiretech',
			link: [
				{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
				{ rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
				{ rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
				{ rel: 'shortcut icon', href: '/favicon.ico' },
				{ rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
			],
			meta: [{ name: 'theme-color', content: '#2F8DE6' }],
		},
	},

	devtools: { enabled: true },

	// Eiretech is a light-theme product; light is forced so the app never
	// renders in a half-styled dark state.
	colorMode: {
		classSuffix: '',
		preference: 'light',
		fallback: 'light',
	},

	googleFonts: {
		families: theme.googleFonts,
		display: 'swap',
		download: true,
	},

	postcss: {
		plugins: {
			'postcss-import': {},
			'tailwindcss/nesting': {},
			tailwindcss: {},
			autoprefixer: {},
		},
	},

	build: {
		transpile: ['v-perfect-signature'],
	},

	nitro: {
		// Prisma ships a native query engine and a generated `.prisma` client.
		// Neither can be bundled, so leave both external and let Node resolve
		// them at runtime from node_modules.
		externals: {
			external: ['@prisma/client', '@prisma/client/default', '.prisma/client'],
		},
		moduleSideEffects: ['@prisma/client'],
		rollupConfig: {
			external: [/^\.prisma(\/.*)?$/, /^@prisma\/client(\/.*)?$/],
		},
	},

	compatibilityDate: '2024-07-28',
});
