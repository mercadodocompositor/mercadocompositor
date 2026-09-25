import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ReleaseDocument } from '../../types';
import { LiberacaoDocumentModal } from '../../components/common/LiberacaoDocumentModal';
import { ReleaseDeliveryStatus } from '../../components/dashboard/ReleaseDeliveryStatus';
import { downloadReleaseDocument } from '../../lib/releaseArchive';
import { normalizeBrazilianWhatsapp } from '../../lib/contact';
import { 
  FileCheck, 
  Search, 
  Eye, 
  ShieldCheck, 
  FileText,
  Download,
  Phone,
  Copy,
  Check,
  LayoutGrid,
  List,
  ExternalLink,
  DollarSign,
  TrendingUp,
  Award,
  Filter,
  Calendar,
  ChevronRight,
  Music,
  Loader2,
  X,
  AlertCircle,
  MessageSquare
} from 'lucide-react';
import { calculateReleaseExpiration, isExclusiveRelease, isReleaseExpired } from '../../lib/releaseTypes';
import { loadReleaseDeliveryStatuses, loadReleaseMetrics, ReleaseMetrics, resendReleaseDelivery, type ReleaseDeliveryStatus as ReleaseDeliveryInfo } from '../../lib/database';
import { getFriendlyErrorMessage } from '../../lib/apiErrors';
import { useModalFocus } from '../../hooks/useModalFocus';
export const ReleasesTab: React.FC = () => {
  const { requests, queryReleases, retryReleaseArchive, authLoading, currentUserId } = useApp();
  const navigate = useNavigate();

  const [selectedDoc, setSelectedDoc] = useState<ReleaseDocument | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSongFilter, setSelectedSongFilter] = useState('todas');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('todas');
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState('todos');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'value_high' | 'value_low' | 'title'>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [copiedDocCode, setCopiedDocCode] = useState<string | null>(null);
  const [downloadingDocCode, setDownloadingDocCode] = useState<string | null>(null);
  const [archivingDocCode, setArchivingDocCode] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [page, setPage] = useState(1);
  const [pageReleases, setPageReleases] = useState<ReleaseDocument[]>([]);
  const [totalReleases, setTotalReleases] = useState(0);
  const [allMetrics, setAllMetrics] = useState<ReleaseMetrics | null>(null);
  const [filteredMetrics, setFilteredMetrics] = useState<ReleaseMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [whatsAppModalDoc, setWhatsAppModalDoc] = useState<ReleaseDocument | null>(null);
  const [customWhatsapp, setCustomWhatsapp] = useState('');
  const [whatsAppCopied, setWhatsAppCopied] = useState(false);
  const [whatsAppPhoneError, setWhatsAppPhoneError] = useState<string | null>(null);
  const whatsappDialogRef = useModalFocus<HTMLDivElement>(Boolean(whatsAppModalDoc), () => setWhatsAppModalDoc(null));
  const pageSize = viewMode === 'grid' ? 12 : 20;

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  };

  const handleDownloadDocPdf = async (doc: ReleaseDocument) => {
    try {
      setDownloadingDocCode(doc.documentCode);
      await new Promise(resolve => setTimeout(resolve, 50));
      const archived = await downloadReleaseDocument(doc);
      showToast(archived ? 'PDF arquivado verificado e baixado.' : 'PDF gerado e baixado. O documento ainda não foi arquivado.', archived ? 'success' : 'warning');
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      showToast('Não foi possível gerar o PDF. Tente novamente.', 'error');
    } finally {
      setDownloadingDocCode(null);
    }
  };

  const handleArchiveDoc = async (doc: ReleaseDocument) => {
    if (doc.documentPath || archivingDocCode) return;
    try {
      setArchivingDocCode(doc.documentCode);
      const archived = await retryReleaseArchive(doc);
      setPageReleases(previous => previous.map(item => item.id === archived.id ? archived : item));
      setSelectedDoc(previous => previous?.id === archived.id ? archived : previous);
      showToast('PDF arquivado com sucesso. A versão armazenada já pode ser baixada.');
    } catch (error) {
      console.error('Erro ao arquivar PDF:', error);
      showToast('Não foi possível arquivar o PDF. Tente novamente.', 'error');
    } finally {
      setArchivingDocCode(null);
    }
  };

  const [kpiScope, setKpiScope] = useState<'all' | 'filtered'>('filtered');

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      searchTerm.trim() ||
      selectedSongFilter !== 'todas' ||
      selectedTypeFilter !== 'todas' ||
      selectedPeriodFilter !== 'todos'
    );
  }, [searchTerm, selectedSongFilter, selectedTypeFilter, selectedPeriodFilter]);

  const activeMetrics = hasActiveFilters && kpiScope === 'filtered' ? filteredMetrics : allMetrics;
  const songsWithReleases = allMetrics?.songs || [];

  useEffect(() => {
    if (authLoading || !currentUserId) return;
    let cancelled = false;
    setAllMetrics(null);
    setMetricsError(null);
    loadReleaseMetrics().then(result => {
      if (!cancelled) setAllMetrics(result);
    }).catch(error => {
      if (!cancelled) setMetricsError(error instanceof Error ? error.message : 'Não foi possível carregar os indicadores.');
    });
    return () => { cancelled = true; };
  }, [authLoading, currentUserId, refreshToken]);

  useEffect(() => {
    if (authLoading || !currentUserId || !hasActiveFilters) {
      setFilteredMetrics(null);
      return;
    }
    let cancelled = false;
    setFilteredMetrics(null);
    setMetricsError(null);
    const timer = window.setTimeout(() => {
      loadReleaseMetrics({
        search: searchTerm,
        songId: selectedSongFilter === 'todas' ? undefined : selectedSongFilter,
        type: selectedTypeFilter === 'todas' ? undefined : selectedTypeFilter as 'exclusiva' | 'nao_exclusiva',
        period: selectedPeriodFilter === 'todos' ? undefined : selectedPeriodFilter as '30d' | '180d' | 'ano_atual'
      }).then(result => {
        if (!cancelled) setFilteredMetrics(result);
      }).catch(error => {
        if (!cancelled) setMetricsError(error instanceof Error ? error.message : 'Não foi possível carregar os indicadores.');
      });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [authLoading, currentUserId, hasActiveFilters, refreshToken, searchTerm, selectedSongFilter, selectedTypeFilter, selectedPeriodFilter]);

  useEffect(() => setPage(1), [searchTerm, selectedSongFilter, selectedTypeFilter, selectedPeriodFilter, sortBy, viewMode]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoadingPage(true);
      setPageError(null);
      try {
        const result = await queryReleases({
          page, pageSize, search: searchTerm,
          songId: selectedSongFilter === 'todas' ? undefined : selectedSongFilter,
          type: selectedTypeFilter === 'todas' ? undefined : selectedTypeFilter as 'exclusiva' | 'nao_exclusiva',
          period: selectedPeriodFilter === 'todos' ? undefined : selectedPeriodFilter as '30d' | '180d' | 'ano_atual',
          sort: sortBy
        });
        if (!cancelled) { setPageReleases(result.releases); setTotalReleases(result.total); }
      } catch (error) {
        if (!cancelled) setPageError(error instanceof Error ? error.message : 'Não foi possível carregar as liberações.');
      } finally {
        if (!cancelled) setIsLoadingPage(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [authLoading, page, pageSize, queryReleases, refreshToken, searchTerm, selectedSongFilter, selectedTypeFilter, selectedPeriodFilter, sortBy]);

  const filteredReleases = pageReleases;

  const [deliveryStatuses, setDeliveryStatuses] = useState<Record<string, ReleaseDeliveryInfo>>({});
  const [sendingDeliveryId, setSendingDeliveryId] = useState<string | null>(null);
  const visibleReleaseIds = filteredReleases.map(doc => doc.id).join(',');

  useEffect(() => {
    if (!visibleReleaseIds) return;
    let active = true;
    loadReleaseDeliveryStatuses(visibleReleaseIds.split(','))
      .then(statuses => { if (active) setDeliveryStatuses(current => ({ ...current, ...statuses })); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [visibleReleaseIds]);

  const handleSendDelivery = async (doc: ReleaseDocument) => {
    if (sendingDeliveryId) return;
    setSendingDeliveryId(doc.id);
    try {
      const result = await resendReleaseDelivery(doc.id);
      setDeliveryStatuses(current => ({
        ...current,
        [doc.id]: {
          ...(current[doc.id] || { releaseId: doc.id, emailQueuedAt: null, lastSentAt: null, emailFailedAt: null, emailLastError: null, views: 0, audioDownloads: 0, lyricsDownloads: 0, firstAudioDownloadAt: null, lastAccessAt: null }),
          expiresAt: result.expiresAt, emailStatus: result.emailStatus, emailQueuedAt: result.queuedAt, lastSentAt: result.lastSentAt,
        },
      }));
      showToast(`Entrega colocada na fila para o e-mail de ${doc.buyerName}. O link vale por 30 dias; o anterior deixou de funcionar.`);
    } catch (error) {
      showToast(getFriendlyErrorMessage(error, 'Não foi possível enviar a entrega.'), 'error');
    } finally {
      setSendingDeliveryId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalReleases / pageSize));

  const formatDate = (date: string) => {
    const [year, month, day] = date.slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  };

  const getValidityLabel = (doc: ReleaseDocument) => {
    if (!isExclusiveRelease(doc.releaseType)) return 'Sem exclusividade';
    const expiresAt = doc.expiresAt || calculateReleaseExpiration(doc.releaseType, doc.issueDate);
    if (!expiresAt) return /definitiv/i.test(doc.releaseType) ? 'Exclusividade definitiva' : 'Prazo de exclusividade não registrado';
    return isReleaseExpired(doc.releaseType, doc.issueDate, expiresAt)
      ? `Exclusividade encerrada em ${formatDate(expiresAt)}`
      : `Exclusividade vigente até ${formatDate(expiresAt)}`;
  };

  const maskDocument = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 4) return '••••';
    return `${'•'.repeat(Math.max(3, digits.length - 4))}${digits.slice(-4)}`;
  };

  const copyValidationLink = async (doc: ReleaseDocument) => {
    const url = `${window.location.origin}/validar-documento?codigo=${doc.documentCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedDocCode(doc.documentCode);
      setTimeout(() => setCopiedDocCode(null), 2500);
    } catch {
      showToast('O navegador não permitiu copiar o link.', 'error');
    }
  };

  const getBuyerPhone = (requestId: string) => {
    const req = requests.find(r => r.id === requestId);
    return req?.buyerWhatsapp;
  };

  const getValidationUrl = (docCode: string) => `${window.location.origin}/validar-documento?codigo=${docCode}`;

  const getWhatsAppMessageText = (doc: ReleaseDocument) => {
    const validationUrl = getValidationUrl(doc.documentCode);
    return `Olá, ${doc.buyerName}! Segue o link de validação do Termo de Liberação da música "${doc.songTitle}" emitido por ${doc.composerName}.\n\nCódigo do Documento: ${doc.documentCode}\nTipo: ${doc.releaseType}\n\nVocê pode consultar a autenticidade do registro no link:\n${validationUrl}`;
  };

  const handleSendWhatsApp = (doc: ReleaseDocument) => {
    const buyerPhone = getBuyerPhone(doc.requestId) || '';
    const normalizedPhone = normalizeBrazilianWhatsapp(buyerPhone);

    if (!normalizedPhone) {
      setCustomWhatsapp(buyerPhone || '');
      setWhatsAppPhoneError(null);
      setWhatsAppModalDoc(doc);
      return;
    }

    const message = encodeURIComponent(getWhatsAppMessageText(doc));
    window.open(`https://wa.me/${normalizedPhone}?text=${message}`, '_blank', 'noopener,noreferrer');
    showToast('WhatsApp aberto com o link público de autenticidade. A entrega completa continua sendo feita por e-mail.', 'warning');
  };

  const handleSendToCustomWhatsapp = () => {
    if (!whatsAppModalDoc) return;
    const normalized = normalizeBrazilianWhatsapp(customWhatsapp);
    if (!normalized) {
      setWhatsAppPhoneError('Informe um WhatsApp brasileiro válido com DDD (ex: 11 99999-9999).');
      return;
    }
    const message = encodeURIComponent(getWhatsAppMessageText(whatsAppModalDoc));
    window.open(`https://wa.me/${normalized}?text=${message}`, '_blank', 'noopener,noreferrer');
    setWhatsAppModalDoc(null);
    showToast('WhatsApp aberto com o link público de autenticidade. A entrega completa continua sendo feita por e-mail.', 'warning');
  };

  const handleOpenWhatsAppWithoutPhone = () => {
    if (!whatsAppModalDoc) return;
    const message = encodeURIComponent(getWhatsAppMessageText(whatsAppModalDoc));
    window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer');
    setWhatsAppModalDoc(null);
    showToast('WhatsApp aberto com o link público de autenticidade. A entrega completa continua sendo feita por e-mail.', 'warning');
  };

  const handleCopyWhatsAppMessage = async () => {
    if (!whatsAppModalDoc) return;
    const text = getWhatsAppMessageText(whatsAppModalDoc);
    try {
      await navigator.clipboard.writeText(text);
      setWhatsAppCopied(true);
      showToast('Texto da mensagem copiado com sucesso!');
      setTimeout(() => setWhatsAppCopied(false), 2500);
    } catch {
      showToast('O navegador não permitiu copiar o texto automaticamente.', 'error');
    }
  };

  // Export to CSV Report
  const handleExportCsv = async () => {
    if (totalReleases === 0 || isExporting) return;
    setIsExporting(true);
    let exportReleases: ReleaseDocument[] = [];
    try {
      const exportPageSize = 500;
      for (let exportPage = 1; ; exportPage += 1) {
        const result = await queryReleases({
          page: exportPage, pageSize: exportPageSize, search: searchTerm,
          songId: selectedSongFilter === 'todas' ? undefined : selectedSongFilter,
          type: selectedTypeFilter === 'todas' ? undefined : selectedTypeFilter as 'exclusiva' | 'nao_exclusiva',
          period: selectedPeriodFilter === 'todos' ? undefined : selectedPeriodFilter as '30d' | '180d' | 'ano_atual',
          sort: sortBy
        });
        exportReleases = exportReleases.concat(result.releases);
        if (exportReleases.length >= result.total || result.releases.length === 0) break;
      }

    const headers = [
      'Codigo_Documento',
      'Obra_Musical',
      'Compositor_Outorgante',
      'Comprador_Outorgado',
      'Documento_Comprador',
      'Cidade_Estado',
      'Tipo_Liberacao',
      'Valor_Acordado_BRL',
      'Data_Emissao',
      'Finalidade',
      'Link_Validacao'
    ];

    const csvCell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@]/.test(text.trimStart())) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = exportReleases.map(r => [r.documentCode,r.songTitle,r.composerName,r.buyerName,maskDocument(r.buyerDocument),r.buyerCityState,r.releaseType,r.agreedValue.toFixed(2),r.issueDate,r.authorizedPurpose,`${window.location.origin}/validar-documento?codigo=${r.documentCode}`].map(csvCell));

    const csvContent = '\uFEFF' + [headers.map(csvCell).join(';'), ...rows.map(row => row.join(';'))].join('\r\n');
    const objectUrl = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.setAttribute('href', objectUrl);
    link.setAttribute('download', `relatorio_liberacoes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
    showToast('CSV exportado com documentos pessoais mascarados.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível exportar o CSV.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {toast && (
        <div role={toast.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`fixed right-5 top-20 z-50 flex max-w-sm items-center gap-2 rounded-2xl px-4 py-3 text-xs font-bold shadow-2xl ${toast.type === 'success' ? 'bg-emerald-500 text-slate-950' : toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-950'}`}>
          <span className="flex-1">{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}
      
      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
            <ShieldCheck className="w-4 h-4" />
            <span>Gestão Jurídica Fonográfica</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Liberações Emitidas
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Histórico de termos de autorização e cessão de direitos patrimoniais emitidos para intérpretes e produtoras.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={totalReleases === 0 || isLoadingPage || isExporting}
            className="flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs border border-slate-700 transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            title="Exportar dados em formato CSV para contabilidade"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>{isExporting ? 'Exportando...' : 'Exportar CSV'}</span>
          </button>

          <Link
            to="/validar-documento"
            target="_blank"
            className="flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5"
          >
            <span>Validador</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* KPI Financial & Operational Metrics Grid */}
      {metricsError && (
        <div role="alert" className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-900 dark:text-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
            <span className="text-red-800 dark:text-red-300">Não foi possível carregar os indicadores: {metricsError}</span>
          </div>
          <button type="button" onClick={() => setRefreshToken(value => value + 1)} className="font-bold text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 underline text-xs">Tentar novamente</button>
        </div>
      )}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
              <span>Indicadores Financeiros e Operacionais</span>
            </span>
            {hasActiveFilters && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Filtros ativos ({filteredMetrics?.count ?? '…'} de {allMetrics?.count ?? '…'})
              </span>
            )}
          </div>

          {hasActiveFilters && (
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setKpiScope('filtered')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                  kpiScope === 'filtered'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Resultados da Busca ({filteredMetrics?.count ?? '…'})
              </button>
              <button
                type="button"
                onClick={() => setKpiScope('all')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                  kpiScope === 'all'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Histórico Geral ({allMetrics?.count ?? '…'})
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          
          {/* Total Documents */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
              {hasActiveFilters && kpiScope === 'filtered' ? 'Emitido no Filtro' : 'Total Emitido'}
            </span>
            <strong className="text-2xl font-bold text-white block">
              {activeMetrics?.count ?? '…'}
            </strong>
            <span className="text-[11px] text-slate-500 block">
              {hasActiveFilters && kpiScope === 'filtered'
                ? `${filteredMetrics?.count ?? '…'} de ${allMetrics?.count ?? '…'} no histórico`
                : `${activeMetrics?.uniqueBuyers ?? '…'} intérprete(s) atendido(s)`}
            </span>
          </div>

          {/* Total Value */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
              {hasActiveFilters && kpiScope === 'filtered' ? 'Valor Acordado no Filtro' : 'Total Acordado nos Termos'}
            </span>
            <strong className="text-2xl font-bold text-amber-400 font-mono block">
              R$ {activeMetrics?.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '…'}
            </strong>
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {hasActiveFilters && kpiScope === 'filtered'
                ? `Total: R$ ${allMetrics?.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '…'}`
                : 'Soma dos valores registrados nos termos'}
            </span>
          </div>

          {/* Average Ticket */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
              {hasActiveFilters && kpiScope === 'filtered' ? 'Ticket Médio (Filtro)' : 'Ticket Médio'}
            </span>
            <strong className="text-2xl font-bold text-white font-mono block">
              R$ {activeMetrics?.averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '…'}
            </strong>
            <span className="text-[11px] text-slate-500 block">
              Por autorização emitida
            </span>
          </div>

          {/* Exclusivity Split */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
              {hasActiveFilters && kpiScope === 'filtered' ? 'Modalidades (Filtro)' : 'Modalidades'}
            </span>
            <strong className="text-2xl font-bold text-white block">
              {activeMetrics?.exclusiveCount ?? '…'} Excl. / {activeMetrics?.nonExclusiveCount ?? '…'} Não
            </strong>
            <span className="text-[11px] text-slate-500 block">
              {(activeMetrics?.exclusiveCount || 0) > 0 ? `${activeMetrics?.exclusiveCount} obra(s) com exclusividade` : 'Apenas não-exclusivas'}
            </span>
          </div>

        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-lg">
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          
          {/* Text Search */}
          <div className="relative sm:col-span-2 lg:col-span-3">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="search"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              aria-label="Buscar liberações"
              placeholder="Buscar música, intérprete, código, CPF/CNPJ..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-9 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-2.5 p-0.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Song Filter */}
          <div className="sm:col-span-1 lg:col-span-3">
            <select
              value={selectedSongFilter}
              onChange={e => setSelectedSongFilter(e.target.value)}
              aria-label="Filtrar por composição"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="todas">Todas as Músicas</option>
              {songsWithReleases.map(s => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>

          {/* Exclusivity Type Filter */}
          <div className="sm:col-span-1 lg:col-span-2">
            <select
              value={selectedTypeFilter}
              onChange={e => setSelectedTypeFilter(e.target.value)}
              aria-label="Filtrar por tipo de liberação"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="todas">Todos os Tipos</option>
              <option value="nao_exclusiva">Não-Exclusiva</option>
              <option value="exclusiva">Exclusiva / Cessão</option>
            </select>
          </div>

          {/* Period Filter */}
          <div className="sm:col-span-1 lg:col-span-2">
            <select
              value={selectedPeriodFilter}
              onChange={e => setSelectedPeriodFilter(e.target.value)}
              aria-label="Filtrar por período"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="todos">Todo o período</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="180d">Últimos 6 meses</option>
              <option value="ano_atual">Ano atual ({new Date().getFullYear()})</option>
            </select>
          </div>

          {/* Sort Order */}
          <div className="sm:col-span-1 lg:col-span-2">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Ordenar liberações"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="recent">Mais recentes</option>
              <option value="oldest">Mais antigas</option>
              <option value="value_high">Maior valor</option>
              <option value="value_low">Menor valor</option>
              <option value="title">Música A–Z</option>
            </select>
          </div>

        </div>

        {/* Filter Summary & View Toggle Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400">
              <strong className="text-white font-semibold">{totalReleases}</strong> {totalReleases === 1 ? 'liberação encontrada' : 'liberações encontradas'}
            </span>
            {(searchTerm || selectedSongFilter !== 'todas' || selectedTypeFilter !== 'todas' || selectedPeriodFilter !== 'todos') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedSongFilter('todas');
                  setSelectedTypeFilter('todas');
                  setSelectedPeriodFilter('todos');
                }}
                className="px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold transition flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>Limpar filtros</span>
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 hidden sm:inline">Visualização:</span>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-label="Visualização em cards"
                className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 text-xs font-semibold ${viewMode === 'grid' ? 'bg-amber-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'}`}
                title="Visualização em Cards"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                aria-label="Visualização em tabela"
                className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 text-xs font-semibold ${viewMode === 'table' ? 'bg-amber-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'}`}
                title="Visualização em Tabela"
              >
                <List className="w-3.5 h-3.5" />
                <span>Tabela</span>
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Main Content Area: Cards or Table */}
      {isLoadingPage ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6" aria-busy="true" aria-label="Carregando liberações">
            {[1, 2, 3, 4].map(idx => (
              <div
                key={idx}
                className="bg-slate-900 border border-slate-800/90 rounded-3xl p-6 shadow-xl space-y-5 animate-pulse flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-slate-800 shrink-0"></div>
                      <div className="space-y-2">
                        <div className="h-3.5 w-28 bg-slate-800 rounded"></div>
                        <div className="h-5 w-44 bg-slate-800 rounded"></div>
                      </div>
                    </div>
                    <div className="h-6 w-24 bg-slate-800 rounded-full shrink-0"></div>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="h-3 w-28 bg-slate-800/60 rounded"></div>
                      <div className="h-3 w-24 bg-slate-800 rounded"></div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="h-3 w-20 bg-slate-800/60 rounded"></div>
                      <div className="h-3 w-28 bg-slate-800 rounded"></div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="h-3 w-24 bg-slate-800/60 rounded"></div>
                      <div className="h-3 w-20 bg-slate-800 rounded"></div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="h-3 w-28 bg-slate-800/60 rounded"></div>
                      <div className="h-3 w-20 bg-slate-800 rounded"></div>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80">
                      <div className="h-3 w-40 bg-slate-800/60 rounded"></div>
                    </div>
                  </div>

                  <div className="h-8 bg-slate-800/40 rounded-xl border border-slate-800/60"></div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <div className="h-8 w-16 bg-slate-800 rounded-xl"></div>
                    <div className="h-8 w-24 bg-slate-800 rounded-xl"></div>
                    <div className="h-8 w-24 bg-slate-800 rounded-xl"></div>
                  </div>
                  <div className="h-8 w-28 bg-slate-800 rounded-xl"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl" aria-busy="true" aria-label="Carregando liberações em tabela">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="p-4">Código / Obra</th>
                    <th className="p-4">Intérprete / Outorgado</th>
                    <th className="p-4">Modalidade</th>
                    <th className="p-4">Valor Acordado</th>
                    <th className="p-4">Emissão</th>
                    <th className="p-4 text-center">Autenticidade</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 animate-pulse">
                  {[1, 2, 3, 4, 5, 6].map(idx => (
                    <tr key={idx} className="hover:bg-slate-800/20 transition">
                      <td className="p-4 space-y-2">
                        <div className="h-3.5 w-24 bg-slate-800 rounded"></div>
                        <div className="h-4 w-40 bg-slate-800 rounded"></div>
                      </td>
                      <td className="p-4 space-y-1.5">
                        <div className="h-4 w-32 bg-slate-800 rounded"></div>
                        <div className="h-3 w-20 bg-slate-800/60 rounded"></div>
                      </td>
                      <td className="p-4">
                        <div className="h-5 w-20 bg-slate-800 rounded-full"></div>
                      </td>
                      <td className="p-4">
                        <div className="h-4 w-20 bg-slate-800 rounded"></div>
                      </td>
                      <td className="p-4">
                        <div className="h-3.5 w-16 bg-slate-800 rounded"></div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="h-6 w-16 bg-slate-800 rounded-lg mx-auto"></div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="h-7 w-24 bg-slate-800 rounded-xl"></div>
                          <div className="h-7 w-8 bg-slate-800 rounded-lg"></div>
                          <div className="h-7 w-8 bg-slate-800 rounded-lg"></div>
                          <div className="h-7 w-20 bg-slate-800 rounded-lg"></div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : pageError ? (
        <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-900 shadow-sm">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-600" />
          <p className="text-red-800 font-medium">{pageError}</p>
          <button type="button" onClick={() => setRefreshToken(value => value + 1)} className="mt-4 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white transition">Tentar novamente</button>
        </div>
      ) : filteredReleases.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 space-y-3 shadow-xl">
          <FileCheck className="w-12 h-12 mx-auto stroke-1 text-slate-600" />
          <h3 className="text-base font-bold text-white">
            {allMetrics?.count === 0 ? 'Nenhuma liberação emitida ainda' : 'Nenhuma liberação encontrada com os filtros atuais'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {allMetrics?.count === 0 
              ? 'Quando um intérprete solicitar a gravação e você confirmar o recebimento do valor, a autorização oficial será emitida aqui.'
              : 'Tente alterar os termos de busca ou limpar os filtros de seleção.'}
          </p>
          <button
            type="button"
            onClick={() => {
              if (allMetrics?.count === 0) {
                navigate('/dashboard/solicitacoes');
              } else {
                setSearchTerm('');
                setSelectedSongFilter('todas');
                setSelectedTypeFilter('todas');
                setSelectedPeriodFilter('todos');
              }
            }}
            className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-md inline-block mt-2"
          >
            {allMetrics?.count === 0 ? 'Ver Solicitações Pendentes' : 'Limpar Filtros'}
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* CARDS GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredReleases.map(doc => {
            const isExclusive = isExclusiveRelease(doc.releaseType);

            return (
              <div 
                key={doc.id}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 hover:border-slate-700 transition flex flex-col justify-between"
              >
                <div className="space-y-4">
                  
                  {/* Top Bar: Code and Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold shrink-0 shadow-sm">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[11px] text-amber-400 font-mono font-bold block">
                          {doc.documentCode}
                        </span>
                        <h3 className="font-bold text-white text-lg truncate">
                          “{doc.songTitle}”
                        </h3>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 border ${
                      isExclusive 
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                        : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    }`}>
                      {isExclusive ? 'Exclusiva' : 'Não-Exclusiva'}
                    </span>
                  </div>

                  {/* Summary Box */}
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/90 text-xs space-y-2 text-slate-300">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Intérprete / Outorgado:</span>
                      <strong className="text-white">{doc.buyerName}</strong>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Documento:</span>
                      <span className="text-slate-300 font-mono">{maskDocument(doc.buyerDocument)}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Valor Acordado:</span>
                      <strong className="text-emerald-400 font-mono font-bold">
                        R$ {doc.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Data de Emissão:</span>
                      <span className="text-slate-200">{formatDate(doc.issueDate)}</span>
                    </div>

                    <div className="flex justify-between items-center gap-2">
                      <span className="text-slate-400">Arquivo PDF:</span>
                      <span className={doc.documentPath ? 'font-semibold text-emerald-300' : 'font-semibold text-amber-300'}>
                        {doc.documentPath ? 'Arquivado' : 'Pendente de arquivamento'}
                      </span>
                    </div>

                    <div className="flex justify-between items-start gap-2">
                      <span className="text-slate-400">Validade:</span>
                      <span className="text-right text-slate-200">{getValidityLabel(doc)}</span>
                    </div>

                    <ReleaseDeliveryStatus
                      compact
                      status={deliveryStatuses[doc.id]}
                      isSending={sendingDeliveryId === doc.id}
                      onSend={() => void handleSendDelivery(doc)}
                    />

                    <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 truncate">
                      <span>Finalidade: </span>
                      <span className="text-slate-300 italic">{doc.authorizedPurpose}</span>
                    </div>
                  </div>

                  {/* Authenticity Public Link Bar */}
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-2 rounded-xl text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>Autenticação Digital Ativa</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => copyValidationLink(doc)}
                      className="text-emerald-300 hover:text-emerald-200 font-bold text-[11px] flex items-center gap-1 transition"
                    >
                      {copiedDocCode === doc.documentCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Link Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar Link</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>

                {/* Bottom Action Buttons */}
                <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* Baixar PDF */}
                    <button
                      type="button"
                      onClick={() => handleDownloadDocPdf(doc)}
                      disabled={downloadingDocCode === doc.documentCode}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 font-semibold text-xs border border-slate-700 transition flex items-center gap-1.5 disabled:opacity-50"
                      title="Baixar Termo Oficial em PDF"
                    >
                      {downloadingDocCode === doc.documentCode ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>PDF</span>
                    </button>

                    {!doc.documentPath && (
                      <button
                        type="button"
                        onClick={() => void handleArchiveDoc(doc)}
                        disabled={Boolean(archivingDocCode)}
                        className="px-3 py-2 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/30 font-semibold text-xs disabled:opacity-50"
                      >
                        {archivingDocCode === doc.documentCode ? 'Arquivando...' : 'Arquivar PDF'}
                      </button>
                    )}

                    {/* Send WhatsApp */}
                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(doc)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition"
                      title="Compartilhar o link público de autenticidade pelo WhatsApp"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </button>

                    {/* View Original Proposal Link */}
                    {doc.requestId && (
                      <button
                        type="button"
                        onClick={() => navigate(`/dashboard/solicitacoes/${doc.requestId}`)}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition"
                        title="Ver histórico e proposta original"
                      >
                        Ver Proposta
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedDoc(doc)}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition flex items-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Visualizar Termo</span>
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE CORPORATE VIEW */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="p-4">Código / Obra</th>
                  <th className="p-4">Intérprete / Outorgado</th>
                  <th className="p-4">Modalidade</th>
                  <th className="p-4">Valor Acordado</th>
                  <th className="p-4">Emissão</th>
                  <th className="p-4 min-w-64">Entrega</th>
                  <th className="p-4 text-center">Autenticidade</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredReleases.map(doc => {
                  const isExclusive = isExclusiveRelease(doc.releaseType);

                  return (
                    <tr key={doc.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-4">
                        <span className="font-mono text-[11px] text-amber-400 block font-bold">
                          {doc.documentCode}
                        </span>
                        <strong className="text-white text-sm block mt-0.5">
                          “{doc.songTitle}”
                        </strong>
                      </td>

                      <td className="p-4">
                        <strong className="text-slate-200 block">{doc.buyerName}</strong>
                        <span className="text-[11px] text-slate-500">{doc.buyerCityState}</span>
                      </td>

                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isExclusive ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {isExclusive ? 'Exclusiva' : 'Não-Exclusiva'}
                        </span>
                        <span className="mt-1 block text-[10px] text-slate-400">{getValidityLabel(doc)}</span>
                      </td>

                      <td className="p-4 font-mono font-bold text-emerald-400">
                        R$ {doc.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="p-4 text-slate-300">
                        {formatDate(doc.issueDate)}
                      </td>

                      <td className="p-4">
                        <ReleaseDeliveryStatus
                          compact
                          status={deliveryStatuses[doc.id]}
                          isSending={sendingDeliveryId === doc.id}
                          onSend={() => void handleSendDelivery(doc)}
                        />
                      </td>

                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={() => copyValidationLink(doc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold text-[11px] transition"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{copiedDocCode === doc.documentCode ? 'Copiado!' : 'Ativa'}</span>
                        </button>
                        <span className={`mt-1 block text-[10px] font-semibold ${doc.documentPath ? 'text-emerald-300' : 'text-amber-300'}`}>
                          PDF {doc.documentPath ? 'arquivado' : 'pendente'}
                        </span>
                      </td>

                      <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                        {doc.requestId && (
                          <button
                            type="button"
                            onClick={() => navigate(`/dashboard/solicitacoes/${doc.requestId}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs border border-slate-700 transition shadow-sm"
                            title="Ver histórico e proposta original"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                            <span>Ver Proposta</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDownloadDocPdf(doc)}
                          disabled={downloadingDocCode === doc.documentCode}
                          aria-label="Baixar termo em PDF"
                          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition disabled:opacity-50"
                          title="Baixar PDF Oficial"
                        >
                          {downloadingDocCode === doc.documentCode ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </button>

                        {!doc.documentPath && (
                          <button
                            type="button"
                            onClick={() => void handleArchiveDoc(doc)}
                            disabled={Boolean(archivingDocCode)}
                            className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 font-semibold text-xs disabled:opacity-50"
                          >
                            {archivingDocCode === doc.documentCode ? 'Arquivando...' : 'Arquivar PDF'}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleSendWhatsApp(doc)}
                          aria-label="Abrir mensagem no WhatsApp; envio não confirmado automaticamente"
                          className="p-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 transition"
                          title="Abrir mensagem no WhatsApp; envio não confirmado automaticamente"
                        >
                          <Phone className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedDoc(doc)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                        >
                          Ver Termo
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoadingPage && !pageError && totalPages > 1 && (
        <nav aria-label="Paginação das liberações" className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>Página {page} de {totalPages} · {totalReleases} liberações encontradas</span>
          <div className="flex gap-2">
            <button type="button" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))} className="min-h-10 rounded-xl bg-slate-800 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
            <button type="button" disabled={page === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))} className="min-h-10 rounded-xl bg-slate-800 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Próxima</button>
          </div>
        </nav>
      )}

      {/* Document Viewer Official Modal */}
      {selectedDoc && (
        <LiberacaoDocumentModal 
          document={selectedDoc}
          buyerPhone={getBuyerPhone(selectedDoc.requestId)}
          archiving={archivingDocCode === selectedDoc.documentCode}
          onRetryArchive={() => void handleArchiveDoc(selectedDoc)}
          onClose={() => setSelectedDoc(null)}
        />
      )}

      {/* WhatsApp Fallback / Share Modal */}
      {whatsAppModalDoc && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div ref={whatsappDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="whatsapp-modal-title" aria-describedby="whatsapp-modal-explanation" className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-slate-100 relative animate-fadeIn">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <Phone className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 id="whatsapp-modal-title" className="font-bold text-base text-white truncate">
                    Preparar mensagem no WhatsApp
                  </h3>
                  <p className="text-xs text-slate-400 truncate">
                    Obra: “{whatsAppModalDoc.songTitle}” · {whatsAppModalDoc.documentCode}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWhatsAppModalDoc(null)}
                aria-label="Fechar modal"
                className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning / Explanation Banner */}
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="block font-bold">WhatsApp não identificado no cadastro</strong>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Não localizamos um número válido registrado para <strong>{whatsAppModalDoc.buyerName}</strong>. Você pode informar o número abaixo, escolher o contato diretamente no WhatsApp Web ou copiar o texto pronto.
                </p>
              </div>
            </div>
            <p id="whatsapp-modal-explanation" className="text-xs text-slate-300">
              Abrir o WhatsApp apenas prepara a mensagem. O envio só deve ser confirmado após você enviá-la ao interessado.
            </p>

            {/* Option 1: Inform custom phone */}
            <div className="space-y-2">
              <label htmlFor="custom-whatsapp-input" className="block text-xs font-bold text-slate-200">
                Informar número de WhatsApp:
              </label>
              <div className="flex gap-2">
                <input
                  id="custom-whatsapp-input"
                  data-autofocus
                  type="tel"
                  value={customWhatsapp}
                  onChange={e => {
                    setCustomWhatsapp(e.target.value);
                    setWhatsAppPhoneError(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSendToCustomWhatsapp();
                  }}
                  placeholder="(11) 99999-9999"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handleSendToCustomWhatsapp}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-md shrink-0"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Abrir</span>
                </button>
              </div>
              {whatsAppPhoneError && (
                <p role="alert" className="text-[11px] text-red-400 font-semibold">{whatsAppPhoneError}</p>
              )}
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">ou</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            {/* Option 2: Open WhatsApp Web without phone */}
            <div>
              <button
                type="button"
                onClick={handleOpenWhatsAppWithoutPhone}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs border border-slate-700 transition flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4 text-emerald-400" />
                <span>Abrir WhatsApp Web (selecionar contato na lista)</span>
              </button>
            </div>

            {/* Option 3: Copy message */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">Prévia da Mensagem:</span>
                <button
                  type="button"
                  onClick={handleCopyWhatsAppMessage}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
                >
                  {whatsAppCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Mensagem Copiada!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Texto</span>
                    </>
                  )}
                </button>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto select-all font-mono">
                {getWhatsAppMessageText(whatsAppModalDoc)}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setWhatsAppModalDoc(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
