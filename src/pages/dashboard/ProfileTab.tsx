import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  BriefcaseBusiness,
  ExternalLink,
  IdCard,
  Image as ImageIcon,
  MapPin,
  Share2,
  User
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { APP_URL } from '../../config/appConfig';
import { uploadCurrentUserFile, checkUsernameAvailability, removeCurrentUserStorageFiles } from '../../lib/database';
import { handleApiError, parseApiError } from '../../lib/apiErrors';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { ImageCropDialog } from '../../components/common/ImageCropDialog';
import {
  IMAGE_RULES,
  MAX_SOURCE_IMAGE_BYTES,
  MAX_UPLOAD_IMAGE_BYTES,
  USERNAME_MIN_LENGTH,
  USERNAME_TAKEN_MESSAGE,
  focusField,
  getInitials,
  hasCustomImage,
  maskPixKey,
  sanitizeInstagram,
  sanitizeSlug,
  sanitizeWeb,
  validateProfileForm,
  type FieldErrors,
  type ImageKind,
  type ProfileForm,
  type SetProfileField,
  type UsernameStatus
} from './profile/profileFormUtils';
import { ProfileIdentitySection } from './profile/ProfileIdentitySection';
import { ProfilePresentationSection } from './profile/ProfilePresentationSection';
import { ProfileLegalSection } from './profile/ProfileLegalSection';
import { ProfileSocialSection } from './profile/ProfileSocialSection';
import { ProfileSaveBar, type ProfileMessage } from './profile/ProfileSaveBar';
import { ProfileVisibilityCard, type ProfileSectionId } from './profile/ProfileVisibilityCard';

const revokePreviewUrls = (source: Pick<ProfileForm, 'photo' | 'coverPhoto'>) => {
  (['photo', 'coverPhoto'] as const).forEach(kind => {
    if (source[kind]?.startsWith('blob:')) URL.revokeObjectURL(source[kind]);
  });
};

/** Aba em que cada campo validado fica. */
const sectionOfField = (key: string): ProfileSectionId =>
  ['name', 'cpf', 'email', 'whatsapp', 'pixKey', 'pixKeyType'].includes(key)
    ? 'legal'
    : ['instagram', 'youtube', 'spotify', 'website'].includes(key)
      ? 'social'
      : 'presentation';

export const ProfileTab: React.FC = () => {
  const { profile, updateProfile, releases, subscription, songs } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState<ProfileForm>({ ...profile });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [message, setMessage] = useState<ProfileMessage | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageFiles, setImageFiles] = useState<Partial<Record<ImageKind, File>>>({});
  const [cropRequest, setCropRequest] = useState<{ kind: ImageKind; file: File } | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [confirmUsernameChange, setConfirmUsernameChange] = useState(false);
  const [activeSection, setActiveSection] = useState<ProfileSectionId>('identity');
  const usernameChangeConfirmed = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const messageTimer = useRef<number | undefined>(undefined);
  const latestForm = useRef(form);
  latestForm.current = form;

  // Com termos de liberação emitidos, nome civil e CPF só mudam via suporte
  // (garantido também pelo trigger guard_composer_identity no banco).
  const identityLocked = releases.length > 0;
  const usernameChanged = Boolean(profile.username) && sanitizeSlug(form.username || '') !== profile.username;
  const hasChanges = useMemo(() => JSON.stringify(form) !== JSON.stringify(profile), [form, profile]);

  const showMessage = (next: ProfileMessage | null, autoHideMs?: number) => {
    window.clearTimeout(messageTimer.current);
    setMessage(next);
    if (next && autoHideMs) {
      messageTimer.current = window.setTimeout(() => setMessage(null), autoHideMs);
    }
  };

  useEffect(() => () => {
    window.clearTimeout(messageTimer.current);
    // Libera as prévias locais (blob:) que ainda estiverem em uso ao sair da página.
    revokePreviewUrls(latestForm.current);
  }, []);

  const set: SetProfileField = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    if (fieldErrors[key as string]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  };

  // Verificação prévia (com atraso) da disponibilidade do endereço público
  useEffect(() => {
    const trimmedSlug = sanitizeSlug(form.username || '');
    if (!trimmedSlug || trimmedSlug.length < USERNAME_MIN_LENGTH) {
      setUsernameStatus('invalid');
      return;
    }
    if (trimmedSlug === profile.username) {
      setUsernameStatus('current');
      return;
    }
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const isAvail = await checkUsernameAvailability(trimmedSlug);
        setUsernameStatus(isAvail ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [form.username, profile.username]);

  // O perfil mudou no servidor (ex.: selo concedido pelo admin). Se o formulário
  // ainda era igual ao perfil anterior, não há edição a preservar: acompanha o
  // novo. Comparar com o perfil novo (como antes) nunca dava igual nesse caso.
  const lastSyncedProfile = useRef(profile);
  useEffect(() => {
    const previous = lastSyncedProfile.current;
    lastSyncedProfile.current = profile;
    if (JSON.stringify(latestForm.current) === JSON.stringify(previous)) {
      setForm({ ...profile });
    }
  }, [profile]);

  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);

  // O app usa BrowserRouter (sem useBlocker): intercepta, na fase de captura, cliques
  // em links internos antes do <Link> do React Router e pede confirmação ao usuário.
  useEffect(() => {
    if (!hasChanges || isSaving) return;
    const interceptInternalLinks = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener('click', interceptInternalLinks, true);
    return () => document.removeEventListener('click', interceptInternalLinks, true);
  }, [hasChanges, isSaving, location.pathname, location.search]);

  const discardChanges = () => {
    revokePreviewUrls(form);
    setForm({ ...profile });
    setImageFiles({});
    setFieldErrors({});
    showMessage(null);
  };

  const selectImage = (file: File, kind: ImageKind) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      showMessage({ type: 'error', text: 'Formato não aceito. Use uma imagem JPG, PNG ou WebP.' });
      return;
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      showMessage({ type: 'error', text: 'Imagem muito grande. Escolha um arquivo de até 20 MB.' });
      return;
    }
    showMessage(null);
    setCropRequest({ kind, file });
  };

  const applyCroppedImage = (file: File) => {
    if (!cropRequest) return;
    const { kind } = cropRequest;
    setCropRequest(null);
    if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
      showMessage({ type: 'error', text: 'A imagem recortada passou de 5 MB. Tente outra imagem.' });
      return;
    }
    if (form[kind]?.startsWith('blob:')) URL.revokeObjectURL(form[kind]);
    set(kind, URL.createObjectURL(file));
    setImageFiles(current => ({ ...current, [kind]: file }));
  };

  const removeImage = (kind: ImageKind) => {
    if (form[kind]?.startsWith('blob:')) URL.revokeObjectURL(form[kind]);
    set(kind, '');
    setImageFiles(current => {
      const next = { ...current };
      delete next[kind];
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    const errors = validateProfileForm(form, { identityLocked, usernameStatus });
    const username = sanitizeSlug(form.username);

    setIsSaving(true);

    // A verificação com atraso pode ainda estar em andamento (ou ter falhado):
    // confirma a disponibilidade no momento do envio para não depender dela.
    if (!errors.username && username !== profile.username) {
      try {
        if (!(await checkUsernameAvailability(username))) {
          errors.username = USERNAME_TAKEN_MESSAGE;
          setUsernameStatus('taken');
        }
      } catch {
        // A restrição de unicidade do banco continua sendo a garantia final.
      }
    }

    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      setIsSaving(false);
      setFieldErrors(errors);
      const firstError = errorKeys[0];
      setActiveSection(sectionOfField(firstError));
      window.setTimeout(() => focusField(`field-${firstError}`), 0);
      showMessage({
        type: 'error',
        text: errorKeys.length === 1
          ? 'Corrija o campo destacado em vermelho para salvar.'
          : `Corrija os ${errorKeys.length} campos destacados em vermelho para salvar.`
      });
      return;
    }

    if (usernameChanged && !usernameChangeConfirmed.current) {
      setIsSaving(false);
      setConfirmUsernameChange(true);
      return;
    }
    usernameChangeConfirmed.current = false;

    setFieldErrors({});
    const uploadedImages: Record<ImageKind, string> = { photo: form.photo, coverPhoto: form.coverPhoto };
    const newUploads: Array<{ bucket: string; value?: string | null }> = [];
    const replacedFiles: Array<{ bucket: string; value?: string | null }> = [];

    try {
      for (const kind of ['photo', 'coverPhoto'] as const) {
        const file = imageFiles[kind];
        if (file) {
          uploadedImages[kind] = await uploadCurrentUserFile('profile-media', file);
          newUploads.push({ bucket: 'profile-media', value: uploadedImages[kind] });
        }
        // Substituída ou removida: o arquivo anterior vira órfão no bucket.
        if (hasCustomImage(profile[kind]) && profile[kind] !== uploadedImages[kind]) {
          replacedFiles.push({ bucket: 'profile-media', value: profile[kind] });
        }
      }

      const normalized: ProfileForm = {
        ...form,
        username,
        name: form.name.trim(),
        stageName: form.stageName.trim(),
        email: form.email.trim().toLowerCase(),
        whatsapp: form.whatsapp.trim(),
        cpf: form.cpf ? form.cpf.trim() : '',
        society: form.society || '',
        pixKey: form.pixKey ? maskPixKey(form.pixKeyType || 'cpf', form.pixKey) : '',
        pixKeyType: form.pixKeyType || 'cpf',
        city: form.city.trim(),
        state: form.state.trim(),
        bio: form.bio.trim(),
        experienceYears: form.experienceYears.trim(),
        photo: uploadedImages.photo,
        coverPhoto: uploadedImages.coverPhoto,
        instagram: sanitizeInstagram(form.instagram),
        youtube: sanitizeWeb(form.youtube),
        spotify: sanitizeWeb(form.spotify || ''),
        website: sanitizeWeb(form.website)
      };

      await updateProfile(normalized);
      revokePreviewUrls(form);
      setForm(normalized);
      setImageFiles({});

      // Limpeza de fotos anteriores órfãs no bucket profile-media
      if (replacedFiles.length) {
        try {
          await removeCurrentUserStorageFiles(replacedFiles);
        } catch {
          // O perfil já foi salvo com sucesso; falha silenciosa para não degradar a experiência
        }
      }

      showMessage({ type: 'success', text: 'Perfil salvo com sucesso.' }, 4000);
    } catch (error) {
      // Reverter uploads enviados nesta tentativa caso o salvamento falhe
      if (newUploads.length) {
        try {
          await removeCurrentUserStorageFiles(newUploads);
        } catch { /* erro principal permanece o actionable */ }
      }

      const parsed = parseApiError(error);
      if (parsed.code === 'CONFLICT' && /username/i.test(parsed.technicalMessage || '')) {
        setFieldErrors(prev => ({ ...prev, username: USERNAME_TAKEN_MESSAGE }));
        setUsernameStatus('taken');
        focusField('field-username');
        showMessage({ type: 'error', text: USERNAME_TAKEN_MESSAGE });
      } else {
        showMessage({
          type: 'error',
          text: handleApiError(error, 'Não foi possível salvar as alterações. Tente novamente.', { operation: 'saveProfile' })
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  /** Troca de aba e leva o foco ao campo (a aba precisa estar visível antes). */
  const goToField = (section: ProfileSectionId, fieldId: string) => {
    setActiveSection(section);
    window.setTimeout(() => focusField(fieldId), 0);
  };

  // `fromForm`: o botão ao lado do campo de endereço. O link novo só existe depois de salvo.
  const copyLink = async (fromForm = false) => {
    if (fromForm && usernameChanged) {
      showMessage({ type: 'error', text: 'Salve as alterações do perfil antes de copiar o novo link público.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(`${APP_URL}/compositor/${profile.username}`);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      showMessage({ type: 'error', text: 'Não foi possível copiar o link.' });
    }
  };

  const cropRule = IMAGE_RULES[cropRequest?.kind ?? 'photo'];
  const sectionTabs = [
    { id: 'identity' as const, label: 'Foto e capa', icon: ImageIcon },
    { id: 'presentation' as const, label: 'Apresentação', icon: IdCard },
    { id: 'legal' as const, label: 'Dados pessoais', icon: BriefcaseBusiness },
    { id: 'social' as const, label: 'Redes sociais', icon: Share2 }
  ];
  const errorCountBySection = Object.keys(fieldErrors).reduce<Partial<Record<ProfileSectionId, number>>>((acc, key) => {
    const section = sectionOfField(key);
    acc[section] = (acc[section] || 0) + 1;
    return acc;
  }, {});
  // get_public_composer só devolve perfis com assinatura ativa: sem ela o link dá "não encontrado".
  const publicLinkWorks = subscription.isPlaceholder || subscription.status === 'active';

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12 animate-fadeIn">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            <User className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Perfil artístico & comercial</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            Meu Perfil
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Sua vitrine profissional para artistas e produtores.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex gap-2">
            {publicLinkWorks ? (
              <a href={`/compositor/${profile.username}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition hover:border-amber-400 hover:text-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:text-amber-300 sm:flex-none">
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver perfil público
                <span className="sr-only">(abre em nova aba)</span>
              </a>
            ) : (
              <Link to="/dashboard/assinatura" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition hover:border-amber-400 hover:text-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:text-amber-300 sm:flex-none">
                Ativar para publicar
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="relative min-h-64 overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 shadow-xl shadow-slate-950/15">
        {hasCustomImage(form.coverPhoto) ? <img src={form.coverPhoto} alt="" className="absolute inset-0 h-full w-full object-cover opacity-65" /> : <div className="absolute inset-0 bg-gradient-to-br from-amber-500/30 via-slate-900 to-slate-950" />}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/75 to-slate-950/10" />
        {(imageFiles.photo || imageFiles.coverPhoto) && <span className="absolute left-4 top-4 z-10 rounded-full border border-amber-400/40 bg-slate-950/75 px-3 py-1.5 text-xs font-bold text-amber-300 backdrop-blur">Nova imagem, ainda não salva</span>}
        <button type="button" onClick={() => goToField('identity', 'field-banner')} className="absolute right-4 top-4 z-10 inline-flex items-center gap-2 rounded-xl border border-white/30 bg-slate-950/60 px-3 py-2 text-xs font-bold text-white backdrop-blur transition hover:bg-slate-900">
          <ImageIcon className="h-4 w-4" /> Editar capa
        </button>
        <div className="relative z-10 flex min-h-64 items-end p-6 sm:p-8">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-900 text-xl font-black text-amber-300 shadow-2xl sm:h-28 sm:w-28">
              {hasCustomImage(form.photo) ? <img src={form.photo} alt={form.stageName || 'Foto do perfil'} className="h-full w-full object-cover" /> : getInitials(form.stageName || form.name || '')}
            </div>
            <div className="min-w-0 pb-1 text-white">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-2xl font-black tracking-tight drop-shadow-sm sm:text-3xl">{form.stageName || 'Nome artístico'}</h2>
                {profile.isVerified && <BadgeCheck className="h-6 w-6 shrink-0 fill-emerald-500 text-white" aria-label="Perfil verificado" />}
              </div>
              <p className="mt-1.5 text-sm font-semibold text-slate-100">Compositor{form.genres[0] ? ` • ${form.genres[0]}` : ''}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-200"><MapPin className="h-3.5 w-3.5 text-amber-400" /> {form.city || 'Sua cidade'}{form.state ? `, ${form.state}` : ''}</p>
              <div className="mt-3 flex flex-wrap gap-2">{form.genres.slice(0, 3).map(genre => <span key={genre} className="rounded-full border border-white/30 bg-slate-950/50 px-3 py-1 text-xs font-semibold backdrop-blur">{genre}</span>)}</div>
            </div>
          </div>
        </div>
      </section>

      <form
        id="profile-editor-form"
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        aria-label="Editar perfil do compositor"
        className="min-w-0"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <nav aria-label="Seções do perfil" className="grid grid-cols-2 border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/30 sm:grid-cols-4">
              {sectionTabs.map(tab => { const Icon = tab.icon; const active = activeSection === tab.id; const tabErrors = errorCountBySection[tab.id] || 0; return <button key={tab.id} type="button" onClick={() => setActiveSection(tab.id)} aria-current={active ? 'page' : undefined} aria-label={tabErrors ? `${tab.label}: ${tabErrors} ${tabErrors === 1 ? 'campo com erro' : 'campos com erro'}` : undefined} className={`flex min-h-16 items-center justify-center gap-2.5 border-b-[3px] px-3 text-sm font-extrabold transition ${active ? 'border-amber-500 bg-white text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'border-transparent text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-white'}`}><Icon className="h-[18px] w-[18px]" />{tab.label}{tabErrors > 0 && <span aria-hidden="true" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{tabErrors}</span>}</button>; })}
            </nav>
            <div className="p-5 sm:p-8">
              <p className="mb-6 text-xs text-slate-600 dark:text-slate-400">Campos marcados com <span className="font-black text-amber-600 dark:text-amber-400">*</span> são obrigatórios.</p>
              <div hidden={activeSection !== 'identity'}><ProfileIdentitySection form={form} isVerified={Boolean(profile.isVerified)} pendingImages={imageFiles} onSelectImage={selectImage} onRemoveImage={removeImage} /></div>
              <div hidden={activeSection !== 'presentation'}><ProfilePresentationSection form={form} set={set} errors={fieldErrors} usernameStatus={usernameStatus} usernameChanged={usernameChanged} currentUsername={profile.username} linkCopied={linkCopied} onCopyLink={() => void copyLink(true)} /></div>
              <div hidden={activeSection !== 'legal'}><ProfileLegalSection form={form} set={set} errors={fieldErrors} identityLocked={identityLocked} /></div>
              <div hidden={activeSection !== 'social'}><ProfileSocialSection form={form} set={set} errors={fieldErrors} /></div>
            </div>
          </div>

          <aside className="space-y-5">
            <ProfileVisibilityCard
              profile={profile}
              subscription={subscription}
              songs={songs}
              hasUnsavedChanges={hasChanges}
              linkCopied={linkCopied}
              onCopyLink={() => void copyLink()}
              onGoToField={goToField}
            />
          </aside>
        </div>

        <div className="mt-5"><ProfileSaveBar message={message} isSaving={isSaving} hasChanges={hasChanges} onDismissMessage={() => showMessage(null)} onDiscard={discardChanges} /></div>
      </form>

      <ImageCropDialog
        file={cropRequest?.file ?? null}
        aspect={cropRule.aspect}
        outputWidth={cropRule.width}
        outputHeight={cropRule.height}
        title={cropRule.cropTitle}
        onCancel={() => setCropRequest(null)}
        onConfirm={applyCroppedImage}
      />

      <AdminConfirmDialog
        isOpen={confirmUsernameChange}
        variant="warning"
        title="Alterar seu endereço público?"
        description={`O novo endereço será /compositor/${sanitizeSlug(form.username || '')}. Por 180 dias, quem abrir o link antigo /compositor/${profile.username} ou os links das suas músicas será levado ao endereço novo. Depois disso os links antigos deixam de funcionar; atualize-os onde já foram divulgados.`}
        confirmLabel="Alterar e salvar"
        cancelLabel="Manter endereço atual"
        onCancel={() => setConfirmUsernameChange(false)}
        onConfirm={() => {
          setConfirmUsernameChange(false);
          usernameChangeConfirmed.current = true;
          formRef.current?.requestSubmit();
        }}
      />

      <AdminConfirmDialog
        isOpen={pendingNavigation !== null}
        variant="warning"
        title="Sair sem salvar?"
        description="Você tem alterações no perfil que ainda não foram salvas. Se sair agora, elas serão perdidas."
        confirmLabel="Sair sem salvar"
        cancelLabel="Continuar editando"
        onCancel={() => setPendingNavigation(null)}
        onConfirm={() => {
          const target = pendingNavigation;
          setPendingNavigation(null);
          discardChanges();
          if (target) navigate(target);
        }}
      />
    </div>
  );
};
