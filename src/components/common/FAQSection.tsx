import React, { useState } from 'react';
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
import { Link } from 'react-router-dom';

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
    question: 'Como funciona a proteção da minha música contra cópias não autorizadas?',
    answer: 'O Mercado do Compositor foi projetado com foco absoluto na segurança do autor. Na sua página pública, os ouvintes têm acesso apenas a prévias de áudio de no máximo 60 segundos, com trava automática no player. O arquivo de áudio original completo permanece criptografado e restrito ao seu painel administrativo.',
    highlight: true
  },
  {
    id: 'comissao-negociacoes',
    category: 'pagamentos',
    question: 'A plataforma retém alguma porcentagem ou comissão sobre os valores que eu negociar?',
    answer: 'Não! Cobramos zero comissão sobre suas negociações. O Mercado do Compositor opera sob o modelo de assinatura mensal fixa. Isso significa que 100% do valor acordado pela liberação ou gravação da sua música é pago diretamente pelo interessado para a sua conta (via chave PIX ou transferência bancária), sem intermediários.',
    highlight: true
  },
  {
    id: 'ecad-direitos',
    category: 'direitos',
    question: 'Como funcionam os Direitos Autorais e a arrecadação pelo ECAD?',
    answer: 'A liberação emitida pela plataforma concede autorização para fixação e gravação fonográfica da obra. Seus direitos autorais morais e patrimoniais de execução pública continuam 100% resguardados pela Lei Federal nº 9.610/98. Sempre que a música tocar em rádios, shows, televisão ou plataformas digitais, os direitos de execução pública continuam sendo recolhidos pelo ECAD através da sua sociedade autoral (UBC, ABRAMUS, etc.).',
    highlight: true
  },
  {
    id: 'validacao-documento',
    category: 'direitos',
    question: 'Como é gerado e validado o termo de autorização de gravação?',
    answer: 'Quando você aceitar uma proposta, o sistema gera com 1 clique um Termo de Autorização de Gravação em PDF estruturado profissionalmente. O documento inclui os dados do autor, intérprete, obra e um Código Validador Único. Qualquer pessoa pode conferir a autenticidade do documento em nossa página pública de validação oficial.',
  },
  {
    id: 'cnpj-sociedade',
    category: 'plataforma',
    question: 'Preciso ter CNPJ ou ser associado a alguma entidade para usar a plataforma?',
    answer: 'Não é obrigatório. Qualquer compositor brasileiro com CPF pode criar seu catálogo, organizar letras e disponibilizar suas prévias. Se você já for cadastrado em alguma sociedade de gestão coletiva (UBC, ABRAMUS, SOCINPRO, AMAR, etc.), poderá informar sua filiação no seu perfil para transmitir ainda mais credibilidade aos produtores.',
  },
  {
    id: 'divulgacao-whatsapp',
    category: 'plataforma',
    question: 'Como faço para divulgar minhas músicas para artistas e empresários?',
    answer: 'Ao se cadastrar, você ganha um link profissional exclusivo (ex: mercadodocompositor.com.br/compositor/seunome) e links individuais para cada composição cadastrada. Você pode compartilhar esses links diretamente pelo WhatsApp ou Instagram de artistas, empresários e produtores, que poderão ouvir a prévia de 60s em qualquer celular sem precisar instalar nenhum aplicativo.',
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
  const [openId, setOpenId] = useState<string | null>('protecao-audio');
  const [selectedCategory, setSelectedCategory] = useState<'todos' | 'protecao' | 'direitos' | 'pagamentos' | 'plataforma'>('todos');

  const filteredItems = FAQ_ITEMS.filter(item => {
    if (selectedCategory === 'todos') return true;
    return item.category === selectedCategory;
  });

  const toggleItem = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <section id="faq" className="scroll-mt-24 py-20 md:py-28 bg-[#060B18] text-white relative border-t border-amber-500/20 overflow-hidden">
      {/* Glow de ambientação */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 blur-[150px] rounded-full pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-12">
        
        {/* Header da Seção */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span>Tire Todas as Suas Dúvidas</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-serif italic text-white tracking-tight leading-tight">
            Perguntas <span className="text-amber-400 font-serif">Frequentes</span>
          </h2>

          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Entenda como funciona a segurança das suas obras, arrecadação autoral, emissão de termos jurídicos e pagamentos diretos.
          </p>
        </div>

        {/* Filtros rápidos por categoria */}
        <div className="flex items-center justify-center gap-2 overflow-x-auto pb-2 no-scrollbar text-xs">
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
        <div className="space-y-4 max-w-3xl mx-auto">
          {filteredItems.map(item => {
            const isOpen = openId === item.id;
            return (
              <div
                key={item.id}
                className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                  isOpen
                    ? 'bg-slate-900/90 border-amber-500/50 shadow-xl shadow-amber-500/5 ring-1 ring-amber-500/20'
                    : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className="w-full text-left p-5 sm:p-6 flex items-center justify-between gap-4 transition cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <span className="font-serif font-bold text-base sm:text-lg text-white flex items-center gap-3">
                    {item.highlight && (
                      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span>{item.question}</span>
                  </span>

                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 ${
                    isOpen ? 'bg-amber-500 text-slate-950 rotate-180' : 'bg-slate-800 text-slate-400'
                  }`}>
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-6 sm:px-6 sm:pb-6 text-slate-300 text-sm leading-relaxed border-t border-slate-800/60 pt-4 animate-fadeIn">
                    <p>{item.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Box de Contato e Ajuda Adicional */}
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-slate-800 text-center space-y-4 max-w-2xl mx-auto">
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
