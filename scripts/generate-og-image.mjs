/**
 * Gera public/og-image.jpg (1200×630), a prévia padrão do site no WhatsApp,
 * Facebook, LinkedIn e X. Rode de novo se mudar o logo ou a foto da home:
 *   node scripts/generate-og-image.mjs
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = (file) => path.join(root, 'public', file);
const WIDTH = 1200;
const HEIGHT = 630;

const background = await sharp(pub('hero-composers-v2.webp'))
  .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
  .toBuffer();

const overlay = Buffer.from(`
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0A1128" stop-opacity="0.96"/>
      <stop offset="0.6" stop-color="#0A1128" stop-opacity="0.82"/>
      <stop offset="1" stop-color="#0A1128" stop-opacity="0.45"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#fade)"/>
  <text x="80" y="200" font-family="Georgia, 'Times New Roman', serif" font-size="34" font-weight="700" fill="#FCD34D" letter-spacing="1">MERCADO DO COMPOSITOR</text>
  <text x="80" y="300" font-family="Georgia, 'Times New Roman', serif" font-size="64" font-weight="700" fill="#FFFFFF">Suas músicas merecem</text>
  <text x="80" y="378" font-family="Georgia, 'Times New Roman', serif" font-size="64" font-weight="700" fill="#FFFFFF">encontrar a <tspan fill="#FCD34D">voz certa</tspan></text>
  <text x="80" y="460" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#CBD5E1">Obras inéditas de compositores brasileiros,</text>
  <text x="80" y="498" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#CBD5E1">com liberação digital para gravação.</text>
  <rect x="80" y="545" width="120" height="5" rx="2.5" fill="#FBBF24"/>
</svg>`);

const logoMask = Buffer.from('<svg width="88" height="88"><rect width="88" height="88" rx="18"/></svg>');
const logo = await sharp(pub('logo.webp'))
  .resize(88, 88, { fit: 'cover' })
  .composite([{ input: logoMask, blend: 'dest-in' }])
  .png()
  .toBuffer();

await sharp(background)
  .composite([
    { input: overlay, top: 0, left: 0 },
    { input: logo, top: 52, left: 80 },
  ])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(pub('og-image.jpg'));

console.log('public/og-image.jpg gerado');
