import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Lofi-Kawaii/' : '/',
  server: {
    host: '::',
  },
}));
