import React, { useEffect, useState } from 'react';
import { 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck, 
  Scale, 
  BadgePercent, 
  FileText, 
  MessageCircle, 
  ArrowRight,
  Mail,
  Sparkles
} from 'lucide-react';
import { APP_CONFIG } from '../../config/appConfig';
import { Link, useLocation } from 'react-router-dom';

interface FAQItem {
  id: string;
  category: 'protecao' | 'direitos' | 'pagamentos' | 'plataforma';
  question: string;
  answer: string;
  highlight?: boolean;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'protecao-audio',
    category: 'protecao',
    question: 'Minhas músicas estão protegidas?',
    answer: 'O Mercado do Compositor foi projetado com foco absoluto na segurança do autor. Na sua página pública, os ouvintes têm acesso apenas a prévias de áudio de no máximo 85 segundos, com trava automática no player. O arquivo de áudio original completo permanece criptografado e restrito ao seu painel administrativo.',
    highlight: true
  },
  {
    id: 'comissao-negociacoes',
    category: 'pagamentos',
    question: 'Como funciona a prévia protegida de 85 segundos?',
    answer: 'Não! Cobramos zero comissão sobre suas negociações. O Mercado do Compositor opera sob o modelo de assinatura mensal fixa. Isso significa que 100% do valor acordado pela liberação ou gravação da sua música é pago diretamente pelo interessado para a sua conta (via chave PIX ou transferência bancária), sem intermediários.',
    highlight: true
  },
  {
    id: 'ecad-direitos',
    category: 'direitos',
    question: 'Como ficam meus direitos autorais e os pagamentos do ECAD?',
    answer: 'A liberação emitida pela plataforma concede autorização para fixação e gravação fonográfica da obra. Seus direitos autorais morais e patrimoniais de execução pública continuam 100% resguardados pela Lei Federal nº 9.610/98. Sempre que a música tocar em rádios, shows, televisão ou plataformas digitais, os direitos de execução pública continuam sendo recolhidos pelo ECAD através da sua sociedade autoral (UBC, ABRAMUS, etc.).',
    highlight: true
  },
  {
    id: 'validacao-documento',
    category: 'direitos',
    question: 'Preciso liberar a gravação da minha música?',
    answer: 'Quando você aceitar uma proposta, o sistema gera com 1 clique um Termo de Autorização de Gravação em PDF estruturado profissionalmente. O documento inclui os dados do autor, intérprete, obra e um Código Validador Único. Qualquer pessoa pode conferir a autenticidade do documento em nossa página pública de validação oficial.',
  },
  {
    id: 'cnpj-sociedade',
    category: 'plataforma',
    question: 'Como funciona o cancelamento?',
    answer: 'Não é obrigatório. Qualquer compositor brasileiro com CPF pode criar seu catálogo, organizar letras e disponibilizar suas prévias. Se você já for cadastrado em alguma sociedade de gestão coletiva (UBC, ABRAMUS, SOCINPRO, AMAR, etc.), poderá informar sua filiação no seu perfil para transmitir ainda mais credibilidade aos produtores.',
  },
  {
    id: 'divulgacao-whatsapp',
    category: 'plataforma',
    question: 'Como faço para divulgar minhas músicas para artistas e empresários?',
    answer: 'Ao se cadastrar, você ganha um link profissional exclusivo (ex: mercadodocompositor.com.br/compositor/seunome) e links individuais para cada composição cadastrada. Você pode compartilhar esses links diretamente pelo WhatsApp ou Instagram de artistas, empresários e produtores, que poderão ouvir a prévia de 85s em qualquer celular sem precisar instalar nenhum aplicativo.',
  },
  {
    id: 'cancelamento-planos',
    category: 'pagamentos',
    question: 'Posso alterar de plano ou cancelar minha assinatura quando quiser?',
    answer: 'Sim, você tem total liberdade. Não exigimos tempo mínimo de fidelidade e não há multas de cancelamento. Você pode fazer upgrade de plano para aumentar seu limite de músicas ou cancelar a renovação a qualquer instante diretamente no seu painel de controle.',
  },
  {
    id: 'como-artista-grava',
    category: 'plataforma',
    question: 'Sou artista ou produtor e gostei de uma música. Como faço para gravar?',
    answer: 'Basta acessar o perfil público do compositor, escolher a música e clicar no botão "Tenho Interesse em Gravar". Você preenche seus dados de contato e proposta. O compositor recebe uma notificação instantânea e entra em contato direto com você para acertar os detalhes e gerar a liberação oficial.',
  }
];

export const FAQSection: React.FC = () => {
  const { hash } = useLocation();
  const [openId, setOpenId] = useState<string | null>('protecao-audio');
  const [selectedCategory, setSelectedCategory] = useState<'todos' | 'protecao' | 'direitos' | 'pagamentos' | 'plataforma'>('todos');

  useEffect(() => {
    if (hash === '#ecad-direitos') setOpenId('ecad-direitos');
  }, [hash]);

  const filteredItems = FAQ_ITEMS.filter(item => {
    if (selectedCategory === 'todos') return true;
    return item.category === selectedCategory;
  });

  const toggleItem = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <section id="faq" className="relative scroll-mt-24 overflow-hidden border-t border-amber-500/20 bg-[#061326] py-16 text-white md:py-20">
      <img src="/faq-studio.webp" alt="" aria-hidden="true" className="absolute inset-y-0 left-0 h-full w-full object-cover object-left opacity-90 lg:w-[36%]" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#061326] via-35% to-[#061326]" />
      {/* Glow de ambientação */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 blur-[150px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto grid max-w-[1536px] gap-10 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.25fr] lg:gap-14 lg:pl-[29%] xl:pr-16">
        
        {/* Header da Seção */}
        <div className="max-w-md space-y-5 text-left">
          <h2 className="font-serif text-4xl leading-tight tracking-tight text-white sm:text-5xl">
            Dúvidas frequentes
          </h2>

          <p className="text-lg leading-relaxed text-slate-200">
            Transparência para você compor com ainda mais tranquilidade.
          </p>

          <div className="grid grid-cols-3 gap-4 pt-5">
            <div><ShieldCheck className="mb-3 h-9 w-9 text-amber-400" /><strong className="font-serif text-sm">Seguro</strong><p className="mt-1 text-xs leading-relaxed text-slate-400">Seus direitos sempre respeitados</p></div>
            <div><MessageCircle className="mb-3 h-9 w-9 text-amber-400" /><strong className="font-serif text-sm">Conexões reais</strong><p className="mt-1 text-xs leading-relaxed text-slate-400">Com artistas, produtores e selos</p></div>
            <div><HelpCircle className="mb-3 h-9 w-9 text-amber-400" /><strong className="font-serif text-sm">Do seu lado</strong><p className="mt-1 text-xs leading-relaxed text-slate-400">Em todas as fases da sua jornada</p></div>
          </div>
        </div>

        {/* Filtros rápidos por categoria */}
        <div className="hidden items-center justify-center gap-2 overflow-x-auto pb-2 no-scrollbar text-xs">
          {[
            { id: 'todos', label: 'Todas as Dúvidas' },
            { id: 'protecao', label: 'Proteção & Áudio' },
            { id: 'pagamentos', label: 'Negociações & PIX' },
            { id: 'direitos', label: 'ECAD & Direitos Autorais' },
            { id: 'plataforma', label: 'Uso & Divulgação' }
          ].map(cat => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id as any)}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition cursor-pointer font-medium ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Lista Accordion */}
        <div className="space-y-0 self-start border-y border-slate-600/80">
          {filteredItems.slice(0, 5).map(item => {
            const isOpen = openId === item.id;
            return (
              <div
                key={item.id}
                id={item.id}
                className={`border-b border-slate-600/80 transition-all duration-300 last:border-b-0 ${
                  isOpen
                    ? 'bg-[#0d1b30]/95'
                    : 'bg-transparent hover:bg-white/[0.03]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 p-4 text-left transition sm:px-5"
                  aria-expanded={isOpen}
                >
                  <span className="font-serif font-bold text-base sm:text-lg text-white flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-lg leading-none text-[#071426]">{isOpen ? '−' : '+'}</span>
                    <span>{item.question}</span>
                  </span>

                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="animate-fadeIn px-5 pb-5 pl-14 text-sm leading-relaxed text-slate-300">
                    <p>{item.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Box de Contato e Ajuda Adicional */}
        <div className="hidden p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-slate-800 text-center space-y-4 max-w-2xl mx-auto">
          <h3 className="text-lg font-bold text-white font-serif">Não encontrou a resposta que procurava?</h3>
          <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
            Nossa equipe de suporte está pronta para esclarecer qualquer dúvida sobre seu catálogo, direitos e termos de autorização.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href={`https://wa.me/55${APP_CONFIG.contact.whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Chamar no WhatsApp</span>
            </a>
            <a
              href={`mailto:${APP_CONFIG.contact.email}`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs border border-slate-700 transition"
            >
              <Mail className="w-4 h-4 text-amber-400" />
              <span>Enviar e-mail de suporte</span>
            </a>
          </div>
        </div>

      </div>
    </section>
  );
};
