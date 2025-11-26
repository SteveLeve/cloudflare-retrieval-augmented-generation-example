import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [
        {
            name: 'html-loader',
            transform(code, id) {
                if (id.endsWith('.html')) {
                    return {
                        code: `export default ${JSON.stringify(code)}`,
                        map: null,
                    };
                }
            },
        },
    ],
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/**',
				'tests/**',
				'*.config.ts',
			],
		},
	},
});
