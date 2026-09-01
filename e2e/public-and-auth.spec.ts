import { expect, test } from '@playwright/test';

test('homepage carrega sem erros de console', async ({ page }) => {
  const errors:string[]=[];
  page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('header').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('rota protegida redireciona visitante para login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login|\/autenticacao/);
});

test('páginas públicas não criam rolagem horizontal no celular', async ({ page }) => {
  await page.goto('/');
  const hasOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  expect(hasOverflow).toBe(false);
});

test('validador de documento aceita navegação direta', async ({ page }) => {
  await page.goto('/validar-documento');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await expect(page.locator('input').first()).toBeVisible();
});

test('dashboard autenticado expõe navegação acessível', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL||!process.env.E2E_PASSWORD,'Credenciais E2E não configuradas.');
  await page.goto('/login');
  await page.getByLabel(/e-mail/i).fill(process.env.E2E_EMAIL!);
  await page.getByLabel(/senha/i).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button',{name:/entrar/i}).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('navigation',{name:/dashboard/i}).first()).toBeVisible();
  await expect(page.getByRole('heading',{name:/central de pendências/i})).toBeVisible();
});
