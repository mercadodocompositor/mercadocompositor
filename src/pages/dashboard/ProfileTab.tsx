import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
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
  buildProfileChecks,
  focusField,
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
import { ProfileStrengthCard } from './profile/ProfileStrengthCard';
import { ProfileIdentitySection } from './profile/ProfileIdentitySection';
import { ProfilePresentationSection } from './profile/ProfilePresentationSection';
import { ProfileLegalSection } from './profile/ProfileLegalSection';
import { ProfileSocialSection } from './profile/ProfileSocialSection';
import { ProfileSaveBar, type ProfileMessage } from './profile/ProfileSaveBar';

const revokePreviewUrls = (source: Pick<ProfileForm, 'photo' | 'coverPhoto'>) => {
  (['photo', 'coverPhoto'] as const).forEach(kind => {
    if (source[kind]?.startsWith('blob:')) URL.revokeObjectURL(source[kind]);
  });
};

export const ProfileTab: React.FC = () => {
  const { profile, updateProfile, releases } = useApp();
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
  const profileChecks = useMemo(() => buildProfileChecks(form), [form]);
  const completionPercentage = Math.round((profileChecks.filter(check => check.done).length / profileChecks.length) * 100);

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

  useEffect(() => {
    if (!hasChanges) {
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
      focusField(`field-${errorKeys[0]}`);
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

  const copyLink = async () => {
    if (form.username !== profile.username) {
      showMessage({ type: 'error', text: 'Salve as alterações do perfil antes de copiar o novo link público.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/compositor/${form.username}`);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      showMessage({ type: 'error', text: 'Não foi possível copiar o link.' });
    }
  };

  const cropRule = IMAGE_RULES[cropRequest?.kind ?? 'photo'];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn pb-12">
      <header className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
            <User className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Perfil artístico & comercial</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Meu Perfil de Compositor
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gerencie sua vitrine pública, bio, mídias e dados para emissão de liberações.
          </p>
        </div>

        <a
          href={`/compositor/${profile.username}`}
          target="_blank"
          rel="noreferrer"
          className="w-full sm:w-auto shrink-0 justify-center px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          <span>Ver vitrine pública</span>
          <ExternalLink className="w-4 h-4" aria-hidden="true" />
          <span className="sr-only">(abre em nova aba)</span>
        </a>
      </header>

      <ProfileStrengthCard checks={profileChecks} completionPercentage={completionPercentage} />

      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        aria-label="Editar perfil do compositor"
        className="min-w-0 bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-8 shadow-2xl space-y-8"
      >
        <p className="text-xs text-slate-400">
          Campos marcados com <span aria-hidden="true" className="text-amber-400">*</span><span className="sr-only">asterisco</span> são obrigatórios.
        </p>

        <ProfileIdentitySection
          form={form}
          isVerified={Boolean(profile.isVerified)}
          pendingImages={imageFiles}
          onSelectImage={selectImage}
          onRemoveImage={removeImage}
        />

        <ProfilePresentationSection
          form={form}
          set={set}
          errors={fieldErrors}
          usernameStatus={usernameStatus}
          usernameChanged={usernameChanged}
          currentUsername={profile.username}
          linkCopied={linkCopied}
          onCopyLink={copyLink}
        />

        <ProfileLegalSection form={form} set={set} errors={fieldErrors} identityLocked={identityLocked} />

        <ProfileSocialSection form={form} set={set} errors={fieldErrors} />

        <ProfileSaveBar
          message={message}
          isSaving={isSaving}
          hasChanges={hasChanges}
          onDismissMessage={() => showMessage(null)}
          onDiscard={discardChanges}
        />
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
        description={`O link /compositor/${profile.username} e os links das suas músicas vão parar de funcionar. Quem receber o endereço antigo verá uma página não encontrada. O novo endereço será /compositor/${sanitizeSlug(form.username || '')}.`}
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
