import { describe, it, expect } from 'vitest';
import { evaluatePlanCapacity } from './planCapacity';
import { readFileSync } from 'fs';

describe('Capacidade do Plano de Assinatura: evaluatePlanCapacity', () => {
  it('não assume capacidade quando consultas ao banco falham', () => {
    const databaseSource = readFileSync('src/lib/database.ts', 'utf8');
    expect(databaseSource).toContain('if (subRes.error || songsCountRes.error || !subRes.data || songsCountRes.count === null)');
    expect(databaseSource).toContain("planName: 'Não verificado'");
    expect(databaseSource).not.toContain("return evaluatePlanCapacity(0, 100, 'Plano Padrão')");
  });
  it('permite upload para planos com limite ilimitado (null ou undefined)', () => {
    const resNull = evaluatePlanCapacity(150, null, 'Plano Ouro');
    expect(resNull.canAddSong).toBe(true);
    expect(resNull.isUnlimited).toBe(true);
    expect(resNull.maxSongs).toBeNull();
    expect(resNull.remainingSongs).toBeNull();
    expect(resNull.message).toBeUndefined();

    const resUndef = evaluatePlanCapacity(50, undefined, 'Plano Diamante');
    expect(resUndef.canAddSong).toBe(true);
    expect(resUndef.isUnlimited).toBe(true);
  });

  it('permite upload quando a quantidade atual for inferior ao limite do plano', () => {
    const res = evaluatePlanCapacity(40, 50, 'Plano Prata');
    expect(res.canAddSong).toBe(true);
    expect(res.isUnlimited).toBe(false);
    expect(res.currentSongCount).toBe(40);
    expect(res.maxSongs).toBe(50);
    expect(res.remainingSongs).toBe(10);
    expect(res.message).toBeUndefined();
  });

  it('bloqueia upload quando a quantidade atual atingir exatamente o limite do plano', () => {
    const res = evaluatePlanCapacity(50, 50, 'Plano Prata');
    expect(res.canAddSong).toBe(false);
    expect(res.isUnlimited).toBe(false);
    expect(res.currentSongCount).toBe(50);
    expect(res.maxSongs).toBe(50);
    expect(res.remainingSongs).toBe(0);
    expect(res.message).toContain('O Plano Prata permite até 50 músicas');
    expect(res.message).toContain('Faça um upgrade');
  });

  it('bloqueia upload quando a quantidade atual ultrapassar o limite do plano', () => {
    const res = evaluatePlanCapacity(55, 50, 'Plano Bronze');
    expect(res.canAddSong).toBe(false);
    expect(res.isUnlimited).toBe(false);
    expect(res.currentSongCount).toBe(55);
    expect(res.maxSongs).toBe(50);
    expect(res.remainingSongs).toBe(0);
    expect(res.message).toContain('O Plano Bronze permite até 50 músicas');
  });

  it('trata valores zerados e negativos com segurança', () => {
    const resZero = evaluatePlanCapacity(0, 10, 'Plano Iniciante');
    expect(resZero.canAddSong).toBe(true);
    expect(resZero.currentSongCount).toBe(0);
    expect(resZero.remainingSongs).toBe(10);

    const resNeg = evaluatePlanCapacity(-5, 10, 'Plano Iniciante');
    expect(resNeg.canAddSong).toBe(true);
    expect(resNeg.currentSongCount).toBe(0);
  });
});
