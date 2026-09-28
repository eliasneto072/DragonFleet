// src/shared/services/notification-html.test.ts
//
// O formatador das notificações. Os dois grupos que interessam são o do
// escape — porque um email não se corrige depois de enviado — e o das quebras
// de linha, que era o defeito original.

import { describe, it, expect } from 'vitest';
import { escaparHtml, mensagemParaHtml } from './notification-html';

describe('escaparHtml', () => {
  it('escapa o que pode ser lido como marcação', () => {
    expect(escaparHtml('<b>oi</b>')).toBe('&lt;b&gt;oi&lt;/b&gt;');
    expect(escaparHtml('faturação < 500€')).toContain('&lt; 500');
    expect(escaparHtml('a & b')).toBe('a &amp; b');
    expect(escaparHtml(`aspas " e '`)).toBe('aspas &quot; e &#39;');
  });

  it('escapa o & primeiro, para não escapar o próprio escape', () => {
    // Ao contrário, "&lt;" sairia "&amp;lt;" e o leitor via o código.
    expect(escaparHtml('<')).toBe('&lt;');
  });
});

describe('mensagemParaHtml', () => {
  it('não deixa passar HTML vindo da mensagem', () => {
    const html = mensagemParaHtml('<script>roubar()</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('separa parágrafos por linha em branco', () => {
    const html = mensagemParaHtml('Primeiro.\n\nSegundo.');
    expect(html.match(/<p /g)?.length).toBe(2);
    expect(html).toContain('Primeiro.');
    expect(html).toContain('Segundo.');
  });

  it('guarda a quebra simples dentro do parágrafo', () => {
    // Este era o defeito: o <p> antigo colava as duas linhas.
    const html = mensagemParaHtml('Linha um\nLinha dois');
    expect(html).toContain('Linha um<br>Linha dois');
  });

  it('faz listas', () => {
    const html = mensagemParaHtml('- primeiro\n- segundo\n• terceiro\n* quarto');
    expect(html).toContain('<ul');
    expect(html.match(/<li /g)?.length).toBe(4);
  });

  it('faz títulos com um, dois ou três cardinais', () => {
    const html = mensagemParaHtml('# Um\n## Dois\n### Três');
    expect(html.match(/font-weight:600/g)?.length).toBe(3);
  });

  it('faz negrito, e o negrito sobrevive ao escape', () => {
    const html = mensagemParaHtml('isto é **importante**');
    expect(html).toContain('<strong');
    expect(html).toContain('importante');
  });

  it('um ** sem par fica como texto', () => {
    const html = mensagemParaHtml('desconto de **50');
    expect(html).not.toContain('<strong');
    expect(html).toContain('**50');
  });

  it('a lista fecha quando volta texto normal', () => {
    const html = mensagemParaHtml('- um\n- dois\nTexto a seguir.');
    const ul = html.indexOf('</ul>');
    const p = html.lastIndexOf('<p ');
    expect(ul).toBeGreaterThan(-1);
    expect(p).toBeGreaterThan(ul);
  });

  it('aguenta \\r\\n do Windows', () => {
    const html = mensagemParaHtml('Um\r\n\r\nDois');
    expect(html.match(/<p /g)?.length).toBe(2);
    expect(html).not.toContain('\r');
  });

  it('mensagem vazia ou só espaços dá string vazia', () => {
    expect(mensagemParaHtml('')).toBe('');
    expect(mensagemParaHtml('   \n\n  ')).toBe('');
  });

  it('não rebenta com uma mensagem grande', () => {
    const grande = Array.from({ length: 500 }, (_, i) => `- item ${i}`).join('\n');
    expect(() => mensagemParaHtml(grande)).not.toThrow();
  });
});
