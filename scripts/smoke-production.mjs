import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';

config({ path: '.env.local', quiet: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local.');

const apiHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'content-type': 'application/json' };
const checks = [
  { name: 'Homepage', url: 'https://mercadodocompositor.com.br/', expected: [200] },
  { name: 'Fallback da rota amigável', url: 'https://mercadodocompositor.com.br/compositor/mercado/musica/teste-f01b79cf/interesse', expected: [200] },
  { name: 'Catálogo público', url: `${supabaseUrl}/rest/v1/rpc/get_featured_composers`, method: 'POST', headers: apiHeaders, body: JSON.stringify({ p_limit: 1 }), expected: [200] },
  { name: 'Perfil público sem áudio original', url: `${supabaseUrl}/rest/v1/rpc/get_public_composer`, method: 'POST', headers: apiHeaders, body: JSON.stringify({ p_username: 'mercado' }), expected: [200], inspect: body => !/("original_audio_path"|"audioUrl"|song-originals)/i.test(body) },
  { name: 'Estatísticas privadas', url: `${supabaseUrl}/rest/v1/rpc/get_my_song_stats`, method: 'POST', headers: apiHeaders, body: '{}', expected: [401, 403] },
  { name: 'Métricas históricas privadas', url: `${supabaseUrl}/rest/v1/rpc/get_my_dashboard_metrics`, method: 'POST', headers: apiHeaders, body: JSON.stringify({ p_days: 30 }), expected: [401, 403] },
  { name: 'Validador sem sessão', url: `${supabaseUrl}/functions/v1/validate-media-upload`, method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' }, body: '{}', expected: [401] },
];

let failed = false;
for (const check of checks) {
  const args = ['-sS', '-w', '\n%{http_code}', '-X', check.method || 'GET'];
  for (const [name, value] of Object.entries(check.headers || {})) args.push('-H', `${name}: ${value}`);
  if (check.body) args.push('--data', check.body);
  args.push(check.url);
  const result = spawnSync(process.platform === 'win32' ? 'curl.exe' : 'curl', args, { encoding: 'utf8' });
  const separator = result.stdout.lastIndexOf('\n');
  const responseBody = separator >= 0 ? result.stdout.slice(0, separator) : '';
  const status = Number(result.stdout.slice(separator + 1).trim());
  const passed = result.status === 0 && check.expected.includes(status) && (!check.inspect || check.inspect(responseBody));
  console.log(`${passed ? 'PASS' : 'FAIL'} ${check.name}: HTTP ${status || 'erro de rede'}`);
  if (!passed) failed = true;
}

if (failed) process.exit(1);
