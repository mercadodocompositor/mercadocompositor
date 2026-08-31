import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { APP_CONFIG } from '../config/appConfig';
import { 
  ShieldCheck, 
  FileText, 
  Lock, 
  ArrowLeft, 
  CheckCircle, 
  HelpCircle, 
  Mail, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  Scale,
  Eye,
  Database,
  Music,
  UserCheck
} from 'lucide-react';

export const LegalPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isPrivacy = location.pathname === '/privacidade';

  const [activeTab, setActiveTab] = useState<'termos' | 'privacidade'>(isPrivacy ? 'privacidade' : 'termos');

  useEffect(() => {
    setActiveTab(isPrivacy ? 'privacidade' : 'termos');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname, isPrivacy]);

  const handleTabChange = (tab: 'termos' | 'privacidade') => {
    setActiveTab(tab);
    navigate(tab === 'privacidade' ? '/privacidade' : '/termos');
  };

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
                ? `Regras, condições e compromissos operacionais para uso do ecossistema ${APP_CONFIG.name}.`
                : `Como coletamos, tratamos, protegemos e garantimos seus direitos sob a Lei Geral de Proteção de Dados (LGPD).`}
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

          {/* Version and Status Badge */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 px-5 py-3 rounded-2xl text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-slate-300">Versão 1.0 (Vigente)</span>
              <span>•</span>
              <span>Última atualização: 31 de agosto de 2026</span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-amber-400 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Conformidade com a Lei 9.610/98 e Lei 13.709/18 (LGPD)</span>
            </div>
          </div>

          {/* Document Content Container */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-10 text-slate-200">
            
            {activeTab === 'termos' ? (
              /* ========================================================= */
              /*                  TERMOS DE USO OFICIAIS                   */
              /* ========================================================= */
              <div className="space-y-8 leading-relaxed text-sm">
                
                {/* 1. Objeto */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">1.</span>
                    <span>Objeto e Natureza da Plataforma</span>
                  </h2>
                  <p>
                    O <strong>{APP_CONFIG.name}</strong> é uma plataforma tecnológica de intermediação, apresentação e gestão de obras musicais. O serviço tem por finalidade conectar autores e compositores a intérpretes, produtores fonográficos, gravadoras e empresários do mercado artístico.
                  </p>
                  <p>
                    A plataforma oferece aos compositores cadastrados um perfil público profissional, catálogo digital com reprodução de prévias seguras de até 60 segundos, canal direto para recebimento de solicitações de interesse artístico e ferramenta de emissão de Termos de Liberação e Autorização Fonográfica com validação eletrônica de autenticidade.
                  </p>
                </section>

                {/* 2. Cadastro e Segurança */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">2.</span>
                    <span>Cadastro, Capacidade Civil e Segurança da Conta</span>
                  </h2>
                  <p>
                    Para usufruir dos recursos da plataforma, o usuário declara ser plenamente capaz civilmente ou estar devidamente assistido/representado por seus responsáveis legais. O usuário compromete-se a fornecer informações verídicas, exatas e atualizadas (incluindo nome civil, CPF, e-mail e dados de contato).
                  </p>
                  <p>
                    O acesso à conta é pessoal e intransferível, sendo o usuário exclusivamente responsável pela guarda, confidencialidade de sua senha e por todas as operações realizadas em seu perfil.
                  </p>
                </section>

                {/* 3. Direitos Autorais e Titularidade */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">3.</span>
                    <span>Direitos Autorais e Titularidade das Obras (Lei nº 9.610/1998)</span>
                  </h2>
                  <p>
                    Ao cadastrar qualquer composição na plataforma, o compositor declara e garante, sob as penas da lei:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                    <li>Ser o legítimo titular e criador originário da letra e melodia, ou deter expressa e formal autorização de todos os eventuais coautores para inserção e comercialização da obra;</li>
                    <li>Que a obra musical não constitui plágio, cópia, contrafação ou violação de direitos autorais de terceiros;</li>
                    <li>Que o {APP_CONFIG.name} atua como facilitador de exibição e conexão, <strong>não transferindo, não alienando e não adquirindo os direitos autorais patrimoniais ou morais</strong> das músicas, os quais permanecem sob a exclusiva titularidade de seus autores.</li>
                  </ul>
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-200 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-amber-300 block mb-1">Aviso sobre Registro de Autoria:</strong>
                      A exibição no catálogo público auxilia na comprovação de anterioridade temporal, mas <em>não substitui o registro formal</em> junto aos órgãos oficiais competentes (como Biblioteca Nacional ou Escola de Música da UFRJ).
                    </div>
                  </div>
                </section>

                {/* 4. Proteção de Áudios */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">4.</span>
                    <span>Proteção Tecnológica do Áudio Original</span>
                  </h2>
                  <p>
                    O {APP_CONFIG.name} adota medidas rigorosas de proteção patrimonial das obras:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                    <li><strong>Áudio Original Completo:</strong> Fica armazenado em repositório criptografado estritamente privado, inacessível a visitantes anônimos e sem link público permanente.</li>
                    <li><strong>Áudio de Prévia:</strong> O catálogo público disponibiliza exclusivamente amostras de até 60 segundos para apreciação artística por intérpretes.</li>
                  </ul>
                </section>

                {/* 5. Solicitações e Liberações Fonográficas */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">5.</span>
                    <span>Negociações, Propostas e Liberações Fonográficas</span>
                  </h2>
                  <p>
                    Interessados podem registrar propostas formais de gravação. O compositor possui total autonomia para aceitar, recusar, negociar valores e estabelecer se a liberação será <em>Exclusiva</em> ou <em>Não-Exclusiva</em>.
                  </p>
                  <p>
                    Após a confirmação da negociação, a plataforma emite o <strong>Termo Oficial de Liberação Fonográfica</strong> em formato digital e PDF, com identificador único (ex: <code>LIB-2026-XXXXX</code>) e assinatura digital eletrônica (conforme o art. 10, § 2º da Medida Provisória nº 2.200-2/2001).
                  </p>
                </section>

                {/* 6. Planos, Assinaturas e Cancelamento */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">6.</span>
                    <span>Planos de Assinatura, Cobrança e Cancelamento</span>
                  </h2>
                  <p>
                    A manutenção do catálogo profissional e recursos avançados é viabilizada por meio dos planos de assinatura (Bronze, Prata e Ouro).
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                    <li>Os valores mensais são pré-fixados e informados com clareza no ato da adesão;</li>
                    <li>O usuário pode cancelar sua assinatura a qualquer momento através do painel de configurações, sem cláusula de fidelidade, sem cobrança de multas ou penalidades;</li>
                    <li>A plataforma não cobra percentual ou comissão oculta sobre os valores acordados diretamente entre o compositor e o intérprete na cessão das obras.</li>
                  </ul>
                </section>

                {/* 7. Condutas Vedadas */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">7.</span>
                    <span>Condutas Vedadas e Moderação</span>
                  </h2>
                  <p>
                    É estritamente proibido no {APP_CONFIG.name}:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                    <li>Fazer upload de fonogramas, áudios ou letras protegidas de terceiros sem a respectiva autorização legal;</li>
                    <li>Inserir conteúdo de ódio, ofensivo, discriminatório ou ilícito;</li>
                    <li>Tentar violar as camadas de segurança, autenticação ou realizar raspagem automatizada (scraping) do acervo.</li>
                  </ul>
                  <p className="text-xs text-slate-400">
                    A administração da plataforma reserva-se o direito de suspender cautelarmente obras sob disputa judicial ou contas com comprovada violação destes termos.
                  </p>
                </section>

                {/* 8. Foro e Contato */}
                <section className="space-y-3 border-t border-slate-800 pt-6">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="text-amber-400 font-mono">8.</span>
                    <span>Legislação Aplicável e Foro</span>
                  </h2>
                  <p>
                    Estes Termos são regidos pelas leis da República Federativa do Brasil. Para dirimir quaisquer controvérsias oriundas do presente instrumento, fica eleito o Foro da Comarca de Goiânia — Estado de Goiás, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
                  </p>
                </section>

              </div>
            ) : (
              /* ========================================================= */
              /*             POLÍTICA DE PRIVACIDADE OFICIAL (LGPD)        */
              /* ========================================================= */
              <div className="space-y-8 leading-relaxed text-sm">
                
                {/* 1. Introdução LGPD */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">1.</span>
                    <span>Compromisso com a Privacidade e a LGPD</span>
                  </h2>
                  <p>
                    Esta Política de Privacidade descreve de forma clara como o <strong>{APP_CONFIG.name}</strong> coleta, utiliza, armazena, compartilha e protege os dados pessoais de seus usuários e visitantes, em rigorosa conformidade com a <strong>Lei Geral de Proteção de Dados Pessoais (Lei Federal nº 13.709/2018 — LGPD)</strong> e o Marco Civil da Internet (Lei nº 12.965/2014).
                  </p>
                </section>

                {/* 2. Dados Coletados */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">2.</span>
                    <span>Dados Pessoais que Coletamos</span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase">
                        <UserCheck className="w-4 h-4" />
                        <span>Dados de Cadastro do Compositor</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        Nome civil, nome artístico, endereço de e-mail, telefone/WhatsApp, CPF, cidade, estado, biografia, fotografia de perfil e links de redes sociais.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase">
                        <Music className="w-4 h-4" />
                        <span>Dados de Obras Musicais</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        Título da canção, gênero musical, coautores participantes, letras, áudio guia/original, áudio de prévia, arte de capa e código de registro de autoria.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase">
                        <FileText className="w-4 h-4" />
                        <span>Dados de Propostas e Liberações</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        Nome do interessado/intérprete, documento (CPF/CNPJ), contato, cidade, finalidade da gravação declarada, valores acordados e código de autenticidade do termo.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase">
                        <Database className="w-4 h-4" />
                        <span>Dados Técnicos de Navegação</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        Endereço IP, data/hora de acesso, identificador anônimo de visitante para contagem deduplicada de reproduções e métricas de desempenho.
                      </p>
                    </div>

                  </div>
                </section>

                {/* 3. Finalidades e Bases Legais */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">3.</span>
                    <span>Finalidade e Bases Legais do Tratamento</span>
                  </h2>
                  <p>
                    O tratamento de seus dados apoia-se estritamente nas seguintes bases legais do art. 7º da LGPD:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-slate-300">
                    <li><strong>Execução de Contrato (Art. 7º, V):</strong> Criação de conta, manutenção do perfil público, reprodução controlada de prévias, intermediação de propostas e emissão de autorizações;</li>
                    <li><strong>Cumprimento de Obrigação Legal (Art. 7º, II):</strong> Guarda de registros de acesso conforme o art. 15 do Marco Civil da Internet e emissão de documentos fiscais/jurídicos;</li>
                    <li><strong>Legítimo Interesse e Segurança (Art. 7º, IX):</strong> Prevenção a fraudes, proteção contra downloads não autorizados de áudios originais e métricas antifraude de plays.</li>
                  </ul>
                </section>

                {/* 4. Divisão entre Dados Públicos e Privados */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">4.</span>
                    <span>Segregação entre Dados Públicos e Protegidos</span>
                  </h2>
                  <p>
                    O {APP_CONFIG.name} aplica o princípio do <em>Privacy by Design</em> e da minimização de dados:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-1.5">
                      <span className="font-bold text-emerald-400 uppercase block">O que é visível publicamente:</span>
                      <p className="text-slate-300">
                        Nome artístico, foto de perfil, cidade/UF, biografia, redes sociais e músicas autorizadas para exibição pública (áudio de prévia de até 60s).
                      </p>
                    </div>

                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-1.5">
                      <span className="font-bold text-amber-400 uppercase block">O que NUNCA é exposto publicamente:</span>
                      <p className="text-slate-300">
                        CPF completo, e-mail de login, WhatsApp pessoal (a menos que compartilhado voluntariamente na negociação), áudios originais e senhas criptografadas.
                      </p>
                    </div>
                  </div>
                </section>

                {/* 5. Segurança do Armazenamento */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">5.</span>
                    <span>Armazenamento Seguro e Criptografia</span>
                  </h2>
                  <p>
                    Os dados são processados em servidores de nuvem de alta segurança (Supabase Cloud / AWS), com criptografia em trânsito (HTTPS / TLS 1.3), criptografia de repouso (AES-256) e políticas estritas de segurança em nível de linha (<em>Row Level Security — RLS</em>) no banco de dados.
                  </p>
                </section>

                {/* 6. Direitos do Titular de Dados */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span className="text-amber-400 font-mono">6.</span>
                    <span>Seus Direitos como Titular (Art. 18 da LGPD)</span>
                  </h2>
                  <p>Você pode, a qualquer momento e mediante solicitação simples:</p>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                    <li>Confirmar a existência de tratamento e acessar seus dados cadastrais;</li>
                    <li>Solicitar a correção de dados incompletos, inexatos ou desatualizados diretamente no painel;</li>
                    <li>Solicitar a exclusão ou anonimização de sua conta e composições armazenadas;</li>
                    <li>Revogar consentimentos concedidos anteriormente.</li>
                  </ul>
                </section>

                {/* 7. Canal do Encarregado (DPO) */}
                <section className="space-y-3 border-t border-slate-800 pt-6">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="text-amber-400 font-mono">7.</span>
                    <span>Contato com o Encarregado de Dados (DPO)</span>
                  </h2>
                  <p>
                    Para exercer seus direitos de titular ou tirar dúvidas sobre o tratamento de seus dados pessoais, entre em contato com nossa equipe de privacidade através do e-mail oficial:
                  </p>
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex items-center gap-3">
                    <Mail className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <strong className="text-white text-xs block">Canal Oficial de Privacidade & DPO:</strong>
                      <a href={`mailto:${APP_CONFIG.contact.email}`} className="text-amber-400 hover:underline text-xs font-mono">
                        {APP_CONFIG.contact.email}
                      </a>
                    </div>
                  </div>
                </section>

              </div>
            )}

            {/* Quick Actions Footer */}
            <div className="pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <Link 
                to="/autenticacao?modo=register" 
                className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 font-bold transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar para o Cadastro de Compositor</span>
              </Link>

              <Link 
                to="/" 
                className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition"
              >
                <span>Ir para a Página Inicial</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>

          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
};
