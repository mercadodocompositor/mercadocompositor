const configuredAppUrl = import.meta.env.VITE_APP_URL?.trim().replace(/\/$/, '');

// Fora do navegador (testes/CI sem VITE_APP_URL) não existe window.
export const APP_URL = configuredAppUrl
  || (typeof window !== 'undefined' ? window.location.origin : 'https://mercadodocompositor.com.br');
export const GOOGLE_AUTH_ENABLED = import.meta.env.VITE_GOOGLE_AUTH_ENABLED !== 'false';

export const APP_CONFIG = {
  name: "Mercado do Compositor",
  shortName: "Compositor",
  tagline: "Suas músicas merecem encontrar a voz certa.",
  subtitle: "Crie seu perfil profissional, apresente suas composições e conecte-se com artistas interessados em gravar suas obras.",
  
  plans: [
    {
      name: "Plano Bronze",
      priceMonthly: "24,90",
      priceValue: 24.90,
      maxSongs: 100,
      highlight: false,
      features: [
        "Até 100 músicas no catálogo",
        "Perfil público do Compositor",
        "Prévia protegida de 85 segundos com letra completa",
        "Contato direto com artistas, com aviso por e-mail",
        "Gestão de solicitações e negociações",
        "Termo de liberação em PDF com validação de autenticidade",
        "Entrega da obra completa por link seguro",
        "Estatísticas completas"
      ]
    },
    {
      name: "Plano Prata",
      priceMonthly: "34,90",
      priceValue: 34.90,
      maxSongs: 200,
      highlight: true,
      features: [
        "Até 200 músicas no catálogo",
        "Perfil público do Compositor",
        "Prévia protegida de 85 segundos com letra completa",
        "Contato direto com artistas, com aviso por e-mail",
        "Gestão de solicitações e negociações",
        "Termo de liberação em PDF com validação de autenticidade",
        "Entrega da obra completa por link seguro",
        "Estatísticas completas"
      ]
    },
    {
      name: "Plano Ouro",
      priceMonthly: "54,90",
      priceValue: 54.90,
      maxSongs: null,
      highlight: false,
      features: [
        "Músicas ilimitadas no catálogo",
        "Perfil público do Compositor",
        "Prévia protegida de 85 segundos com letra completa",
        "Contato direto com artistas, com aviso por e-mail",
        "Gestão de solicitações e negociações",
        "Termo de liberação em PDF com validação de autenticidade",
        "Entrega da obra completa por link seguro",
        "Estatísticas completas e elegibilidade para destaque no catálogo público"
      ]
    }
  ],

  plan: {
    name: "Plano Bronze",
    priceMonthly: "24,90",
    priceValue: 24.90,
    currency: "R$",
    period: "mês",
    maxSongs: 100,
    features: [
      "Perfil público personalizado e compartilhável",
      "Cadastro de até 100 músicas no catálogo",
      "Player de áudio com prévia protegida (85 segundos)",
      "Recebimento de solicitações de artistas e intérpretes",
      "Gestão completa de liberações e autorizações de gravação",
      "Emissão de termos de liberação em PDF",
      "Suporte da plataforma"
    ],
    cancelNotice: "Cancele quando quiser, sem fidelidade ou multa."
  },

  company: {
    legalName: "Mercado do Compositor Intermediação e Tecnologia Digital Ltda.",
    tradeName: "Mercado do Compositor",
    cnpj: "41.099.784/0001-34",
    jurisdiction: "Comarca de Goiânia — Estado de Goiás",
    dpoEmail: "contato@mercadodocompositor.com.br",
    supportEmail: "contato@mercadodocompositor.com.br",
    serviceHours: "Segunda a sexta-feira, das 09h às 18h (Horário de Brasília)"
  },

  social: {
    instagram: "https://instagram.com/mercadodocompositor",
    youtube: "https://youtube.com/@mercadodocompositor"
  },

  contact: {
    email: "contato@mercadodocompositor.com.br",
    whatsapp: "(51) 99659-7804"
  }
};
