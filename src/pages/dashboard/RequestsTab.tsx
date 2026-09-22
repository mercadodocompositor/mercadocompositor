import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate, Link, useSearchParams, UNSAFE_NavigationContext } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { InterestRequest, RequestStatus, ReleaseDocument, RequestHistoryItem } from '../../types';
import { LiberacaoDocumentModal } from '../../components/common/LiberacaoDocumentModal';
import { getRequestCode } from '../../lib/identifiers';
import { normalizeBrazilianWhatsapp } from '../../lib/contact';
import { useDebounce } from '../../hooks/useDebounce';
import { isExclusiveReleaseType, isActiveExclusiveRelease, isReleaseExpired } from '../../lib/releaseTypes';
import { DEFAULT_RELEASE_TYPE, RELEASE_TYPE_OPTIONS, REQUEST_STATUS_LABELS, getAllowedRequestStatuses, getManuallySelectableRequestStatuses, getReleaseConditions } from '../../lib/requestWorkflow';
import { loadRequestHistory } from '../../lib/database';
import { parseRequestFilters, serializeRequestFilters } from '../../lib/requestFilters';
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
  Send,
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
  const { requests, songs, updateRequestStatus, queryRequests, getRequestById, issueRelease, retryReleaseArchive, markReleaseSent, releases, profile, authLoading } = useApp();

  const [activeTab, setActiveTab] = useState<RequestStatus | 'todas'>(() => parseRequestFilters(searchParams).status);
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
  const [releasePendingSentConfirmation, setReleasePendingSentConfirmation] = useState<ReleaseDocument | null>(null);
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
  const [isMarkingReleaseSent, setIsMarkingReleaseSent] = useState(false);

  // Document modal trigger state
  const [viewingReleaseDoc, setViewingReleaseDoc] = useState<ReleaseDocument | null>(null);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const closePaymentModal = React.useCallback(() => { if (!isConfirmingPayment) setShowPaymentConfirmation(false); }, [isConfirmingPayment]);
  const closeArchiveModal = React.useCallback(() => { if (!isSaving) setShowArchiveConfirmation(false); }, [isSaving]);
  const closeReviewModal = React.useCallback(() => { if (!isIssuingRelease) setShowReleaseReview(false); }, [isIssuingRelease]);
  const closeSentConfirmationModal = React.useCallback(() => { if (!isMarkingReleaseSent) setReleasePendingSentConfirmation(null); }, [isMarkingReleaseSent]);
  const paymentDialogRef = useModalFocus<HTMLDivElement>(showPaymentConfirmation, closePaymentModal);
  const archiveDialogRef = useModalFocus<HTMLDivElement>(showArchiveConfirmation, closeArchiveModal);
  const reviewDialogRef = useModalFocus<HTMLDivElement>(showReleaseReview, closeReviewModal);
  const sentConfirmationDialogRef = useModalFocus<HTMLDivElement>(Boolean(releasePendingSentConfirmation), closeSentConfirmationModal);

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

  const isMutating = isSaving || isConfirmingPayment || isIssuingRelease || isMarkingReleaseSent;

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToastMessage({ message, type });
    if (type === 'success') setTimeout(() => setToastMessage(current => current?.message === message ? null : current), 3500);
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

  const handleAgreedValueChange = (value: number | '') => {
    setMoneyDisplay(value === '' ? '' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
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

  const handleMoneyTextChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 10);
    const amount = digits ? Number(digits) / 100 : '';
    handleAgreedValueChange(amount);
  };

  const moneyError = agreedValueInput !== '' && (agreedValueInput <= 0 || agreedValueInput > 10000000)
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
    queryRequests({page,pageSize,status:activeTab === 'todas' ? undefined : activeTab,
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
        showToast("Detalhes e observações salvos com sucesso!");
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

    if (!reviewConfirmed) {
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
        ? "Liberação emitida! A música foi fechada para novas propostas e o intérprete recebe o link da cópia por e-mail."
        : "Liberação emitida! O intérprete recebe o link da cópia por e-mail.");

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

  const handleSendReleaseWhatsApp = (doc: ReleaseDocument) => {
    if (!activeRequest) return;
    const normalizedPhone = normalizeBrazilianWhatsapp(activeRequest.buyerWhatsapp);
    const validationUrl = `${window.location.origin}/validar-documento?codigo=${doc.documentCode}`;
    const message = encodeURIComponent(
      `Olá, ${doc.buyerName}! Segue o Termo de Liberação da música "${doc.songTitle}" emitido por ${doc.composerName}.\n\n` +
      `Código do Documento: ${doc.documentCode}\n` +
      `Tipo de Liberação: ${doc.releaseType}\n\n` +
      `Você pode consultar a autenticidade e validade jurídica do documento no link oficial:\n${validationUrl}`
    );
    const whatsappUrl = normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${message}`
      : `https://wa.me/?text=${message}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    showToast('Mensagem preparada no WhatsApp. Confirme o envio nesta página depois de enviá-la.', 'warning');
  };

  const handleSendReleaseEmail = (doc: ReleaseDocument) => {
    if (!activeRequest) return;
    const validationUrl = `${window.location.origin}/validar-documento?codigo=${doc.documentCode}`;
    const subject = encodeURIComponent(`Termo de Liberação Oficial — Música "${doc.songTitle}"`);
    const body = encodeURIComponent(
      `Olá, ${doc.buyerName},\n\n` +
      `Foi emitido o Termo de Liberação para a música "${doc.songTitle}".\n\n` +
      `Código do Documento: ${doc.documentCode}\n` +
      `Tipo de Liberação: ${doc.releaseType}\n` +
      `Valor Oficial: R$ ${Number(doc.agreedValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n` +
      `Você pode verificar a autenticidade e baixar o termo oficial no link:\n${validationUrl}\n\n` +
      `Atenciosamente,\n${doc.composerName}`
    );
    window.location.href = `mailto:${activeRequest.buyerEmail}?subject=${subject}&body=${body}`;
    showToast('E-mail preparado. Confirme o envio nesta página depois de enviá-lo.', 'warning');
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

  const handleMarkReleaseAsSent = async (releaseId: string) => {
    if (!beginMutation(setIsMarkingReleaseSent)) return;
    try {
      await markReleaseSent(releaseId);
      setReleasePendingSentConfirmation(null);
      showToast('Envio ao comprador registrado com sucesso!');
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível registrar o envio. Tente novamente.', 'error');
    } finally {
      endMutation(setIsMarkingReleaseSent);
    }
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
    const otherReleasesForSong = releases.filter(r => r.songId === activeRequest.songId && r.requestId !== activeRequest.id);
    const hasExclusiveReleaseForSong = otherReleasesForSong.some(r => isActiveExclusiveRelease(r));
    const hasAnyOtherReleaseForSong = otherReleasesForSong.some(r => !isReleaseExpired(r.releaseType, r.issueDate, r.expiresAt));

    return (
      <div className="space-y-6 animate-fadeIn pb-12">
        {/* Toast Feedback */}
        {toastMessage && (
          <div role={toastMessage.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`fixed top-20 right-5 z-50 max-w-sm font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs animate-fadeIn ${toastMessage.type === 'success' ? 'bg-emerald-500 text-slate-950' : toastMessage.type === 'error' ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-950'}`}>
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
              <p className="mt-2 text-sm leading-relaxed text-slate-300">Confirma o recebimento de <strong className="text-emerald-400">R$ {Number(agreedValueInput).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>? Esta ação habilitará a emissão do termo.</p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" disabled={isConfirmingPayment} onClick={() => setShowPaymentConfirmation(false)} className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Cancelar</button>
                <button data-autofocus type="button" disabled={isConfirmingPayment} onClick={handleMarkPaymentReceived} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{isConfirmingPayment ? 'Confirmando...' : 'Sim, confirmar'}</button>
              </div>
            </div>
          </div>
        )}

        {releasePendingSentConfirmation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) closeSentConfirmationModal(); }}>
            <div ref={sentConfirmationDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="confirm-release-sent-title" className="w-full max-w-md rounded-3xl border border-blue-500/30 bg-slate-900 p-6 shadow-2xl">
              <h2 id="confirm-release-sent-title" className="text-lg font-bold text-white">Confirmar envio realizado</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Confirma que enviou o termo <strong className="text-blue-300">{releasePendingSentConfirmation.documentCode}</strong> para <strong className="text-white">{releasePendingSentConfirmation.buyerName}</strong>? O sistema registrará a data e a hora desta confirmação.
              </p>
              <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                Confirme somente depois de concluir o envio no WhatsApp, no aplicativo de e-mail ou por outro canal.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" disabled={isMarkingReleaseSent} onClick={closeSentConfirmationModal} className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Cancelar</button>
                <button data-autofocus type="button" disabled={isMarkingReleaseSent} onClick={() => void handleMarkReleaseAsSent(releasePendingSentConfirmation.id)} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                  {isMarkingReleaseSent ? 'Registrando...' : 'Sim, o envio foi realizado'}
                </button>
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
                <div><dt className="text-xs text-slate-500">Comprador</dt><dd className="font-semibold text-white break-all">{activeRequest.buyerName}</dd></div>
                <div><dt className="text-xs text-slate-500">Música</dt><dd className="font-semibold text-white break-all">{activeRequest.songTitle}</dd></div>
                <div><dt className="text-xs text-slate-500">Valor quitado</dt><dd className="font-semibold text-emerald-400">R$ {Number(agreedValueInput || activeRequest.agreedValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</dd></div>
                <div><dt className="text-xs text-slate-500">Tipo</dt><dd className="font-semibold text-amber-400">{releaseTypeInput}</dd></div>
              </dl>
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
              activeRequest.status === 'liberacao_enviada' ? (existingRelease?.sentToBuyerAt ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-blue-500/20 text-blue-300 border-blue-500/40') :
              'bg-slate-800 text-slate-300 border-slate-700'
            }`}>
              {activeRequest.status === 'liberacao_enviada'
                ? (existingRelease?.sentToBuyerAt ? 'Liberação Emitida (Enviada)' : 'Liberação Emitida (Aguardando Envio)')
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
                  <h3 className="text-lg font-bold text-white">Gestão Financeira e Status</h3>
                  <p className="text-xs text-slate-400">Controle os valores acordados e registre o recebimento do pagamento</p>
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
                H? um rascunho salvo nesta sess?o.
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={restoreDraft} className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-slate-950">Restaurar rascunho</button>
                  <button type="button" onClick={() => { clearRequestDrafts(activeRequest.id); setRestorableDraft(false); }} className="rounded-lg border border-slate-600 px-3 py-2">Descartar rascunho</button>
                </div>
              </div>}

              {/* Status and Value Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1.5 font-semibold">Status da Negociação</label>
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
                  <label htmlFor="agreed-value" className="block text-slate-400 mb-1.5 font-semibold">Valor Acordado (R$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-500 font-bold text-xs">R$</span>
                    <input
                      id="agreed-value"
                      type="text"
                      inputMode="numeric"
                      aria-invalid={Boolean(moneyError)}
                      aria-describedby={moneyError ? "agreed-value-error" : undefined}
                      value={existingRelease ? existingRelease.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : moneyDisplay}
                      onChange={e => handleMoneyTextChange(e.target.value)}
                      disabled={isMutating || activeRequest.status === 'liberacao_enviada' || Boolean(existingRelease)}
                      placeholder="0,00"
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

              {/* Archive reason helper */}
              {draftStatus === 'arquivada' && (
                <div className="space-y-2 text-xs animate-fadeIn bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-400 font-semibold">Motivo do Arquivamento (Opcional):</label>
                    {archiveReason !== (activeRequest.archiveReason || '') && (
                      <span className="text-[10px] text-amber-400/90 font-medium">
                        Alteração não salva
                      </span>
                    )}
                  </div>
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
                        <p><strong className="text-white">{statusLabels[item.previousStatus]}</strong> → <strong className="text-amber-400">{statusLabels[item.newStatus]}</strong></p>
                        {(item.previousAgreedValue !== item.newAgreedValue) && <p className="mt-1 text-slate-400">Valor: {item.previousAgreedValue ? `R$ ${item.previousAgreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'não informado'} → {item.newAgreedValue ? `R$ ${item.newAgreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'não informado'}</p>}
                        <time className="mt-1 block text-[10px] text-slate-500" dateTime={item.changedAt}>{formatDate(item.changedAt)} · autor da conta {item.actorId.slice(0, 8)}</time>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* Release Configuration Section */}
              {(activeRequest.status === 'pagamento_confirmado' || activeRequest.status === 'liberacao_enviada') && (
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

              {/* Release Dispatch Section (WhatsApp / Email / Verification link) */}
              {existingRelease && (
                <div className="bg-slate-950 p-5 rounded-2xl border border-blue-500/30 space-y-4 animate-fadeIn text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                      <FileCheck className="w-5 h-5" />
                      <span>Termo de Liberação Emitido</span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] tracking-wider uppercase border ${
                      existingRelease.sentToBuyerAt
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    }`}>
                      {existingRelease.sentToBuyerAt ? 'Envio registrado' : 'Envio não confirmado'}
                    </span>
                  </div>

                  <div role={archiveError ? "alert" : "status"} className={`rounded-xl border p-3 text-xs ${existingRelease.documentPath ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-200"}`}>
                    {existingRelease.documentPath ? "PDF arquivado e disponível." : archivingRelease ? "Arquivando PDF..." : "Termo emitido. O PDF ainda precisa ser arquivado."}
                    {archiveError && <p className="mt-1">Falha no arquivamento: {archiveError}</p>}
                    {!existingRelease.documentPath && !archivingRelease && <button type="button" onClick={() => void handleRetryArchive(existingRelease)} className="mt-2 rounded-lg bg-amber-500 px-3 py-2 font-bold text-slate-950">Tentar arquivar novamente</button>}
                  </div>

                  <p className="text-slate-300 leading-relaxed">
                    {existingRelease.sentToBuyerAt
                      ? `O envio do termo ${existingRelease.documentCode} foi confirmado pelo compositor em ${new Date(existingRelease.sentToBuyerAt).toLocaleDateString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`
                      : `O termo oficial ${existingRelease.documentCode} foi emitido e assinado digitalmente. Ele não é enviado automaticamente pelo sistema: utilize os canais abaixo para enviar o documento e o link de validação ao interessado.`
                    }
                  </p>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSendReleaseWhatsApp(existingRelease)}
                      disabled={isMutating}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Abrir mensagem no WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSendReleaseEmail(existingRelease)}
                      disabled={isMutating}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition"
                    >
                      <Mail className="w-3.5 h-3.5 text-amber-400" />
                      <span>Preparar e-mail</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleCopyReleaseValidationLink(existingRelease)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 border border-slate-700 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                      <span>Copiar Link de Autenticidade</span>
                    </button>

                    {!existingRelease.sentToBuyerAt && (
                      <button
                        type="button"
                        onClick={() => setReleasePendingSentConfirmation(existingRelease)}
                        disabled={isMutating}
                        className="px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-bold text-xs flex items-center gap-1.5 border border-blue-500/30 transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Confirmar Envio Realizado</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-800">
                {activeRequest.status === 'pagamento_pendente' && draftStatus === 'pagamento_pendente' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!agreedValueInput || Number(agreedValueInput) <= 0) {
                        showToast('Informe um valor acordado maior que zero antes de confirmar o pagamento.', 'warning');
                        return;
                      }
                      setShowPaymentConfirmation(true);
                    }}
                    disabled={isMutating}
                    className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isConfirmingPayment ? 'Confirmando pagamento...' : 'Confirmar Pagamento Recebido'}</span>
                  </button>
                )}

                {activeRequest.status === 'nova' && <button type="button" disabled={isMutating} onClick={() => void executeSaveDetails('em_negociacao')} className="px-5 py-3 rounded-2xl bg-amber-500 text-slate-950 font-bold text-xs">Iniciar negocia??o</button>}
                {activeRequest.status === 'em_negociacao' && <button type="button" disabled={isMutating || Boolean(moneyError) || agreedValueInput === ''} onClick={() => void executeSaveDetails('pagamento_pendente')} className="px-5 py-3 rounded-2xl bg-amber-500 text-slate-950 font-bold text-xs disabled:opacity-50">Registrar acordo</button>}

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
                  {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                </button>

                {existingRelease ? (
                  <button
                    type="button"
                    onClick={() => setViewingReleaseDoc(existingRelease)}
                    className="px-6 py-3 rounded-2xl bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-500/20 transition"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Visualizar Documento de Liberação</span>
                  </button>
                ) : activeRequest.status === 'pagamento_confirmado' ? (
                  <button
                    type="button"
                    onClick={() => void handleCreateRelease(false)}
                    disabled={isMutating || hasExclusiveReleaseForSong || (isExclusiveReleaseType(releaseTypeInput) && (hasAnyOtherReleaseForSong || !legalAcknowledged))}
                    className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>{isIssuingRelease ? 'Emitindo liberação...' : 'Emitir termo de liberação'}</span>
                  </button>
                ) : null}
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
          <div role={toastMessage.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`fixed top-20 right-5 z-50 max-w-sm font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs animate-fadeIn ${toastMessage.type === 'success' ? 'bg-emerald-500 text-slate-950' : toastMessage.type === 'error' ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-950'}`}>
            {toastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <span className="flex-1">{toastMessage.message}</span>
          <button type="button" onClick={() => setToastMessage(null)} aria-label="Fechar aviso" className="p-1 hover:bg-emerald-600/20 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & KPI Summary */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Gestão de Solicitações & Liberações
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Central de negociação com intérpretes, controle de pagamentos diretos e emissão de autorizações fonográficas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-2xl flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-amber-400" />
            <div className="text-left">
              <span className="block text-[10px] text-slate-500 font-bold uppercase">Total</span>
              <strong className="text-xs text-white">{Object.values(statusCounts).reduce<number>((sum, count) => sum + Number(count), 0)}</strong>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-2xl flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-300" />
            <div className="text-left">
              <span className="block text-[10px] text-slate-500 font-bold uppercase">Em Negociação</span>
              <strong className="text-xs text-amber-300">
                {Number(statusCounts.em_negociacao || 0) + Number(statusCounts.pagamento_pendente || 0)}
              </strong>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-2xl flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            <div className="text-left">
              <span className="block text-[10px] text-slate-500 font-bold uppercase">Liberadas</span>
              <strong className="text-xs text-emerald-400">
                {Number(statusCounts.liberacao_enviada || 0)}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Search */}
        <div className="relative sm:col-span-6">
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
        <div className="sm:col-span-4">
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

      {/* Status Tabs with Colored Badges (Wrapped - No Horizontal Scroll) */}
      <div role="tablist" aria-label="Filtrar solicitações por status" className="bg-slate-900 border border-slate-800 p-2.5 rounded-2xl flex flex-wrap items-center gap-2">
        {[
          { id: 'todas', label: 'Todas', badgeClass: 'bg-slate-800 text-slate-300' },
          { id: 'nova', label: 'Novas', badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
          { id: 'em_negociacao', label: 'Em Negociação', badgeClass: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' },
          { id: 'pagamento_pendente', label: 'Pagamento Pendente', badgeClass: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' },
          { id: 'pagamento_confirmado', label: 'Pagamento Confirmado', badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
          { id: 'liberacao_enviada', label: 'Liberações Emitidas', badgeClass: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
          { id: 'arquivada', label: 'Arquivadas', badgeClass: 'bg-slate-800 text-slate-400' }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          const count = tab.id === 'todas'
            ? Object.values(statusCounts).reduce<number>((sum, value) => sum + Number(value), 0)
            : Number(statusCounts[tab.id] || 0);
          return (
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              key={tab.id}
              onClick={() => setActiveTab(tab.id as RequestStatus | 'todas')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
                isActive
                  ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/30 font-bold'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800/80'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isActive ? 'bg-slate-950 text-amber-400' : tab.badgeClass}`}>
                {count}
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

                  <button
                    onClick={() => {
                      if (activeRequest && req.id !== activeRequest.id && hasUnsavedChanges) {
                        if (!window.confirm('Há alterações não salvas nesta solicitação. Deseja sair e descartá-las?')) {
                          return;
                        }
                        isNavigatingConfirmedRef.current = true;
                      }
                      navigate(`/dashboard/solicitacoes/${req.id}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-400 font-bold text-xs transition flex items-center gap-1"
                  >
                    <span>Ver detalhes</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
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
