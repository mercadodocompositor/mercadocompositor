import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  AlertCircle,
  ArrowLeft,
  User,
  MapPin,
  Calendar,
  ExternalLink
} from 'lucide-react';

export const RequestsTab: React.FC = () => {
  const { requestId } = useParams<{ requestId?: string }>();
  const navigate = useNavigate();
  const { requests, songs, updateRequestStatus, issueRelease, updateSong, releases, profile } = useApp();

  const [activeTab, setActiveTab] = useState<RequestStatus | 'todas'>('todas');
  const [selectedSongFilter, setSelectedSongFilter] = useState<string>('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest'>('recent');
  
  // Selected request state based on URL or local state
  const activeRequest = requestId ? requests.find(r => r.id === requestId) : null;
  
  // Detail page form state
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

  // Sync form inputs when active request changes
  useEffect(() => {
    if (activeRequest) {
      setAgreedValueInput(activeRequest.agreedValue || '');
      setNotesInput(activeRequest.notes || '');
      setArchiveReason('');
      setCloseSongForRelease(false);
    }
  }, [activeRequest]);

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

  const handleSaveDetails = () => {
    if (!activeRequest) return;
    if (!getAllowedStatuses(activeRequest.status).includes(activeRequest.status)) {
      showToast('Essa mudança de status não é permitida no fluxo atual.');
      return;
    }
    if (agreedValueInput !== '' && Number(agreedValueInput) <= 0) {
      showToast('O valor acordado deve ser maior que zero.');
      return;
    }

    let finalNotes = notesInput;
    if (activeRequest.status === 'arquivada' && archiveReason) {
      finalNotes = finalNotes ? `${finalNotes}\n[Motivo do Arquivamento: ${archiveReason}]` : `[Motivo do Arquivamento: ${archiveReason}]`;
    }

    updateRequestStatus(activeRequest.id, activeRequest.status, {
      agreedValue: agreedValueInput ? Number(agreedValueInput) : undefined,
      notes: finalNotes
    });
    showToast("Detalhes e observações salvos com sucesso!");
  };

  const handleStatusChange = (newStatus: RequestStatus) => {
    if (!activeRequest) return;
    updateRequestStatus(activeRequest.id, newStatus, {
      agreedValue: agreedValueInput ? Number(agreedValueInput) : undefined,
      notes: notesInput
    });
    showToast(`Status alterado para "${statusLabels[newStatus]}"`);
  };

  const handleMarkPaymentReceived = () => {
    if (!activeRequest) return;
    if (!agreedValueInput || Number(agreedValueInput) <= 0) {
      showToast('Informe um valor acordado maior que zero antes de confirmar o pagamento.');
      return;
    }
    if (!window.confirm(`Confirmar o recebimento de R$ ${Number(agreedValueInput).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}?`)) return;
    updateRequestStatus(activeRequest.id, 'pagamento_confirmado', {
      agreedValue: Number(agreedValueInput),
      notes: notesInput,
      paymentReceivedAt: new Date().toISOString()
    });
    showToast("Pagamento marcado como recebido! O botão de Emitir Liberação está disponível.");
  };

  const handleCreateRelease = async () => {
    if (!activeRequest) return;
    const existingRelease = releases.find(release => release.requestId === activeRequest.id);
    if (existingRelease) {
      setViewingReleaseDoc(existingRelease);
      return;
    }
    if (activeRequest.status !== 'pagamento_confirmado') {
      showToast('A liberação só pode ser emitida após a confirmação do pagamento.');
      return;
    }
    const agreedValue = Number(agreedValueInput || activeRequest.agreedValue);
    if (!agreedValue || agreedValue <= 0) {
      showToast('Informe o valor acordado antes de emitir a liberação.');
      return;
    }
    const requestedSong = songs.find(song => song.id === activeRequest.songId);
    if (!requestedSong) {
      showToast('A música vinculada a esta solicitação não foi encontrada.');
      return;
    }

    const isExclusive = releaseTypeInput.toLowerCase().includes('exclusiv');

    const newDoc = issueRelease(activeRequest.id, {
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

  // ==========================================
  // VIEW 1: DEDICATED REQUEST DETAIL FULL PAGE
  // ==========================================
  if (activeRequest) {
    const song = songs.find(s => s.id === activeRequest.songId);
    const existingRelease = releases.find(r => r.requestId === activeRequest.id);

    return (
      <div className="space-y-6 animate-fadeIn pb-12">
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

        {/* Top Breadcrumb / Back Button */}
        <div className="flex items-center justify-between">
          <Link
            to="/dashboard/solicitacoes"
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
              activeRequest.status === 'liberacao_enviada' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
              'bg-slate-800 text-slate-300 border-slate-700'
            }`}>
              {statusLabels[activeRequest.status]}
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
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSimulateWhatsApp(activeRequest.buyerWhatsapp, activeRequest.songTitle, activeRequest.buyerName)}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
              >
                <Phone className="w-4 h-4" />
                <span>Conversar no WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => handleEmail(activeRequest.buyerEmail, activeRequest.songTitle, activeRequest.buyerName)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition"
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
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex justify-between items-center">
                  <span className="text-slate-400">Nome Completo:</span>
                  <strong className="text-white">{activeRequest.buyerName}</strong>
                </div>

                {activeRequest.buyerStageName && (
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex justify-between items-center">
                    <span className="text-slate-400">Nome Artístico:</span>
                    <strong className="text-amber-300">{activeRequest.buyerStageName}</strong>
                  </div>
                )}

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex justify-between items-center">
                  <span className="text-slate-400">CPF / CNPJ:</span>
                  <strong className="text-slate-200 font-mono">{formatCpfCnpj(activeRequest.cpfCnpj)}</strong>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex justify-between items-center">
                  <span className="text-slate-400">WhatsApp:</span>
                  <strong className="text-emerald-400 font-mono">{activeRequest.buyerWhatsapp}</strong>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex justify-between items-center">
                  <span className="text-slate-400">E-mail:</span>
                  <strong className="text-slate-200 truncate max-w-[200px]">{activeRequest.buyerEmail}</strong>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex justify-between items-center">
                  <span className="text-slate-400">Cidade / UF:</span>
                  <strong className="text-slate-200">{activeRequest.buyerCityState}</strong>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 flex justify-between items-center">
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

              {/* Status and Value Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1.5 font-semibold">Status da Negociação</label>
                  <select
                    value={activeRequest.status}
                    onChange={e => handleStatusChange(e.target.value as RequestStatus)}
                    disabled={activeRequest.status === 'pagamento_confirmado' || activeRequest.status === 'liberacao_enviada'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-3 text-white font-medium focus:outline-none focus:border-amber-500"
                  >
                    {getAllowedStatuses(activeRequest.status).map(status => (
                      <option key={status} value={status}>{statusLabels[status]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1.5 font-semibold">Valor Acordado (R$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-500 font-bold text-xs">R$</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={agreedValueInput}
                      onChange={e => setAgreedValueInput(e.target.value ? Number(e.target.value) : '')}
                      placeholder="0,00"
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-white font-mono font-bold text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  {agreedValueInput !== '' && (
                    <span className="text-[11px] text-emerald-400 font-semibold mt-1 block">
                      = R$ {Number(agreedValueInput).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>

              {/* Archive reason helper */}
              {activeRequest.status === 'arquivada' && (
                <div className="space-y-1 text-xs animate-fadeIn bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <label className="block text-slate-400 font-semibold mb-1">Motivo do Arquivamento (Opcional):</label>
                  <select
                    value={archiveReason}
                    onChange={e => setArchiveReason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-300 focus:outline-none focus:border-amber-500"
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

              {/* Internal Notes */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-semibold">
                  Observações Internas (Visíveis apenas para você)
                </label>
                <textarea
                  rows={4}
                  maxLength={500}
                  value={notesInput}
                  onChange={e => setNotesInput(e.target.value)}
                  placeholder="Ex: Conversa realizada por WhatsApp em 28/08. Pagamento de R$ 3.500 recebido na conta do compositor via PIX."
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-xs text-white focus:outline-none focus:border-amber-500 leading-relaxed"
                />
              </div>

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
                      value={releaseTypeInput}
                      onChange={e => setReleaseTypeInput(e.target.value)}
                      disabled={Boolean(existingRelease)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
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

                  {!existingRelease && releaseTypeInput.toLowerCase().includes('exclusiv') && (
                    <label className="flex items-start gap-2.5 pt-1 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={closeSongForRelease}
                        onChange={e => setCloseSongForRelease(e.target.checked)}
                        className="mt-0.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                      />
                      <span>Fechar automaticamente a música para novos interessados no catálogo público após a emissão.</span>
                    </label>
                  )}
                </div>
              )}

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-800">
                {activeRequest.status === 'pagamento_pendente' && (
                  <button
                    type="button"
                    onClick={handleMarkPaymentReceived}
                    className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar Pagamento Recebido</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveDetails}
                  className="px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
                >
                  Salvar Alterações
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
                    onClick={handleCreateRelease}
                    className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>Emitir Liberação Oficial</span>
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

      {/* Status Tabs with Colored Badges (Wrapped - No Horizontal Scroll) */}
      <div role="tablist" aria-label="Filtrar solicitações por status" className="bg-slate-900 border border-slate-800 p-2.5 rounded-2xl flex flex-wrap items-center gap-2">
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
                    onClick={() => navigate(`/dashboard/solicitacoes/${req.id}`)}
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
