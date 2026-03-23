import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { CarouselSlide } from '../types';

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'post-template.html');
const IMAGE_SIZE = 1080;

export async function generatePostImage(data: {
  titulo: string;
  topicos: Array<{ emoji: string; titulo: string; conteudo: string }>;
  hashtags: string[];
}): Promise<Buffer> {
  const html = buildSingleSlideHtml({
    titulo: data.titulo,
    topicos: data.topicos,
    hashtags: data.hashtags,
  });

  return renderHtmlToImage(html);
}

export async function generateCarouselImages(data: {
  titulo: string;
  topicos: Array<{ emoji: string; titulo: string; conteudo: string }>;
  hashtags: string[];
}): Promise<Buffer[]> {
  const slides: CarouselSlide[] = [
    { type: 'cover', titulo: data.titulo },
    ...data.topicos.map((t) => ({
      type: 'topic' as const,
      emoji: t.emoji,
      titulo: t.titulo,
      conteudo: t.conteudo,
    })),
    { type: 'closing', hashtags: data.hashtags },
  ];

  const images: Buffer[] = [];
  for (const slide of slides) {
    const html = buildSlideHtml(slide);
    const img = await renderHtmlToImage(html);
    images.push(img);
  }

  return images;
}

async function renderHtmlToImage(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: IMAGE_SIZE, height: IMAGE_SIZE });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.screenshot({ type: 'png' }) as Buffer;
    return buffer;
  } finally {
    await browser.close();
  }
}

function getBaseTemplate(): string {
  return fs.readFileSync(TEMPLATE_PATH, 'utf-8');
}

function buildSingleSlideHtml(data: {
  titulo: string;
  topicos: Array<{ emoji: string; titulo: string; conteudo: string }>;
  hashtags: string[];
}): string {
  const template = getBaseTemplate();

  const topicosHtml = data.topicos
    .map(
      (t) => `
      <div class="topico">
        <span class="topico-emoji">${t.emoji}</span>
        <div class="topico-text">
          <strong>${t.titulo}</strong>
          <p>${t.conteudo}</p>
        </div>
      </div>`,
    )
    .join('\n');

  const hashtagsHtml = data.hashtags.map((h) => `<span class="hashtag">${h}</span>`).join(' ');

  return template
    .replace('{{TITULO}}', data.titulo)
    .replace('{{TOPICOS}}', topicosHtml)
    .replace('{{HASHTAGS}}', hashtagsHtml);
}

function buildSlideHtml(slide: CarouselSlide): string {
  const base = getBaseTemplate();

  if (slide.type === 'cover') {
    const content = `
      <div class="slide-cover">
        <h1 class="titulo">${slide.titulo}</h1>
        <p class="subtitle">Deslize para ver os destaques →</p>
      </div>`;
    return base
      .replace('{{TITULO}}', '')
      .replace('{{TOPICOS}}', content)
      .replace('{{HASHTAGS}}', '');
  }

  if (slide.type === 'topic') {
    const content = `
      <div class="slide-topic">
        <span class="slide-emoji">${slide.emoji}</span>
        <h2 class="slide-titulo">${slide.titulo}</h2>
        <p class="slide-conteudo">${slide.conteudo}</p>
      </div>`;
    return base
      .replace('{{TITULO}}', '')
      .replace('{{TOPICOS}}', content)
      .replace('{{HASHTAGS}}', '');
  }

  // closing slide
  const hashtagsHtml = (slide.hashtags ?? []).map((h) => `<span class="hashtag">${h}</span>`).join(' ');
  const content = `
    <div class="slide-closing">
      <h2>Siga para mais conteúdo!</h2>
      <p class="closing-cta">🔔 Ative as notificações</p>
    </div>`;
  return base
    .replace('{{TITULO}}', '')
    .replace('{{TOPICOS}}', content)
    .replace('{{HASHTAGS}}', hashtagsHtml);
}
