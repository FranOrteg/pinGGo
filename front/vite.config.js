import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: true,
    port: 5173,
  },
  optimizeDeps: {
    include: ['pdfjs-dist/build/pdf.mjs'],
  },
});
