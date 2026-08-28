import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { APP_CONFIG } from '../config/appConfig';
import { getFeaturedComposers } from '../lib/database';
import type { FeaturedComposer } from '../types';
import { 
  Music, 
  Play, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight, 
  UserPlus, 
  Upload, 
  Share2, 
  FileCheck,
  Disc,
  Headphones,
  Lock,
  MessageSquare,
  BadgeCheck,
  Zap
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [featuredComposers,setFeaturedComposers]=useState<FeaturedComposer[]>([]);
  useEffect(()=>{getFeaturedComposers().then(setFeaturedComposers).catch(()=>setFeaturedComposers([]));},[]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      
      <Navbar />

      <main className="flex-grow">
        
        {/* HERO SECTION */}
        <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden bg-[#0A1128] border-b border-amber-500/20 text-white">
          
          {/* Ambient Background Glow */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/15 blur-[140px] rounded-full pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
              
              {/* Hero Text */}
              <div className="lg:col-span-12 max-w-4xl mx-auto space-y-6 text-center lg:text-left">
                
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>A Casa do Compositor Brasileiro</span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif tracking-tight text-white leading-[1.12]">
                  Suas músicas merecem encontrar a <span className="italic text-amber-400 font-serif">voz certa</span>.
                </h1>

                <p className="text-lg sm:text-xl text-slate-300 max-w-2xl leading-relaxed mx-auto lg:mx-0">
                  {APP_CONFIG.subtitle}
                </p>

                {/* Hero Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                  <Link
                    to="/login?modo=register"
                    className="w-full sm:w-auto px-8 py-4 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-base shadow-xl shadow-amber-500/20 hover:shadow-amber-500/30 flex items-center justify-center gap-2 transition transform hover:-translate-y-0.5"
                  >
                    <span>Criar Minha Conta de Compositor</span>
                    <ArrowRight className="w-5 h-5" />
                  </Link>

                </div>

                {/* Micro trust indicators */}
                <div className="pt-6 border-t border-slate-800/80 grid grid-cols-3 gap-4 text-slate-400 text-xs text-center lg:text-left">
                  <div className="flex items-center gap-2 justify-center lg:justify-start">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Áudio protegido (60s)</span>
                  </div>
                  <div className="flex items-center gap-2 justify-center lg:justify-start">
                    <BadgeCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Negociação Direta</span>
                  </div>
                  <div className="flex items-center gap-2 justify-center lg:justify-start">
                    <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Emissão de Liberação</span>
                  </div>
                </div>

              </div>

              {/* Visual Card Representation of Composer Profile */}

            </div>
          </div>
        </section>


        {/* COMO FUNCIONA (4 STEPS) SECTION */}
        <section id="como-funciona" className="py-20 bg-white border-b border-slate-200 text-slate-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
              <span className="text-amber-600 font-bold text-xs uppercase tracking-widest block">
                Passo a Passo Simples
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif italic text-[#0A1128]">
                Como funciona o Mercado do Compositor
              </h2>
              <p className="text-slate-500 text-base">
                Quatro etapas fáceis para você valorizar seu catálogo e fechar autorizações com segurança.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              
              {/* Step 1 */}
              <div className="bg-[#F1F5F9] border border-slate-200 p-6 rounded-2xl space-y-4 hover:border-amber-400 transition">
                <div className="w-12 h-12 rounded-xl bg-[#0A1128] text-amber-400 flex items-center justify-center font-serif italic font-bold text-xl shadow-sm">
                  1
                </div>
                <h3 className="text-lg font-serif font-bold text-[#0A1128]">Crie sua conta</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Cadastre seus dados pessoais e seu perfil artístico em poucos minutos com total praticidade.
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-[#F1F5F9] border border-slate-200 p-6 rounded-2xl space-y-4 hover:border-amber-400 transition">
                <div className="w-12 h-12 rounded-xl bg-[#0A1128] text-amber-400 flex items-center justify-center font-serif italic font-bold text-xl shadow-sm">
                  2
                </div>
                <h3 className="text-lg font-serif font-bold text-[#0A1128]">Cadastre suas composições</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Insira as letras completas e os áudios. A plataforma gera automaticamente a prévia limitada de 60 segundos.
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-[#F1F5F9] border border-slate-200 p-6 rounded-2xl space-y-4 hover:border-amber-400 transition">
                <div className="w-12 h-12 rounded-xl bg-[#0A1128] text-amber-400 flex items-center justify-center font-serif italic font-bold text-xl shadow-sm">
                  3
                </div>
                <h3 className="text-lg font-serif font-bold text-[#0A1128]">Divulgue seu perfil</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Compartilhe sua página pública com artistas, empresários e produtoras de todo o Brasil.
                </p>
              </div>

              {/* Step 4 */}
              <div className="bg-[#F1F5F9] border border-slate-200 p-6 rounded-2xl space-y-4 hover:border-amber-400 transition">
                <div className="w-12 h-12 rounded-xl bg-[#0A1128] text-amber-400 flex items-center justify-center font-serif italic font-bold text-xl shadow-sm">
                  4
                </div>
                <h3 className="text-lg font-serif font-bold text-[#0A1128]">Negocie e envie a liberação</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Receba manifestações de interesse, combine os valores diretamente e emita o documento de autorização.
                </p>
              </div>

            </div>

          </div>
        </section>


        {/* BENEFÍCIOS SECTION */}
        <section id="beneficios" className="py-20 bg-[#F1F5F9] text-slate-900 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
              <span className="text-amber-600 font-bold text-xs uppercase tracking-widest block">
                Por que usar a plataforma
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif italic text-[#0A1128]">
                Benefícios exclusivos para o compositor
              </h2>
              <p className="text-slate-500 text-base">
                Tudo o que você precisa para gerenciar e profissionalizar suas obras em um único lugar.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {[
                { title: "Perfil profissional", desc: "Sua página própria e elegante para enviar o link direto pelo WhatsApp.", icon: UserPlus },
                { title: "Catálogo organizado", desc: "Acesse rapidamente letras, autores, registros e arquivos em qualquer lugar.", icon: Disc },
                { title: "Proteção do áudio completo", desc: "Ninguém baixa seu áudio original; apenas a guia privada fica guardada.", icon: Lock },
                { title: "Prévia limitada das músicas", desc: "A reprodução trava automaticamente aos 60 segundos para proteger sua autoria.", icon: Headphones },
                { title: "Contato direto com interessados", desc: "Sem intermediários abusivos ou retenções indesejadas na negociação.", icon: MessageSquare },
                { title: "Gestão das solicitações", desc: "Acompanhe propostas recebidas, valores negociados e status de pagamento.", icon: CheckCircle2 },
                { title: "Emissão de liberações", desc: "Gere termos de autorização de gravação profissionais e estruturados.", icon: FileCheck },
                { title: "Maior visibilidade", desc: "Aumente suas chances de ter composições gravadas por grandes artistas.", icon: Sparkles }
              ].map((b, i) => {
                const IconComp = b.icon;
                return (
                  <div key={i} className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-amber-400 transition space-y-3 shadow-xs">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <IconComp className="w-5 h-5" />
                    </div>
                    <h3 className="font-serif font-bold text-[#0A1128] text-base">{b.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{b.desc}</p>
                  </div>
                );
              })}

            </div>

          </div>
        </section>


        {/* COMPOSITORES EM DESTAQUE SECTION */}
        {featuredComposers.length > 0 && <section id="compositores" className="py-20 bg-[#0A1128] text-white border-t border-amber-500/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
              <div>
                <span className="text-amber-400 font-bold text-xs uppercase tracking-widest block mb-2">
                  Talentos da Plataforma
                </span>
                <h2 className="text-3xl font-serif italic text-white">
                  Compositores em Destaque
                </h2>
              </div>

              <Link
                to="/compositor/rafael-monteiro"
                className="text-amber-400 hover:text-amber-300 font-semibold text-xs uppercase tracking-wider flex items-center gap-1 self-start md:self-auto"
              >
                <span>Ver todos os compositores</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* 3 Featured Composers */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {featuredComposers.map(comp => (
                <div 
                  key={comp.id}
                  className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden hover:border-amber-500/40 transition group flex flex-col justify-between shadow-xl"
                >
                  <div>
                    <div className="h-48 overflow-hidden relative">
                      <img 
                        src={comp.photo} 
                        alt={comp.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                      <span className="absolute bottom-3 left-3 bg-[#0A1128]/90 backdrop-blur-md border border-amber-500/30 text-amber-400 text-xs px-2.5 py-1 rounded-full font-medium">
                        {comp.cityState}
                      </span>
                    </div>

                    <div className="p-6 space-y-3">
                      <h3 className="text-xl font-serif italic font-bold text-white group-hover:text-amber-400 transition-colors">
                        {comp.name}
                      </h3>
                      
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                        {comp.bio}
                      </p>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {comp.genres.map((g, idx) => (
                          <span key={idx} className="text-[10px] bg-slate-800 text-amber-300 px-2 py-0.5 rounded border border-slate-700">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 pt-0 flex items-center justify-between border-t border-slate-800/60 mt-4">
                    <span className="text-xs text-slate-400">
                      <strong>{comp.songCount}</strong> músicas cadastradas
                    </span>

                    <button
                      onClick={() => navigate(`/compositor/${comp.username}`)}
                      className="px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs transition"
                    >
                      Ver perfil
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </section>}


        {/* PRICING PLAN SECTION */}
        <section id="planos" className="py-20 bg-white text-slate-900 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
              <span className="text-amber-600 font-bold text-xs uppercase tracking-widest block">
                Investimento Acessível
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif italic text-[#0A1128]">
                Escolha o Plano Ideal para seu Catálogo
              </h2>
              <p className="text-slate-500 text-base">
                Três opções transparentes para cada fase da sua carreira.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              {APP_CONFIG.plans.map(plan => (
                <div key={plan.name} className={`bg-[#0A1128] text-white rounded-3xl p-7 shadow-2xl relative space-y-6 border-2 ${plan.highlight ? 'border-amber-500' : 'border-slate-800'}`}>
                  {plan.highlight && <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 font-bold text-xs uppercase tracking-widest px-4 py-1 rounded-full">Mais Popular</div>}
                  <div className="text-center border-b border-slate-800 pb-5">
                    <h3 className="text-2xl font-serif italic font-bold">{plan.name}</h3>
                    <div className="flex items-baseline justify-center gap-1 pt-3"><span className="text-slate-400 text-sm">R$</span><span className="text-4xl font-serif italic font-bold text-amber-400">{plan.priceMonthly}</span><span className="text-slate-400 text-sm">/ mês</span></div>
                  </div>
                  <ul className="space-y-3 text-xs text-slate-300">
                    {plan.features.map(feature => <li key={feature} className="flex items-start gap-3"><CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" /><span>{feature}</span></li>)}
                  </ul>
                  <Link to="/login?modo=register" className="block w-full py-3 text-center rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm">Escolher {plan.name.replace('Plano ', '')}</Link>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-slate-500 mt-6">{APP_CONFIG.plan.cancelNotice}</p>

          </div>
        </section>

      </main>

      <Footer />

    </div>
  );
};
