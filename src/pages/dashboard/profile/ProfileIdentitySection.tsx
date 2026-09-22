import React, { useState } from 'react';
import { AlertCircle, Camera, MapPin, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { SectionHeader } from './ProfileFields';
import {
  FEATURED_GENRES,
  IMAGE_RULES,
  getInitials,
  hasCustomImage,
  type ImageKind,
  type ProfileForm
} from './profileFormUtils';

interface ProfileIdentitySectionProps {
  form: ProfileForm;
  isVerified: boolean;
  pendingImages: Partial<Record<ImageKind, File>>;
  onSelectImage: (file: File, kind: ImageKind) => void;
  onRemoveImage: (kind: ImageKind) => void;
}

export const ProfileIdentitySection: React.FC<ProfileIdentitySectionProps> = ({
  form,
  isVerified,
  pendingImages,
  onSelectImage,
  onRemoveImage
}) => {
  const [dragOverKind, setDragOverKind] = useState<ImageKind | null>(null);
  const [brokenImages, setBrokenImages] = useState<Partial<Record<ImageKind, string>>>({});
  const showCover = hasCustomImage(form.coverPhoto) && brokenImages.coverPhoto !== form.coverPhoto;
  const showPhoto = hasCustomImage(form.photo) && brokenImages.photo !== form.photo;

  return (
    <section id="section-identity" aria-labelledby="section-identity-title" className="space-y-4 scroll-mt-28">
      <SectionHeader
        titleId="section-identity-title"
        title="Identidade Visual & Prévia"
        description="Prévia em tempo real de como os artistas e produtores verão seu perfil."
        visibility="public"
      />

      {/* Prévia: reflete a vitrine pública enquanto o usuário edita */}
      <div className="relative rounded-3xl overflow-hidden min-h-[14rem] sm:h-52 bg-slate-950 border border-slate-800 shadow-xl">
        {showCover ? (
          <img
            src={form.coverPhoto}
            onError={() => setBrokenImages(current => ({ ...current, coverPhoto: form.coverPhoto }))}
            alt="Capa do perfil"
            className="absolute inset-0 w-full h-full object-cover opacity-60"
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-amber-500/25 via-slate-900 to-slate-950" />
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent" />
        {(pendingImages.photo || pendingImages.coverPhoto) && (
          <span className="absolute top-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-slate-950/85 px-2.5 py-1 text-xs font-semibold text-amber-300 backdrop-blur">
            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> Nova imagem, ainda não salva
          </span>
        )}

        <div className="relative z-10 p-4 pt-12 sm:pt-4 h-full flex flex-col justify-end sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            {showPhoto ? (
              <img
                src={form.photo}
                onError={() => setBrokenImages(current => ({ ...current, photo: form.photo }))}
                alt={form.stageName || 'Foto de perfil'}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-3 border-amber-400 object-cover shadow-2xl bg-slate-900 shrink-0"
              />
            ) : (
              <div
                role="img"
                aria-label="Sem foto de perfil"
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-3 border-amber-400/60 bg-slate-900 shadow-2xl shrink-0 flex items-center justify-center text-xl font-extrabold text-amber-300"
              >
                {getInitials(form.stageName || '')}
              </div>
            )}
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {isVerified && (
                  <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3" aria-hidden="true" /> Compositor Verificado
                  </span>
                )}
                {form.society && (
                  <span className="bg-slate-900/90 text-slate-300 text-xs px-2 py-0.5 rounded-full border border-slate-700 hidden sm:inline">
                    {form.society.split(' - ')[0]}
                  </span>
                )}
              </div>
              <p className="font-bold text-white text-xl leading-tight truncate">
                {form.stageName || 'Nome Artístico'}
              </p>
              <p className="text-xs text-slate-300 flex flex-wrap items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>{form.city || 'Sua Cidade'} — {form.state || 'UF'}</span>
                {form.experienceYears && <span>• {form.experienceYears} de estrada</span>}
              </p>
            </div>
          </div>

          <div className="hidden md:flex flex-wrap gap-1 max-w-xs justify-end">
            {form.genres.slice(0, FEATURED_GENRES).map(genre => (
              <span key={genre} className="text-xs bg-slate-900/90 text-amber-300 px-2 py-0.5 rounded-full border border-slate-700">
                {genre}
              </span>
            ))}
          </div>
        </div>
      </div>

      {!isVerified && (
        <p className="text-xs text-slate-400 flex items-start gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
          <span>O selo <strong className="text-slate-300">Compositor Verificado</strong> aparece na vitrine depois que a equipe analisa e confirma seu cadastro.</span>
        </p>
      )}

      {/* Áreas de envio: clique ou arraste; toda imagem passa pelo recorte */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {(['photo', 'coverPhoto'] as const).map(kind => {
          const rule = IMAGE_RULES[kind];
          const hasImage = hasCustomImage(form[kind]);
          const isPending = Boolean(pendingImages[kind]);
          const isDragOver = dragOverKind === kind;
          const hintId = `${rule.fieldId}-hint`;
          return (
            <div key={kind} id={rule.fieldId} className="space-y-2">
              <label
                onDragOver={event => { event.preventDefault(); setDragOverKind(kind); }}
                onDragLeave={() => setDragOverKind(current => (current === kind ? null : current))}
                onDrop={event => {
                  event.preventDefault();
                  setDragOverKind(null);
                  const dropped = event.dataTransfer.files?.[0];
                  if (dropped) onSelectImage(dropped, kind);
                }}
                className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer text-xs text-slate-300 transition space-y-1 block focus-within:ring-2 focus-within:ring-amber-500 ${
                  isDragOver
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-800 hover:border-amber-500/50 bg-slate-950/40 hover:bg-slate-950'
                }`}
              >
                <Camera className="w-5 h-5 text-amber-400 mx-auto mb-1" aria-hidden="true" />
                <strong className="text-white block font-semibold">
                  {isDragOver ? 'Solte a imagem aqui' : hasImage ? `Trocar ${rule.label}` : `Enviar ${rule.label}`}
                </strong>
                <span id={hintId} className="block text-xs text-slate-500">Clique ou arraste · JPG, PNG ou WebP · {rule.hint}</span>
                {isPending && (
                  <span className="block text-xs font-semibold text-amber-300">Nova imagem selecionada. Salve para publicar.</span>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-describedby={hintId}
                  className="sr-only"
                  onChange={event => {
                    const selected = event.target.files?.[0];
                    // Limpa o valor para permitir escolher o mesmo arquivo de novo.
                    event.target.value = '';
                    if (selected) onSelectImage(selected, kind);
                  }}
                />
              </label>
              {hasImage && (
                <button
                  type="button"
                  onClick={() => onRemoveImage(kind)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remover {rule.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
