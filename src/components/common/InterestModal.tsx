import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, Music, Send, ShieldCheck, AlertCircle } from 'lucide-react';
import { Song } from '../../types';
import { useApp } from '../../context/AppContext';
import { getRequestCode } from '../../lib/identifiers';

interface InterestModalProps {
  song: Song;
  onClose: () => void;
  isOpen?: boolean;
}

const maskCpfCnpj = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

const maskPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
};

export const InterestModal: React.FC<InterestModalProps> = ({ song, onClose, isOpen = true }) => {
  const { addInterestRequest } = useApp();

  if (isOpen === false) return null;

  const [buyerName, setBuyerName] = useState('');
  const [buyerStageName, setBuyerStageName] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerWhatsapp, setBuyerWhatsapp] = useState('');
  const [buyerCityState, setBuyerCityState] = useState('');
  const [purpose, setPurpose] = useState('Gravação de Single / Lançamento Digital');
  const [message, setMessage] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [requestCode, setRequestCode] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);
    if (!acceptedTerms) {
      setFormError("Por favor, confirme a declaração de veracidade antes de enviar a proposta.");
      return;
    }
    if (!buyerName.trim() || !cpfCnpj.trim() || !buyerEmail.trim() || !buyerWhatsapp.trim() || !buyerCityState.trim()) {
      setFormError("Preencha todos os campos obrigatórios da proposta.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(buyerEmail.trim())) {
      setFormError("Informe um endereço de e-mail de contato válido (ex.: seu.nome@email.com).");
      return;
    }
    const documentDigits = cpfCnpj.replace(/\D/g, '');
    if (![11, 14].includes(documentDigits.length)) {
      setFormError("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) com quantidade válida de números.");
      return;
    }
    const phoneDigits = buyerWhatsapp.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 13) {
      setFormError("Informe um WhatsApp válido com DDD (ex: 11 99999-9999).");
      return;
    }
    if (message.trim().length < 20) {
      setFormError("A mensagem para o compositor deve conter pelo menos 20 caracteres descrevendo seu projeto.");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await addInterestRequest({
        songId: song.id,
        songTitle: song.title,
        songCover: song.coverUrl,
        buyerName: buyerName.trim(),
        buyerStageName: (buyerStageName || buyerName).trim(),
        cpfCnpj: cpfCnpj.trim(),
        buyerEmail: buyerEmail.trim().toLowerCase(),
        buyerWhatsapp: buyerWhatsapp.trim(),
        buyerCityState: buyerCityState.trim(),
        purpose,
        message: message.trim()
      });

      if (created) {
        setRequestCode(getRequestCode(created.id));
        setSubmitted(true);
      } else {
        setFormError("Não foi possível enviar sua solicitação. Tente novamente.");
      }
    } catch (err) {
      console.error("Erro ao registrar interesse:", err);
      setFormError("Erro de conexão ao enviar proposta. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-4 sm:p-8 shadow-2xl relative my-4 sm:my-8 text-slate-100 animate-scaleUp max-h-[calc(100dvh-2rem)] overflow-y-auto touch-scroll">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Fechar modal"
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/80 hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {!submitted ? (
          <div className="space-y-6">
            
            {/* Header */}
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold mb-2">
                <Music className="w-3.5 h-3.5" />
                <span>Solicitação de Liberação de Gravação</span>
              </div>
              <h3 className="text-2xl font-bold text-white tracking-tight">
                Tenho interesse em gravar esta obra
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                Preencha o formulário abaixo para entrar em contato direto com o compositor.
              </p>
            </div>

            {formError && (
              <div role="alert" className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Song Card Summary */}
            <div className="flex items-center gap-4 bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
              <img
                src={song.coverUrl}
                alt={song.title}
                className="w-14 h-14 rounded-xl object-cover border border-slate-700 shrink-0"
              />
              <div>
                <span className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold block">
                  {song.genre}
                </span>
                <h4 className="text-base font-bold text-white leading-tight">{song.title}</h4>
                <p className="text-xs text-slate-400 mt-0.5">Composição de: {song.authors}</p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={buyerName}
                    onChange={e => setBuyerName(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nome Artístico / Dupla / Empresa
                  </label>
                  <input
                    type="text"
                    value={buyerStageName}
                    onChange={e => setBuyerStageName(e.target.value)}
                    placeholder="Ex: Dupla João & Maria"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    CPF ou CNPJ *
                  </label>
                  <input
                    type="text"
                    required
                    value={cpfCnpj}
                    onChange={e => setCpfCnpj(maskCpfCnpj(e.target.value))}
                    placeholder="000.000.000-00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Cidade e Estado *
                  </label>
                  <input
                    type="text"
                    required
                    value={buyerCityState}
                    onChange={e => setBuyerCityState(e.target.value)}
                    placeholder="Ex: São Paulo - SP"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    E-mail de Contato *
                  </label>
                  <input
                    type="email"
                    required
                    value={buyerEmail}
                    onChange={e => setBuyerEmail(e.target.value)}
                    placeholder="voce@exemplo.com.br"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    value={buyerWhatsapp}
                    onChange={e => setBuyerWhatsapp(maskPhone(e.target.value))}
                    placeholder="(00) 90000-0000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Finalidade da Gravação *
                </label>
                <select
                  value={purpose}
                  onChange={e => setPurpose(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                >
                  <option value="Gravação de Single / Lançamento Digital">Gravação de Single / Lançamento Digital</option>
                  <option value="Gravação de Álbum / EP Completo">Gravação de Álbum / EP Completo</option>
                  <option value="Gravação de DVD / Projeto Ao Vivo">Gravação de DVD / Projeto Ao Vivo</option>
                  <option value="Uso Comercial / Trilha Sonora / Publicidade">Uso Comercial / Trilha Sonora / Publicidade</option>
                  <option value="Outra finalidade">Outra finalidade</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Mensagem para o Compositor
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Conte um pouco sobre seu projeto musical, prazo desejado e proposta..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition resize-none"
                />
              </div>

              {/* Terms Checkbox */}
              <div className="flex items-start gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="terms"
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  className="mt-1 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="terms" className="text-xs text-slate-400 leading-normal">
                  Declaro que as informações acima são verdadeiras e estou ciente de que o pagamento da autorização será negociado diretamente com o compositor.
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition"
              >
                {isSubmitting ? (
                  <span>Enviando solicitação...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Enviar solicitação</span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Confirmation State required by Section 10 */
          <div className="py-8 text-center space-y-5 animate-fadeIn">
            <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-500/10">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-white">Solicitação Enviada com Sucesso!</h3>
              {requestCode && (
                <div className="mx-auto max-w-xs rounded-2xl border border-slate-700 bg-slate-950 p-3 mt-3">
                  <span className="block text-[10px] uppercase tracking-wider text-slate-500">Código da proposta</span>
                  <strong className="block font-mono text-lg text-amber-400 mt-0.5">{requestCode}</strong>
                </div>
              )}
              <p className="text-amber-200 text-xs max-w-md mx-auto leading-relaxed bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20 mt-3">
                “Seu interesse foi enviado ao compositor. Ele entrará em contato para combinar os detalhes da liberação.”
              </p>
            </div>

            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Você também pode visualizar esta solicitação direto no painel do compositor para dar sequência à simulação.
            </p>

            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition"
            >
              Fechar janela
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
