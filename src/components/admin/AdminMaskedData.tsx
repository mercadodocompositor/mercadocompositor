import React, { useState } from 'react';
import { Eye, EyeOff, ShieldCheck, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAdminToast } from './AdminToast';

export type MaskDataType = 'cpf' | 'phone' | 'email' | 'text';

export interface AdminMaskedDataProps {
  value: string;
  type?: MaskDataType;
  subjectName?: string;
  className?: string;
}

export const AdminMaskedData: React.FC<AdminMaskedDataProps> = ({
  value,
  type = 'text',
  subjectName = 'usuário',
  className = ''
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const { addSystemLog, profile } = useApp();
  const toast = useAdminToast();

  if (!value) {
    return <span className="text-slate-500 italic">Não informado</span>;
  }

  const maskValue = (raw: string, dataType: MaskDataType | string = 'text') => {
    if (!raw) return '';

    switch (dataType) {
      case 'cpf': {
        const clean = raw.replace(/\D/g, '');
        if (clean.length === 11) {
          return `***.${clean.slice(3, 6)}.${clean.slice(6, 9)}-**`;
        }
        if (clean.length === 14) {
          // CNPJ
          return `**.${clean.slice(2, 5)}.${clean.slice(5, 8)}/****-**`;
        }
        return '***.***.***-**';
      }
      case 'phone': {
        const clean = raw.replace(/\D/g, '');
        if (clean.length >= 10) {
          const ddd = clean.slice(0, 2);
          const end = clean.slice(-4);
          return `(${ddd}) 9****-${end}`;
        }
        return '(**) *****-****';
      }
      case 'email': {
        const parts = raw.split('@');
        if (parts.length === 2) {
          const user = parts[0];
          const domain = parts[1];
          const visibleUser = user.length > 2 ? `${user.slice(0, 2)}***` : `${user.slice(0, 1)}***`;
          return `${visibleUser}@${domain}`;
        }
        return '***@***.***';
      }
      default:
        return '••••••••';
    }
  };

  const handleToggleReveal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRevealed) {
      setIsRevealed(false);
      return;
    }

      // LGPD Compliance: Audit log event
      const logTitle = `Visualização de Dado Sensível (LGPD)`;
      const logDesc = `O administrador revelou o campo [${type.toUpperCase()}] de [${subjectName}].`;
      const persisted = await addSystemLog({
        category: 'auth',
        status: 'warning',
        title: logTitle,
        description: logDesc,
        user: profile.email || profile.name || 'Administrador autenticado'
      });

      if (!persisted) {
        toast.error('Auditoria indisponível', 'O dado não foi revelado porque o acesso não pôde ser registrado.');
        return;
      }
      setIsRevealed(true);
      toast.info('Dado Sensível Revelado', 'O acesso foi registrado no log de auditoria e segurança (LGPD).');
  };

  const displayedText = isRevealed ? value : maskValue(value, type);

  return (
    <span className={`inline-flex items-center gap-1.5 group/mask ${className}`}>
      <span className={`font-mono transition ${isRevealed ? 'text-amber-300 font-semibold' : 'text-slate-300'}`}>
        {displayedText}
      </span>
      <button
        type="button"
        onClick={handleToggleReveal}
        className="p-1 rounded-md text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition"
        title={isRevealed ? 'Ocultar dado (LGPD)' : 'Revelar dado sensível (Gera log de auditoria)'}
        aria-label={isRevealed ? 'Ocultar dado' : 'Revelar dado'}
      >
        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </span>
  );
};
