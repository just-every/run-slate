import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({root:fileURLToPath(new URL('.', import.meta.url)),plugins:[react(),tailwindcss()],server:{host:'127.0.0.1',port:4198,strictPort:true,fs:{allow:[fileURLToPath(new URL('../..',import.meta.url))]}}});
