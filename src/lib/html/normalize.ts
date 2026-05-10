import * as cheerio from 'cheerio';

function collapseWhitespace(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function normalizeHtml(rawHtml: string, format: 'html' | 'text' = 'html'): string {
  const $ = cheerio.load(rawHtml);
  const article = $('#js_article');

  if (!article.length) {
    throw new Error('未找到 #js_article');
  }

  article.find('#js_top_ad_area').remove();
  article.find('#js_tags_preview_toast').remove();
  article.find('#content_bottom_area').remove();
  article.find('#js_pc_qr_code').remove();
  article.find('#wx_stream_article_slide_tip').remove();
  article.find('script').remove();
  article.find('#js_content').removeAttr('style');

  article.find('img').each((_, element) => {
    const image = $(element);
    const src = image.attr('src') ?? image.attr('data-src');
    if (src) {
      image.attr('src', src);
    }
  });

  if (format === 'text') {
    return collapseWhitespace(article.text());
  }

  const bodyClass = $('body').attr('class') ?? '';
  const articleHtml = $('<div>').append(article.clone()).html() ?? '';
  return `<!DOCTYPE html>
<html lang="zh_CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=0,viewport-fit=cover">
    <meta name="referrer" content="no-referrer">
    <style>
      #js_article {
        max-width: 667px;
        margin: 0 auto;
      }
      img {
        max-width: 100%;
      }
    </style>
  </head>
  <body class="${bodyClass}">
    ${articleHtml}
  </body>
</html>`;
}
