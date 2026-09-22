export interface PlanCapacityInfo {
  canAddSong: boolean;
  currentSongCount: number;
  maxSongs: number | null; // null = ilimitado
  remainingSongs: number | null; // null = ilimitado
  planName: string;
  isUnlimited: boolean;
  message?: string;
}

/**
 * Avalia a capacidade de adição de músicas para um plano de assinatura.
 * 
 * @param songCount Quantidade atual de músicas cadastradas pelo compositor.
 * @param maxSongs Limite de músicas do plano (null/undefined = ilimitado).
 * @param planName Nome descritivo do plano.
 * @returns Informações detalhadas de capacidade e permissão de upload.
 */
export const evaluatePlanCapacity = (
  songCount: number,
  maxSongs: number | null | undefined,
  planName = 'Plano Atual'
): PlanCapacityInfo => {
  const isUnlimited = maxSongs === null || maxSongs === undefined;
  const count = Math.max(0, Number(songCount) || 0);

  if (isUnlimited) {
    return {
      canAddSong: true,
      currentSongCount: count,
      maxSongs: null,
      remainingSongs: null,
      planName,
      isUnlimited: true,
    };
  }

  const limit = Math.max(1, Number(maxSongs) || 1);
  const remaining = Math.max(0, limit - count);
  const canAdd = count < limit;

  return {
    canAddSong: canAdd,
    currentSongCount: count,
    maxSongs: limit,
    remainingSongs: remaining,
    planName,
    isUnlimited: false,
    message: canAdd
      ? undefined
      : `O ${planName} permite até ${limit} ${limit === 1 ? 'música' : 'músicas'}. Você já atingiu o limite de ${count} ${count === 1 ? 'obra cadastrada' : 'obras cadastradas'}. Faça um upgrade para enviar novas composições.`,
  };
};
