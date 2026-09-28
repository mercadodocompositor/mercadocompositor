import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/featured_composers_2026_09_28.sql', 'utf8');
const page = readFileSync('src/pages/ComposersPage.tsx', 'utf8');

describe('compositores em destaque', () => {
  it('destaca por plano ou por escolha do admin, só com obra publicada', () => {
    expect(sql).toContain('add column if not exists is_featured boolean not null default false');
    expect(sql).toContain('add column if not exists includes_featured boolean not null default false');
    expect(sql).toMatch(/'featured', \(p\.is_featured or coalesce\(plan\.includes_featured, false\)\) and stats\.song_count > 0/);
    expect(sql).toMatch(/where name = 'Plano Ouro'/);
  });

  it('só a gestão de compositores altera o destaque, com auditoria', () => {
    expect(sql).toMatch(/admin_set_composer_featured[\s\S]+can_manage_composer_subscriptions\(\)[\s\S]+insert into public\.system_logs/);
    expect(sql).toContain('revoke execute on function public.admin_set_composer_featured(uuid, boolean) from public, anon');
  });

  it('não deixa o compositor editar colunas administrativas do perfil', () => {
    expect(sql).toContain('revoke update on table public.profiles from anon, authenticated');
    const grant = sql.split('grant update (')[1]?.split(') on table public.profiles')[0] || '';
    for (const column of ['is_featured', 'is_verified', 'views_count', 'featured_at']) {
      expect(grant).not.toContain(column);
    }
  });

  it('mostra a seção de destaque só sem filtros e tira os destacados da grade geral', () => {
    expect(page).toContain('const showFeaturedSection = !loading && !hasActiveFilters && featuredComposers.length > 0');
    expect(page).toContain('filteredComposers.filter(comp => !comp.featured)');
  });
});
