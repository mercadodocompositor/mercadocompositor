import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

/**
 * Gera dist/og-config.php, lido pelo public/compositor.php para montar a prévia
 * dos perfis no WhatsApp/redes. Só leva valores que já são públicos no bundle
 * (URL do Supabase, chave anon e URL do app). Por ser .php, o servidor executa
 * o arquivo em vez de exibi-lo; o nowdoc dispensa escapar aspas.
 */
function ogConfigPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'og-config-php',
    apply: 'build',
    generateBundle() {
      const json = JSON.stringify({
        supabaseUrl: env.VITE_SUPABASE_URL?.trim() ?? '',
        anonKey: env.VITE_SUPABASE_ANON_KEY?.trim() ?? '',
        appUrl: env.VITE_APP_URL?.trim() ?? '',
      });
      this.emitFile({
        type: 'asset',
        fileName: 'og-config.php',
        source: `<?php\n// Gerado pelo build (vite.config.ts). Não edite no servidor.\nreturn json_decode(<<<'JSON'\n${json}\nJSON\n, true);\n`,
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), tailwindcss(), ogConfigPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // O helper de preload do Vite (e os helpers de CommonJS) eram
            // agrupados dentro de vendor-pdf, porque o jspdf é o primeiro a
            // usá-los. Como toda rota lazy importa esse helper, o jspdf
            // inteiro (~177 kB gzip) era pré-carregado já na home.
            if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'vendor-react';
            if (!id.includes('node_modules')) return;
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
            if (id.includes('react-dom') || id.includes('react-router') || /node_modules[\\/]react[\\/]/.test(id)) return 'vendor-react';
            if (id.includes('motion')) return 'vendor-motion';
            if (id.includes('lucide-react')) return 'vendor-icons';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    test: {
      exclude: ['**/node_modules/**', '**/e2e/**', '**/.git/**'],
    },
  };
});
