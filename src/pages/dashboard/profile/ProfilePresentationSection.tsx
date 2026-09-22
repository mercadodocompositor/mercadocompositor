import React, { useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Copy, LoaderCircle, Plus, X, XCircle } from 'lucide-react';
import { FieldError, FieldHint, FieldLabel, SectionHeader, fieldA11y, getInputClass } from './ProfileFields';
import {
  BIO_MAX_LENGTH,
  BIO_MIN_LENGTH,
  FEATURED_GENRES,
  GENRES,
  MAX_GENRES,
  SOCIETIES,
  STATES,
  USERNAME_MIN_LENGTH,
  sanitizeSlug,
  type FieldErrors,
  type ProfileForm,
  type SetProfileField,
  type UsernameStatus
} from './profileFormUtils';

interface ProfilePresentationSectionProps {
  form: ProfileForm;
  set: SetProfileField;
  errors: FieldErrors;
  usernameStatus: UsernameStatus;
  usernameChanged: boolean;
  currentUsername: string;
  linkCopied: boolean;
  onCopyLink: () => void;
}

const UsernameStatusText: React.FC<{ status: UsernameStatus; hasError: boolean }> = ({ status, hasError }) => {
  if (status === 'checking') {
    return (
      <span className="text-amber-400 flex items-center gap-1">
        <LoaderCircle className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Verificando disponibilidade...
      </span>
    );
  }
  if (hasError) return null;
  switch (status) {
    case 'available':
      return <span className="text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Endereço disponível</span>;
    case 'taken':
      return <span className="text-red-400 font-semibold flex items-center gap-1"><XCircle className="w-3.5 h-3.5" aria-hidden="true" /> Este endereço já está em uso por outro compositor.</span>;
    case 'current':
      return <span className="text-slate-400 flex items-center gap-1"><Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" /> Seu endereço público atual</span>;
    case 'invalid':
      return <span className="text-amber-400/90">Mínimo de {USERNAME_MIN_LENGTH} caracteres (apenas letras, números e hífens)</span>;
    default:
      return null;
  }
};

export const ProfilePresentationSection: React.FC<ProfilePresentationSectionProps> = ({
  form,
  set,
  errors,
  usernameStatus,
  usernameChanged,
  currentUsername,
  linkCopied,
  onCopyLink
}) => {
  const [customGenre, setCustomGenre] = useState('');
  const bioLength = form.bio.trim().length;
  const genreLimitReached = form.genres.length >= MAX_GENRES;
  const customGenres = form.genres.filter(genre => !GENRES.includes(genre));

  const toggleGenre = (genre: string) => {
    if (form.genres.includes(genre)) {
      set('genres', form.genres.filter(item => item !== genre));
    } else if (!genreLimitReached) {
      set('genres', [...form.genres, genre]);
    }
  };

  const addGenre = () => {
    const genre = customGenre.trim();
    if (!genre || genreLimitReached || form.genres.some(item => item.toLowerCase() === genre.toLowerCase())) return;
    set('genres', [...form.genres, genre]);
    setCustomGenre('');
  };

  return (
    <section id="section-presentation" aria-labelledby="section-presentation-title" className="space-y-4 border-t border-slate-800 pt-6 scroll-mt-28">
      <SectionHeader
        titleId="section-presentation-title"
        title="Apresentação Artística & Vitrine Pública"
        description="Informações visíveis para cantores, empresários e produtoras musicais."
        visibility="public"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div id="field-stageName">
          <FieldLabel htmlFor="input-stageName" required>Nome artístico / pseudônimo</FieldLabel>
          <input
            id="input-stageName"
            maxLength={100}
            value={form.stageName}
            onChange={e => set('stageName', e.target.value)}
            placeholder="Ex: Rafael Monteiro"
            autoComplete="nickname"
            aria-required="true"
            {...fieldA11y(errors, 'stageName')}
            className={getInputClass(errors, 'stageName')}
          />
          <FieldError errors={errors} name="stageName" />
        </div>

        <div id="field-username">
          <FieldLabel htmlFor="input-username" required>Endereço público (link da vitrine)</FieldLabel>
          <div className="mt-1.5 flex">
            <span aria-hidden="true" className="bg-slate-800 rounded-l-xl px-3 py-2.5 text-xs text-slate-400 border border-r-0 border-slate-800 select-none">
              /compositor/
            </span>
            <input
              id="input-username"
              value={form.username}
              onChange={e => set('username', sanitizeSlug(e.target.value))}
              placeholder="seu-nome"
              autoComplete="off"
              spellCheck={false}
              aria-required="true"
              {...fieldA11y(errors, 'username', 'username-status username-hint')}
              className={`min-w-0 flex-1 bg-slate-950 border rounded-r-xl px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 font-mono ${
                errors.username ? 'border-red-500 ring-2 ring-red-500/20 bg-red-950/20' : 'border-slate-800 focus:border-amber-500'
              }`}
            />
            <button
              type="button"
              onClick={onCopyLink}
              aria-label="Copiar link público"
              title="Copiar link da vitrine"
              className="ml-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {linkCopied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>
          <FieldError errors={errors} name="username" />
          <div id="username-status" aria-live="polite" className="flex items-center gap-1.5 mt-1 text-xs min-h-4">
            <UsernameStatusText status={usernameStatus} hasError={Boolean(errors.username)} />
          </div>
          <p id="username-hint" aria-live="polite" className="text-xs text-slate-500 mt-1">
            {linkCopied
              ? <span className="inline-flex items-center gap-1 text-emerald-400"><Check className="w-3.5 h-3.5" aria-hidden="true" /> Link copiado para a área de transferência.</span>
              : 'Use apenas letras minúsculas, números e hífens.'}
          </p>
          {usernameChanged && (
            <p role="note" className="mt-2 flex items-start gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" aria-hidden="true" />
              <span>
                Ao salvar, o link atual <strong className="font-mono">/compositor/{currentUsername}</strong> e os links das suas músicas deixam de funcionar. Atualize-os onde já foram divulgados.
              </span>
            </p>
          )}
        </div>

        <div id="field-city">
          <FieldLabel htmlFor="input-city" required>Cidade</FieldLabel>
          <input
            id="input-city"
            maxLength={80}
            value={form.city}
            onChange={e => set('city', e.target.value)}
            placeholder="Ex: Goiânia"
            autoComplete="address-level2"
            aria-required="true"
            {...fieldA11y(errors, 'city')}
            className={getInputClass(errors, 'city')}
          />
          <FieldError errors={errors} name="city" />
        </div>

        <div id="field-state">
          <FieldLabel htmlFor="input-state" required>Estado (UF)</FieldLabel>
          <select
            id="input-state"
            value={form.state}
            onChange={e => set('state', e.target.value)}
            autoComplete="address-level1"
            aria-required="true"
            {...fieldA11y(errors, 'state')}
            className={getInputClass(errors, 'state')}
          >
            <option value="">Selecione o estado</option>
            {STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>
          <FieldError errors={errors} name="state" />
        </div>

        <div id="field-experienceYears" className="sm:col-span-2">
          <FieldLabel htmlFor="input-experienceYears">Tempo de estrada / experiência musical</FieldLabel>
          <input
            id="input-experienceYears"
            maxLength={50}
            value={form.experienceYears}
            onChange={e => set('experienceYears', e.target.value)}
            placeholder="Ex: 10 anos compondo para artistas nacionais"
            {...fieldA11y(errors, 'experienceYears')}
            className={getInputClass(errors, 'experienceYears')}
          />
          <FieldError errors={errors} name="experienceYears" />
        </div>

        <div id="field-society" className="sm:col-span-2">
          <FieldLabel htmlFor="input-society">Sociedade de gestão coletiva / arrecadação (ECAD)</FieldLabel>
          <select
            id="input-society"
            value={form.society || ''}
            onChange={e => set('society', e.target.value)}
            {...fieldA11y(errors, 'society', 'society-hint')}
            className={getInputClass(errors, 'society')}
          >
            <option value="">Selecione sua sociedade de filiação (opcional)</option>
            {SOCIETIES.map(soc => (
              <option key={soc} value={soc}>{soc}</option>
            ))}
          </select>
          <FieldError errors={errors} name="society" />
          <FieldHint id="society-hint">A sigla da sociedade aparece como selo na sua vitrine.</FieldHint>
        </div>
      </div>

      <div id="field-bio">
        <div className="flex justify-between items-center gap-3">
          <FieldLabel htmlFor="input-bio" required>Biografia artística / apresentação</FieldLabel>
          <span id="bio-counter" className={`text-xs ${bioLength < BIO_MIN_LENGTH ? 'text-amber-400/90' : 'text-slate-500'}`}>
            {bioLength < BIO_MIN_LENGTH
              ? `${bioLength} / mín. ${BIO_MIN_LENGTH}`
              : `${form.bio.length} / ${BIO_MAX_LENGTH}`}
          </span>
        </div>
        <textarea
          id="input-bio"
          rows={4}
          maxLength={BIO_MAX_LENGTH}
          value={form.bio}
          onChange={e => set('bio', e.target.value)}
          placeholder="Conte sua trajetória, parcerias, influências, gravações de sucesso e diferenciais das suas composições..."
          aria-required="true"
          {...fieldA11y(errors, 'bio', 'bio-counter')}
          className={`${getInputClass(errors, 'bio')} resize-none leading-relaxed`}
        />
        <FieldError errors={errors} name="bio" />
      </div>

      <div
        id="field-genres"
        role="group"
        aria-labelledby="genres-label"
        aria-describedby={errors.genres ? 'genres-counter error-genres' : 'genres-counter'}
        className="space-y-2 pt-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <FieldLabel id="genres-label" required>Gêneros musicais de destaque</FieldLabel>
          <span id="genres-counter" aria-live="polite" className={`text-xs ${genreLimitReached ? 'text-amber-400/90' : 'text-slate-500'}`}>
            {form.genres.length} de {MAX_GENRES} selecionados
            {genreLimitReached ? '. Desmarque um para escolher outro.' : ''}
          </span>
        </div>
        <p className="text-xs text-slate-500">Os {FEATURED_GENRES} primeiros escolhidos aparecem em destaque na vitrine.</p>
        <div className="flex flex-wrap gap-2">
          {GENRES.map(genre => {
            const isSelected = form.genres.includes(genre);
            const isBlocked = !isSelected && genreLimitReached;
            return (
              <button
                type="button"
                key={genre}
                onClick={() => toggleGenre(genre)}
                aria-pressed={isSelected}
                disabled={isBlocked}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-40 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md font-bold'
                    : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 pt-2">
          <input
            value={customGenre}
            maxLength={40}
            onChange={e => setCustomGenre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGenre(); } }}
            placeholder={genreLimitReached ? `Limite de ${MAX_GENRES} gêneros atingido` : 'Adicionar outro estilo...'}
            aria-label="Novo gênero musical personalizado"
            disabled={genreLimitReached}
            className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={addGenre}
            disabled={genreLimitReached || !customGenre.trim()}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs flex items-center gap-1 border border-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Adicionar</span>
          </button>
        </div>

        {customGenres.length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1" aria-label="Gêneros personalizados">
            {customGenres.map(genre => (
              <li key={genre} className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-300 border border-amber-500/30 pl-2.5 pr-1 py-1 rounded-xl text-xs">
                {genre}
                <button
                  type="button"
                  onClick={() => toggleGenre(genre)}
                  aria-label={`Remover gênero ${genre}`}
                  className="p-0.5 rounded-md text-amber-400 hover:text-white hover:bg-amber-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <FieldError errors={errors} name="genres" />
      </div>
    </section>
  );
};
