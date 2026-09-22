import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

// Reserva margem para o atraso/padding introduzido pelo encoder MP3. O arquivo
// final continua abaixo de 60s quando medido por decodificadores diferentes.
const MAX_PREVIEW_SECONDS = 59.8;
let ffmpegPromise: Promise<FFmpeg> | null = null;

const getFFmpeg = () => {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({ coreURL, wasmURL });
      return ffmpeg;
    })().catch(error => {
      ffmpegPromise = null;
      throw error;
    });
  }
  return ffmpegPromise;
};

/** Decodifica e recodifica uma prévia MP3 nova; não copia frames do original. */
export const createAudioPreview = async (source: File, startSeconds = 0): Promise<File> => {
  const ffmpeg = await getFFmpeg();
  const jobId = crypto.randomUUID();
  const inputName = `input-${jobId}.mp3`;
  const outputName = `preview-${jobId}.mp3`;

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(source));
    const exitCode = await ffmpeg.exec([
      '-ss', String(Math.max(0, startSeconds)),
      '-i', inputName,
      '-t', String(MAX_PREVIEW_SECONDS),
      '-vn',
      '-map_metadata', '-1',
      '-map_chapters', '-1',
      '-codec:a', 'libmp3lame',
      '-b:a', '128k',
      '-ar', '44100',
      '-write_xing', '1',
      outputName,
    ]);
    if (exitCode !== 0) throw new Error('audio_transcoding_failed');
    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array) || output.byteLength === 0) throw new Error('audio_transcoding_failed');
    return new File([output], `preview-${source.name.replace(/\.[^/.]+$/, '')}.mp3`, { type: 'audio/mpeg' });
  } catch {
    throw new Error('Não foi possível gerar a prévia real de 60 segundos neste navegador.');
  } finally {
    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
  }
};
