import React from 'react';
import { Link } from 'react-router-dom';
import { APP_CONFIG } from '../../config/appConfig';
import { Music2, Instagram, Youtube, Mail, Phone, MapPin, ShieldCheck, FileText } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-950 border-t border-slate-800 text-slate-400 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center">
                <img src="/logo.webp" alt="Mercado do Compositor" className="w-full h-full object-contain" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">
                {APP_CONFIG.name}
              </span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              A plataforma SaaS dedicada ao fortalecimento do compositor brasileiro. Divulgue suas obras, proteja suas áudio-prévias e conecte-se diretamente com artistas e produtores.
            </p>
            <div className="pt-2 flex items-center gap-4 text-slate-300">
              <a href="#" className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center hover:text-amber-400 hover:border-amber-500/40 transition">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="#" className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center hover:text-amber-400 hover:border-amber-500/40 transition">
                <Youtube className="w-4 h-4" />
              </a>
              <a href={`mailto:${APP_CONFIG.contact.email}`} className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center hover:text-amber-400 hover:border-amber-500/40 transition">
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-white font-semibold text-base">Plataforma</h4>
            <ul className="space-y-2 text-slate-400">
              <li><a href="#como-funciona" className="hover:text-amber-400 transition">Como funciona</a></li>
              <li><a href="#beneficios" className="hover:text-amber-400 transition">Benefícios</a></li>
              <li><a href="#compositores" className="hover:text-amber-400 transition">Compositores em Destaque</a></li>
              <li><a href="#planos" className="hover:text-amber-400 transition">Planos e Preços</a></li>
              <li><Link to="/cadastro" className="hover:text-amber-400 transition">Criar Conta</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-3">
            <h4 className="text-white font-semibold text-base">Institucional</h4>
            <ul className="space-y-2 text-slate-400">
              <li><a href="#" className="hover:text-amber-400 transition">Sobre o Mercado do Compositor</a></li>
              <li><a href="#" className="hover:text-amber-400 transition flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-slate-500" /> Termos de Uso</a></li>
              <li><a href="#" className="hover:text-amber-400 transition flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-slate-500" /> Política de Privacidade</a></li>
              <li><a href="#" className="hover:text-amber-400 transition">Direitos Autorais e ECAD</a></li>
              <li><a href="#" className="hover:text-amber-400 transition">Dúvidas Frequentes (FAQ)</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-3">
            <h4 className="text-white font-semibold text-base">Atendimento</h4>
            <ul className="space-y-2.5 text-slate-400">
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{APP_CONFIG.contact.email}</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{APP_CONFIG.contact.whatsapp}</span>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{APP_CONFIG.contact.address}</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Notice & Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-slate-900 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} {APP_CONFIG.name}. Todos os direitos reservados.</p>
          <div className="text-slate-400 text-center">Privacidade e segurança para o catálogo do compositor.</div>
        </div>
      </div>
    </footer>
  );
};
