import type { RequestStatus } from '../types';

export type RequestFilters = {
  status: RequestStatus | 'todas';
  song: string;
  query: string;
  sort: 'recent' | 'oldest';
  page: number;
};

const statuses = new Set<RequestStatus>([
  'nova', 'em_negociacao', 'pagamento_pendente',
  'pagamento_confirmado', 'liberacao_enviada', 'arquivada'
]);

export const parseRequestFilters = (params: URLSearchParams): RequestFilters => {
  const rawStatus = params.get('status')?.trim().toLowerCase();
  const rawPage = Number(params.get('page'));
  return {
    status: rawStatus && statuses.has(rawStatus as RequestStatus)
      ? (rawStatus as RequestStatus)
      : 'todas',
    song: params.get('song')?.trim() || 'todas',
    query: (params.get('q') || '').slice(0, 100),
    sort: params.get('sort') === 'oldest' ? 'oldest' : 'recent',
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  };
};

export const serializeRequestFilters = (filters: Partial<RequestFilters>): URLSearchParams => {
  const params = new URLSearchParams();
  const rawStatus = filters.status?.trim().toLowerCase();
  if (rawStatus && rawStatus !== 'todas' && statuses.has(rawStatus as RequestStatus)) {
    params.set('status', rawStatus);
  }
  if (filters.song && filters.song !== 'todas') {
    params.set('song', filters.song.trim());
  }
  if (filters.query && filters.query.trim()) {
    params.set('q', filters.query.trim().slice(0, 100));
  }
  if (filters.sort === 'oldest') {
    params.set('sort', 'oldest');
  }
  if (typeof filters.page === 'number' && Number.isSafeInteger(filters.page) && filters.page > 1) {
    params.set('page', String(filters.page));
  }
  return params;
};

