import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Check, CheckCircle2, Circle, Copy, EyeOff, Globe2, LoaderCircle } from 'lucide-react';
import { APP_URL } from '../../../config/appConfig';
import type { ComposerProfile, Song, Subscription } from '../../../types';
import { BIO_MIN_LENGTH, hasCustomImage } from './profileFormUtils';

export type ProfileSectionId = 'identity' | 'presentation' | 'legal' | 'social';

interface ProfileVisibilityCardProps {
  /** Perfil salvo: é o que artistas e produtores veem, não o rascunho do formulário. */
  profile: ComposerProfile;
  subscription: Subscription;
  songs: Song[];
  hasUnsavedChanges: boolean;
  linkCopied: boolean;
  onCopyLink: () => void;
  onGoToField: (section: ProfileSectionId, fieldId: string) => void;
}

type Visibility = 'loading' | 'hidden' | 'off-catalog' | 'visible';

const TONES: Record<Exclude<Visibility, 'loading'>, { badge: string; box: string; icon: React.ReactNode; label: string }> = {
  hidden: {
    label: 'Perfil oculto',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
    box: 'border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/5',
    icon: <EyeOff className="h-4 w-4" aria-hidden="true" />
  },
  'off-catalog': {
    label: 'No ar, fora do catálogo',
    badge: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
    box: 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5',
    icon: <AlertCircle className="h-4 w-4" aria-hidden="true" />
  },
  visible: {
    label: 'Visível no catálogo',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
    box: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/5',
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
  }
};

const ctaClass = 'mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-extrabold text-slate-950 transition hover:bg-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400';

export const ProfileVisibilityCard: React.FC<ProfileVisibilityCardProps> = ({
  profile,
  subscription,
  songs,
  hasUnsavedChanges,
  linkCopied,
  onCopyLink,
  onGoToField
}) => {
  const publishedCount = songs.filter(song => song.status === 'published').length;
  const pendingCount = songs.filter(song => song.status === 'pending_approval').length;
  // Espelha o banco: get_public_composer exige assinatura ativa; a lista de
  // compositores exige também ao menos uma música publicada.
  const visibility: Visibility = subscription.isPlaceholder
    ? 'loading'
    : subscription.status !== 'active'
      ? 'hidden'
      : publishedCount === 0 ? 'off-catalog' : 'visible';

  const publicHost = APP_URL.replace(/^https?:\/\//, '');
  const tips = [
    { id: 'photo', label: 'Foto de perfil', done: hasCustomImage(profile.photo), section: 'identity' as const, field: 'field-avatar' },
    { id: 'cover', label: 'Imagem de capa', done: hasCustomImage(profile.coverPhoto), section: 'identity' as const, field: 'field-banner' },
    { id: 'bio', label: `Biografia com ${BIO_MIN_LENGTH}+ caracteres`, done: profile.bio.trim().length >= BIO_MIN_LENGTH, section: 'presentation' as const, field: 'field-bio' },
    { id: 'social', label: 'Uma rede social ou streaming', done: Boolean(profile.instagram || profile.youtube || profile.spotify || profile.website), section: 'social' as const, field: 'field-instagram' }
  ];
  const doneTips = tips.filter(tip => tip.done).length;

  return (
    <section aria-labelledby="profile-visibility-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"><Globe2 className="h-5 w-5" aria-hidden="true" /></span>
        <h2 id="profile-visibility-title" className="text-base font-extrabold tracking-tight text-slate-950 dark:text-white">Visibilidade do perfil</h2>
      </div>

      <div aria-live="polite" className="mt-4">
        {visibility === 'loading' ? (
          <p className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Verificando a visibilidade…</p>
        ) : (
          <div className={`rounded-2xl border p-4 ${TONES[visibility].box}`}>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold ${TONES[visibility].badge}`}>
              {TONES[visibility].icon}{TONES[visibility].label}
            </span>
            {visibility === 'hidden' && <>
              <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-300">
                Artistas e produtores ainda não veem seu perfil nem suas músicas. O link público só abre com a assinatura ativa.
              </p>
              <Link to="/dashboard/assinatura" className={ctaClass}>{subscription.status === 'pending' ? 'Ativar assinatura' : 'Reativar assinatura'} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </>}
            {visibility === 'off-catalog' && <>
              <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-300">
                Seu link já abre, mas você só entra na lista de compositores depois de ter uma música publicada.
                {pendingCount > 0 && ` ${pendingCount === 1 ? 'Uma música está' : `${pendingCount} músicas estão`} aguardando aprovação.`}
              </p>
              {pendingCount === 0 && <Link to="/dashboard/musicas/nova" className={ctaClass}>Cadastrar música <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
            </>}
            {visibility === 'visible' && (
              <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-300">
                Você aparece para artistas e produtores com {publishedCount === 1 ? '1 música publicada' : `${publishedCount} músicas publicadas`}.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Seu link público</p>
        <div className="mt-1.5 flex items-stretch gap-2">
          <p className="min-w-0 flex-1 break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            {publicHost}/compositor/<strong className="font-extrabold text-slate-900 dark:text-slate-100">{profile.username}</strong>
          </p>
          <button
            type="button"
            onClick={onCopyLink}
            aria-label="Copiar link público"
            title="Copiar link público"
            className="shrink-0 rounded-xl border border-slate-300 px-3 text-slate-700 transition hover:border-amber-400 hover:text-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:border-slate-700 dark:text-slate-300 dark:hover:text-amber-300"
          >
            {linkCopied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        {hasUnsavedChanges && <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">Mostra o que está salvo. Salve para publicar as alterações.</p>}
      </div>

      {doneTips < tips.length && (
        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Para atrair mais artistas</p>
            <span className="text-xs text-slate-600 dark:text-slate-400">{doneTips} de {tips.length}</span>
          </div>
          <ul className="mt-2 space-y-1">
            {tips.map(tip => (
              <li key={tip.id}>
                {tip.done ? (
                  <span className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-500 line-through dark:text-slate-500">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{tip.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onGoToField(tip.section, tip.field)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-800 transition hover:bg-amber-50 hover:text-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:text-slate-200 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                  >
                    <Circle className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="flex-1">{tip.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
