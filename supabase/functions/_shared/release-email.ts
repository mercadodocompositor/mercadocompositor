export type ReleaseEmailFields = {
  buyer_name: string
  composer_name: string
  song_title: string
  document_code: string
  agreed_value: number
}

export const releaseTemplateVariables = (release: ReleaseEmailFields, deliveryUrl: string) => ({
  BUYER_NAME: release.buyer_name.trim(),
  COMPOSER_NAME: release.composer_name.trim(),
  SONG_TITLE: release.song_title.trim(),
  DOCUMENT_CODE: release.document_code.trim(),
  AGREED_VALUE: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(release.agreed_value),
  DELIVERY_URL: deliveryUrl,
  YEAR: String(new Date().getUTCFullYear()),
})
