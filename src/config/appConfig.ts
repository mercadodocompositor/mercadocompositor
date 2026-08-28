const configuredAppUrl = import.meta.env.VITE_APP_URL?.trim().replace(/\/$/, '');

export const APP_URL = configuredAppUrl || window.location.origin;
export const GOOGLE_AUTH_ENABLED = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true';

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
        "Perfil público personalizado",
        "Player com prévias protegidas de 60 segundos",
        "Cadastro, edição e organização das composições",
        "Recebimento de solicitações de intérpretes",
        "Indicadores de visualizações e reproduções"
      ]
    },
    {
      name: "Plano Prata",
      priceMonthly: "34,90",
      priceValue: 34.90,
      maxSongs: 200,
      highlight: true,
      features: [
        "Todos os benefícios do Plano Bronze",
        "Até 200 músicas no catálogo",
        "Gestão de negociações e pagamentos confirmados",
        "Emissão de liberações digitais",
        "Histórico organizado de solicitações e liberações",
        "Links individuais para compartilhar cada música",
        "Busca, filtros e ordenação avançada do catálogo"
      ]
    },
    {
      name: "Plano Ouro",
      priceMonthly: "54,90",
      priceValue: 54.90,
      maxSongs: null,
      highlight: false,
      features: [
        "Todos os benefícios do Plano Prata",
        "Músicas ilimitadas no catálogo",
        "Cartão",
        "Elegibilidade para destaque no catálogo público",
        "Gestão completa de propostas e liberações",
        "Painel completo de desempenho das composições",
        "Perfil preparado para um catálogo profissional amplo"
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
      "Player de áudio com prévia protegida (60 segundos)",
      "Recebimento de solicitações de artistas e intérpretes",
      "Gestão completa de liberações e autorizações de gravação",
      "Emissão de termos de liberação em PDF",
      "Suporte da plataforma"
    ],
    cancelNotice: "Cancele quando quiser, sem fidelidade ou multa."
  },

  contact: {
    email: "contato@mercadodocompositor.com.br",
    whatsapp: "(62) 99876-5432",
    address: "Goiânia — GO, Brasil"
  }
};
