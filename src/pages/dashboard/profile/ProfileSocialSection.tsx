import React from 'react';
import { Globe, Instagram, Music, Youtube } from 'lucide-react';
import { FieldError, FieldLabel, SectionHeader, fieldA11y, getInputClass } from './ProfileFields';
import type { FieldErrors, ProfileForm, SetProfileField } from './profileFormUtils';

interface ProfileSocialSectionProps {
  form: ProfileForm;
  set: SetProfileField;
  errors: FieldErrors;
}

type SocialField = 'instagram' | 'youtube' | 'spotify' | 'website';

const SOCIAL_FIELDS: Array<{ key: SocialField; label: string; placeholder: string; maxLength: number; icon: React.ReactNode }> = [
  { key: 'instagram', label: 'Instagram', placeholder: '@seuusuario ou instagram.com/usuario', maxLength: 120, icon: <Instagram className="w-3.5 h-3.5 text-pink-400" aria-hidden="true" /> },
  { key: 'youtube', label: 'Canal no YouTube', placeholder: 'youtube.com/@seucanal', maxLength: 200, icon: <Youtube className="w-3.5 h-3.5 text-red-400" aria-hidden="true" /> },
  { key: 'spotify', label: 'Spotify / plataforma de streaming', placeholder: 'open.spotify.com/artist/...', maxLength: 200, icon: <Music className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" /> },
  { key: 'website', label: 'Website / portfólio oficial', placeholder: 'seusite.com.br', maxLength: 200, icon: <Globe className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" /> }
];

export const ProfileSocialSection: React.FC<ProfileSocialSectionProps> = ({ form, set, errors }) => (
  <section id="section-social" aria-labelledby="section-social-title" className="space-y-4 border-t border-slate-800 pt-6 scroll-mt-28">
    <SectionHeader
      titleId="section-social-title"
      title="Redes Sociais & Links Externos"
      description="Canais para artistas conhecerem mais do seu trabalho e ouvirem suas produções."
      visibility="public"
    />

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {SOCIAL_FIELDS.map(field => (
        <div key={field.key} id={`field-${field.key}`}>
          <FieldLabel htmlFor={`input-${field.key}`} icon={field.icon}>{field.label}</FieldLabel>
          <input
            id={`input-${field.key}`}
            type={field.key === 'instagram' ? 'text' : 'url'}
            inputMode={field.key === 'instagram' ? 'text' : 'url'}
            maxLength={field.maxLength}
            value={form[field.key] || ''}
            onChange={e => set(field.key, e.target.value)}
            placeholder={field.placeholder}
            autoComplete="off"
            spellCheck={false}
            {...fieldA11y(errors, field.key)}
            className={getInputClass(errors, field.key)}
          />
          <FieldError errors={errors} name={field.key} />
        </div>
      ))}
    </div>
  </section>
);
