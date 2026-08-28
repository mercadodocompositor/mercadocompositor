import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [, , inputPath, outputPath, durationArg = '60'] = process.argv;

if (!inputPath || !outputPath) {
  throw new Error('Uso: node scripts/create-mp3-preview.mjs <entrada.mp3> <saida.mp3> [segundos]');
}

const maxDuration = Number(durationArg);
if (!Number.isFinite(maxDuration) || maxDuration <= 0) {
  throw new Error('A duração deve ser um número positivo.');
}

const input = await readFile(inputPath);
let offset = 0;

// Preserve ID3v2 metadata when present.
if (input.subarray(0, 3).toString('ascii') === 'ID3' && input.length >= 10) {
  const size = ((input[6] & 0x7f) << 21)
    | ((input[7] & 0x7f) << 14)
    | ((input[8] & 0x7f) << 7)
    | (input[9] & 0x7f);
  offset = Math.min(10 + size, input.length);
}

const audioStart = offset;
let audioEnd = offset;
let elapsed = 0;
let frameCount = 0;

const mpeg1Layer3Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const mpeg2Layer3Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const sampleRates = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

while (offset + 4 <= input.length && elapsed < maxDuration) {
  const header = input.readUInt32BE(offset);
  const hasSync = (header >>> 21) === 0x7ff;
  const version = (header >>> 19) & 0x3;
  const layer = (header >>> 17) & 0x3;
  const bitrateIndex = (header >>> 12) & 0xf;
  const sampleRateIndex = (header >>> 10) & 0x3;
  const padding = (header >>> 9) & 0x1;

  if (!hasSync || version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    offset += 1;
    continue;
  }

  const bitrate = (version === 3 ? mpeg1Layer3Bitrates : mpeg2Layer3Bitrates)[bitrateIndex];
  const sampleRate = sampleRates[version][sampleRateIndex];
  const samplesPerFrame = version === 3 ? 1152 : 576;
  const frameLength = Math.floor((version === 3 ? 144000 : 72000) * bitrate / sampleRate) + padding;
  const frameDuration = samplesPerFrame / sampleRate;

  if (offset + frameLength > input.length || elapsed + frameDuration > maxDuration) break;

  audioEnd = offset + frameLength;
  offset = audioEnd;
  elapsed += frameDuration;
  frameCount += 1;
}

if (frameCount === 0 || audioEnd <= audioStart) {
  throw new Error(`Nenhum frame MP3 Layer III válido encontrado em ${inputPath}.`);
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, input.subarray(0, audioEnd));
console.log(`${outputPath}: ${elapsed.toFixed(3)}s, ${frameCount} frames`);
