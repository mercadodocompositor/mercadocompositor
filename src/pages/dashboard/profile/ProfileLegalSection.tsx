import React from 'react';
import { CreditCard, Lock, ShieldCheck } from 'lucide-react';
import { FieldError, FieldHint, FieldLabel, SectionHeader, VisibilityBadge, fieldA11y, getInputClass } from './ProfileFields';
import {
  PIX_TYPE_LABELS,
  maskCpf,
  maskPhone,
  maskPixKey,
  validatePixKey,
  type FieldErrors,
  type PixKeyType,
  type ProfileForm,
  type SetProfileField
} from './profileFormUtils';

interface ProfileLegalSectionProps {
  form: ProfileForm;
  set: SetProfileField;
  errors: FieldErrors;
  /** Com termos de liberação emitidos, nome civil e CPF só mudam via suporte. */
  identityLocked: boolean;
}

const PIX_PLACEHOLDERS: Record<PixKeyType, string> = {
  cpf: '000.000.000-00',
  email: 'seuemail@exemplo.com',
  phone: '(00) 00000-0000',
  random: '1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f'
};

const quickPixButtonClass = 'rounded-md px-1.5 py-0.5 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

export const ProfileLegalSection: React.FC<ProfileLegalSectionProps> = ({ form, set, errors, identityLocked }) => {
  const pixType = (form.pixKeyType || 'cpf') as PixKeyType;
  const lockedClass = identityLocked ? 'opacity-70 cursor-not-allowed' : '';

  const fillPixFrom = (type: PixKeyType, value: string) => {
    set('pixKeyType', type);
    set('pixKey', maskPixKey(type, value));
  };

  return (
    <section id="section-legal" aria-labelledby="section-legal-title" className="space-y-4 border-t border-slate-800 pt-6 scroll-mt-28">
      <SectionHeader
        titleId="section-legal-title"
        title="Identificação Civil & Contato"
        description="Nada desta seção aparece na sua vitrine. Nome civil e CPF identificam você como titular nos termos de liberação que você emite; e-mail e WhatsApp são usados para avisar você sobre pedidos e negociações."
        visibility="private"
        icon={<ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />}
      />

      {identityLocked && (
        <div role="note" id="identity-locked-note" className="flex items-start gap-2.5 rounded-2xl border border-slate-700 bg-slate-950/80 p-3.5 text-xs text-slate-300">
          <Lock className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" aria-hidden="true" />
          <p>
            <strong className="text-white">Nome civil e CPF estão bloqueados para edição.</strong>{' '}
            Você já emitiu termos de liberação com esses dados. Para corrigir alguma informação, fale com o suporte. Assim os documentos emitidos continuam válidos.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div id="field-name">
          <FieldLabel htmlFor="input-name" required icon={identityLocked ? <Lock className="w-3 h-3 text-slate-500" aria-hidden="true" /> : undefined}>
            Nome civil completo (titular dos direitos)
          </FieldLabel>
          <input
            id="input-name"
            maxLength={120}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Ex: Rafael da Silva Monteiro"
            autoComplete="name"
            readOnly={identityLocked}
            aria-required="true"
            {...fieldA11y(errors, 'name', identityLocked ? 'identity-locked-note' : undefined)}
            className={getInputClass(errors, 'name', lockedClass)}
          />
          <FieldError errors={errors} name="name" />
        </div>

        <div id="field-cpf">
          <FieldLabel htmlFor="input-cpf" required icon={identityLocked ? <Lock className="w-3 h-3 text-slate-500" aria-hidden="true" /> : undefined}>
            CPF do compositor
          </FieldLabel>
          <input
            id="input-cpf"
            type="text"
            value={form.cpf}
            onChange={e => set('cpf', maskCpf(e.target.value))}
            placeholder="000.000.000-00"
            inputMode="numeric"
            autoComplete="off"
            readOnly={identityLocked}
            aria-required="true"
            {...fieldA11y(errors, 'cpf', identityLocked ? 'identity-locked-note cpf-hint' : 'cpf-hint')}
            className={getInputClass(errors, 'cpf', `font-mono ${lockedClass}`)}
          />
          <FieldError errors={errors} name="cpf" />
          <FieldHint id="cpf-hint">Consta nos termos de liberação entregues ao intérprete. Nunca aparece na vitrine.</FieldHint>
        </div>

        <div id="field-email">
          <FieldLabel htmlFor="input-email" required>E-mail para notificações e negociações</FieldLabel>
          <input
            id="input-email"
            type="email"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="seuemail@exemplo.com.br"
            autoComplete="email"
            aria-required="true"
            {...fieldA11y(errors, 'email')}
            className={getInputClass(errors, 'email')}
          />
          <FieldError errors={errors} name="email" />
        </div>

        <div id="field-whatsapp">
          <FieldLabel htmlFor="input-whatsapp" required>WhatsApp de contato direto</FieldLabel>
          <input
            id="input-whatsapp"
            type="tel"
            value={form.whatsapp}
            onChange={e => set('whatsapp', maskPhone(e.target.value))}
            placeholder="(00) 00000-0000"
            autoComplete="tel-national"
            aria-required="true"
            {...fieldA11y(errors, 'whatsapp')}
            className={getInputClass(errors, 'whatsapp', 'font-mono')}
          />
          <FieldError errors={errors} name="whatsapp" />
        </div>

        {/* Chave PIX para negociações comerciais */}
        <div id="field-pix" role="group" aria-labelledby="pix-title" className="sm:col-span-2 bg-slate-950/80 border border-slate-800 p-5 rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <h3 id="pix-title" className="text-sm font-bold text-white">Chave PIX para negociações</h3>
              </div>
              <p id="pix-description" className="text-xs text-slate-400 mt-0.5">
                Fica guardada no seu cadastro para agilizar as negociações. Não aparece na vitrine; você decide quando compartilhá-la com o intérprete. Opcional.
              </p>
            </div>
            <VisibilityBadge visibility="private" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <FieldLabel htmlFor="input-pixKeyType">Tipo de chave</FieldLabel>
              <select
                id="input-pixKeyType"
                value={pixType}
                onChange={e => {
                  const nextType = e.target.value;
                  set('pixKeyType', nextType);
                  // Troca de tipo: descarta a chave que não corresponde ao novo formato.
                  if (validatePixKey(nextType, form.pixKey || '')) set('pixKey', '');
                }}
                className={getInputClass(errors, 'pixKeyType')}
              >
                {(Object.keys(PIX_TYPE_LABELS) as PixKeyType[]).map(type => (
                  <option key={type} value={type}>{PIX_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>

            <div id="field-pixKey" className="sm:col-span-2">
              <div className="flex flex-wrap justify-between items-center gap-x-2">
                <FieldLabel htmlFor="input-pixKey">Chave PIX</FieldLabel>
                <div className="flex gap-1" role="group" aria-label="Preencher a chave com um dado do cadastro">
                  {form.cpf && (
                    <button type="button" onClick={() => fillPixFrom('cpf', form.cpf)} className={quickPixButtonClass}>Usar CPF</button>
                  )}
                  {form.whatsapp && (
                    <button type="button" onClick={() => fillPixFrom('phone', form.whatsapp)} className={quickPixButtonClass}>Usar WhatsApp</button>
                  )}
                  {form.email && (
                    <button type="button" onClick={() => fillPixFrom('email', form.email)} className={quickPixButtonClass}>Usar e-mail</button>
                  )}
                </div>
              </div>
              <input
                id="input-pixKey"
                maxLength={140}
                value={form.pixKey || ''}
                onChange={e => set('pixKey', maskPixKey(pixType, e.target.value))}
                autoComplete="off"
                spellCheck={false}
                inputMode={pixType === 'cpf' || pixType === 'phone' ? 'numeric' : pixType === 'email' ? 'email' : 'text'}
                placeholder={PIX_PLACEHOLDERS[pixType]}
                {...fieldA11y(errors, 'pixKey', 'pix-description')}
                className={getInputClass(errors, 'pixKey')}
              />
              <FieldError errors={errors} name="pixKey" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
