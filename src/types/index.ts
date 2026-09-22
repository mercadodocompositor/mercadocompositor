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
  originalMediaId?: string | null;
  /** Physically truncated public file. Never point this field at the original audio. */
  previewAudioUrl?: string | null;
  previewMediaId?: string | null;
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
  composerId?: string;
  composerName?: string;
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
  platformFeePercentage?: number;
  platformFeeAmount?: number;
  composerNetAmount?: number;
  archiveReason?: string;
  archivedAt?: string;
  releaseId?: string;
  updatedAt?: string;
}

export interface RequestHistoryItem {
  id: string;
  requestId: string;
  actorId: string;
  previousStatus: RequestStatus;
  newStatus: RequestStatus;
  previousAgreedValue?: number;
  newAgreedValue?: number;
  changedAt: string;
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
  expiresAt?: string;
  additionalConditions: string;
  digitalSignature: string;
  documentCode: string;
  documentPath?: string;
  documentHash?: string;
  templateVersion?: string;
  documentArchivedAt?: string;
  sentToBuyerAt?: string;
  isDemonstrative: boolean;
}

export interface Invoice {
  id: string;
  date: string;
  value: number;
  status: 'pago' | 'pendente' | 'cancelado' | 'estornado';
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
  /** Renovação automática no cartão (Assinaturas do Mercado Pago) autorizada. */
  autoRenew?: boolean;
  /** Status do preapproval no Mercado Pago: pending, authorized, paused, cancelled. */
  recurringStatus?: string;
  /** Datas do teste grátis, quando a conta já utilizou a oferta. */
  trialStartedAt?: string;
  trialEndsAt?: string;
  /** Valor inicial do contexto antes de a assinatura real carregar do banco. */
  isPlaceholder?: boolean;
}

export interface DashboardMetricPoint {
  date: string;
  profileViews: number;
  songPlays: number;
  interestRequests: number;
  releasesIssued: number;
  songsPublished: number;
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
  society?: string;
  instagram: string;
  youtube: string;
  spotify?: string;
  website: string;
  photo: string;
  coverPhoto: string;
  pixKey?: string;
  pixKeyType?: string;
  viewsCount: number;
  /** Definido apenas pela equipe (admin_set_profile_verified); nunca enviado no salvamento. */
  isVerified?: boolean;
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
  /**
   * Preview mascarado da chave Pix master (apenas os 4 últimos caracteres).
   * A chave em texto claro nunca faz parte do estado global: ela só é obtida
   * sob demanda por um administrador via `adminRevealPixKey()`.
   */
  pixKeyMasked: string;
  pixKeyConfigured: boolean;
  maintenanceMode: boolean;
  systemAnnouncement: string;
  requireApprovalForNewSongs: boolean;
  termsVersion: string;
  updatedAt?: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  category: 'auth' | 'financial' | 'moderation' | 'system';
  title: string;
  description: string;
  user: string;
  /** Nunca foi persistido: system_logs não tem coluna de IP. Mantido opcional para compatibilidade. */
  ip?: string;
  status: 'info' | 'success' | 'warning' | 'error';
}

export interface SubscriptionPlanItem {
  id: string;
  name: string;
  monthlyPrice: number;
  maxSongs: number | null;
  isActive: boolean;
  sortOrder: number;
  features?: string[];
  description?: string;
}

export type AdminRoleType = 'admin' | 'moderator' | 'financial';

export interface UserRoleItem {
  id: string;
  userId: string;
  email: string;
  name?: string;
  role: AdminRoleType;
  createdAt: string;
}

export type DeletionRequestStatus = 'pendente' | 'em_analise' | 'concluida' | 'rejeitada';

export interface AccountDeletionRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  reason?: string;
  status: DeletionRequestStatus;
  createdAt: string;
  resolvedAt?: string;
  adminNotes?: string;
}

export type NotificationType = 'request' | 'release' | 'moderation' | 'system';

export interface UserNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  link?: string;
  createdAt: string;
}
