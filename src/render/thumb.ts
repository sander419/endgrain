/**
 * Уменьшение снимка доски под витрину.
 *
 * Снимок для печати — PNG на 1200 px: на бумаге нужна резкость, а размер
 * не важен. Витрина живёт по другим правилам: картинки лежат в `localStorage`
 * рядом с двумя десятками таких же, а потом целиком уезжают внутрь HTML-файла,
 * который мастерская отправит клиенту в мессенджере.
 *
 * PNG на древесной текстуре почти не сжимается — тот же кадр в JPEG выходит
 * впятеро легче и на фотографии дерева неотличим. Отсюда 560 px и JPEG:
 * карточка показывается шириной 270–500 px, запас на плотный экран остаётся.
 */

/** Ширина снимка в карточке витрины. */
export const SHOWCASE_IMAGE_WIDTH = 560;

/** Ниже — заметны артефакты на границах пород, выше — файл толстеет впустую. */
export const SHOWCASE_IMAGE_QUALITY = 0.82;

/**
 * Пропорции карточки. Снимок доски обрезается по центру: доски бывают
 * и квадратные, и вытянутые, а сетка карточек должна стоять ровно.
 */
export const SHOWCASE_ASPECT = 4 / 3;

/**
 * Ужать data URI до размера карточки. Возвращает JPEG.
 *
 * Асинхронно, потому что картинку сначала надо декодировать. Ошибку не бросает:
 * не получилось — вернём исходник, карточка с тяжёлой картинкой лучше карточки
 * без картинки.
 */
export function shrinkForShowcase(
  dataUri: string,
  width = SHOWCASE_IMAGE_WIDTH,
  quality = SHOWCASE_IMAGE_QUALITY
): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUri) {
      resolve('');
      return;
    }

    const image = new Image();
    image.onload = () => {
      try {
        const height = Math.round(width / SHOWCASE_ASPECT);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUri);
          return;
        }

        // Белый фон под JPEG: формат не знает прозрачности, и без заливки
        // прозрачные края становятся чёрными.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Кроп по центру: масштабируем по большей стороне и срезаем лишнее.
        const scale = Math.max(width / image.width, height / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          image,
          (width - drawWidth) / 2,
          (height - drawHeight) / 2,
          drawWidth,
          drawHeight
        );

        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUri);
      }
    };
    image.onerror = () => resolve('');
    image.src = dataUri;
  });
}
