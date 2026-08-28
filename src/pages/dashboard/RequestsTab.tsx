import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { InterestRequest, RequestStatus, ReleaseDocument } from '../../types';
import { LiberacaoDocumentModal } from '../../components/common/LiberacaoDocumentModal';
import { getRequestCode } from '../../lib/identifiers';
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
  AlertCircle
} from 'lucide-react';

export const RequestsTab: React.FC = () => {
  const { requests, songs, updateRequestStatus, issueRelease, updateSong, releases, profile } = useApp();

  const [activeTab, setActiveTab] = useState<RequestStatus | 'todas'>('todas');
  const [selectedSongFilter, setSelectedSongFilter] = useState<string>('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest'>('recent');
  const [selectedRequest, setSelectedRequest] = useState<InterestRequest | null>(null);
  
  // Detail drawer form state
  const [agreedValueInput, setAgreedValueInput] = useState<number | ''>('');
  const [notesInput, setNotesInput] = useState('');
  const [releaseTypeInput, setReleaseTypeInput] = useState<string>('Autorização de Gravação e Exploração Fonográfica (Não-Exclusiva)');
  const [closeSongForRelease, setCloseSongForRelease] = useState<boolean>(false);
  const [archiveReason, setArchiveReason] = useState<string>('');
  
  // Document modal trigger state
  const [viewingReleaseDoc, setViewingReleaseDoc] = useState<ReleaseDocument | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const statusLabels: Record<RequestStatus, string> = {
    nova: 'Nova',
    em_negociacao: 'Em negociação',
    pagamento_pendente: 'Pagamento pendente',
    pagamento_confirmado: 'Pagamento confirmado',
    liberacao_enviada: 'Liberação enviada',
    arquivada: 'Arquivada'
  };

  const getAllowedStatuses = (current: RequestStatus): RequestStatus[] => {
    if (current === 'nova') return ['nova', 'em_negociacao', 'arquivada'];
    if (current === 'em_negociacao') return ['em_negociacao', 'pagamento_pendente', 'arquivada'];
    if (current === 'pagamento_pendente') return ['pagamento_pendente', 'em_negociacao', 'arquivada'];
    if (current === 'arquivada') return ['arquivada', 'nova'];
    return [current];
  };

  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const filteredRequests = requests.filter(req => {
    const matchesTab = activeTab === 'todas' || req.status === activeTab;
    const matchesSong = selectedSongFilter === 'todas' || req.songId === selectedSongFilter;
    const query = normalize(searchTerm);
    const matchesSearch = [
      req.buyerName,
      req.buyerStageName || '',
      req.songTitle,
      req.buyerCityState,
      req.buyerEmail,
      req.cpfCnpj,
      getRequestCode(req.id)
    ].some(value => normalize(value).includes(query));
    return matchesTab && matchesSong && matchesSearch;
  }).sort((a, b) => sortOrder === 'recent'
    ? b.createdAt.localeCompare(a.createdAt)
    : a.createdAt.localeCompare(b.createdAt));

  const formatDate = (date: string) => {
    const [year, month, day] = date.slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
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

  const handleOpenDetail = (req: InterestRequest) => {
    setSelectedRequest(req);
    setAgreedValueInput(req.agreedValue || '');
    setNotesInput(req.notes || '');
    setArchiveReason('');
    setCloseSongForRelease(false);
  };

  const handleSaveDetails = () => {
    if (!selectedRequest) return;
    const persistedRequest = requests.find(request => request.id === selectedRequest.id);
    if (persistedRequest && !getAllowedStatuses(persistedRequest.status).includes(selectedRequest.status)) {
      showToast('Essa mudança de status não é permitida no fluxo atual.');
      return;
    }
    if (agreedValueInput !== '' && Number(agreedValueInput) <= 0) {
      showToast('O valor acordado deve ser maior que zero.');
      return;
    }

    let finalNotes = notesInput;
    if (selectedRequest.status === 'arquivada' && archiveReason) {
      finalNotes = finalNotes ? `${finalNotes}\n[Motivo do Arquivamento: ${archiveReason}]` : `[Motivo do Arquivamento: ${archiveReason}]`;
    }

    updateRequestStatus(selectedRequest.id, selectedRequest.status, {
      agreedValue: agreedValueInput ? Number(agreedValueInput) : undefined,
      notes: finalNotes
    });
    showToast("Detalhes e observações salvos com sucesso!");
    setSelectedRequest(null);
  };

  const handleMarkPaymentReceived = () => {
    if (!selectedRequest) return;
    if (!agreedValueInput || Number(agreedValueInput) <= 0) {
      showToast('Informe um valor acordado maior que zero antes de confirmar o pagamento.');
      return;
    }
    if (!window.confirm(`Confirmar o recebimento de R$ ${Number(agreedValueInput).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}?`)) return;
    updateRequestStatus(selectedRequest.id, 'pagamento_confirmado', {
      agreedValue: Number(agreedValueInput),
      notes: notesInput,
      paymentReceivedAt: new Date().toISOString()
    });
    showToast("Pagamento marcado como recebido! O botão de Emitir Liberação está liberado.");
    setSelectedRequest(prev => prev ? {
      ...prev,
      status: 'pagamento_confirmado',
      agreedValue: Number(agreedValueInput)
    } : null);
  };

  const handleCreateRelease = async () => {
    if (!selectedRequest) return;
    const existingRelease = releases.find(release => release.requestId === selectedRequest.id);
    if (existingRelease) {
      setViewingReleaseDoc(existingRelease);
      setSelectedRequest(null);
      return;
    }
    if (selectedRequest.status !== 'pagamento_confirmado') {
      showToast('A liberação só pode ser emitida após a confirmação do pagamento.');
      return;
    }
    const agreedValue = Number(agreedValueInput || selectedRequest.agreedValue);
    if (!agreedValue || agreedValue <= 0) {
      showToast('Informe o valor acordado antes de emitir a liberação.');
      return;
    }
    const requestedSong = songs.find(song => song.id === selectedRequest.songId);
    if (!requestedSong) {
      showToast('A música vinculada a esta solicitação não foi encontrada.');
      return;
    }

    const isExclusive = releaseTypeInput.toLowerCase().includes('exclusiv');

    const newDoc = issueRelease(selectedRequest.id, {
      requestId: selectedRequest.id,
      songId: selectedRequest.songId,
      songTitle: selectedRequest.songTitle,
      authors: requestedSong.authors,
      composerName: profile.name,
      composerCpf: profile.cpf,
      composerCityState: `${profile.city} - ${profile.state}`,
      buyerName: selectedRequest.buyerName,
      buyerDocument: selectedRequest.cpfCnpj,
      buyerCityState: selectedRequest.buyerCityState,
      agreedValue,
      authorizedPurpose: selectedRequest.purpose,
      releaseType: releaseTypeInput,
      issueDate: new Date().toLocaleDateString('en-CA'),
      additionalConditions: isExclusive 
        ? "Liberação com cláusula de exclusividade. Créditos de autoria obrigatórios em todos os fonogramas e sistemas de arrecadação ECAD."
        : "Créditos de autoria obrigatórios em todos os fonogramas e sistemas de arrecadação ECAD.",
      digitalSignature: `${profile.name} (declaração eletrônica emitida pela conta autenticada)`
    });

    if (closeSongForRelease) {
      await updateSong(requestedSong.id, { isAvailableForRelease: false });
      showToast("Liberação emitida! A música foi fechada para novas propostas.");
    } else {
      showToast("Liberação emitida com sucesso!");
    }

    setViewingReleaseDoc(newDoc);
    setSelectedRequest(null);
  };

  const handleSimulateWhatsApp = (phone: string, songTitle: string, buyerName?: string) => {
    const digits = phone.replace(/\D/g, '');
    const normalizedPhone = digits.startsWith('55') ? digits : `55${digits}`;
    const greeting = buyerName ? `Olá, ${buyerName}!` : 'Olá!';
    const msg = encodeURIComponent(`${greeting} Sou ${profile.stageName || profile.name}, compositor cadastrado no Mercado do Compositor. Recebi sua solicitação para a música "${songTitle}". Vamos conversar sobre os detalhes da gravação?`);
    window.open(`https://wa.me/${normalizedPhone}?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  const handleEmail = (email: string, songTitle: string, buyerName?: string) => {
    const subject = encodeURIComponent(`Mercado do Compositor — Solicitação da música "${songTitle}"`);
    const body = encodeURIComponent(`Olá ${buyerName || ''},\n\nRecebi sua solicitação de gravação para a música "${songTitle}".\nEstou à disposição para combinarmos os detalhes e valores para emissão da autorização.\n\nAtenciosamente,\n${profile.stageName || profile.name}`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  React.useEffect(() => {
    if (!selectedRequest) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedRequest(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedRequest]);

  // Timeline step helper
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

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Toast Feedback */}
      {toastMessage && (
        <div role="status" className="fixed top-20 right-5 z-50 max-w-sm bg-emerald-500 text-slate-950 font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="flex-1">{toastMessage}</span>
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
              <strong className="text-xs text-white">{requests.length}</strong>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-2xl flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-300" />
            <div className="text-left">
              <span className="block text-[10px] text-slate-500 font-bold uppercase">Em Negociação</span>
              <strong className="text-xs text-amber-300">
                {requests.filter(r => r.status === 'em_negociacao' || r.status === 'pagamento_pendente').length}
              </strong>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-2xl flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            <div className="text-left">
              <span className="block text-[10px] text-slate-500 font-bold uppercase">Liberadas</span>
              <strong className="text-xs text-emerald-400">
                {requests.filter(r => r.status === 'liberacao_enviada').length}
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
            <option value="todas">Todas as Músicas ({requests.length})</option>
            {songs.map(s => {
              const count = requests.filter(r => r.songId === s.id).length;
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

      {/* Status Tabs with Colored Badges */}
      <div role="tablist" aria-label="Filtrar solicitações por status" className="bg-slate-900 border border-slate-800 p-2 rounded-2xl flex items-center gap-1.5 overflow-x-auto">
        {[
          { id: 'todas', label: 'Todas', badgeClass: 'bg-slate-800 text-slate-300' },
          { id: 'nova', label: 'Novas', badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
          { id: 'em_negociacao', label: 'Em Negociação', badgeClass: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' },
          { id: 'pagamento_pendente', label: 'Pagamento Pendente', badgeClass: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' },
          { id: 'pagamento_confirmado', label: 'Pagamento Confirmado', badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
          { id: 'liberacao_enviada', label: 'Liberação Enviada', badgeClass: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
          { id: 'arquivada', label: 'Arquivadas', badgeClass: 'bg-slate-800 text-slate-400' }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          const count = tab.id === 'todas' ? requests.length : requests.filter(request => request.status === tab.id).length;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              key={tab.id}
              onClick={() => setActiveTab(tab.id as RequestStatus | 'todas')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-2 ${
                isActive 
                  ? 'bg-amber-500 text-slate-950 shadow-md' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
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
          {filteredRequests.length === 0 ? (
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
            filteredRequests.map(req => (
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
                    onClick={() => handleOpenDetail(req)}
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

      {/* Detail Drawer / Modal with Visual Timeline & Full Controls */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div role="dialog" aria-modal="true" aria-labelledby="request-dialog-title" className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative my-8 text-slate-100 space-y-6">
            
            <button
              type="button"
              onClick={() => setSelectedRequest(null)}
              aria-label="Fechar detalhes da solicitação"
              className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/80 hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-amber-400 uppercase tracking-wider font-bold bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                  Código: {getRequestCode(selectedRequest.id)}
                </span>
                <span className="text-[11px] text-slate-400">
                  Recebida em {formatDate(selectedRequest.createdAt)}
                </span>
              </div>
              <h3 id="request-dialog-title" className="text-2xl font-bold text-white mt-1">
                {selectedRequest.buyerName}{selectedRequest.buyerStageName ? ` (${selectedRequest.buyerStageName})` : ''}
              </h3>
            </div>

            {/* Stepper / Timeline Visual Component */}
            {selectedRequest.status !== 'arquivada' && (
              <div className="bg-slate-950 border border-slate-800/90 p-4 rounded-2xl">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-3">
                  Etapa da Negociação:
                </span>
                <div className="grid grid-cols-5 gap-1 text-center">
                  {timelineSteps.map(stepItem => {
                    const currentStepNum = getTimelineStep(selectedRequest.status);
                    const isDone = currentStepNum >= stepItem.step;
                    const isCurrent = currentStepNum === stepItem.step;
                    const IconComponent = stepItem.icon;

                    return (
                      <div key={stepItem.step} className="flex flex-col items-center gap-1.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${
                          isCurrent
                            ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-500/20'
                            : isDone
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-slate-900 text-slate-600 border border-slate-800'
                        }`}>
                          {isDone && !isCurrent ? <Check className="w-4 h-4" /> : <IconComponent className="w-4 h-4" />}
                        </div>
                        <span className={`text-[9px] leading-tight font-medium ${
                          isCurrent ? 'text-amber-400 font-bold' : isDone ? 'text-slate-300' : 'text-slate-600'
                        }`}>
                          {stepItem.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Buyer Details Grid */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <p>Música: <strong className="text-amber-300">“{selectedRequest.songTitle}”</strong></p>
              <p>CPF / CNPJ: <strong className="text-slate-200">{formatCpfCnpj(selectedRequest.cpfCnpj)}</strong></p>
              <p>E-mail: <strong className="text-slate-200">{selectedRequest.buyerEmail}</strong></p>
              <p>WhatsApp: <strong className="text-slate-200">{selectedRequest.buyerWhatsapp}</strong></p>
              <p>Cidade/UF: <strong className="text-slate-200">{selectedRequest.buyerCityState}</strong></p>
              <p>Status atual: <strong className="text-amber-400 uppercase">{statusLabels[selectedRequest.status]}</strong></p>
            </div>

            {/* Purpose & Message */}
            <div className="space-y-2 text-xs">
              <span className="font-semibold text-slate-300">Finalidade Declarada:</span>
              <p className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-200 font-medium">
                {selectedRequest.purpose}
              </p>

              {selectedRequest.message && (
                <>
                  <span className="font-semibold text-slate-300 block pt-1">Mensagem do Interessado:</span>
                  <p className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-300 italic leading-relaxed">
                    “{selectedRequest.message}”
                  </p>
                </>
              )}
            </div>

            {/* Direct Contact Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch gap-3 pt-1">
              <button
                type="button"
                onClick={() => handleSimulateWhatsApp(selectedRequest.buyerWhatsapp, selectedRequest.songTitle, selectedRequest.buyerName)}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition"
              >
                <Phone className="w-4 h-4" />
                <span>Conversar no WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => handleEmail(selectedRequest.buyerEmail, selectedRequest.songTitle, selectedRequest.buyerName)}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
              >
                <Mail className="w-4 h-4 text-amber-400" />
                <span>Responder por E-mail</span>
              </button>
            </div>

            {/* Negotiation & Payment Management Controls */}
            <div className="bg-slate-950/90 p-5 rounded-2xl border border-slate-800 space-y-4">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <span>Gestão da Negociação e Pagamento Direto</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Status da Negociação</label>
                  <select
                    value={selectedRequest.status}
                    onChange={e => setSelectedRequest({ ...selectedRequest, status: e.target.value as RequestStatus })}
                    disabled={selectedRequest.status === 'pagamento_confirmado' || selectedRequest.status === 'liberacao_enviada'}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  >
                    {getAllowedStatuses(requests.find(request => request.id === selectedRequest.id)?.status || selectedRequest.status).map(status => (
                      <option key={status} value={status}>{statusLabels[status]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Valor Acordado (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-500 font-bold text-xs">R$</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={agreedValueInput}
                      onChange={e => setAgreedValueInput(e.target.value ? Number(e.target.value) : '')}
                      placeholder="0,00"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  {agreedValueInput !== '' && (
                    <span className="text-[11px] text-emerald-400 font-semibold mt-1 block">
                      = R$ {Number(agreedValueInput).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>

              {/* Archive reason helper when selecting "arquivada" */}
              {selectedRequest.status === 'arquivada' && (
                <div className="animate-fadeIn space-y-1 text-xs">
                  <label className="block text-slate-400 font-semibold">Motivo do Arquivamento (Opcional):</label>
                  <select
                    value={archiveReason}
                    onChange={e => setArchiveReason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Selecione um motivo...</option>
                    <option value="Valor não acordado">Valor proposto não aceito</option>
                    <option value="Interessado não respondeu">Interessado não deu continuidade</option>
                    <option value="Obra já liberada para outro intérprete">Obra já liberada com exclusividade para outro artista</option>
                    <option value="Desistência mútua">Desistência mútua das partes</option>
                    <option value="Outro motivo">Outro motivo</option>
                  </select>
                </div>
              )}

              {/* Release Type Configuration if payment is confirmed or sending release */}
              {(selectedRequest.status === 'pagamento_confirmado' || selectedRequest.status === 'liberacao_enviada') && (
                <div className="bg-slate-900 p-4 rounded-xl border border-amber-500/30 space-y-3 animate-fadeIn text-xs">
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Configuração do Termo de Autorização</span>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Tipo de Autorização Fonográfica:</label>
                    <select
                      value={releaseTypeInput}
                      onChange={e => setReleaseTypeInput(e.target.value)}
                      disabled={releases.some(r => r.requestId === selectedRequest.id)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="Autorização de Gravação e Exploração Fonográfica (Não-Exclusiva)">
                        Autorização Não-Exclusiva (Padrão para regravações fonográficas)
                      </option>
                      <option value="Autorização Exclusiva de Gravação e Fixação (12 meses)">
                        Autorização Exclusiva por 12 meses
                      </option>
                      <option value="Autorização Exclusiva de Gravação e Fixação (24 meses)">
                        Autorização Exclusiva por 24 meses
                      </option>
                      <option value="Cessão Exclusiva Definitiva de Direitos Patrimoniais">
                        Cessão Exclusiva Definitiva de Direitos Patrimoniais
                      </option>
                    </select>
                  </div>

                  {!releases.some(r => r.requestId === selectedRequest.id) && releaseTypeInput.toLowerCase().includes('exclusiv') && (
                    <label className="flex items-start gap-2 pt-1 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={closeSongForRelease}
                        onChange={e => setCloseSongForRelease(e.target.checked)}
                        className="mt-0.5 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
                      />
                      <span>Fechar automaticamente a música para novos interessados no catálogo público após a emissão.</span>
                    </label>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1 font-semibold">Observações Internas (Visíveis apenas para você)</label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={notesInput}
                  onChange={e => setNotesInput(e.target.value)}
                  placeholder="Ex: Pagamento de R$ 3.500 recebido via PIX em 28/08. Liberado para gravação do single."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                {selectedRequest.status === 'pagamento_pendente' && (
                  <button
                    type="button"
                    onClick={handleMarkPaymentReceived}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar Pagamento</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveDetails}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
                >
                  Salvar Alterações
                </button>

                {releases.some(release => release.requestId === selectedRequest.id) ? (
                  <button
                    type="button"
                    onClick={() => {
                      const document = releases.find(release => release.requestId === selectedRequest.id);
                      if (document) {
                        setViewingReleaseDoc(document);
                        setSelectedRequest(null);
                      }
                    }}
                    className="px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Visualizar Liberação</span>
                  </button>
                ) : selectedRequest.status === 'pagamento_confirmado' ? (
                  <button
                    type="button"
                    onClick={handleCreateRelease}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>Emitir Liberação Oficial</span>
                  </button>
                ) : null}
              </div>

            </div>

          </div>
        </div>
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
