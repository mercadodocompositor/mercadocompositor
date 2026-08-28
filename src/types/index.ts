export type SongStatus = 'draft' | 'pending_approval' | 'published' | 'rejected';
export type ValueType = 'suggested' | 'consultation';

export interface Song {
  id: string;
  composerId?: string;
  title: string;
  genre: string;
  subgenre?: string;
  authors: string;
  dateComposed: string;
  dateRegistered: string;
  lyrics: string;
  /** Original audio. Restricted to composer/admin areas. */
  audioUrl?: string;
  /** Internal Storage path for replacing/removing the protected original. */
  originalAudioPath?: string | null;
  /** Physically truncated public file. Never point this field at the original audio. */
  previewAudioUrl?: string;
  coverUrl: string;
  registryCode?: string;
  notes?: string;
  status: SongStatus;
  isAvailableForRelease: boolean;
  valueType: ValueType;
  suggestedValue?: number;
  playCount: number;
  interestedCount: number;
  summary?: string;
  isFeatured?: boolean;
}

export type RequestStatus = 
  | 'nova' 
  | 'em_negociacao' 
  | 'pagamento_pendente' 
  | 'pagamento_confirmado' 
  | 'liberacao_enviada' 
  | 'arquivada';

export interface InterestRequest {
  id: string;
  songId: string;
  songTitle: string;
  songCover?: string;
  buyerName: string;
  buyerStageName?: string;
  cpfCnpj: string;
  buyerEmail: string;
  buyerWhatsapp: string;
  buyerCityState: string;
  purpose: string;
  message: string;
  status: RequestStatus;
  createdAt: string;
  agreedValue?: number;
  notes?: string;
  paymentReceivedAt?: string;
  releaseId?: string;
}

export interface ReleaseDocument {
  id: string;
  requestId: string;
  songId: string;
  songTitle: string;
  authors: string;
  composerName: string;
  composerCpf: string;
  composerCityState: string;
  buyerName: string;
  buyerDocument: string;
  buyerCityState: string;
  agreedValue: number;
  authorizedPurpose: string;
  releaseType: string; // e.g. "Exclusiva por 24 meses" or "Não Exclusiva"
  issueDate: string;
  additionalConditions: string;
  digitalSignature: string;
  documentCode: string;
  isDemonstrative: boolean;
}

export interface Invoice {
  id: string;
  date: string;
  value: number;
  status: 'pago' | 'pendente' | 'cancelado';
  pdfUrl?: string;
}

export type SubscriptionStatus = 'active' | 'pending' | 'suspended' | 'cancelled';

export interface Subscription {
  status: SubscriptionStatus;
  planName: string;
  monthlyPrice: string;
  nextBillingDate: string;
  paymentMethod: 'Cartão de Crédito' | 'Pix';
  cardLast4?: string;
  cardBrand?: string;
  invoices: Invoice[];
}

export interface ComposerProfile {
  username: string;
  name: string;
  stageName: string;
  email: string;
  whatsapp: string;
  cpf: string;
  city: string;
  state: string;
  bio: string;
  experienceYears: string;
  genres: string[];
  instagram: string;
  youtube: string;
  website: string;
  photo: string;
  coverPhoto: string;
  viewsCount: number;
}

export interface FeaturedComposer {
  id: string;
  username: string;
  name: string;
  cityState: string;
  genres: string[];
  songCount: number;
  photo: string;
  bio: string;
}

export interface AdminComposer {
  id: string;
  username: string;
  name: string;
  stageName: string;
  email: string;
  whatsapp: string;
  cpf: string;
  cityState: string;
  subscriptionStatus: SubscriptionStatus;
  planName: string;
  monthlyValue: number;
  registeredAt: string;
  songCount: number;
  totalPlays: number;
  totalReleases: number;
  revenueGenerated: number;
  photo: string;
  isVerified: boolean;
  notes?: string;
}

export interface PlatformSettings {
  platformName: string;
  tagline: string;
  planMonthlyPrice: number;
  planMaxSongs: number;
  platformFeePercentage: number;
  supportWhatsapp: string;
  supportEmail: string;
  pixKey: string;
  maintenanceMode: boolean;
  systemAnnouncement: string;
  requireApprovalForNewSongs: boolean;
  termsVersion: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  category: 'auth' | 'financial' | 'moderation' | 'system';
  title: string;
  description: string;
  user: string;
  ip: string;
  status: 'info' | 'success' | 'warning' | 'error';
}
