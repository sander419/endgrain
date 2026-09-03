/**
 * Публичный ключ, которым приложение проверяет подпись лицензии.
 *
 * Файл сгенерирован: node tools/issue-license.mjs keygen
 * Руками не править. Смена этой пары делает недействительными все выданные
 * ключи, поэтому она и вынесена в отдельный файл — чтобы такое изменение
 * было видно в диффе одной строкой, а не терялось среди правок логики.
 *
 * Секрета здесь нет: публичный ключ на то и публичный.
 */
export const PUBLIC_KEY: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'SUwe8GrMBI4Q8hnAGCRLEthnJSGHc8i0HXBJWva0OsI',
  y: 'LZYlHky3agsJJfSQ3lErwKbRYcGH7IMaRQCr-aqjgU0',
  ext: true,
};
