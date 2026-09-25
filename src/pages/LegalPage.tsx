import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { APP_CONFIG } from '../config/appConfig';
import { useApp } from '../context/AppContext';
import { formatMoneyBR, listOfferedPlans } from '../lib/plans';
import { 
  ShieldCheck, 
  FileText, 
  Lock, 
  ArrowLeft, 
  Mail, 
  ExternalLink,
  Scale,
  Database,
  Music,
  UserCheck,
  Building2,
  Phone,
  Search,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export const LegalPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isPrivacy = location.pathname === '/privacidade';

  const [activeTab, setActiveTab] = useState<'termos' | 'privacidade'>(isPrivacy ? 'privacidade' : 'termos');
  const [searchQuery, setSearchQuery] = useState('');
  const { subscriptionPlans } = useApp();
  // Mesmo catálogo que o checkout cobra: o termo não pode anunciar outro preço.
  const offeredPlans = useMemo(() => listOfferedPlans(subscriptionPlans), [subscriptionPlans]);

  useEffect(() => {
    setActiveTab(isPrivacy ? 'privacidade' : 'termos');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname, isPrivacy]);

  const handleTabChange = (tab: 'termos' | 'privacidade') => {
    setActiveTab(tab);
    navigate(tab === 'privacidade' ? '/privacidade' : '/termos');
  };

  const termsSections = useMemo(() => [
    {
      id: 'objeto',
      number: '1',
      title: 'Objeto, Natureza da Plataforma e Qualificação Jurídica',
      keywords: 'objeto natureza empresa cnpj razao social intermediacao cadastro',
      content: (
        <div className="space-y-3">
          <p>
            O <strong>{APP_CONFIG.name}</strong>, operado sob a razão social <strong>{APP_CONFIG.company.legalName}</strong>, pessoa jurídica de direito privado inscrita no CNPJ/MF sob o nº <strong>{APP_CONFIG.company.cnpj}</strong>, doravante denominada simplesmente <strong>"Plataforma"</strong> ou <strong>"Mercado do Compositor"</strong>, é uma plataforma SaaS (Software as a Service) de vitrine digital, gestão e intermediação de obras musicais autorais.
          </p>
          <p>
            O serviço tem por objetivo exclusivo conectar autores e compositores legítimos a intérpretes, bandas, gravadoras, produtoras fonográficas e empresários artísticos, disponibilizando catálogo profissional protegido, gestão de propostas fonográficas e ferramentas eletrônicas de emissão e verificação de Termos de Liberação de Gravação.
          </p>
        </div>
      )
    },
    {
      id: 'cadastro',
      number: '2',
      title: 'Cadastro, Capacidade Civil e Segurança da Conta',
      keywords: 'cadastro conta login senha requisitos idade maioridade responsabilidade',
      content: (
        <div className="space-y-3">
          <p>
            Para criar uma conta e utilizar as funcionalidades da plataforma, o usuário declara ter plena capacidade civil nos termos do Código Civil Brasileiro (maior de 18 anos ou emancipado) ou estar devidamente assistido por seus responsáveis legais.
          </p>
          <p>
            O usuário se compromete a fornecer informações cadastrais rigorosamente verdadeiras, completas e atualizadas (incluindo nome civil, nome artístico, CPF/CNPJ, e-mail e dados de contato). O acesso à conta é individual, intransferível e protegido por credenciais criptografadas, sendo o titular exclusivamente responsável pela confidencialidade de sua senha e pelas atividades realizadas em sua conta.
          </p>
        </div>
      )
    },
    {
      id: 'direitos-autorais',
      number: '3',
      title: 'Direitos Autorais, Titularidade e Relação com o ECAD (Lei nº 9.610/1998)',
      keywords: 'direitos autorais autoria titularidade lei 9610 ubc ecad abramus royalties propriedade intelectual',
      content: (
        <div className="space-y-3">
          <p>
            Ao cadastrar qualquer composição na plataforma, o compositor declara e garante formalmente, sob as penas civis e criminais da legislação brasileira:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-300">
            <li>
              <strong>Titularidade Integral e Exclusiva:</strong> Ser o legítimo autor e criador originário da letra, melodia e arranjo da composição, ou possuir poderes expressos e autorizações escritas de todos os coautores participantes para sua divulgação e negociação;
            </li>
            <li>
              <strong>Originalidade e Ausência de Plágio:</strong> Que a composição é inédita e original, não violando direitos de terceiros, marcas, patentes ou direitos autorais protegidos pela Lei Federal nº 9.610/1998;
            </li>
            <li>
              <strong>Preservação dos Direitos Patrimoniais e Morais:</strong> O {APP_CONFIG.name} <strong>NÃO adquire, não aliena, não transfere e não reivindica direitos patrimoniais ou morais</strong> sobre as obras cadastradas. A titularidade permanece 100% sob controle dos autores;
            </li>
            <li>
              <strong>Isenção de Comissão sobre Cessões:</strong> O {APP_CONFIG.name} não cobra percentuais ou comissões sobre os valores acordados entre o compositor e o intérprete pela liberação da obra musical;
            </li>
            <li>
              <strong>Gestão Coletiva e Arrecadação (ECAD):</strong> A disponibilização de obras na plataforma não substitui e não interfere na arrecadação de execução pública musical gerida pelo <strong>ECAD</strong> e pelas associações de gestão coletiva (UBC, Abramus, Socinpro, etc.) às quais o autor seja filiado.
            </li>
          </ul>
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-200 flex items-start gap-3 mt-3">
            <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300 block mb-1">Evidência Temporal de Anterioridade:</strong>
              O cadastro com carimbo de data/hora (timestamping) e registro criptográfico na plataforma auxilia na comprovação de anterioridade temporal da criação, sendo recomendada adicionalmente a formalização do registro autoral perante o ECAD e ou sua Editora.
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'protecao-audio',
      number: '4',
      title: 'Proteção Tecnológica do Áudio e Limitação de Prévia',
      keywords: 'audio previa 60 segundos protecao cofre download pirataria seguranca',
      content: (
        <div className="space-y-3">
          <p>
            O {APP_CONFIG.name} implementa arquitetura de segurança em camadas para resguardar o patrimônio dos autores:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <span className="font-bold text-amber-400 text-xs uppercase flex items-center gap-1.5">
                <Lock className="w-4 h-4" /> Áudio Original Completo (Privado)
              </span>
              <p className="text-xs text-slate-300">
                Armazenado em storage criptografado e estritamente privado (Supabase Storage / AWS S3 com políticas RLS). Não possui link público permanente e não pode ser baixado por visitantes anônimos.
              </p>
            </div>
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <span className="font-bold text-emerald-400 text-xs uppercase flex items-center gap-1.5">
                <Music className="w-4 h-4" /> Prévia Pública de até 60 Segundos
              </span>
              <p className="text-xs text-slate-300">
                O player público reproduz exclusivamente trechos de prévia de até 60 segundos com marcação de amostragem, permitindo a apreciação artística sem viabilizar apropriação indevida do fonograma completo.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'liberacoes',
      number: '5',
      title: 'Negociações, Propostas e Validação Oficial de Liberações',
      keywords: 'liberacao termo pdf autorizacao gravacao exclusividade validar documento qr code',
      content: (
        <div className="space-y-3">
          <p>
            Interessados podem registrar propostas de gravação informando nome artístico, CPF/CNPJ, finalidade do projeto e canais de contato. O compositor detém plena autonomia negocial para aceitar, recusar, contrapropor valores e definir o regime de cessão:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
            <li><strong>Liberação Exclusiva:</strong> Confere ao intérprete exclusividade para registro fonográfico da obra pelo período acordado, bloqueando novas autorizações concomitantes no catálogo;</li>
            <li><strong>Liberação Não-Exclusiva:</strong> Permite a gravação e comercialização da obra fonográfica sem exclusividade de mercado.</li>
          </ul>
          <p>
            Após o acordo das partes, o compositor pode emitir o <strong>Termo Oficial de Liberação Fonográfica</strong> em formato PDF, com código identificador único (ex.: <code>LIB-2026-XXXXX</code>) e assinatura digital eletrônica nos termos do art. 10, § 2º da Medida Provisória nº 2.200-2/2001. A autenticidade do documento pode ser consultada publicamente a qualquer momento por gravadoras, plataformas de streaming e produtores na página oficial <Link to="/validar-documento" className="text-amber-400 font-semibold hover:underline">/validar-documento</Link> ou via leitura de QR Code.
          </p>
        </div>
      )
    },
    {
      id: 'planos-pagamentos',
      number: '6',
      title: 'Planos de Assinatura e Direito de Arrependimento (CDC)',
      keywords: 'planos assinatura precos cancelamento reembolso estorno arrependimento cdc',
      content: (
        <div className="space-y-3">
          <p>
            O acesso às ferramentas profissionais da plataforma é estruturado mediante planos de assinatura mensal, contratados por meio do checkout seguro do Stripe:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {offeredPlans.map(p => (
              <div key={p.name} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs space-y-1">
                <strong className="text-amber-400 block text-sm">{p.name}</strong>
                <span className="text-lg font-black text-white block">R$ {formatMoneyBR(p.monthlyPrice)}<span className="text-slate-500 text-xs font-normal">/mês</span></span>
                <span className="text-slate-400 block">{p.maxSongs ? `Até ${p.maxSongs} músicas` : 'Músicas ilimitadas'}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-2 text-slate-300">
            <p>
              <strong>Contratação:</strong> Valores e período de vigência são apresentados antes do redirecionamento ao Stripe. A plataforma não recebe nem armazena números de cartão.
            </p>
            <p>
              <strong>Vigência e renovação:</strong> Cada pagamento confirmado pelo Stripe libera os recursos do plano por um mês. A assinatura é renovada mensalmente até o cancelamento no Portal do Cliente.
            </p>
            <p>
              <strong>Vencimento:</strong> Sem renovação confirmada, o perfil público e as obras do usuário podem deixar de ser exibidos no catálogo após o fim da vigência, sem perda dos dados cadastrados no painel.
            </p>
            <p>
              <strong>Cancelamento Sem Multas:</strong> O usuário pode cancelar a renovação a qualquer momento pelo Portal do Cliente Stripe. O acesso é mantido até o final do período pago, sem multas ou taxas rescisórias. Não há reembolso proporcional do período em curso, ressalvado o Direito de Arrependimento abaixo.
            </p>
            <p>
              <strong>Direito de Arrependimento (Art. 49 do CDC):</strong> Nos termos do art. 49 da Lei Federal nº 8.078/1990 (Código de Defesa do Consumidor), o usuário pode desistir da contratação no prazo de até <strong>7 (sete) dias corridos</strong> a contar da assinatura inicial, mediante solicitação ao suporte, com restituição dos valores pagos.
            </p>
            <p>
              <strong>Estornos e Contestações:</strong> O estorno de uma cobrança ou sua contestação junto à operadora do cartão (chargeback) suspende a exibição pública do perfil e das obras até a regularização da assinatura.
            </p>
            <p>
              <strong>Alteração de Valores:</strong> Eventual reajuste no valor dos planos será comunicado previamente aos assinantes pelo painel e pelo e-mail cadastrado, antes de ser aplicado às cobranças seguintes.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'condutas',
      number: '7',
      title: 'Condutas Vedadas e Políticas de Moderação',
      keywords: 'condutas proibicoes moderacao suspensao exclusao pirataria fake',
      content: (
        <div className="space-y-3">
          <p>É estritamente vedado ao usuário da plataforma:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
            <li>Inserir fonogramas, letras ou áudios pertencentes a terceiros sem a devida cessão ou procuração autoral;</li>
            <li>Fornecer dados cadastrais falsificados ou utilizar CPFs/CNPJs de terceiros;</li>
            <li>Divulgar conteúdos de ódio, ofensivos, racistas, homofóbicos, discriminatórios ou pornográficos;</li>
            <li>Empregar mecanismos automatizados (bots, crawlers, scraping) para download não autorizado do acervo;</li>
            <li>Tentar burlar sistemas de autenticação, permissões de banco de dados ou medidas de proteção tecnológica.</li>
          </ul>
          <p className="text-xs text-slate-400">
            A infração a qualquer destas regras sujeitará o infrator à suspensão preventiva ou exclusão definitiva da conta, sem prejuízo da responsabilização civil e criminal cabível.
          </p>
        </div>
      )
    },
    {
      id: 'foro',
      number: '8',
      title: 'Legislação Aplicável, Foro de Eleição e Identificação',
      keywords: 'legislacao foro goiania goias marco civil contato suporte empresa',
      content: (
        <div className="space-y-3">
          <p>
            O presente instrumento é regido integralmente pelas leis da República Federativa do Brasil, em especial o Marco Civil da Internet (Lei nº 12.965/2014), a Lei de Direitos Autorais (Lei nº 9.610/1998) e o Código de Defesa do Consumidor (Lei nº 8.078/1990).
          </p>
          <p>
            Para dirimir quaisquer controvérsias decorrentes destes Termos, as partes elegem o <strong>Foro da Comarca de Goiânia — Estado de Goiás</strong>, com expressa renúncia a qualquer outro, por mais privilegiado que seja, ressalvada a competência do foro de domicílio do consumidor conforme legislação imperativa.
          </p>
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs space-y-1">
            <strong className="text-white block font-bold">Identificação Oficial do Provedor:</strong>
            <span className="text-slate-300 block">{APP_CONFIG.company.legalName} • CNPJ {APP_CONFIG.company.cnpj}</span>
            <span className="text-slate-400 block">Atendimento: {APP_CONFIG.contact.email} • {APP_CONFIG.company.serviceHours}</span>
          </div>
        </div>
      )
    }
  ], [offeredPlans]);

  const privacySections = useMemo(() => [
    {
      id: 'compromisso-lgpd',
      number: '1',
      title: 'Compromisso com a Privacidade e Marco Legal (LGPD)',
      keywords: 'lgpd privacidade dados pessoais lei 13709 marco civil internet anpd',
      content: (
        <div className="space-y-3">
          <p>
            Esta Política de Privacidade reflete o compromisso intransigente do <strong>{APP_CONFIG.company.legalName}</strong> (CNPJ {APP_CONFIG.company.cnpj}) com a segurança, transparência e proteção dos dados pessoais de seus clientes, compositores, intérpretes e visitantes, em conformidade com a <strong>Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD)</strong>, com o Marco Civil da Internet (Lei nº 12.965/2014) e com as diretrizes da <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong>.
          </p>
        </div>
      )
    },
    {
      id: 'agentes-tratamento',
      number: '2',
      title: 'Controlador e Operadores de Dados Qualificados',
      keywords: 'controlador operador supabase aws encarregado dpo',
      content: (
        <div className="space-y-3">
          <p>
            Na qualidade de <strong>Controlador de Dados</strong>, o Mercado do Compositor toma as decisões sobre o tratamento de dados pessoais. Para operacionalizar a plataforma com nível corporativo de confiabilidade, atuam como <strong>Operadores de Dados</strong> os seguintes parceiros certificados:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-300 text-xs">
            <li><strong>Supabase Inc. / Amazon Web Services (AWS):</strong> Hospedagem em nuvem de alto desempenho, banco de dados PostgreSQL relacional seguro, autenticação multifator e armazenamento criptografado de áudios com certificações ISO 27001 e SOC 2 Type II.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'dados-coletados',
      number: '3',
      title: 'Dados Pessoais Coletados e Finalidades do Tratamento',
      keywords: 'dados coletados cpf email whatsapp telefone cidade estado obras fotos cookies',
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <span className="font-bold text-amber-400 text-xs uppercase flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" /> Dados Cadastrais do Compositor
              </span>
              <p className="text-xs text-slate-300">
                Nome civil completo, nome artístico, CPF, endereço eletrônico (e-mail), telefone/WhatsApp, cidade, estado, biografia profissional, foto de perfil e links de redes sociais.
              </p>
            </div>
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <span className="font-bold text-emerald-400 text-xs uppercase flex items-center gap-1.5">
                <Music className="w-4 h-4" /> Dados de Obras e Catálogo
              </span>
              <p className="text-xs text-slate-300">
                Título da canção, ritmo/gênero, nomes de coautores, letras das músicas, registros de autoria, artes de capa e amostras de áudio para geração de prévias públicas de 60 segundos.
              </p>
            </div>
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <span className="font-bold text-blue-400 text-xs uppercase flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> Dados de Intérpretes e Propostas
              </span>
              <p className="text-xs text-slate-300">
                Nome do proponente, nome artístico/banda, CPF ou CNPJ, e-mail de contato, WhatsApp, cidade/UF, finalidade artística declarada, valores acordados e dados do Termo de Liberação.
              </p>
            </div>
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <span className="font-bold text-purple-400 text-xs uppercase flex items-center gap-1.5">
                <Database className="w-4 h-4" /> Dados Técnicos e Registros de Conexão
              </span>
              <p className="text-xs text-slate-300">
                Endereço IP de origem, porta lógica, registros de data/hora de login, identificadores anônimos de sessão (para contagem anti-fraude de reproduções) e logs de integridade.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'bases-legais',
      number: '4',
      title: 'Bases Legais do Tratamento (Art. 7º da LGPD)',
      keywords: 'bases legais art 7 execucao contrato obrigacao legal legitimo interesse',
      content: (
        <div className="space-y-3">
          <p>O tratamento de dados na plataforma apoia-se estritamente nas seguintes hipóteses legais:</p>
          <ul className="list-disc pl-5 space-y-2 text-slate-300">
            <li><strong>Execução de Contrato (Art. 7º, V):</strong> Necessário para operacionalizar o catálogo, exibir o perfil público, intermediar negociações, gerar o termo de liberação e prestar suporte técnico;</li>
            <li><strong>Cumprimento de Obrigação Legal (Art. 7º, II):</strong> Guarda de registros de acesso a aplicações de internet por 6 (seis) meses (art. 15 do Marco Civil da Internet) e emissão de notas fiscais/documentos fiscais;</li>
            <li><strong>Legítimo Interesse (Art. 7º, IX):</strong> Segurança cibernética da plataforma, prevenção de fraudes em pagamentos, mitigação de scraping e garantia de inviolabilidade dos áudios originais.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'segregacao',
      number: '5',
      title: 'Segregação de Dados Públicos vs. Dados Protegidos (Privacy by Design)',
      keywords: 'segregacao privacidade publico privado sigilo cpf whatsapp seguranca',
      content: (
        <div className="space-y-3">
          <p>
            A plataforma adota o princípio de <em>Privacidade por Padrão (Privacy by Default)</em>:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-1.5">
              <span className="font-bold text-emerald-400 uppercase block">Dados Visíveis Publicamente:</span>
              <p className="text-slate-300">
                Nome artístico do compositor, foto pública de vitrine, cidade/estado, biografia artística, links de redes sociais e faixas do catálogo autorizadas com prévias de até 60 segundos.
              </p>
            </div>
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-1.5">
              <span className="font-bold text-amber-400 uppercase block">Dados Estritamente Confidenciais:</span>
              <p className="text-slate-300">
                CPF completo do autor, e-mail de acesso, senhas criptografadas por hashing (Argon2/bcrypt), arquivos de áudio originais integrais e histórico financeiro de faturamento.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'direitos-titular',
      number: '6',
      title: 'Seus Direitos como Titular de Dados e Prazos (Art. 18 da LGPD)',
      keywords: 'direitos titular art 18 acesso correcao exclusao revogacao portabilidade prazo 15 dias',
      content: (
        <div className="space-y-3">
          <p>Você pode, a qualquer tempo e de forma facilitada e gratuita:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
            <li>Confirmar a existência de tratamento e acessar seus dados cadastrais;</li>
            <li>Corrigir dados incompletos, inexatos ou desatualizados diretamente na aba "Meu Perfil";</li>
            <li>Solicitar a eliminação dos dados pessoais tratados com base em consentimento;</li>
            <li>Solicitar informações sobre o compartilhamento de seus dados com terceiros;</li>
            <li>Revogar o consentimento a qualquer momento.</li>
          </ul>
          <p className="text-xs text-slate-400">
            As solicitações enviadas ao canal do DPO serão respondidas no prazo legal de até <strong>15 (quinze) dias</strong> a contar do recebimento do requerimento, resguardada a retenção de dados obrigatória para cumprimento de obrigação legal ou defesa judicial de direitos.
          </p>
        </div>
      )
    },
    {
      id: 'dpo-contato',
      number: '7',
      title: 'Canal Oficial do Encarregado pelo Tratamento de Dados (DPO)',
      keywords: 'dpo encarregado privacidade email contato canal suporte',
      content: (
        <div className="space-y-3">
          <p>
            Para exercer quaisquer dos seus direitos de titular ou esclarecer dúvidas sobre esta Política de Privacidade, entre em contato diretamente com o nosso Encarregado de Proteção de Dados (DPO):
          </p>
          <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <strong className="text-white text-sm block">Encarregado pelo Tratamento de Dados (DPO)</strong>
                <a href={`mailto:${APP_CONFIG.company.dpoEmail}`} className="text-amber-400 hover:underline text-xs font-mono">
                  {APP_CONFIG.company.dpoEmail}
                </a>
              </div>
            </div>
            <div className="text-right text-xs text-slate-400">
              <span>Atendimento formal de segunda a sexta-feira</span>
            </div>
          </div>
        </div>
      )
    }
  ], []);

  const currentSections = activeTab === 'termos' ? termsSections : privacySections;
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return currentSections;
    const q = searchQuery.toLowerCase();
    return currentSections.filter(s => 
      s.title.toLowerCase().includes(q) || 
      s.keywords.toLowerCase().includes(q)
    );
  }, [currentSections, searchQuery]);

  return (
    <div className="min-h-screen bg-[#060B18] text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <Navbar />

      <main className="flex-grow py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Header Banner */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <Scale className="w-4 h-4" />
              <span>Transparência e Governança Jurídica</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {activeTab === 'termos' ? 'Termos de Uso da Plataforma' : 'Política de Privacidade e Proteção de Dados'}
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
              {activeTab === 'termos'
                ? `Regras, condições contratuais e direitos operacionais do ecossistema ${APP_CONFIG.company.tradeName}.`
                : `Diretrizes de tratamento, salvaguarda de áudios e cumprimento integral da Lei Geral de Proteção de Dados (LGPD).`}
            </p>
          </div>

          {/* Navigation Switcher Tabs */}
          <div className="flex items-center justify-center">
            <div className="bg-slate-900 border border-slate-800 p-1.5 rounded-2xl flex items-center gap-2 max-w-md w-full shadow-lg">
              <button
                type="button"
                onClick={() => handleTabChange('termos')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                  activeTab === 'termos'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Termos de Uso</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange('privacidade')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                  activeTab === 'privacidade'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Lock className="w-4 h-4" />
                <span>Política de Privacidade</span>
              </button>
            </div>
          </div>

          {/* Corporate Identification & Status Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-white">Documento Oficial Vigente (Versão 1.2)</span>
                <span>•</span>
                <span className="text-slate-400">Atualizado em 21 de setembro de 2026</span>
              </div>
              <div className="flex items-center gap-2 text-amber-400 font-medium text-[11px]">
                <ShieldCheck className="w-4 h-4" />
                <span>Conformidade com Lei 9.610/98 (Autoral) e Lei 13.709/18 (LGPD)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-slate-400 text-[11px]">
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block font-semibold">{APP_CONFIG.company.legalName}</strong>
                  <span>CNPJ: {APP_CONFIG.company.cnpj}</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Mail className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block font-semibold">Canais Oficiais de Contato</strong>
                  <span>Suporte: {APP_CONFIG.contact.email}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Search inside document */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`Filtrar cláusula ou palavra-chave em ${activeTab === 'termos' ? 'Termos de Uso' : 'Privacidade'} (ex: direitos autorais, cancelamento, lgpd)...`}
              className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
            {searchQuery && (
              <button 
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white px-2 py-1"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Document Content Container */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-10 text-slate-200">
            
            {filteredSections.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-sm font-semibold text-white">Nenhuma cláusula encontrada para "{searchQuery}"</p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-amber-400 hover:underline font-bold"
                >
                  Exibir todas as cláusulas
                </button>
              </div>
            ) : (
              <div className="space-y-10 leading-relaxed text-sm">
                {filteredSections.map(sec => (
                  <section key={sec.id} id={sec.id} className="space-y-3 scroll-mt-24">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                      <span className="text-amber-400 font-mono">{sec.number}.</span>
                      <span>{sec.title}</span>
                    </h2>
                    {sec.content}
                  </section>
                ))}
              </div>
            )}

            {/* Quick Actions Footer */}
            <div className="pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <Link 
                to="/cadastro" 
                className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 font-bold transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Ir para o Cadastro de Compositor</span>
              </Link>

              <div className="flex items-center gap-4">
                <Link 
                  to="/validar-documento" 
                  className="inline-flex items-center gap-1.5 text-slate-400 hover:text-amber-400 transition"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Validar Termo Emitido</span>
                </Link>

                <Link 
                  to="/" 
                  className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition"
                >
                  <span>Página Inicial</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
};
