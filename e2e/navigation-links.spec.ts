import { expect, test } from '@playwright/test';

test('links de seção do rodapé e menu levam ao destino', async ({ page }) => {
  await page.goto('/');
  for (const id of ['como-funciona', 'beneficios', 'planos', 'faq']) {
    await page.locator('footer').getByRole('link', { name: id === 'faq' ? 'Dúvidas Frequentes (FAQ)' : id === 'planos' ? 'Planos e Preços' : id === 'beneficios' ? 'Benefícios' : 'Como funciona' }).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.locator(`#${id}`)).toBeInViewport();
  }

  await page.locator('footer').getByRole('link', { name: 'Direitos Autorais e ECAD' }).click();
  await expect(page.locator('#ecad-direitos')).toBeInViewport();
  await expect(page.locator('#ecad-direitos button')).toHaveAttribute('aria-expanded', 'true');

  await page.goto('/compositores');
  await page.locator('header nav').getByRole('button', { name: 'Como Funciona' }).click();
  await expect(page).toHaveURL(/\/#como-funciona$/);
  await expect(page.locator('#como-funciona')).toBeInViewport();
});
