import React, { useState } from 'react';
import { BadgeCheck, Camera, ShieldCheck, Trash2 } from 'lucide-react';
import { SectionHeader } from './ProfileFields';
import {
  IMAGE_RULES,
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

  return (
    <section id="section-identity" aria-labelledby="section-identity-title" className="space-y-6 scroll-mt-28">
      <SectionHeader
        titleId="section-identity-title"
        title="Foto e capa do perfil"
        description="Use imagens nítidas e profissionais. A prévia acima é atualizada enquanto você edita."
        visibility="public"
      />

      {/* Áreas de envio: clique ou arraste; toda imagem passa pelo recorte */}
      <div className="grid grid-cols-1 gap-5 pt-1 sm:grid-cols-2">
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
                className={`group block min-h-40 cursor-pointer space-y-2 rounded-2xl border-2 border-dashed p-6 text-center transition focus-within:ring-4 focus-within:ring-amber-500/20 ${
                  isDragOver
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10'
                    : 'border-slate-300 bg-slate-50 hover:border-amber-500 hover:bg-amber-50/60 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:bg-slate-950'
                }`}
              >
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700 transition group-hover:scale-105 dark:bg-amber-500/10 dark:text-amber-400"><Camera className="h-5 w-5" aria-hidden="true" /></span>
                <strong className="block text-xs font-extrabold text-slate-950 dark:text-white">
                  {isDragOver ? 'Solte a imagem aqui' : hasImage ? `Trocar ${rule.label}` : `Enviar ${rule.label}`}
                </strong>
                <span id={hintId} className="block text-xs text-slate-600 dark:text-slate-400">Clique ou arraste · JPG, PNG ou WebP<br />{rule.hint}</span>
                {isPending && (
                  <span className="block text-xs font-semibold text-amber-700 dark:text-amber-300">Nova imagem selecionada. Salve para publicar.</span>
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
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remover {rule.label}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isVerified ? (
        <p className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>Seu perfil tem o selo <strong>Compositor Verificado</strong>, exibido ao lado do seu nome na vitrine.</span>
        </p>
      ) : (
        <p className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
          <ShieldCheck className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <span>O selo <strong className="text-slate-800 dark:text-slate-200">Compositor Verificado</strong> aparece na vitrine depois que a equipe analisa e confirma seu cadastro. Um perfil completo, com foto, capa e biografia, facilita a análise.</span>
        </p>
      )}
    </section>
  );
};
