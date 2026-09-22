import React from 'react';
import type { DashboardMetricPoint } from '../../types';
import { DashboardCard, DashboardSectionHeader } from './DashboardUI';

export const MetricsHistory: React.FC<{ points: DashboardMetricPoint[] }> = ({ points }) => {
  const totals = points.reduce((sum, point) => ({
    views: sum.views + point.profileViews,
    plays: sum.plays + point.songPlays,
    requests: sum.requests + point.interestRequests,
    releases: sum.releases + point.releasesIssued,
  }), { views: 0, plays: 0, requests: 0, releases: 0 });
  const chartPoints = points.slice(-14);
  const maxValue = Math.max(1, ...chartPoints.flatMap(point => [point.profileViews, point.songPlays]));
  const toPolyline = (key: 'profileViews' | 'songPlays') => chartPoints.map((point,index) => {
    const x = chartPoints.length === 1 ? 50 : (index/(chartPoints.length-1))*100;
    const y = 46-(point[key]/maxValue)*42;
    return `${x},${y}`;
  }).join(' ');

  return (
    <DashboardCard className="overflow-hidden" aria-labelledby="metrics-history-title">
      <DashboardSectionHeader title="Desempenho dos últimos 30 dias" description="Acompanhe o engajamento e a audiência das suas composições ao longo do tempo." titleId="metrics-history-title" />
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 sm:p-6">
        {[['Visualizações',totals.views],['Reproduções',totals.plays],['Solicitações',totals.requests],['Liberações',totals.releases]].map(([label,value]) => <div key={label} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 border border-transparent dark:border-slate-800/80"><span className="block text-xs text-slate-500 dark:text-slate-400">{label}</span><strong className="mt-1 block text-xl text-slate-900 dark:text-white">{Number(value).toLocaleString('pt-BR')}</strong></div>)}
      </div>
      {points.length ? (
        <div className="px-5 pb-6 sm:px-6">
          <div className="mb-2 flex gap-4 text-xs text-slate-600 dark:text-slate-300"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Visualizações</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" />Reproduções</span></div>
          <svg viewBox="0 0 100 48" role="img" aria-label="Gráfico de visualizações e reproduções dos últimos 14 dias" className="h-44 w-full overflow-visible rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3 border border-transparent dark:border-slate-800/60" preserveAspectRatio="none">
            <polyline points={toPolyline('profileViews')} fill="none" stroke="#f59e0b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <polyline points={toPolyline('songPlays')} fill="none" stroke="#2563eb" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
          <details className="mt-3 text-xs"><summary className="min-h-11 cursor-pointer py-3 font-bold text-slate-700 dark:text-slate-200 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">Ver dados do gráfico</summary><div className="max-h-52 overflow-auto"><table className="w-full"><thead><tr className="text-left text-slate-500 dark:text-slate-400"><th className="p-2">Data</th><th className="p-2">Visualizações</th><th className="p-2">Reproduções</th></tr></thead><tbody className="text-slate-700 dark:text-slate-300">{chartPoints.map(point=><tr key={point.date} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2">{new Date(`${point.date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td className="p-2">{point.profileViews}</td><td className="p-2">{point.songPlays}</td></tr>)}</tbody></table></div></details>
        </div>
      ) : <p className="px-5 pb-6 text-sm text-slate-500 dark:text-slate-400 sm:px-6">Nenhuma métrica registrada no período selecionado. Suas estatísticas serão exibidas assim que houver reproduções ou visualizações do seu perfil.</p>}
    </DashboardCard>
  );
};
