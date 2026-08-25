import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SystemLog } from '../../types';
import { 
  Activity, 
  Search, 
  Trash2, 
  Download, 
  ShieldCheck, 
  DollarSign, 
  Lock, 
  Server, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  XCircle 
} from 'lucide-react';

export const AdminLogsTab: React.FC = () => {
  const { systemLogs, clearSystemLogs } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'auth' | 'financial' | 'moderation' | 'system'>('all');

  const filteredLogs = systemLogs.filter(log => {
    const matchesSearch = 
      log.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.ip.includes(searchTerm);

    const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const getCategoryIcon = (category: SystemLog['category']) => {
    switch (category) {
      case 'financial':
        return <DollarSign className="w-4 h-4 text-emerald-400" />;
      case 'auth':
        return <Lock className="w-4 h-4 text-amber-400" />;
      case 'moderation':
        return <ShieldCheck className="w-4 h-4 text-blue-400" />;
      default:
        return <Server className="w-4 h-4 text-purple-400" />;
    }
  };

  const getStatusBadge = (status: SystemLog['status']) => {
    switch (status) {
      case 'success':
        return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Sucesso</span>;
      case 'warning':
        return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Aviso</span>;
      case 'error':
        return <span className="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Erro</span>;
      default:
        return <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Info</span>;
    }
  };

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(systemLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `mercado-compositor-logs-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-400" />
            <span>Logs de Auditoria & Segurança do Sistema</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Rastreabilidade completa de logins, transações financeiras, emissões de contratos e uploads no Mercado.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportJson}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Exportar JSON</span>
          </button>

          <button
            onClick={() => {
              if (window.confirm("Deseja limpar os registros de log da sessão atual?")) {
                clearSystemLogs();
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 text-xs font-semibold flex items-center gap-2 transition"
          >
            <Trash2 className="w-4 h-4" />
            <span>Limpar Histórico</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por descrição, usuário, IP ou título do evento..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              categoryFilter === 'all'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-white bg-slate-950'
            }`}
          >
            Todos ({systemLogs.length})
          </button>
          <button
            onClick={() => setCategoryFilter('financial')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              categoryFilter === 'financial'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-emerald-400 bg-slate-950'
            }`}
          >
            Financeiro
          </button>
          <button
            onClick={() => setCategoryFilter('auth')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              categoryFilter === 'auth'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-amber-400 bg-slate-950'
            }`}
          >
            Autenticação
          </button>
          <button
            onClick={() => setCategoryFilter('moderation')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              categoryFilter === 'moderation'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-blue-400 bg-slate-950'
            }`}
          >
            Moderação
          </button>
        </div>
      </div>

      {/* Logs Stream List */}
      <div className="space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 p-12 rounded-3xl text-center">
            <Activity className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-white">Nenhum registro encontrado</p>
            <p className="text-xs text-slate-400 mt-1">Ajuste os filtros de busca para visualizar os logs.</p>
          </div>
        ) : (
          filteredLogs.map(log => (
            <div 
              key={log.id} 
              className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-700 transition"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                  {getCategoryIcon(log.category)}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-white font-bold text-xs sm:text-sm">{log.title}</span>
                    {getStatusBadge(log.status)}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{log.description}</p>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1">
                    <span>Usuário: <strong className="text-slate-300">{log.user}</strong></span>
                    <span>•</span>
                    <span>IP: <strong className="font-mono text-slate-300">{log.ip}</strong></span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0 text-[11px] text-slate-400 self-end sm:self-center font-mono">
                {log.timestamp}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
