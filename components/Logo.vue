<script setup lang="ts">
// The Eiretech 360° mark and wordmark. The mark mirrors public/logos/eiretech-mark.svg.
defineProps({
	/** Hide the wordmark and render only the blue "e" tile. */
	markOnly: { type: Boolean, default: false },
});
</script>

<template>
	<svg
		:viewBox="markOnly ? '0 0 28 28' : '0 0 138 28'"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		aria-label="Eiretech 360"
	>
		<title>Eiretech 360°</title>

		<!-- Mark (100-unit artwork scaled to 28) -->
		<g transform="scale(0.28)">
			<path d="M0 0H60A40 40 0 0 1 100 40V60A40 40 0 0 1 60 100H40A40 40 0 0 1 0 60Z" fill="#2F8DE6" />
			<path
				d="M1 70C30 78 56 72 72 54C79 46 80 40 75 36"
				fill="none"
				stroke="#FFFFFF"
				stroke-width="3.6"
				stroke-linecap="round"
			/>
			<path d="M61 79.5A26 26 0 1 1 73.1 63.7L60.6 60.4A13 13 0 1 0 54.5 68.3Z" fill="#FFFFFF" />
			<rect x="35" y="51.5" width="38" height="11" fill="#FFFFFF" />
			<circle cx="68" cy="23" r="4.6" fill="#7DBF3C" />
		</g>

		<!-- Wordmark: dotless i with a green dot, then 360° -->
		<template v-if="!markOnly">
			<text
				x="35"
				y="21"
				font-family="Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
				font-size="20"
				font-weight="600"
				letter-spacing="-0.4"
				fill="#0F172A"
				textLength="84"
				lengthAdjust="spacingAndGlyphs"
			>
				e&#305;retech
			</text>
			<circle cx="52.2" cy="7.4" r="1.9" fill="#7DBF3C" />
			<text
				x="121"
				y="22"
				font-family="Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
				font-size="7"
				font-weight="600"
				fill="#2F8DE6"
			>
				360°
			</text>
		</template>
	</svg>
</template>
