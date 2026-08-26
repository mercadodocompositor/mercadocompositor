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
  FileText
} from 'lucide-react';

export const RequestsTab: React.FC = () => {
  const { requests, songs, updateRequestStatus, issueRelease, releases, profile } = useApp();

  const [activeTab, setActiveTab] = useState<RequestStatus | 'todas'>('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest'>('recent');
  const [selectedRequest, setSelectedRequest] = useState<InterestRequest | null>(null);
  
  // Detail drawer form state
  const [agreedValueInput, setAgreedValueInput] = useState<number | ''>('');
  const [notesInput, setNotesInput] = useState('');
  
  // Document modal trigger state
  const [viewingReleaseDoc, setViewingReleaseDoc] = useState<ReleaseDocument | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
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
    return matchesTab && matchesSearch;
  }).sort((a, b) => sortOrder === 'recent'
    ? b.createdAt.localeCompare(a.createdAt)
    : a.createdAt.localeCompare(b.createdAt));

  const formatDate = (date: string) => {
    const [year, month, day] = date.slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  };

  const handleOpenDetail = (req: InterestRequest) => {
    setSelectedRequest(req);
    setAgreedValueInput(req.agreedValue || '');
    setNotesInput(req.notes || '');
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
    updateRequestStatus(selectedRequest.id, selectedRequest.status, {
      agreedValue: agreedValueInput ? Number(agreedValueInput) : undefined,
      notes: notesInput
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

  const handleCreateRelease = () => {
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
      releaseType: "Autorização de Gravação e Exploração Fonográfica",
      issueDate: new Date().toLocaleDateString('en-CA'),
      additionalConditions: "Créditos de autoria obrigatórios em todos os fonogramas e sistemas de arrecadação ECAD.",
      digitalSignature: `${profile.name} (declaração eletrônica emitida pela conta autenticada)`
    });

    setViewingReleaseDoc(newDoc);
    setSelectedRequest(null);
  };

  const handleSimulateWhatsApp = (phone: string, songTitle: string) => {
    const digits = phone.replace(/\D/g, '');
    const normalizedPhone = digits.startsWith('55') ? digits : `55${digits}`;
    const msg = encodeURIComponent(`Olá! Sou ${profile.stageName}, do Mercado do Compositor. Recebi sua solicitação para a música "${songTitle}". Vamos conversar?`);
    window.open(`https://wa.me/${normalizedPhone}?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  const handleEmail = (email: string, songTitle: string) => {
    const subject = encodeURIComponent(`Solicitação sobre a música "${songTitle}"`);
    const body = encodeURIComponent(`Olá! Sou ${profile.stageName}, do Mercado do Compositor. Recebi sua solicitação e gostaria de conversar sobre a composição "${songTitle}".`);
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

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Toast */}
      {toastMessage && (
        <div role="status" className="fixed top-20 right-5 z-50 max-w-sm bg-emerald-500 text-slate-950 font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs animate-fadeIn">
          <CheckCircle2 className="w-5 h-5" />
          <span className="flex-1">{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)} aria-label="Fechar aviso" className="p-1 hover:bg-emerald-600/20 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Gestão de Solicitações de Intérpretes
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Acompanhe negociações, registre pagamentos recebidos e emita autorizações de gravação
          </p>
        </div>

        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs px-3.5 py-1.5 rounded-full font-bold">
          {requests.length} Solicitações no total
        </span>
      </div>

      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="search"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            aria-label="Buscar solicitações"
            placeholder="Buscar por comprador, música, cidade, e-mail ou documento..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>
        <select
          value={sortOrder}
          onChange={event => setSortOrder(event.target.value as typeof sortOrder)}
          aria-label="Ordenar solicitações"
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
        >
          <option value="recent">Mais recentes</option>
          <option value="oldest">Mais antigas</option>
        </select>
      </div>

      {/* Status Tabs required by Section 11 */}
      <div role="tablist" aria-label="Filtrar solicitações por status" className="bg-slate-900 border border-slate-800 p-2 rounded-2xl flex items-center gap-1 overflow-x-auto">
        {[
          { id: 'todas', label: 'Todas' },
          { id: 'nova', label: 'Novas' },
          { id: 'em_negociacao', label: 'Em Negociação' },
          { id: 'pagamento_pendente', label: 'Pagamento Pendente' },
          { id: 'pagamento_confirmado', label: 'Pagamento Confirmado' },
          { id: 'liberacao_enviada', label: 'Liberação Enviada' },
          { id: 'arquivada', label: 'Arquivadas' }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              key={tab.id}
              onClick={() => setActiveTab(tab.id as RequestStatus | 'todas')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                isActive 
                  ? 'bg-amber-500 text-slate-950 shadow-md' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label} ({tab.id === 'todas' ? requests.length : requests.filter(request => request.status === tab.id).length})
            </button>
          );
        })}
      </div>

      {/* Requests List */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="divide-y divide-slate-800/80">
          {filteredRequests.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <MessageSquare className="w-10 h-10 mx-auto stroke-1" />
              <p className="text-sm">Nenhuma solicitação encontrada.</p>
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')} className="text-xs font-bold text-amber-400 hover:text-amber-300">
                  Limpar busca
                </button>
              )}
            </div>
          ) : (
            filteredRequests.map(req => (
              <div key={req.id} className="p-5 hover:bg-slate-800/40 transition flex flex-col md:flex-row md:items-center justify-between gap-4">
                
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-amber-400 font-bold shrink-0">
                    <MessageSquare className="w-6 h-6" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white text-base">{req.buyerName}</h3>
                      {req.buyerStageName && (
                        <span className="text-xs text-amber-300 font-medium">({req.buyerStageName})</span>
                      )}
                      <span className="text-[11px] text-slate-500">• {req.buyerCityState}</span>
                      <span className="text-[11px] font-mono text-slate-500">Código: {getRequestCode(req.id)}</span>
                    </div>

                    <p className="text-xs text-slate-300">
                      Música solicitada: <strong className="text-amber-400">“{req.songTitle}”</strong>
                    </p>

                    <p className="text-xs text-slate-400 line-clamp-1 italic">
                      “{req.purpose}”
                    </p>
                    <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 pt-1">
                      <span>Recebida em {formatDate(req.createdAt)}</span>
                      {req.agreedValue && <span className="text-emerald-400">R$ {req.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                      {releases.some(release => release.requestId === req.id) && <span className="text-blue-400">Liberação emitida</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-800">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    req.status === 'pagamento_confirmado' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                    req.status === 'em_negociacao' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                    req.status === 'liberacao_enviada' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                    'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}>
                    {statusLabels[req.status]}
                  </span>

                  <button
                    onClick={() => handleOpenDetail(req)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-400 font-bold text-xs transition flex items-center gap-1"
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


      {/* Detail Drawer / Modal required by Section 11 */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
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
              <span className="text-[11px] text-amber-400 uppercase tracking-wider font-bold">
                Código da solicitação: {getRequestCode(selectedRequest.id)}
              </span>
              <h3 id="request-dialog-title" className="text-2xl font-bold text-white mt-1">
                {selectedRequest.buyerName}{selectedRequest.buyerStageName ? ` (${selectedRequest.buyerStageName})` : ''}
              </h3>
            </div>

            {/* Buyer Details Grid */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <p>Música: <strong className="text-amber-300">“{selectedRequest.songTitle}”</strong></p>
              <p>CPF / CNPJ: <strong className="text-slate-200">{selectedRequest.cpfCnpj}</strong></p>
              <p>E-mail: <strong className="text-slate-200">{selectedRequest.buyerEmail}</strong></p>
              <p>WhatsApp: <strong className="text-slate-200">{selectedRequest.buyerWhatsapp}</strong></p>
              <p>Cidade/UF: <strong className="text-slate-200">{selectedRequest.buyerCityState}</strong></p>
              <p>Data do envio: <strong className="text-slate-200">{formatDate(selectedRequest.createdAt)}</strong></p>
            </div>

            {/* Purpose & Message */}
            <div className="space-y-2 text-xs">
              <span className="font-semibold text-slate-300">Finalidade Declarada:</span>
              <p className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-200">
                {selectedRequest.purpose}
              </p>

              {selectedRequest.message && (
                <>
                  <span className="font-semibold text-slate-300 block pt-1">Mensagem do Comprador:</span>
                  <p className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-300 italic">
                    “{selectedRequest.message}”
                  </p>
                </>
              )}
            </div>

            {/* Direct Contact Buttons required by Section 11 */}
            <div className="flex flex-col sm:flex-row items-stretch gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleSimulateWhatsApp(selectedRequest.buyerWhatsapp, selectedRequest.songTitle)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition"
              >
                <Phone className="w-4 h-4" />
                <span>Conversar no WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => handleEmail(selectedRequest.buyerEmail, selectedRequest.songTitle)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition"
              >
                <Mail className="w-4 h-4 text-amber-400" />
                <span>Responder por E-mail</span>
              </button>
            </div>

            {/* Negotiation & Payment Management Controls */}
            <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 space-y-4">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <span>Gestão da Negociação e Pagamento Direto</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Status da Negociação</label>
                  <select
                    value={selectedRequest.status}
                    onChange={e => setSelectedRequest({ ...selectedRequest, status: e.target.value as RequestStatus })}
                    disabled={selectedRequest.status === 'pagamento_confirmado' || selectedRequest.status === 'liberacao_enviada'}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    {getAllowedStatuses(requests.find(request => request.id === selectedRequest.id)?.status || selectedRequest.status).map(status => (
                      <option key={status} value={status}>{statusLabels[status]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Valor Acordado (R$)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={agreedValueInput}
                    onChange={e => setAgreedValueInput(Number(e.target.value))}
                    placeholder="Ex: 3500"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Observações Internas</label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={notesInput}
                  onChange={e => setNotesInput(e.target.value)}
                  placeholder="Ex: PIX recebido na conta do compositor em 05/08."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                {selectedRequest.status === 'pagamento_pendente' && (
                  <button
                    type="button"
                    onClick={handleMarkPaymentReceived}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold text-xs flex items-center gap-1.5 transition"
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
                    className="px-5 py-2.5 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold text-xs flex items-center gap-1.5"
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
                    <span>Emitir Liberação</span>
                  </button>
                ) : null}
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Document Viewer Modal if user generates release */}
      {viewingReleaseDoc && (
        <LiberacaoDocumentModal 
          document={viewingReleaseDoc}
          onClose={() => setViewingReleaseDoc(null)}
        />
      )}

    </div>
  );
};
