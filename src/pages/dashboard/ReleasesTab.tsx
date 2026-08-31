import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ReleaseDocument } from '../../types';
import { LiberacaoDocumentModal } from '../../components/common/LiberacaoDocumentModal';
import { downloadReleasePdf } from '../../lib/pdfGenerator';
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
  Loader2
} from 'lucide-react';

export const ReleasesTab: React.FC = () => {
  const { releases, requests, songs } = useApp();
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

  const handleDownloadDocPdf = async (doc: ReleaseDocument) => {
    try {
      setDownloadingDocCode(doc.documentCode);
      await new Promise(resolve => setTimeout(resolve, 50));
      downloadReleasePdf(doc);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
    } finally {
      setDownloadingDocCode(null);
    }
  };

  // Helper normalize
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Metrics Calculations
  const totalValue = useMemo(() => releases.reduce((total, rel) => total + (rel.agreedValue || 0), 0), [releases]);
  const averageTicket = useMemo(() => releases.length > 0 ? totalValue / releases.length : 0, [releases, totalValue]);
  const exclusiveCount = useMemo(() => releases.filter(r => r.releaseType.toLowerCase().includes('exclusiv')).length, [releases]);
  const nonExclusiveCount = useMemo(() => releases.length - exclusiveCount, [releases, exclusiveCount]);
  const uniqueBuyers = useMemo(() => new Set(releases.map(release => release.buyerDocument)).size, [releases]);

  // Unique songs present in releases
  const songsWithReleases = useMemo(() => {
    const songMap = new Map<string, string>();
    releases.forEach(r => songMap.set(r.songId, r.songTitle));
    return Array.from(songMap.entries()).map(([id, title]) => ({ id, title }));
  }, [releases]);

  // Filtered releases
  const filteredReleases = useMemo(() => {
    const query = normalize(searchTerm);
    const now = new Date();

    return releases.filter(rel => {
      // Search
      const matchesSearch = [
        rel.songTitle,
        rel.buyerName,
        rel.documentCode,
        rel.authors,
        rel.authorizedPurpose,
        rel.buyerCityState,
        rel.releaseType,
        rel.buyerDocument
      ].some(value => normalize(value).includes(query));

      if (!matchesSearch) return false;

      // Song Filter
      if (selectedSongFilter !== 'todas' && rel.songId !== selectedSongFilter) {
        return false;
      }

      // Type Filter
      if (selectedTypeFilter !== 'todas') {
        if (selectedTypeFilter === 'exclusiva' && !rel.releaseType.toLowerCase().includes('exclusiv')) return false;
        if (selectedTypeFilter === 'nao_exclusiva' && rel.releaseType.toLowerCase().includes('exclusiv')) return false;
      }

      // Period Filter
      if (selectedPeriodFilter !== 'todos') {
        const issueTime = new Date(rel.issueDate).getTime();
        if (selectedPeriodFilter === '30d') {
          const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).getTime();
          if (issueTime < past30) return false;
        } else if (selectedPeriodFilter === '180d') {
          const past180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).getTime();
          if (issueTime < past180) return false;
        } else if (selectedPeriodFilter === 'ano_atual') {
          const currentYear = now.getFullYear();
          if (new Date(rel.issueDate).getFullYear() !== currentYear) return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'oldest') return a.issueDate.localeCompare(b.issueDate);
      if (sortBy === 'value_high') return b.agreedValue - a.agreedValue;
      if (sortBy === 'value_low') return a.agreedValue - b.agreedValue;
      if (sortBy === 'title') return a.songTitle.localeCompare(b.songTitle, 'pt-BR');
      return b.issueDate.localeCompare(a.issueDate);
    });
  }, [releases, searchTerm, selectedSongFilter, selectedTypeFilter, selectedPeriodFilter, sortBy]);

  const formatDate = (date: string) => {
    const [year, month, day] = date.slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  };

  const maskDocument = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 4) return '••••';
    return `${'•'.repeat(Math.max(3, digits.length - 4))}${digits.slice(-4)}`;
  };

  const copyValidationLink = (doc: ReleaseDocument) => {
    const url = `${window.location.origin}/validar-documento?codigo=${doc.documentCode}`;
    navigator.clipboard.writeText(url);
    setCopiedDocCode(doc.documentCode);
    setTimeout(() => setCopiedDocCode(null), 2500);
  };

  const getBuyerPhone = (requestId: string) => {
    const req = requests.find(r => r.id === requestId);
    return req?.buyerWhatsapp;
  };

  const handleSendWhatsApp = (doc: ReleaseDocument) => {
    const buyerPhone = getBuyerPhone(doc.requestId) || '';
    const digits = buyerPhone.replace(/\D/g, '');
    const normalizedPhone = digits.length > 0 ? (digits.startsWith('55') ? digits : `55${digits}`) : '';
    const validationUrl = `${window.location.origin}/validar-documento?codigo=${doc.documentCode}`;
    const message = encodeURIComponent(
      `Olá, ${doc.buyerName}! Segue o Termo de Liberação da música "${doc.songTitle}" emitido por ${doc.composerName}.\n\nCódigo do Documento: ${doc.documentCode}\nTipo: ${doc.releaseType}\n\nVocê pode consultar e validar a autenticidade oficial do documento no link:\n${validationUrl}`
    );

    if (normalizedPhone) {
      window.open(`https://wa.me/${normalizedPhone}?text=${message}`, '_blank', 'noopener,noreferrer');
    } else {
      window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer');
    }
  };

  // Export to CSV Report
  const handleExportCsv = () => {
    if (filteredReleases.length === 0) return;

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

    const rows = filteredReleases.map(r => [
      `"${r.documentCode}"`,
      `"${r.songTitle.replace(/"/g, '""')}"`,
      `"${r.composerName.replace(/"/g, '""')}"`,
      `"${r.buyerName.replace(/"/g, '""')}"`,
      `"${r.buyerDocument}"`,
      `"${r.buyerCityState.replace(/"/g, '""')}"`,
      `"${r.releaseType.replace(/"/g, '""')}"`,
      r.agreedValue.toFixed(2),
      r.issueDate,
      `"${r.authorizedPurpose.replace(/"/g, '""')}"`,
      `"${window.location.origin}/validar-documento?codigo=${r.documentCode}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_liberacoes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      
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

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={releases.length === 0}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs border border-slate-700 transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            title="Exportar dados em formato CSV para contabilidade"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Exportar Relatório CSV</span>
          </button>

          <Link
            to="/validar-documento"
            target="_blank"
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5"
          >
            <span>Consultar Validador</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* KPI Financial & Operational Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Total Documents */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
            Total Emitido
          </span>
          <strong className="text-2xl font-bold text-white block">
            {releases.length}
          </strong>
          <span className="text-[11px] text-slate-500 block">
            {uniqueBuyers} intérprete(s) atendido(s)
          </span>
        </div>

        {/* Total Value */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
            Volume Negociado
          </span>
          <strong className="text-2xl font-bold text-amber-400 font-mono block">
            R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </strong>
          <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            100% recebido direto
          </span>
        </div>

        {/* Average Ticket */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
            Ticket Médio
          </span>
          <strong className="text-2xl font-bold text-white font-mono block">
            R$ {averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </strong>
          <span className="text-[11px] text-slate-500 block">
            Por autorização emitida
          </span>
        </div>

        {/* Exclusivity Split */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
            Modalidades
          </span>
          <strong className="text-2xl font-bold text-white block">
            {exclusiveCount} Excl. / {nonExclusiveCount} Não
          </strong>
          <span className="text-[11px] text-slate-500 block">
            {exclusiveCount > 0 ? `${exclusiveCount} obra(s) com exclusividade` : 'Apenas não-exclusivas'}
          </span>
        </div>

      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
        
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          
          {/* Text Search */}
          <div className="relative sm:col-span-4">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="search"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              aria-label="Buscar liberações"
              placeholder="Buscar por música, intérprete, código, CPF/CNPJ..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Song Filter */}
          <div className="sm:col-span-3">
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
          <div className="sm:col-span-2">
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

          {/* Sort Order */}
          <div className="sm:col-span-2">
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

          {/* View Mode Toggle */}
          <div className="sm:col-span-1 flex items-center justify-end">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full justify-center sm:w-auto">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-label="Visualização em cards"
                className={`p-1.5 rounded-lg transition ${viewMode === 'grid' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
                title="Cards"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                aria-label="Visualização em tabela"
                className={`p-1.5 rounded-lg transition ${viewMode === 'table' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
                title="Tabela"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* Main Content Area: Cards or Table */}
      {filteredReleases.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 space-y-3 shadow-xl">
          <FileCheck className="w-12 h-12 mx-auto stroke-1 text-slate-600" />
          <h3 className="text-base font-bold text-white">
            {releases.length === 0 ? 'Nenhuma liberação emitida ainda' : 'Nenhuma liberação encontrada com os filtros atuais'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {releases.length === 0 
              ? 'Quando um intérprete solicitar a gravação e você confirmar o recebimento do valor, a autorização oficial será emitida aqui.'
              : 'Tente alterar os termos de busca ou limpar os filtros de seleção.'}
          </p>
          <button
            type="button"
            onClick={() => {
              if (releases.length === 0) {
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
            {releases.length === 0 ? 'Ver Solicitações Pendentes' : 'Limpar Filtros'}
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* CARDS GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredReleases.map(doc => {
            const isExclusive = doc.releaseType.toLowerCase().includes('exclusiv');

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
                      <span className="text-slate-400">Valor Quitado:</span>
                      <strong className="text-emerald-400 font-mono font-bold">
                        R$ {doc.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Data de Emissão:</span>
                      <span className="text-slate-200">{formatDate(doc.issueDate)}</span>
                    </div>

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

                    {/* Send WhatsApp */}
                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(doc)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition"
                      title="Enviar termo para o WhatsApp do intérprete"
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="p-4">Código / Obra</th>
                  <th className="p-4">Intérprete / Outorgado</th>
                  <th className="p-4">Modalidade</th>
                  <th className="p-4">Valor Quitado</th>
                  <th className="p-4">Emissão</th>
                  <th className="p-4 text-center">Autenticidade</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredReleases.map(doc => {
                  const isExclusive = doc.releaseType.toLowerCase().includes('exclusiv');

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
                      </td>

                      <td className="p-4 font-mono font-bold text-emerald-400">
                        R$ {doc.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="p-4 text-slate-300">
                        {formatDate(doc.issueDate)}
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
                      </td>

                      <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
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

                        <button
                          type="button"
                          onClick={() => handleSendWhatsApp(doc)}
                          aria-label="Enviar termo por WhatsApp"
                          className="p-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 transition"
                          title="Enviar via WhatsApp"
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

      {/* Document Viewer Official Modal */}
      {selectedDoc && (
        <LiberacaoDocumentModal 
          document={selectedDoc}
          buyerPhone={getBuyerPhone(selectedDoc.requestId)}
          onClose={() => setSelectedDoc(null)}
        />
      )}

    </div>
  );
};
