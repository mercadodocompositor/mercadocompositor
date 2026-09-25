import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate, Link, useSearchParams, UNSAFE_NavigationContext } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { InterestRequest, RequestStatus, ReleaseDocument, RequestHistoryItem } from '../../types';
import { LiberacaoDocumentModal } from '../../components/common/LiberacaoDocumentModal';
import { ReleaseDeliveryStatus } from '../../components/dashboard/ReleaseDeliveryStatus';
import { getRequestCode } from '../../lib/identifiers';
import { normalizeBrazilianWhatsapp } from '../../lib/contact';
import { useDebounce } from '../../hooks/useDebounce';
import { isExclusiveReleaseType, isActiveExclusiveRelease, isReleaseExpired } from '../../lib/releaseTypes';
import { DEFAULT_RELEASE_TYPE, RELEASE_TYPE_OPTIONS, REQUEST_STATUS_LABELS, getAllowedRequestStatuses, getManuallySelectableRequestStatuses, getReleaseConditions } from '../../lib/requestWorkflow';
import { loadReleaseDeliveryStatuses, loadRequestHistory, resendReleaseDelivery, type ReleaseDeliveryStatus as ReleaseDeliveryInfo } from '../../lib/database';
import { getFriendlyErrorMessage } from '../../lib/apiErrors';
import { REQUEST_GROUP_STATUSES, isRequestGroup, parseRequestFilters, serializeRequestFilters, toStatusQuery, type RequestFilters } from '../../lib/requestFilters';
import { formatBrlAmount, parseBrlAmount } from '../../lib/money';
import { useModalFocus } from '../../hooks/useModalFocus';
import {
  MessageSquare,
  Search,
  CheckCircle2,
  FileCheck,
  Phone,
  Mail,
  DollarSign,
  X,
  ChevronRight,
  FileText,
  Clock,
  ShieldCheck,
  Music,
  Filter,
  Check,
  AlertCircle,
  ArrowLeft,
  User,
  MapPin,
  Calendar,
  ExternalLink,
  LoaderCircle
} from 'lucide-react';

export const RequestsTab: React.FC = () => {
  const { requestId } = useParams<{ requestId?: string }>();
  const navigate = useNavigate();
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const { requests, songs, updateRequestStatus, queryRequests, getRequestById, issueRelease, retryReleaseArchive, releases, profile, authLoading, currentUserId } = useApp();

  const [activeTab, setActiveTab] = useState<RequestFilters['status']>(() => parseRequestFilters(searchParams).status);
  const [selectedSongFilter, setSelectedSongFilter] = useState<string>(() => parseRequestFilters(searchParams).song);
  const [searchTerm, setSearchTerm] = useState(() => parseRequestFilters(searchParams).query);
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest'>(() => parseRequestFilters(searchParams).sort);
  const [page, setPage] = useState(() => parseRequestFilters(searchParams).page);
  const pageSize = 20;
  const [listedRequests, setListedRequests] = useState<InterestRequest[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [songCounts, setSongCounts] = useState<Record<string, number>>({});
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [loadedRequest, setLoadedRequest] = useState<InterestRequest | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [detailLoading, setDetailLoading] = useState(Boolean(requestId));
  const [concurrencyConflict, setConcurrencyConflict] = useState(false);

  // Selected request state based on URL or local state
  const activeRequest = requestId ? requests.find(r => r.id === requestId) || (loadedRequest?.id === requestId ? loadedRequest : null) : null;

  // Detail page form state
  const [moneyDisplay, setMoneyDisplay] = useState('');
  const [moneyTextInvalid, setMoneyTextInvalid] = useState(false);
  const [releaseReviewError, setReleaseReviewError] = useState('');
  const [agreedValueInput, setAgreedValueInput] = useState<number | ''>('');
  const [notesInput, setNotesInput] = useState('');
  const [releaseTypeInput, setReleaseTypeInput] = useState<string>(DEFAULT_RELEASE_TYPE);
  const [closeSongForRelease, setCloseSongForRelease] = useState<boolean>(false);
  const [archiveReason, setArchiveReason] = useState<string>('');
  const [draftStatus, setDraftStatus] = useState<RequestStatus>('nova');
  const [showBuyerDocument, setShowBuyerDocument] = useState(false);
  const [legalAcknowledged, setLegalAcknowledged] = useState(false);
  const [showPaymentConfirmation, setShowPaymentConfirmation] = useState(false);
  const [showArchiveConfirmation, setShowArchiveConfirmation] = useState(false);
  const [showReleaseReview, setShowReleaseReview] = useState(false);
  const [deliveryStatuses, setDeliveryStatuses] = useState<Record<string, ReleaseDeliveryInfo>>({});
  const [sendingDeliveryId, setSendingDeliveryId] = useState<string | null>(null);
  const [historyRequestId, setHistoryRequestId] = useState<string | null>(null);
  const [requestHistory, setRequestHistory] = useState<RequestHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [archiveError, setArchiveError] = useState('');
  const [archivingRelease, setArchivingRelease] = useState(false);
  const [restorableDraft, setRestorableDraft] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [isIssuingRelease, setIsIssuingRelease] = useState(false);

  // Document modal trigger state
  const [viewingReleaseDoc, setViewingReleaseDoc] = useState<ReleaseDocument | null>(null);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const closePaymentModal = React.useCallback(() => { if (!isConfirmingPayment) setShowPaymentConfirmation(false); }, [isConfirmingPayment]);
  const closeArchiveModal = React.useCallback(() => { if (!isSaving) setShowArchiveConfirmation(false); }, [isSaving]);
  const closeReviewModal = React.useCallback(() => { if (!isIssuingRelease) setShowReleaseReview(false); }, [isIssuingRelease]);
  const paymentDialogRef = useModalFocus<HTMLDivElement>(showPaymentConfirmation, closePaymentModal);
  const archiveDialogRef = useModalFocus<HTMLDivElement>(showArchiveConfirmation, closeArchiveModal);
  const reviewDialogRef = useModalFocus<HTMLDivElement>(showReleaseReview, closeReviewModal);

  // Toast feedback
  const mutationInProgressRef = useRef(false);

  const beginMutation = (setPending: React.Dispatch<React.SetStateAction<boolean>>) => {
    if (mutationInProgressRef.current) return false;
    mutationInProgressRef.current = true;
    setPending(true);
    return true;
  };

  const endMutation = (setPending: React.Dispatch<React.SetStateAction<boolean>>) => {
    mutationInProgressRef.current = false;
    setPending(false);
  };

  const isMutating = isSaving || isConfirmingPayment || isIssuingRelease || Boolean(sendingDeliveryId);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToastMessage({ message, type });
    if (type === 'success') setTimeout(() => setToastMessage(current => current?.message === message ? null : current), 5000);
  };
  const statusLabels = REQUEST_STATUS_LABELS;
  const getAllowedStatuses = getAllowedRequestStatuses;
  const getSelectableStatuses = getManuallySelectableRequestStatuses;

  const lastLoadedRequestIdRef = useRef<string | null>(null);
  const isNavigatingConfirmedRef = useRef(false);
  const hasUnsavedChangesRef = useRef(false);

  // Sincroniza ao trocar de solicitação. Mutações bem-sucedidas atualizam
  // explicitamente os campos confirmados para preservar rascunhos em falhas.
  useEffect(() => {
    if (!activeRequest) {
      lastLoadedRequestIdRef.current = null;
      return;
    }

    if (lastLoadedRequestIdRef.current !== activeRequest.id) {
      lastLoadedRequestIdRef.current = activeRequest.id;
      let cachedNotes: string | null = null;
      let cachedReason: string | null = null;
      let cachedValue: string | null = null;
      let cachedStatus: string | null = null;
      try {
        cachedNotes = sessionStorage.getItem(`req_draft_notes_${activeRequest.id}`);
        cachedReason = sessionStorage.getItem(`req_draft_reason_${activeRequest.id}`);
        cachedValue = sessionStorage.getItem(`req_draft_value_${activeRequest.id}`);
        cachedStatus = sessionStorage.getItem(`req_draft_status_${activeRequest.id}`);
      } catch {
        cachedNotes = null;
        cachedReason = null;
        cachedValue = null;
        cachedStatus = null;
      }
      setRestorableDraft(cachedNotes !== null || cachedReason !== null || cachedValue !== null || cachedStatus !== null);
      setAgreedValueInput(activeRequest.agreedValue || '');
      setMoneyTextInvalid(false);
      setMoneyDisplay(activeRequest.agreedValue ? activeRequest.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
      setNotesInput(activeRequest.notes || '');
      setArchiveReason(activeRequest.archiveReason || '');
      setDraftStatus(activeRequest.status);
      setShowBuyerDocument(false);
      setArchiveError('');
      setLegalAcknowledged(false);
      setCloseSongForRelease(false);
    }
  }, [activeRequest?.id]);

  const restoreDraft = () => {
    if (!activeRequest) return;
    try {
      const id = activeRequest.id;
      const value = sessionStorage.getItem(`req_draft_value_${id}`);
      const notes = sessionStorage.getItem(`req_draft_notes_${id}`);
      const reason = sessionStorage.getItem(`req_draft_reason_${id}`);
      const status = sessionStorage.getItem(`req_draft_status_${id}`);
      if (value !== null) { setAgreedValueInput(value === '' ? '' : Number(value)); setMoneyDisplay(value ? Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''); }
      if (notes !== null) setNotesInput(notes);
      if (reason !== null) setArchiveReason(reason);
      if (status && getSelectableStatuses(activeRequest.status).includes(status as RequestStatus)) setDraftStatus(status as RequestStatus);
    } catch { /* storage unavailable */ }
    setRestorableDraft(false);
  };

  const handleNotesChange = (value: string) => {
    setNotesInput(value);
    if (activeRequest) {
      try {
        if (value !== (activeRequest.notes || '')) {
          sessionStorage.setItem(`req_draft_notes_${activeRequest.id}`, value);
        } else {
          sessionStorage.removeItem(`req_draft_notes_${activeRequest.id}`);
        }
      } catch {
        // Ignora falhas em storage
      }
    }
  };

  const handleArchiveReasonChange = (value: string) => {
    setArchiveReason(value);
    if (activeRequest) {
      try {
        if (value !== (activeRequest.archiveReason || '')) {
          sessionStorage.setItem(`req_draft_reason_${activeRequest.id}`, value);
        } else {
          sessionStorage.removeItem(`req_draft_reason_${activeRequest.id}`);
        }
      } catch {
        // Ignora falhas em storage
      }
    }
  };

  const handleAgreedValueChange = (value: number | '', display?: string) => {
    setMoneyDisplay(display ?? (value === '' ? '' : formatBrlAmount(value)));
    setMoneyTextInvalid(false);
    setAgreedValueInput(value);
    if (activeRequest) {
      try {
        const originalValue = activeRequest.agreedValue || '';
        if (value !== originalValue) {
          sessionStorage.setItem(`req_draft_value_${activeRequest.id}`, String(value));
        } else {
          sessionStorage.removeItem(`req_draft_value_${activeRequest.id}`);
        }
      } catch {
        // Ignora falhas em storage
      }
    }
  };

  // O texto é lido como reais ("3500" = R$ 3.500,00). A máscara anterior
  // tratava os dígitos como centavos e gravava R$ 35,00 para quem digitava 3500.
  const handleMoneyTextChange = (text: string) => {
    const cleaned = text.replace(/[^\d.,R$\s]/gi, '').slice(0, 20);
    const amount = parseBrlAmount(cleaned);
    if (amount === null) {
      setMoneyDisplay(cleaned);
      setMoneyTextInvalid(true);
      return;
    }
    handleAgreedValueChange(amount, cleaned);
  };

  const handleMoneyBlur = () => {
    if (!moneyTextInvalid && agreedValueInput !== '') setMoneyDisplay(formatBrlAmount(agreedValueInput));
  };

  const moneyError = moneyTextInvalid
    ? 'Valor inválido. Use o formato 3.500,00.'
    : agreedValueInput !== '' && (agreedValueInput <= 0 || agreedValueInput > 10000000)
      ? agreedValueInput <= 0 ? 'Informe um valor maior que zero.' : 'Limite: R$ 10.000.000,00.'
      : '';

  const handleDraftStatusChange = (status: RequestStatus) => {
    setDraftStatus(status);
    if (activeRequest) {
      try {
        if (status !== activeRequest.status) {
          sessionStorage.setItem(`req_draft_status_${activeRequest.id}`, status);
        } else {
          sessionStorage.removeItem(`req_draft_status_${activeRequest.id}`);
        }
      } catch {
        // Ignora falhas em storage
      }
    }
  };

  const clearRequestDrafts = (requestId: string) => {
    try {
      sessionStorage.removeItem(`req_draft_notes_${requestId}`);
      sessionStorage.removeItem(`req_draft_reason_${requestId}`);
      sessionStorage.removeItem(`req_draft_value_${requestId}`);
      sessionStorage.removeItem(`req_draft_status_${requestId}`);
    } catch {
      // Ignora falhas em storage
    }
  };

  const handleDiscardChanges = () => {
    if (!activeRequest) return;
    clearRequestDrafts(activeRequest.id);
    setRestorableDraft(false);
    setAgreedValueInput(activeRequest.agreedValue || '');
    setMoneyTextInvalid(false);
    setMoneyDisplay(activeRequest.agreedValue ? activeRequest.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    setNotesInput(activeRequest.notes || '');
    setArchiveReason(activeRequest.archiveReason || '');
    setDraftStatus(activeRequest.status);
    showToast('Alterações descartadas. Dados originais restaurados.', 'warning');
  };

  const hasUnsavedChanges = Boolean(activeRequest) && (
    agreedValueInput !== (activeRequest?.agreedValue || '') ||
    notesInput !== (activeRequest?.notes || '') ||
    draftStatus !== activeRequest?.status ||
    (draftStatus === 'arquivada' && archiveReason !== (activeRequest?.archiveReason || ''))
  );
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  // Intercepta navegação interna do React Router (navigate e <Link>)
  useEffect(() => {
    if (!navigator) return;
    const nav = navigator as any;
    const originalPush = nav.push;
    const originalReplace = nav.replace;

    nav.push = function(...args: any[]) {
      if (hasUnsavedChangesRef.current && !isNavigatingConfirmedRef.current) {
        const proceed = window.confirm('Há alterações não salvas nesta solicitação. Deseja sair e descartá-las?');
        if (!proceed) return;
      }
      isNavigatingConfirmedRef.current = false;
      return originalPush.apply(nav, args);
    };

    nav.replace = function(...args: any[]) {
      if (hasUnsavedChangesRef.current && !isNavigatingConfirmedRef.current) {
        const proceed = window.confirm('Há alterações não salvas nesta solicitação. Deseja sair e descartá-las?');
        if (!proceed) return;
      }
      isNavigatingConfirmedRef.current = false;
      return originalReplace.apply(nav, args);
    };

    return () => {
      nav.push = originalPush;
      nav.replace = originalReplace;
    };
  }, [navigator]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const confirmInternalNavigation = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || event.defaultPrevented) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin
          || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
      if (!window.confirm('Há alterações não salvas nesta solicitação. Deseja sair e descartá-las?')) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        isNavigatingConfirmedRef.current = true;
      }
    };
    document.addEventListener('click', confirmInternalNavigation, true);
    return () => document.removeEventListener('click', confirmInternalNavigation, true);
  }, [hasUnsavedChanges]);

  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize));
  const paginatedRequests = listedRequests;

  useEffect(() => {
    if (requestId || authLoading) return;
    let cancelled = false;
    setListLoading(true);
    setListError('');
    queryRequests({page,pageSize,status:toStatusQuery(activeTab),
      songId:selectedSongFilter === 'todas' ? undefined : selectedSongFilter,
      search:debouncedSearchTerm,oldest:sortOrder === 'oldest'})
      .then(result => {
        if (cancelled) return;
        setListedRequests(result.requests); setListTotal(result.total);
        setStatusCounts(result.statusCounts); setSongCounts(result.songCounts);
      })
      .catch(() => { if (!cancelled) setListError('Não foi possível carregar as solicitações. Tente novamente.'); })
      .finally(() => { if (!cancelled) setListLoading(false); });
    return () => { cancelled = true; };
  }, [requestId, authLoading, page, activeTab, selectedSongFilter, debouncedSearchTerm, sortOrder, queryRequests]);

  useEffect(() => {
    if (!requestId || requests.some(item => item.id === requestId)) { setLoadedRequest(null); setDetailLoading(false); return; }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(false);
    setLoadedRequest(null);
    getRequestById(requestId).then(item => { if (!cancelled) setLoadedRequest(item); })
      .catch(() => { if (!cancelled) { setLoadedRequest(null); setDetailError(true); } })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [requestId, requests, getRequestById]);

  const releaseIdsKey = releases.map(release => release.id).join(',');
  useEffect(() => {
    if (requestId || !releaseIdsKey) return;
    let active = true;
    loadReleaseDeliveryStatuses(releaseIdsKey.split(','))
      .then(statuses => { if (active) setDeliveryStatuses(current => ({ ...current, ...statuses })); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [requestId, releaseIdsKey]);

  const failedDeliveries = releases.filter(release => deliveryStatuses[release.id]?.emailStatus === 'failed');

  const activeReleaseId = activeRequest
    ? releases.find(release => release.requestId === activeRequest.id)?.id
    : undefined;

  useEffect(() => {
    if (!activeReleaseId) return;
    let active = true;
    loadReleaseDeliveryStatuses([activeReleaseId])
      .then(statuses => {
        if (active) setDeliveryStatuses(current => ({ ...current, ...statuses }));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [activeReleaseId]);

  const isSyncingFromUrlRef = useRef(false);
  const lastUrlParamsRef = useRef<string | null>(null);
  const prevFiltersRef = useRef({ activeTab, selectedSongFilter, debouncedSearchTerm, sortOrder });

  // 1. Sincronização e Validação URL -> Estado Local (Navegação externa, Back/Forward, links diretos)
  useEffect(() => {
    const currentParams = searchParams.toString();
    if (lastUrlParamsRef.current !== null && currentParams === lastUrlParamsRef.current) return;

    const validatedFilters = parseRequestFilters(searchParams);
    const canonicalParams = serializeRequestFilters(validatedFilters);

    lastUrlParamsRef.current = canonicalParams.toString();

    // Se a URL contiver parâmetros inválidos (ex.: status desconhecido ou página fracionária),
    // normaliza a URL no navegador para a versão válida
    if (currentParams !== canonicalParams.toString()) {
      setSearchParams(canonicalParams, { replace: true });
    }

    isSyncingFromUrlRef.current = true;
    setActiveTab(validatedFilters.status);
    setSelectedSongFilter(validatedFilters.song);
    setSearchTerm(validatedFilters.query);
    setSortOrder(validatedFilters.sort);
    setPage(validatedFilters.page);
    prevFiltersRef.current = {
      activeTab: validatedFilters.status,
      selectedSongFilter: validatedFilters.song,
      debouncedSearchTerm: validatedFilters.query,
      sortOrder: validatedFilters.sort
    };
  }, [searchParams, setSearchParams]);

  // 2. Quando filtros materiais forem alterados na UI (não por navegação URL), reseta para a página 1
  useEffect(() => {
    if (isSyncingFromUrlRef.current) return;
    const prev = prevFiltersRef.current;
    if (prev.activeTab !== activeTab ||
        prev.selectedSongFilter !== selectedSongFilter ||
        prev.debouncedSearchTerm !== debouncedSearchTerm ||
        prev.sortOrder !== sortOrder) {
      prevFiltersRef.current = { activeTab, selectedSongFilter, debouncedSearchTerm, sortOrder };
      setPage(1);
    }
  }, [activeTab, selectedSongFilter, debouncedSearchTerm, sortOrder]);

  // 3. Ajuste de página quando o total de páginas for menor
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  // 4. Sincronização Estado Local -> URL (somente quando a alteração parte do usuário)
  useEffect(() => {
    if (isSyncingFromUrlRef.current) {
      isSyncingFromUrlRef.current = false;
      return;
    }

    const next = serializeRequestFilters({
      status: activeTab,
      song: selectedSongFilter,
      query: debouncedSearchTerm,
      sort: sortOrder,
      page
    });

    const nextStr = next.toString();
    if (lastUrlParamsRef.current === null || nextStr !== lastUrlParamsRef.current) {
      lastUrlParamsRef.current = nextStr;
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, selectedSongFilter, debouncedSearchTerm, sortOrder, page, setSearchParams]);

  useEffect(() => {
    if (!activeRequest) { setHistoryRequestId(null); setRequestHistory([]); setHistoryError(''); setHistoryLoading(false); return; }
    let cancelled = false;
    setHistoryRequestId(activeRequest.id);
    setRequestHistory([]);
    setHistoryError('');
    setHistoryLoading(true);
    loadRequestHistory(activeRequest.id).then(items => {
      if (!cancelled) { setRequestHistory(items); setHistoryError(''); }
    }).catch(() => {
      if (!cancelled) setHistoryError('Não foi possível carregar o histórico. Tente recarregar a página.');
    }).finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [activeRequest?.id, activeRequest?.updatedAt]);

  const formatDate = (date: string) => new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    ...(date.includes('T') ? { timeStyle: 'short' as const } : {})
  }).format(new Date(date));

  const maskDocument = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.length > 4 ? `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}` : '••••';
  };
  const maskEmail = (value: string) => {
    const [name, domain] = value.split('@');
    return name && domain ? `${name.slice(0, 2)}•••@${domain}` : '••••';
  };
  const maskPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 4 ? `(••) •••••-${digits.slice(-4)}` : '••••';
  };

  const formatCpfCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 11) {
      return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    if (digits.length === 14) {
      return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return value;
  };

  const handleReloadCurrentVersion = async () => {
    if (!activeRequest) return;
    try {
      const fresh = await getRequestById(activeRequest.id);
      if (fresh) {
        setConcurrencyConflict(false);
        showToast('Versão atual carregada com sucesso! Seu rascunho de alterações foi preservado.', 'success');
        return;
      }
    } catch {
      // Fallback para reload de página
    }
    window.location.reload();
  };

  const executeSaveDetails = async (nextStatus: RequestStatus = draftStatus) => {
    if (!activeRequest) return;
    if (activeRequest.status === 'liberacao_enviada'
        && agreedValueInput !== (activeRequest.agreedValue || '')) {
      showToast('O valor de uma liberação emitida não pode ser alterado.', 'warning');
      return;
    }
    if (nextStatus === 'pagamento_confirmado' && activeRequest.status !== 'pagamento_confirmado') {
      setDraftStatus(activeRequest.status);
      showToast('Confirme o recebimento pelo botão dedicado para revisar o valor antes de concluir.', 'warning');
      return;
    }
    if (!getAllowedStatuses(activeRequest.status).includes(nextStatus)) {
      showToast('Essa mudança de status não é permitida no fluxo atual.', 'warning');
      return;
    }
    if (agreedValueInput !== '') {
      if (Number(agreedValueInput) <= 0) {
        showToast('O valor acordado deve ser maior que zero.', 'warning');
        return;
      }
      if (Number(agreedValueInput) > 10000000) {
        showToast('O valor acordado não pode ultrapassar R$ 10.000.000,00.', 'warning');
        return;
      }
    }

    if (!beginMutation(setIsSaving)) return;
    try {
      const otherReleasesForSong = releases.filter(r => r.songId === activeRequest.songId && r.requestId !== activeRequest.id);
      if ((nextStatus === 'pagamento_pendente' || nextStatus === 'pagamento_confirmado') && otherReleasesForSong.some(r => isActiveExclusiveRelease(r))) {
        showToast('Esta obra já possui uma liberação com cláusula de exclusividade emitida para outro interessado.', 'error');
        return;
      }

      const saved = await updateRequestStatus(activeRequest.id, nextStatus, {
        agreedValue: agreedValueInput === '' ? 0 : Number(agreedValueInput),
        clearAgreedValue: agreedValueInput === '',
        notes: notesInput,
        archiveReason: nextStatus === 'arquivada' ? archiveReason : undefined
      });
      if (saved) {
        clearRequestDrafts(activeRequest.id);
        setDraftStatus(nextStatus);
        const statusChanged = nextStatus !== activeRequest.status;
        showToast(!statusChanged ? 'Detalhes e observações salvos com sucesso!'
          : nextStatus === 'em_negociacao' ? 'Negociação iniciada. Combine valores e condições com o interessado.'
          : nextStatus === 'pagamento_pendente' ? `Acordo de R$ ${formatBrlAmount(Number(agreedValueInput))} registrado. Confirme o pagamento quando recebê-lo.`
          : nextStatus === 'arquivada' ? 'Solicitação arquivada.'
          : nextStatus === 'nova' ? 'Solicitação reaberta.'
          : 'Status atualizado com sucesso!');
      }
    } catch (err: any) {
      const isConflict = Boolean(
        err?.isConflict ||
        err?.code === 'CONCURRENCY_CONFLICT' ||
        /outra aba|foi alterada|recarregue/i.test(err?.message || '')
      );
      if (isConflict) setConcurrencyConflict(true);
      showToast(err?.message || "Erro ao salvar as alterações. O texto digitado foi preservado.", isConflict ? 'warning' : 'error');
    } finally {
      endMutation(setIsSaving);
    }
  };

  const handleSaveDetails = () => {
    if (!activeRequest) return;
    if (draftStatus === 'arquivada' && activeRequest.status !== 'arquivada') {
      setShowArchiveConfirmation(true);
      return;
    }
    void executeSaveDetails();
  };

  const handleMarkPaymentReceived = async () => {
    if (!activeRequest) return;
    if (activeRequest.status !== 'pagamento_pendente') {
      showToast('Salve a alteração de status para Pagamento Pendente antes de confirmar o pagamento.', 'warning');
      setShowPaymentConfirmation(false);
      return;
    }
    const otherReleasesForSong = releases.filter(r => r.songId === activeRequest.songId && r.requestId !== activeRequest.id);
    if (otherReleasesForSong.some(r => isActiveExclusiveRelease(r))) {
      showToast('Esta obra já possui uma liberação com cláusula de exclusividade emitida para outro interessado.', 'error');
      setShowPaymentConfirmation(false);
      return;
    }
    if (!agreedValueInput || Number(agreedValueInput) <= 0) {
      showToast('Informe um valor acordado maior que zero antes de confirmar o pagamento.', 'warning');
      return;
    }
    if (Number(agreedValueInput) > 10000000) {
      showToast('O valor acordado não pode ultrapassar R$ 10.000.000,00.', 'warning');
      return;
    }
    const confirmedAgreedValue = Number(agreedValueInput);
    if (!beginMutation(setIsConfirmingPayment)) return;
    try {
      const saved = await updateRequestStatus(activeRequest.id, 'pagamento_confirmado', {
        agreedValue: confirmedAgreedValue,
        notes: notesInput,
        paymentReceivedAt: new Date().toISOString()
      });
      if (saved) {
        setDraftStatus('pagamento_confirmado');
        setAgreedValueInput(confirmedAgreedValue);
        setMoneyDisplay(confirmedAgreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        clearRequestDrafts(activeRequest.id);
        showToast("Pagamento marcado como recebido! O botão de Emitir Liberação está disponível.");
        setShowPaymentConfirmation(false);
      }
    } catch (err: any) {
      const isConflict = Boolean(
        err?.isConflict ||
        err?.code === 'CONCURRENCY_CONFLICT' ||
        /outra aba|foi alterada|recarregue/i.test(err?.message || '')
      );
      if (isConflict) setConcurrencyConflict(true);
      showToast(err?.message || "Erro ao confirmar pagamento. As alterações foram preservadas.", isConflict ? 'warning' : 'error');
    } finally {
      endMutation(setIsConfirmingPayment);
    }
  };

  const handleCreateRelease = async (reviewConfirmed = false) => {
    if (!activeRequest) return;
    const existingRelease = releases.find(release => release.requestId === activeRequest.id);
    if (existingRelease) {
      setViewingReleaseDoc(existingRelease);
      return;
    }
    if (activeRequest.status !== 'pagamento_confirmado') {
      showToast('A liberação só pode ser emitida após a confirmação do pagamento.', 'warning');
      return;
    }
    // A trigger capture_payment_financial_snapshot recusa qualquer alteração de
    // valor depois do pagamento confirmado. Emitir com um valor editado no
    // campo estourava um erro cru de constraint no meio da emissão.
    const persistedAgreedValue = Number(activeRequest.agreedValue || 0);
    const typedAgreedValue = agreedValueInput === '' ? persistedAgreedValue : Number(agreedValueInput);
    if (Number.isFinite(typedAgreedValue) && typedAgreedValue !== persistedAgreedValue) {
      showToast('O valor acordado não pode mais ser alterado: o pagamento já foi confirmado. Recarregue a solicitação para emitir com o valor registrado.', 'warning');
      return;
    }
    const agreedValue = persistedAgreedValue;
    if (!agreedValue || agreedValue <= 0) {
      showToast('Informe o valor acordado antes de emitir a liberação.', 'warning');
      return;
    }
    if (agreedValue > 10000000) {
      showToast('O valor acordado não pode ultrapassar R$ 10.000.000,00.', 'warning');
      return;
    }
    const requestedSong = songs.find(song => song.id === activeRequest.songId);
    if (!requestedSong) {
      showToast('A música vinculada a esta solicitação não foi encontrada.', 'error');
      return;
    }
    // O cliente recebe a faixa completa junto com o termo; o banco também recusa sem ela.
    if (!requestedSong.originalAudioPath) {
      showToast('Envie a música completa pelo Player Studio antes de emitir o termo. Ela é entregue ao cliente junto com o termo e a letra.', 'warning');
      return;
    }

    const otherReleasesForSong = releases.filter(r => r.songId === activeRequest.songId && r.requestId !== activeRequest.id);
    const hasExclusiveReleaseForSong = otherReleasesForSong.some(r => isActiveExclusiveRelease(r));
    const hasAnyOtherReleaseForSong = otherReleasesForSong.some(r => !isReleaseExpired(r.releaseType, r.issueDate, r.expiresAt));

    if (hasExclusiveReleaseForSong) {
      showToast('Esta obra já possui uma liberação com cláusula de exclusividade emitida para outro interessado.', 'error');
      return;
    }

    const isExclusive = isExclusiveReleaseType(releaseTypeInput);
    if (isExclusive && hasAnyOtherReleaseForSong) {
      showToast('Não é possível conceder exclusividade para uma obra que já possui outras autorizações emitidas.', 'warning');
      return;
    }
    const shouldCloseSong = isExclusive && closeSongForRelease;
    if (isExclusive && !legalAcknowledged) {
      showToast('Confirme a revisão das condições da autorização exclusiva.', 'warning');
      return;
    }

    if (!profile.name?.trim() || !profile.cpf?.trim()) {
      showToast('Complete o nome civil e o CPF em Meu Perfil antes de emitir o termo de liberação.', 'warning');
      return;
    }

    if (!reviewConfirmed) {
      setReleaseReviewError('');
      setShowReleaseReview(true);
      return;
    }

    if (notesInput !== (activeRequest.notes || '')) {
      showToast('Salve as observações antes de emitir a liberação.', 'warning');
      setShowReleaseReview(false);
      return;
    }

    if (!beginMutation(setIsIssuingRelease)) return;
    let newDoc;
    try {
      newDoc = await issueRelease(activeRequest.id, {
      requestId: activeRequest.id,
      songId: activeRequest.songId,
      songTitle: activeRequest.songTitle,
      authors: requestedSong.authors,
      composerName: profile.name,
      composerCpf: profile.cpf,
      composerCityState: `${profile.city} - ${profile.state}`,
      buyerName: activeRequest.buyerName,
      buyerDocument: activeRequest.cpfCnpj,
      buyerCityState: activeRequest.buyerCityState,
      agreedValue,
      authorizedPurpose: activeRequest.purpose,
      releaseType: releaseTypeInput,
      issueDate: new Date().toLocaleDateString('en-CA'),
      additionalConditions: getReleaseConditions(isExclusive),
      digitalSignature: `${profile.name} (declaração eletrônica emitida pela conta autenticada)`
      }, shouldCloseSong, activeRequest.updatedAt);

      showToast(shouldCloseSong
        ? "Liberação emitida! A música foi fechada para novas propostas e o intérprete recebe por e-mail o termo, a música completa e a letra."
        : "Liberação emitida! O intérprete recebe por e-mail o termo, a música completa e a letra.");

      clearRequestDrafts(activeRequest.id);
      setDraftStatus('liberacao_enviada');
      setShowReleaseReview(false);
      setViewingReleaseDoc(newDoc);
      setArchiveError('');
      setArchivingRelease(true);
      try {
        const archived = await retryReleaseArchive(newDoc);
        setViewingReleaseDoc(archived);
      } catch (archiveFailure: any) {
        setArchiveError(archiveFailure?.message || 'O PDF não pôde ser arquivado.');
      } finally {
        setArchivingRelease(false);
      }
    } catch (error: any) {
      console.error('Erro ao emitir liberação:', error);
      const msg = error?.message || error?.error_description || (typeof error === 'string' ? error : 'Não foi possível emitir a liberação.');
      if (/outra aba|foi alterada|recarregue/i.test(msg)) setConcurrencyConflict(true);
      setReleaseReviewError(msg);
      showToast(msg, 'error');
      return;
    } finally {
      endMutation(setIsIssuingRelease);
    }
  };

  const handleRetryArchive = async (document: ReleaseDocument) => {
    setArchivingRelease(true);
    setArchiveError('');
    try {
      const archived = await retryReleaseArchive(document);
      setViewingReleaseDoc(current => current?.id === archived.id ? archived : current);
      showToast('PDF arquivado com sucesso.');
    } catch (error: any) {
      setArchiveError(error?.message || 'Não foi possível arquivar o PDF.');
    } finally { setArchivingRelease(false); }
  };

  const handleSimulateWhatsApp = (phone: string, songTitle: string, buyerName?: string) => {
    const normalizedPhone = normalizeBrazilianWhatsapp(phone);
    if (!normalizedPhone) {
      showToast('O WhatsApp informado nesta solicitação é inválido.', 'warning');
      return;
    }
    const greeting = buyerName ? `Olá, ${buyerName}!` : 'Olá!';
    const msg = encodeURIComponent(`${greeting} Sou ${profile.stageName || profile.name}, compositor cadastrado no Mercado do Compositor. Recebi sua solicitação para a música "${songTitle}". Vamos conversar sobre os detalhes da gravação?`);
    window.open(`https://wa.me/${normalizedPhone}?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  const handleEmail = (email: string, songTitle: string, buyerName?: string) => {
    const subject = encodeURIComponent(`Mercado do Compositor — Solicitação da música "${songTitle}"`);
    const body = encodeURIComponent(`Olá ${buyerName || ''},\n\nRecebi sua solicitação de gravação para a música "${songTitle}".\nEstou à disposição para combinarmos os detalhes e valores para emissão da autorização.\n\nAtenciosamente,\n${profile.stageName || profile.name}`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  const handleCopyReleaseValidationLink = async (doc: ReleaseDocument) => {
    const validationUrl = `${window.location.origin}/validar-documento?codigo=${doc.documentCode}`;
    try {
      // `navigator` do react-router sombreia o global neste componente (linha 43).
      await window.navigator.clipboard.writeText(validationUrl);
      showToast('Link oficial de autenticidade copiado para a área de transferência!');
    } catch {
      showToast('Não foi possível copiar o link automaticamente.', 'error');
    }
  };

  const handleResendDelivery = async (doc: ReleaseDocument) => {
    if (sendingDeliveryId) return;
    const isResend = Boolean(deliveryStatuses[doc.id]);
    setSendingDeliveryId(doc.id);
    try {
      const result = await resendReleaseDelivery(doc.id);
      setDeliveryStatuses(current => ({
        ...current,
        [doc.id]: {
          ...(current[doc.id] || { releaseId: doc.id, emailQueuedAt: null, lastSentAt: null, emailFailedAt: null, emailLastError: null, views: 0, audioDownloads: 0, lyricsDownloads: 0, firstAudioDownloadAt: null, lastAccessAt: null }),
          expiresAt: result.expiresAt,
          emailStatus: result.emailStatus,
          emailQueuedAt: result.queuedAt,
          lastSentAt: result.lastSentAt,
        },
      }));
      showToast(isResend
        ? `Reenvio colocado na fila para ${doc.buyerName}. O novo link vale por 30 dias e o anterior deixou de funcionar.`
        : `Entrega colocada na fila para ${doc.buyerName}. O link seguro vale por 30 dias.`);
    } catch (error) {
      showToast(getFriendlyErrorMessage(error, 'Não foi possível reenviar a entrega.'), 'error');
    } finally {
      setSendingDeliveryId(null);
    }
  };

  const daysSince = (value?: string) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : Math.floor((Date.now() - time) / 86_400_000);
  };

  const describeIdleTime = (req: InterestRequest) => {
    if (req.status === 'liberacao_enviada' || req.status === 'arquivada') return null;
    const days = daysSince(req.updatedAt || req.createdAt);
    if (days < 1) return { text: 'Atualizada hoje', tone: 'text-slate-500' };
    const text = req.status === 'nova'
      ? `Cliente aguarda resposta há ${days} ${days === 1 ? 'dia' : 'dias'}`
      : `Há ${days} ${days === 1 ? 'dia' : 'dias'} sem atualização`;
    return { text, tone: days >= 3 ? 'text-red-300 font-semibold' : 'text-amber-300' };
  };

  const getRowAction = (req: InterestRequest) => {
    const release = releases.find(item => item.requestId === req.id);
    if (release && deliveryStatuses[release.id]?.emailStatus === 'failed') return { label: 'Reenviar entrega', release, urgent: true };
    switch (req.status) {
      case 'nova': return { label: 'Responder', urgent: true };
      case 'em_negociacao': return { label: 'Registrar acordo', urgent: false };
      case 'pagamento_pendente': return { label: 'Confirmar recebimento', urgent: false };
      case 'pagamento_confirmado': return { label: 'Emitir termo', urgent: true };
      case 'liberacao_enviada': return { label: 'Ver entrega', urgent: false };
      default: return { label: 'Ver detalhes', urgent: false };
    }
  };

  const openRequest = (req: InterestRequest) => {
    navigate(`/dashboard/solicitacoes/${req.id}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`);
  };

  const groupCount = (group: keyof typeof REQUEST_GROUP_STATUSES) =>
    REQUEST_GROUP_STATUSES[group].reduce((sum, status) => sum + Number(statusCounts[status] || 0), 0);

  const brl = (value?: number | null) => `R$ ${formatBrlAmount(Number(value || 0))}`;

  const describeHistoryItem = (item: RequestHistoryItem) => {
    const who = item.actorId === currentUserId ? 'Você' : 'A administração da plataforma';
    const valueChanged = item.previousAgreedValue !== item.newAgreedValue;
    if (item.previousStatus !== item.newStatus) {
      if (item.newStatus === 'liberacao_enviada') return `${who} emitiu o termo de liberação.`;
      if (item.newStatus === 'pagamento_confirmado') return `${who} confirmou o recebimento de ${brl(item.newAgreedValue)}.`;
      if (item.newStatus === 'pagamento_pendente' && item.newAgreedValue) return `${who} registrou o acordo de ${brl(item.newAgreedValue)} (${statusLabels[item.previousStatus]} → ${statusLabels[item.newStatus]}).`;
      if (item.newStatus === 'arquivada') return `${who} arquivou a solicitação.`;
      if (item.previousStatus === 'arquivada') return `${who} reabriu a solicitação.`;
      return `${who} mudou de ${statusLabels[item.previousStatus]} para ${statusLabels[item.newStatus]}${valueChanged && item.newAgreedValue ? ` e registrou o valor de ${brl(item.newAgreedValue)}` : ''}.`;
    }
    if (valueChanged) {
      if (!item.newAgreedValue) return `${who} removeu o valor de ${brl(item.previousAgreedValue)}.`;
      if (!item.previousAgreedValue) return `${who} registrou o valor de ${brl(item.newAgreedValue)}.`;
      return `${who} alterou o valor de ${brl(item.previousAgreedValue)} para ${brl(item.newAgreedValue)}.`;
    }
    return `${who} atualizou a solicitação.`;
  };

  const getTimelineStep = (status: RequestStatus) => {
    switch (status) {
      case 'nova': return 1;
      case 'em_negociacao': return 2;
      case 'pagamento_pendente': return 3;
      case 'pagamento_confirmado': return 4;
      case 'liberacao_enviada': return 5;
      default: return 0;
    }
  };

  const timelineSteps = [
    { step: 1, label: 'Proposta Recebida', icon: MessageSquare },
    { step: 2, label: 'Em Negociação', icon: Phone },
    { step: 3, label: 'Pagamento Pendente', icon: Clock },
    { step: 4, label: 'Pagamento Confirmado', icon: CheckCircle2 },
    { step: 5, label: 'Liberação Emitida', icon: FileCheck },
  ];

  if (requestId && (authLoading || detailLoading)) {
    return (
      <div role="status" className="rounded-3xl border border-slate-800 bg-slate-900 p-12 text-center text-sm text-slate-300 animate-pulse space-y-4">
        <LoaderCircle className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
        <p className="text-slate-300 font-semibold">Carregando detalhes da solicitação...</p>
      </div>
    );
  }

  if (requestId && !activeRequest) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-10 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
        <h1 className="text-lg font-bold text-white">{detailError ? 'Falha ao carregar solicitação' : 'Solicitação não encontrada'}</h1>
        <p className="mt-2 text-sm text-slate-400">{detailError ? 'Tente atualizar a página para carregar os dados.' : 'O link pode estar incorreto ou a solicitação não pertence a esta conta.'}</p>
        <Link to="/dashboard/solicitacoes" className="mt-5 inline-flex rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950">Voltar para solicitações</Link>
      </div>
    );
  }

  // ==========================================
  // VIEW 1: DEDICATED REQUEST DETAIL FULL PAGE
  // ==========================================
  if (activeRequest) {
    const song = songs.find(s => s.id === activeRequest.songId);
    const existingRelease = releases.find(r => r.requestId === activeRequest.id);
    const deliveryStatus = existingRelease ? deliveryStatuses[existingRelease.id] : undefined;
    const otherReleasesForSong = releases.filter(r => r.songId === activeRequest.songId && r.requestId !== activeRequest.id);
    const hasExclusiveReleaseForSong = otherReleasesForSong.some(r => isActiveExclusiveRelease(r));
    const hasAnyOtherReleaseForSong = otherReleasesForSong.some(r => !isReleaseExpired(r.releaseType, r.issueDate, r.expiresAt));

    return (
      <div className="space-y-6 animate-fadeIn pb-12">
        {/* Toast Feedback */}
        {toastMessage && (
          <div role={toastMessage.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`fixed top-20 right-5 z-[130] max-w-sm font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs animate-fadeIn ${toastMessage.type === 'success' ? 'bg-emerald-500 text-slate-950' : toastMessage.type === 'error' ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-950'}`}>
            {toastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <span className="flex-1">{toastMessage.message}</span>
            <button type="button" onClick={() => setToastMessage(null)} aria-label="Fechar aviso" className="p-1 hover:bg-emerald-600/20 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {concurrencyConflict && (
          <div role="alert" className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-900 dark:text-amber-200 shadow-xs animate-fadeIn">
            <strong className="block text-amber-950 dark:text-amber-100 font-bold">Esta solicitação foi alterada em outra aba ou sessão.</strong>
            <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">As observações digitadas permanecem salvas nesta sessão. Carregue a versão atual para consultar os dados mais recentes antes de tentar novamente, preservando seu rascunho.</p>
            <button type="button" onClick={handleReloadCurrentVersion} className="mt-3 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 transition">Carregar versão atual</button>
          </div>
        )}

        {showPaymentConfirmation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !isConfirmingPayment) setShowPaymentConfirmation(false); }}>
            <div ref={paymentDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="confirm-payment-title" className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
              <h2 id="confirm-payment-title" className="text-lg font-bold text-white">Confirmar recebimento</h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm">
                <div><dt className="text-xs text-slate-500">Valor recebido</dt><dd className="font-mono font-bold text-emerald-400">R$ {formatBrlAmount(Number(agreedValueInput || 0))}</dd></div>
                <div><dt className="text-xs text-slate-500">Data do registro</dt><dd className="font-semibold text-white">{new Date().toLocaleDateString('pt-BR')}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-slate-500">Pagador</dt><dd className="font-semibold text-white">{activeRequest.buyerName}</dd></div>
              </dl>
              <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                <strong className="block">A plataforma não recebe nem processa este pagamento.</strong>
                Confirme só depois de conferir o valor na sua conta (Pix, transferência ou outro meio combinado). Esta confirmação libera a emissão do termo e não pode ser desfeita.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" disabled={isConfirmingPayment} onClick={() => setShowPaymentConfirmation(false)} className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Cancelar</button>
                <button data-autofocus type="button" disabled={isConfirmingPayment} onClick={handleMarkPaymentReceived} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{isConfirmingPayment ? 'Confirmando...' : 'Sim, confirmar'}</button>
              </div>
            </div>
          </div>
        )}

        {showArchiveConfirmation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !isSaving) setShowArchiveConfirmation(false); }}>
            <div ref={archiveDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="confirm-archive-title" className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-500/10 p-2 text-amber-400">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="confirm-archive-title" className="text-lg font-bold text-white">Arquivar solicitação?</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    A negociação da música <strong className="text-amber-400">“{activeRequest.songTitle}”</strong> com <strong className="text-white break-all text-right">{activeRequest.buyerName}</strong> será arquivada. Você poderá reativá-la depois se necessário.
                  </p>
                  <p className={`mt-2 text-xs ${archiveReason && archiveReason !== 'Outro motivo' ? 'text-slate-400' : 'text-amber-300'}`}>
                    {archiveReason && archiveReason !== 'Outro motivo' ? `Motivo: ${archiveReason}.` : 'Nenhum motivo informado. Recomendamos escolher um antes de arquivar.'}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setShowArchiveConfirmation(false)}
                  className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    setShowArchiveConfirmation(false);
                    void executeSaveDetails();
                  }}
                  className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  Sim, arquivar
                </button>
              </div>
            </div>
          </div>
        )}

        {showReleaseReview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) closeReviewModal(); }}>
            <div ref={reviewDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="release-review-title" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-amber-500/30 bg-slate-900 p-6 shadow-2xl">
              <h2 id="release-review-title" className="text-lg font-bold text-white">Revisão final antes da emissão</h2>
              <p className="mt-1 text-xs text-slate-400">Confira os dados. A emissão cria um documento definitivo.</p>
              <dl className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">Comprador</dt><dd className="font-semibold text-white break-words">{activeRequest.buyerName}</dd></div>
                <div><dt className="text-xs text-slate-500">Música</dt><dd className="font-semibold text-white break-words">{activeRequest.songTitle}</dd></div>
                <div><dt className="text-xs text-slate-500">Valor quitado</dt><dd className="font-semibold text-emerald-400">R$ {Number(agreedValueInput || activeRequest.agreedValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</dd></div>
                <div><dt className="text-xs text-slate-500">Tipo</dt><dd className="font-semibold text-amber-400">{releaseTypeInput}</dd></div>
              </dl>
              {releaseReviewError && (
                <div role="alert" className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-xs leading-relaxed text-red-200">
                  <strong className="block text-red-300">O termo não foi emitido.</strong>
                  {releaseReviewError}
                  {/CPF|nome/i.test(releaseReviewError) && (
                    <Link to="/dashboard/perfil" className="mt-2 inline-block font-bold text-amber-300 underline">Completar Meu Perfil</Link>
                  )}
                </div>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" disabled={isIssuingRelease} onClick={closeReviewModal} className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Voltar e corrigir</button>
                <button data-autofocus type="button" disabled={isIssuingRelease} onClick={() => void handleCreateRelease(true)} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-50">{isIssuingRelease ? 'Emitindo...' : 'Confirmar e emitir'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Top Breadcrumb / Back Button */}
        <div className="flex items-center justify-between">
          <Link
            to={`/dashboard/solicitacoes${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-800 transition"
          >
            <ArrowLeft className="w-4 h-4 text-amber-400" />
            <span>Voltar para todas as solicitações</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/30">
              {getRequestCode(activeRequest.id)}
            </span>
            <span className={`text-xs font-bold uppercase px-3 py-1.5 rounded-xl border ${
              activeRequest.status === 'pagamento_confirmado' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
              activeRequest.status === 'em_negociacao' ? 'bg-orange-500/20 text-orange-300 border-orange-500/40' :
              activeRequest.status === 'pagamento_pendente' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' :
              activeRequest.status === 'liberacao_enviada' ? (deliveryStatus?.audioDownloads ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-blue-500/20 text-blue-300 border-blue-500/40') :
              'bg-slate-800 text-slate-300 border-slate-700'
            }`}>
              {activeRequest.status === 'liberacao_enviada'
                ? (deliveryStatus?.audioDownloads ? 'Liberação entregue' : 'Liberação emitida')
                : statusLabels[activeRequest.status]}
            </span>
          </div>
        </div>

        {/* Main Title & Timeline Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <span className="text-xs text-slate-400 block font-medium">Detalhes da Proposta de Gravação</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                {activeRequest.buyerName}
                {activeRequest.buyerStageName && (
                  <span className="text-amber-400 font-medium text-lg sm:text-xl ml-2">
                    ({activeRequest.buyerStageName})
                  </span>
                )}
              </h1>
            </div>

            {/* Direct Contact Buttons Header */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleSimulateWhatsApp(activeRequest.buyerWhatsapp, activeRequest.songTitle, activeRequest.buyerName)}
                className="flex-1 sm:flex-none justify-center px-4 sm:px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
              >
                <Phone className="w-4 h-4" />
                <span>Conversar no WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => handleEmail(activeRequest.buyerEmail, activeRequest.songTitle, activeRequest.buyerName)}
                className="flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition"
              >
                <Mail className="w-4 h-4 text-amber-400" />
                <span>E-mail</span>
              </button>
            </div>
          </div>

          {/* Stepper / Timeline Component */}
          {activeRequest.status !== 'arquivada' && (
            <div className="space-y-3">
              <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider block">
                Progresso da Negociação
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3">
                {timelineSteps.map(stepItem => {
                  const currentStepNum = getTimelineStep(activeRequest.status);
                  const isDone = currentStepNum >= stepItem.step;
                  const isCurrent = currentStepNum === stepItem.step;
                  const IconComponent = stepItem.icon;

                  return (
                    <div
                      key={stepItem.step}
                      className={`p-3 rounded-2xl border transition flex flex-col items-center text-center gap-2 ${
                        isCurrent
                          ? 'bg-amber-500/10 border-amber-500 text-amber-400 ring-2 ring-amber-500/20'
                          : isDone
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-slate-950/60 border-slate-800 text-slate-500'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isCurrent ? 'bg-amber-500 text-slate-950' : isDone ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-600'
                      }`}>
                        {isDone && !isCurrent ? <Check className="w-4 h-4" /> : <IconComponent className="w-4 h-4" />}
                      </div>
                      <span className={`text-xs font-semibold ${isCurrent ? 'text-white' : isDone ? 'text-slate-200' : 'text-slate-500'}`}>
                        {stepItem.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {(() => {
          const value = Number(agreedValueInput || activeRequest.agreedValue || 0);
          const needsProfile = !profile.name?.trim() || !profile.cpf?.trim();
          const needsAudio = Boolean(song) && !song?.originalAudioPath;
          const primaryClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50';
          let title = ''; let detail = ''; let action: React.ReactNode = null;
          if (activeRequest.status === 'nova') {
            title = 'Próxima ação: responda o interessado';
            detail = 'Fale com ele pelo WhatsApp ou e-mail. Ao começar a conversa, marque a negociação como iniciada.';
            action = <button type="button" disabled={isMutating} onClick={() => void executeSaveDetails('em_negociacao')} className={primaryClass}>Iniciar negociação</button>;
          } else if (activeRequest.status === 'em_negociacao') {
            if (agreedValueInput === '' || moneyError) {
              title = 'Próxima ação: informe o valor combinado';
              detail = 'Digite o valor acordado com o interessado no campo "Valor acordado", logo abaixo.';
              action = <button type="button" onClick={() => document.getElementById('agreed-value')?.focus()} className={primaryClass}>Informar valor</button>;
            } else {
              title = `Próxima ação: confirme o acordo de ${brl(value)}`;
              detail = 'Depois disso, você poderá registrar o recebimento do pagamento.';
              action = <button type="button" disabled={isMutating} onClick={() => void executeSaveDetails('pagamento_pendente')} className={primaryClass}>Registrar acordo</button>;
            }
          } else if (activeRequest.status === 'pagamento_pendente') {
            title = `Próxima ação: confirme o recebimento de ${brl(value)}`;
            detail = 'A plataforma não recebe nem processa o pagamento. Confirme só depois de ver o valor na sua conta.';
            action = <button type="button" disabled={isMutating || !value} onClick={() => setShowPaymentConfirmation(true)} className={primaryClass}>Confirmar recebimento</button>;
          } else if (activeRequest.status === 'pagamento_confirmado' && !existingRelease) {
            if (needsProfile) {
              title = 'Próxima ação: complete seu perfil';
              detail = 'O termo exige seu nome civil e CPF.';
              action = <Link to="/dashboard/perfil" className={primaryClass}>Completar Meu Perfil</Link>;
            } else if (needsAudio && song) {
              title = 'Próxima ação: envie a música completa';
              detail = 'O cliente recebe a música completa e a letra junto com o termo.';
              action = <Link to={`/dashboard/musicas?studio=${song.id}`} className={primaryClass}>Enviar música completa</Link>;
            } else {
              title = 'Próxima ação: emita o termo de liberação';
              detail = 'Revise o tipo de autorização abaixo. O cliente recebe por e-mail o termo, a música completa e a letra.';
              action = <button type="button" disabled={isMutating || hasExclusiveReleaseForSong || (isExclusiveReleaseType(releaseTypeInput) && (hasAnyOtherReleaseForSong || !legalAcknowledged))} onClick={() => void handleCreateRelease(false)} className={primaryClass}>{isIssuingRelease ? 'Emitindo...' : 'Emitir termo'}</button>;
            }
          } else if (existingRelease) {
            if (deliveryStatus?.emailStatus === 'failed') {
              title = 'Próxima ação: reenvie a entrega';
              detail = 'O e-mail com o termo, a música e a letra não chegou ao cliente. Confira o e-mail dele e reenvie.';
              action = <button type="button" disabled={Boolean(sendingDeliveryId)} onClick={() => void handleResendDelivery(existingRelease)} className={primaryClass}>Reenviar entrega</button>;
            } else {
              title = 'Negociação concluída';
              detail = `Termo ${existingRelease.documentCode} emitido. Acompanhe abaixo se o cliente abriu a entrega e baixou a música.`;
              action = <button type="button" onClick={() => setViewingReleaseDoc(existingRelease)} className={primaryClass}>Ver termo</button>;
            }
          } else if (activeRequest.status === 'arquivada') {
            title = 'Solicitação arquivada';
            detail = activeRequest.archiveReason ? `Motivo: ${activeRequest.archiveReason}.` : 'Nenhum motivo foi informado.';
            action = <button type="button" disabled={isMutating} onClick={() => void executeSaveDetails('nova')} className={primaryClass}>Reabrir solicitação</button>;
          }
          if (!title) return null;
          // Antes do pagamento confirmado, as exigências do termo aparecem só como aviso;
          // depois, viram a própria próxima ação (com o botão).
          const earlyStage = ['nova', 'em_negociacao', 'pagamento_pendente'].includes(activeRequest.status);
          const pending = earlyStage ? [needsProfile && 'seu nome civil e CPF no perfil', needsAudio && 'a música completa pelo Player Studio'].filter(Boolean) : [];
          return (
            <section aria-label="Próxima ação" className="flex flex-col gap-4 rounded-3xl border-2 border-amber-500/50 bg-amber-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{detail}</p>
                {pending.length > 0 && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Antes de emitir o termo, você vai precisar de {pending.join(' e ')}.</span>
                  </p>
                )}
              </div>
              <div className="shrink-0">{action}</div>
            </section>
          );
        })()}

        {/* 2-Column Responsive Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* LEFT COLUMN: Song & Buyer Info (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">

            {/* Song Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <span className="text-[11px] uppercase font-bold text-amber-400 tracking-wider block">
                Composição Solicitada
              </span>

              <div className="flex items-center gap-4">
                <img
                  src={song?.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80'}
                  alt={activeRequest.songTitle}
                  className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shadow-md shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    {song?.genre || 'Composição'}
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1 truncate">
                    “{activeRequest.songTitle}”
                  </h3>
                  <p className="text-xs text-slate-400 truncate">Autoria: {song?.authors || profile.stageName}</p>
                </div>
              </div>

              {song && (
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>Valor de Referência:</span>
                  <strong className="text-amber-300">
                    {song.valueType === 'suggested' && song.suggestedValue
                      ? `R$ ${song.suggestedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : 'Sob consulta'}
                  </strong>
                </div>
              )}
            </div>

            {/* Buyer Contact Details Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <span className="text-[11px] uppercase font-bold text-amber-400 tracking-wider block">
                Dados do Intérprete / Comprador
              </span>

              <div className="space-y-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex flex-wrap justify-between items-center gap-2 break-all">
                  <span className="text-slate-400">Nome Completo:</span>
                  <strong className="text-white break-all text-right">{activeRequest.buyerName}</strong>
                </div>

                {activeRequest.buyerStageName && (
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex flex-wrap justify-between items-center gap-2 break-all">
                    <span className="text-slate-400">Nome Artístico:</span>
                    <strong className="text-amber-300 break-all text-right">{activeRequest.buyerStageName}</strong>
                  </div>
                )}

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex flex-wrap justify-between items-center gap-2 break-all">
                  <span className="text-slate-400">CPF / CNPJ:</span>
                  <span className="flex items-center gap-2">
                    <strong className="text-slate-200 font-mono">{showBuyerDocument ? formatCpfCnpj(activeRequest.cpfCnpj) : maskDocument(activeRequest.cpfCnpj)}</strong>
                    <button type="button" onClick={() => setShowBuyerDocument(value => !value)} className="text-[10px] font-bold text-amber-400 hover:text-amber-300">
                      {showBuyerDocument ? 'Ocultar dados' : 'Revelar dados'}
                    </button>
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex flex-wrap justify-between items-center gap-2 break-all">
                  <span className="text-slate-400">WhatsApp:</span>
                  <strong className="text-emerald-400 font-mono">{showBuyerDocument ? activeRequest.buyerWhatsapp : maskPhone(activeRequest.buyerWhatsapp)}</strong>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex flex-wrap justify-between items-center gap-2 break-all">
                  <span className="text-slate-400">E-mail:</span>
                  <strong className="text-slate-200 truncate max-w-[200px]">{showBuyerDocument ? activeRequest.buyerEmail : maskEmail(activeRequest.buyerEmail)}</strong>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex flex-wrap justify-between items-center gap-2 break-all">
                  <span className="text-slate-400">Cidade / UF:</span>
                  <strong className="text-slate-200">{activeRequest.buyerCityState}</strong>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex flex-wrap justify-between items-center gap-2 break-all">
                  <span className="text-slate-400">Data de Envio:</span>
                  <strong className="text-slate-200">{formatDate(activeRequest.createdAt)}</strong>
                </div>

                {activeRequest.consentAcceptedAt ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-emerald-200">
                    <div className="flex items-center gap-2 font-semibold">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      <span>Consentimento registrado</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-emerald-200/70">
                      Aceite registrado pelo servidor em {new Date(activeRequest.consentAcceptedAt).toLocaleString('pt-BR')}
                      {activeRequest.consentPolicyVersion ? ` · Política versão ${activeRequest.consentPolicyVersion}` : ''}.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-amber-200">
                    <div className="flex items-center gap-2 font-semibold">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Evidência de consentimento indisponível</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-amber-200/70">
                      Esta solicitação é anterior ao registro de aceite. O sistema não atribui consentimento retroativamente.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Purpose & Proposal Message */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <span className="text-[11px] uppercase font-bold text-amber-400 tracking-wider block">
                Projeto & Mensagem
              </span>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1 font-semibold">Finalidade Declarada:</span>
                  <p className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-slate-200 font-medium leading-relaxed">
                    {activeRequest.purpose}
                  </p>
                </div>

                {activeRequest.message && (
                  <div>
                    <span className="text-slate-400 block mb-1 font-semibold">Mensagem do Interessado:</span>
                    <p className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-slate-300 italic leading-relaxed whitespace-pre-line">
                      “{activeRequest.message}”
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Negotiation, Payments, Release Configuration (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">

            {/* Negotiation & Agreement Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Negociação e pagamento</h3>
                  <p className="text-xs text-slate-400">Valor combinado, etapa e suas anotações. A plataforma não recebe nem processa o pagamento.</p>
                </div>
              </div>

              {hasExclusiveReleaseForSong && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="text-red-300 font-bold block">Obra Liberada com Exclusividade para Outro Intérprete</strong>
                    <p className="leading-relaxed">
                      Esta música já possui uma liberação emitida com cláusula de exclusividade para outra solicitação. Novas autorizações e recebimentos estão bloqueados para esta composição.
                    </p>
                  </div>
                </div>
              )}

              {restorableDraft && <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                Há um rascunho salvo nesta sessão.
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={restoreDraft} className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-slate-950">Restaurar rascunho</button>
                  <button type="button" onClick={() => { clearRequestDrafts(activeRequest.id); setRestorableDraft(false); }} className="rounded-lg border border-slate-600 px-3 py-2">Descartar rascunho</button>
                </div>
              </div>}

              {/* Status and Value Grid */}
              {existingRelease ? (
                <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs sm:grid-cols-2">
                  <div><dt className="text-slate-500">Etapa</dt><dd className="mt-0.5 font-semibold text-white">{statusLabels[activeRequest.status]}</dd></div>
                  <div><dt className="text-slate-500">Valor acordado</dt><dd className="mt-0.5 font-mono font-bold text-emerald-400">{brl(existingRelease.agreedValue)}</dd></div>
                  <div><dt className="text-slate-500">Pagamento confirmado em</dt><dd className="mt-0.5 text-white">{activeRequest.paymentReceivedAt ? formatDate(activeRequest.paymentReceivedAt) : 'não registrado'}</dd></div>
                  <div><dt className="text-slate-500">Termo</dt><dd className="mt-0.5 text-white"><span className="font-mono text-amber-400">{existingRelease.documentCode}</span> · emitido em {new Date(`${existingRelease.issueDate}T12:00:00`).toLocaleDateString('pt-BR')}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-slate-500">Tipo de autorização</dt><dd className="mt-0.5 text-white">{existingRelease.releaseType}</dd></div>
                </dl>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label htmlFor="request-status" className="block text-slate-400 mb-1.5 font-semibold">Etapa (ajuste manual)</label>
                  <select
                    id="request-status"
                    value={draftStatus}
                    onChange={e => handleDraftStatusChange(e.target.value as RequestStatus)}
                    disabled={isMutating || activeRequest.status === 'liberacao_enviada'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-3 text-white font-medium focus:outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {getSelectableStatuses(activeRequest.status).map(status => {
                      const isIncompatible = hasExclusiveReleaseForSong && (status === 'pagamento_pendente' || status === 'pagamento_confirmado');
                      return (
                        <option key={status} value={status} disabled={isIncompatible}>
                          {statusLabels[status]}{isIncompatible ? ' (Indisponível: exclusividade emitida)' : ''}
                        </option>
                      );
                    })}
                  </select>
                  {draftStatus === 'pagamento_pendente' && activeRequest.status !== 'pagamento_pendente' && (
                    <p className="text-[11px] text-amber-400/90 mt-1.5 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Salve as alterações para registrar o status como Pagamento Pendente e liberar a confirmação de recebimento.</span>
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="agreed-value" className="block text-slate-400 mb-1.5 font-semibold">Valor acordado (R$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-500 font-bold text-xs">R$</span>
                    <input
                      id="agreed-value"
                      type="text"
                      inputMode="decimal"
                      aria-invalid={Boolean(moneyError)}
                      aria-describedby={moneyError ? "agreed-value-error" : undefined}
                      value={existingRelease ? existingRelease.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : moneyDisplay}
                      onChange={e => handleMoneyTextChange(e.target.value)}
                      onBlur={handleMoneyBlur}
                      disabled={isMutating || activeRequest.status === 'liberacao_enviada' || Boolean(existingRelease)}
                      placeholder="Ex.: 3.500,00"
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-white font-mono font-bold text-sm focus:outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                  {moneyError && <p id="agreed-value-error" role="alert" className="mt-1 text-xs text-red-300">{moneyError}</p>}
                  {existingRelease ? (
                    <span className="text-[11px] text-blue-300 font-semibold mt-1 block">
                      Valor fixado no termo {existingRelease.documentCode}.
                    </span>
                  ) : agreedValueInput !== '' && (
                    <span className="text-[11px] text-emerald-400 font-semibold mt-1 block">
                      = R$ {Number(agreedValueInput).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>
              )}

              {/* Archive reason helper */}
              {draftStatus === 'arquivada' && (
                <div className="space-y-2 text-xs animate-fadeIn bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-400 font-semibold">Motivo do arquivamento (recomendado)</label>
                    {archiveReason !== (activeRequest.archiveReason || '') && (
                      <span className="text-[10px] text-amber-400/90 font-medium">
                        Alteração não salva
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">Opcional, mas ajuda você a entender por que as negociações não avançam.</p>
                  <select
                    value={['Valor não acordado', 'Interessado não respondeu', 'Obra já liberada para outro intérprete', 'Desistência mútua', 'Outro motivo'].includes(archiveReason) ? archiveReason : (archiveReason ? 'Outro motivo' : '')}
                    onChange={e => handleArchiveReasonChange(e.target.value)}
                    disabled={isMutating}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-300 focus:outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Selecione um motivo...</option>
                    <option value="Valor não acordado">Valor proposto não aceito</option>
                    <option value="Interessado não respondeu">Interessado não deu continuidade</option>
                    <option value="Obra já liberada para outro intérprete">Obra já liberada com exclusividade para outro artista</option>
                    <option value="Desistência mútua">Desistência mútua das partes</option>
                    <option value="Outro motivo">Outro motivo</option>
                  </select>
                  {(archiveReason === 'Outro motivo' || (archiveReason && !['Valor não acordado', 'Interessado não respondeu', 'Obra já liberada para outro intérprete', 'Desistência mútua'].includes(archiveReason))) && (
                    <input
                      type="text"
                      maxLength={160}
                      value={archiveReason === 'Outro motivo' ? '' : archiveReason}
                      onChange={e => handleArchiveReasonChange(e.target.value || 'Outro motivo')}
                      placeholder="Descreva o motivo do arquivamento (até 160 caracteres)..."
                      disabled={isMutating}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500 text-xs placeholder:text-slate-500 disabled:opacity-60"
                    />
                  )}
                </div>
              )}

              {/* Internal Notes */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs text-slate-400 font-semibold">
                    Observações Internas (Visíveis apenas para você)
                  </label>
                  {notesInput !== (activeRequest.notes || '') && (
                    <span className="text-[10px] text-amber-400/90 font-medium">
                      Alteração não salva (preservada)
                    </span>
                  )}
                </div>
                <textarea
                  id="request-notes"
                  rows={4}
                  maxLength={500}
                  value={notesInput}
                  onChange={e => handleNotesChange(e.target.value)}
                  disabled={isMutating}
                  placeholder="Ex: Conversa realizada por WhatsApp em 28/08. Pagamento de R$ 3.500 recebido na conta do compositor via PIX."
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-xs text-white focus:outline-none focus:border-amber-500 leading-relaxed disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <section aria-labelledby="request-history-title" className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <h3 id="request-history-title" className="flex items-center gap-2 text-sm font-bold text-white"><Clock className="h-4 w-4 text-amber-400" />Histórico de mudanças</h3>
                {historyRequestId !== activeRequest.id || historyLoading ? (
                  <p role="status" className="mt-3 text-xs text-slate-400">Carregando histórico...</p>
                ) : historyError ? (
                  <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{historyError}</p>
                ) : requestHistory.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">Nenhuma mudança de status ou valor registrada desde a ativação do histórico.</p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {requestHistory.map(item => (
                      <li key={item.id} className="border-l-2 border-slate-700 pl-3 text-xs text-slate-300">
                        <p>{describeHistoryItem(item)}</p>
                        <time className="mt-1 block text-[10px] text-slate-500" dateTime={item.changedAt}>{formatDate(item.changedAt)}</time>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* Release Configuration Section */}
              {activeRequest.status === 'pagamento_confirmado' && !existingRelease && (
                <div className="bg-slate-950 p-5 rounded-2xl border border-amber-500/30 space-y-4 animate-fadeIn text-xs">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <ShieldCheck className="w-5 h-5" />
                    <span>Configuração do Termo de Autorização Fonográfica</span>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1.5 font-semibold">Tipo de Autorização / Licença:</label>
                    <select
                      id="release-type"
                      value={releaseTypeInput}
                      onChange={e => {
                        setReleaseTypeInput(e.target.value);
                        setLegalAcknowledged(false);
                        setCloseSongForRelease(false);
                      }}
                      disabled={isMutating || Boolean(existingRelease)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {RELEASE_TYPE_OPTIONS.map((type, index) => (
                        <option key={type} value={type} disabled={index > 0 && hasAnyOtherReleaseForSong}>
                          {type}{index > 0 && hasAnyOtherReleaseForSong ? ' (Indisponível: obra possui outras liberações)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!existingRelease && isExclusiveReleaseType(releaseTypeInput) && (
                    <label className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-slate-300">
                      <input type="checkbox" checked={legalAcknowledged} onChange={e => setLegalAcknowledged(e.target.checked)} disabled={isMutating} className="mt-0.5" />
                      <span>Confirmo que revisei autoria, prazo, território e modalidades de uso. Este registro não substitui orientação jurídica independente.</span>
                    </label>
                  )}

                  {!existingRelease && isExclusiveReleaseType(releaseTypeInput) && (
                    <label className="flex items-start gap-2.5 pt-1 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={closeSongForRelease}
                        onChange={e => setCloseSongForRelease(e.target.checked)}
                        disabled={isMutating}
                        className="mt-0.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                      />
                      <span>Fechar automaticamente a música para novos interessados no catálogo público após a emissão.</span>
                    </label>
                  )}

                  {!existingRelease && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center justify-between text-xs">
                      <span className="text-slate-300">Valor oficial no Termo de Liberação:</span>
                      <strong className="text-emerald-400 font-mono font-bold text-sm">
                        R$ {Number(agreedValueInput || activeRequest.agreedValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                  )}
                </div>
              )}

              {/* Automatic release delivery status */}
              {existingRelease && (
                <div className="bg-slate-950 p-5 rounded-2xl border border-blue-500/30 space-y-4 animate-fadeIn text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                      <FileCheck className="w-5 h-5" />
                      <span>Termo de Liberação Emitido</span>
                    </div>
                  </div>

                  <div role={archiveError ? "alert" : "status"} className={`rounded-xl border p-3 text-xs ${existingRelease.documentPath ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-200"}`}>
                    {existingRelease.documentPath ? "PDF arquivado e disponível." : archivingRelease ? "Arquivando PDF..." : "Termo emitido. O PDF ainda precisa ser arquivado."}
                    {archiveError && <p className="mt-1">Falha no arquivamento: {archiveError}</p>}
                    {!existingRelease.documentPath && !archivingRelease && <button type="button" onClick={() => void handleRetryArchive(existingRelease)} className="mt-2 rounded-lg bg-amber-500 px-3 py-2 font-bold text-slate-950">Tentar arquivar novamente</button>}
                  </div>

                  <ReleaseDeliveryStatus
                    status={deliveryStatus}
                    isSending={sendingDeliveryId === existingRelease.id}
                    onSend={() => void handleResendDelivery(existingRelease)}
                  />

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleCopyReleaseValidationLink(existingRelease)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 border border-slate-700 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                      <span>Copiar Link de Autenticidade</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewingReleaseDoc(existingRelease)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 border border-slate-700 transition"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      <span>Ver termo</span>
                    </button>

                  </div>
                </div>
              )}

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-800">
                {hasUnsavedChanges && (
                  <button
                    type="button"
                    onClick={handleDiscardChanges}
                    disabled={isMutating}
                    className="px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Descartar alterações
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveDetails}
                  disabled={isMutating}
                  className="px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? 'Salvando...' : 'Salvar alterações'}
                </button>


              </div>

            </div>

          </div>

        </div>

        {/* Document Viewer Modal if user generates/views release */}
        {viewingReleaseDoc && (
          <LiberacaoDocumentModal
            document={viewingReleaseDoc}
            buyerPhone={activeRequest.buyerWhatsapp}
            archiveError={archiveError}
            archiving={archivingRelease}
            onRetryArchive={() => void handleRetryArchive(viewingReleaseDoc)}
            onClose={() => setViewingReleaseDoc(null)}
          />
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW 2: REQUESTS LIST CATALOG
  // ==========================================
  return (
    <div className="space-y-6 animate-fadeIn">

      {/* Toast Feedback */}
      {toastMessage && (
          <div role={toastMessage.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`fixed top-20 right-5 z-[130] max-w-sm font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs animate-fadeIn ${toastMessage.type === 'success' ? 'bg-emerald-500 text-slate-950' : toastMessage.type === 'error' ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-950'}`}>
            {toastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <span className="flex-1">{toastMessage.message}</span>
          <button type="button" onClick={() => setToastMessage(null)} aria-label="Fechar aviso" className="p-1 hover:bg-emerald-600/20 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Solicitações</h1>
        <p className="text-xs text-slate-400 mt-1">
          Pedidos de liberação recebidos pelo seu perfil. Comece pelo que precisa da sua ação.
        </p>
      </div>

      {failedDeliveries.length > 0 && (
        <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
          <strong className="flex items-center gap-2 text-sm text-red-200"><AlertCircle className="h-4 w-4" />{failedDeliveries.length === 1 ? 'Uma entrega não chegou ao cliente' : `${failedDeliveries.length} entregas não chegaram aos clientes`}</strong>
          <ul className="mt-3 space-y-2">
            {failedDeliveries.map(release => (
              <li key={release.id} className="flex flex-col gap-2 rounded-xl bg-slate-950/60 p-3 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <span><strong className="text-white">{release.buyerName}</strong> · “{release.songTitle}” · termo {release.documentCode}</span>
                <button type="button" disabled={Boolean(sendingDeliveryId)} onClick={() => void handleResendDelivery(release)} className="rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white hover:bg-red-500 disabled:opacity-50">
                  {sendingDeliveryId === release.id ? 'Reenviando...' : 'Reenviar'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Search */}
        <div className="relative sm:col-span-5">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="search"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            aria-label="Buscar solicitações"
            placeholder="Buscar por intérprete, música, cidade, documento ou código..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Music Filter */}
        <div className="sm:col-span-3">
          <select
            value={selectedSongFilter}
            onChange={e => setSelectedSongFilter(e.target.value)}
            aria-label="Filtrar por música"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="todas">Todas as Músicas</option>
            {songs.map(s => {
              const count = Number(songCounts[s.id] || 0);
              return (
                <option key={s.id} value={s.id}>
                  {s.title} ({count})
                </option>
              );
            })}
          </select>
        </div>

        {/* Status específico (opção secundária aos grupos) */}
        <div className="sm:col-span-2">
          <select
            value={isRequestGroup(activeTab) || activeTab === 'todas' ? '' : activeTab}
            onChange={event => setActiveTab((event.target.value || 'todas') as RequestFilters['status'])}
            aria-label="Filtrar por etapa"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todas as etapas</option>
            {(Object.keys(statusLabels) as RequestStatus[]).map(status => (
              <option key={status} value={status}>{statusLabels[status]} ({Number(statusCounts[status] || 0)})</option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div className="sm:col-span-2">
          <select
            value={sortOrder}
            onChange={event => setSortOrder(event.target.value as typeof sortOrder)}
            aria-label="Ordenar solicitações"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
          </select>
        </div>
      </div>

      {/* Grupos operacionais */}
      <div role="tablist" aria-label="Agrupar solicitações" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          { id: 'acao', label: 'Precisa de ação', hint: 'Novas e pagamentos confirmados', count: groupCount('acao') + failedDeliveries.length, accent: 'text-amber-300' },
          { id: 'andamento', label: 'Em andamento', hint: 'Negociação e pagamento pendente', count: groupCount('andamento'), accent: 'text-blue-300' },
          { id: 'concluidas', label: 'Concluídas', hint: 'Termos emitidos e arquivadas', count: groupCount('concluidas'), accent: 'text-emerald-300' },
          { id: 'todas', label: 'Todas', hint: 'Todas as solicitações', count: Object.values(statusCounts).reduce<number>((sum, value) => sum + Number(value), 0), accent: 'text-slate-300' },
        ] as const).map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-label={`${tab.label}: ${tab.count}`}
              className={`rounded-2xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${isActive ? 'border-amber-500 bg-amber-500 shadow-lg shadow-amber-500/20' : 'border-slate-800 bg-slate-900 hover:border-amber-500/50 hover:bg-slate-800'}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`text-sm font-bold ${isActive ? 'text-slate-950' : 'text-white'}`}>{tab.label}</span>
                <strong className={`text-xl leading-none ${isActive ? 'text-slate-950' : tab.count > 0 ? tab.accent : 'text-slate-500'}`}>{tab.count}</strong>
              </span>
              <span className={`mt-1 block text-[11px] ${isActive ? 'font-medium text-slate-900' : 'text-slate-400'}`}>
                {tab.id === 'acao' && tab.count === 0 ? 'Nada pendente agora' : tab.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* Requests List */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="divide-y divide-slate-800/80">
          {authLoading || listLoading ? (
            <div className="p-12 text-center text-slate-400 space-y-4 animate-pulse">
              <LoaderCircle className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-300">Carregando solicitações de liberação...</p>
            </div>
          ) : listError ? (
            <div role="alert" className="p-12 text-center text-red-300">
              <AlertCircle className="mx-auto mb-3 h-10 w-10" />
              <p className="text-sm font-semibold">{listError}</p>
              <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white">Tentar novamente</button>
            </div>
          ) : listedRequests.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <MessageSquare className="w-12 h-12 mx-auto stroke-1 text-slate-600" />
              <p className="text-sm font-medium">Nenhuma solicitação encontrada para os filtros selecionados.</p>
              {(searchTerm || selectedSongFilter !== 'todas' || activeTab !== 'todas') && (
                <button
                  type="button"
                  onClick={() => { setSearchTerm(''); setSelectedSongFilter('todas'); setActiveTab('todas'); }}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 underline"
                >
                  Limpar todos os filtros
                </button>
              )}
            </div>
          ) : (
            paginatedRequests.map(req => (
              <div key={req.id} className="p-5 hover:bg-slate-800/40 transition flex flex-col md:flex-row md:items-center justify-between gap-4">

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-amber-400 font-bold shrink-0 shadow-sm">
                    <Music className="w-6 h-6" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white text-base">{req.buyerName}</h3>
                      {req.buyerStageName && (
                        <span className="text-xs text-amber-300 font-medium">({req.buyerStageName})</span>
                      )}
                      <span className="text-[11px] text-slate-500">• {req.buyerCityState}</span>
                      <span className="text-[11px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        {getRequestCode(req.id)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300">
                      Música solicitada: <strong className="text-amber-400">“{req.songTitle}”</strong>
                    </p>

                    <p className="text-xs text-slate-400 line-clamp-1 italic">
                      “{req.purpose}”
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
                      <span>Recebida em {formatDate(req.createdAt)}</span>
                      {describeIdleTime(req) && (
                        <span className={`flex items-center gap-1 ${describeIdleTime(req)!.tone}`}><Clock className="h-3 w-3" />{describeIdleTime(req)!.text}</span>
                      )}
                      {req.agreedValue && (
                        <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          Valor: R$ {req.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      {releases.some(release => release.requestId === req.id) && (
                        <span className="text-blue-400 font-semibold bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 flex items-center gap-1">
                          <FileCheck className="w-3 h-3" />
                          Liberação emitida
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-800">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    req.status === 'pagamento_confirmado' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                    req.status === 'em_negociacao' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' :
                    req.status === 'pagamento_pendente' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40' :
                    req.status === 'liberacao_enviada' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                    'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}>
                    {statusLabels[req.status]}
                  </span>

                  {/* 1-Click WhatsApp Quick Action */}
                  <button
                    type="button"
                    onClick={() => handleSimulateWhatsApp(req.buyerWhatsapp, req.songTitle, req.buyerName)}
                    title="Chamar no WhatsApp agora"
                    className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1 shadow-md shadow-emerald-600/20"
                  >
                    <Phone className="w-4 h-4" />
                    <span className="hidden sm:inline text-xs">WhatsApp</span>
                  </button>

                  {(() => {
                    const action = getRowAction(req);
                    return (
                      <button
                        type="button"
                        disabled={'release' in action && Boolean(sendingDeliveryId)}
                        onClick={() => {
                          if ('release' in action && action.release) { void handleResendDelivery(action.release); return; }
                          openRequest(req);
                        }}
                        className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-1 disabled:opacity-50 ${action.urgent ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-slate-800 text-amber-400 hover:bg-amber-500 hover:text-slate-950'}`}
                      >
                        <span>{action.label}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    );
                  })()}
                </div>

              </div>
            ))
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <nav aria-label="Paginação das solicitações" className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
          <span>Página {page} de {totalPages} · {listTotal} resultados</span>
          <div className="flex gap-2">
            <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)} className="rounded-xl bg-slate-800 px-4 py-2 font-bold text-white disabled:opacity-40">Anterior</button>
            <button type="button" disabled={page === totalPages} onClick={() => setPage(value => value + 1)} className="rounded-xl bg-slate-800 px-4 py-2 font-bold text-white disabled:opacity-40">Próxima</button>
          </div>
        </nav>
      )}

      {/* Document Viewer Modal if user generates/views release */}
      {viewingReleaseDoc && (
        <LiberacaoDocumentModal
          document={viewingReleaseDoc}
          onClose={() => setViewingReleaseDoc(null)}
        />
      )}

    </div>
  );
};
