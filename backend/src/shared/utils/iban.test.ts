// src/shared/utils/iban.test.ts
//
// Testes do validador de IBAN.
//
// A pergunta que estes testes respondem: se alguém trocar um dígito ao copiar
// o IBAN, o sistema apanha? Porque se não apanhar, a transferência sai para
// uma conta que não existe — ou, pior, para a de outra pessoa.

import { describe, it, expect } from 'vitest';
import { isValidIban, normalizeIban } from './iban';

// IBAN portugueses fictícios, mas com dígitos de controlo corretos.
//
// Verificados um a um: são os mesmos que o seed usa. Um "IBAN de teste"
// inventado à mão falharia o resto 97 e faria o teste passar pela razão
// errada — a validar que código inválido é recusado, sem nunca provar que
// código válido é aceite.
const VALIDOS = [
  'PT50002700000001234567833',
  'PT50003300004567890123437',
  'PT50001000004567890123438',
  'PT50003500000000123456779',
  'PT50001800001234567891585',
];

describe('normalizeIban', () => {
  it('remove os espacos com que os bancos imprimem o IBAN', () => {
    expect(normalizeIban('PT50 0027 0000 0001 2345 6783 3'))
      .toBe('PT50002700000001234567833');
  });

  it('poe em maiusculas', () => {
    expect(normalizeIban('pt50002700000001234567833'))
      .toBe('PT50002700000001234567833');
  });
});

describe('isValidIban — aceita', () => {
  // Tabela em vez de cinco testes iguais: acrescentar um caso passa a ser
  // acrescentar uma linha ao array acima.
  it.each(VALIDOS)('aceita o IBAN valido %s', (iban) => {
    expect(isValidIban(iban)).toBe(true);
  });
});

describe('isValidIban — recusa', () => {
  it('recusa um IBAN com um digito trocado', () => {
    // O caso que interessa mesmo. O comprimento continua certo, o formato
    // continua certo, e só o resto 97 o apanha.
    const bom = VALIDOS[0];
    const mau = bom.slice(0, -1) + (bom.slice(-1) === '3' ? '4' : '3');

    expect(isValidIban(bom)).toBe(true);
    expect(isValidIban(mau)).toBe(false);
  });

  it('recusa dois digitos trocados de posicao', () => {
    // Trocar dois dígitos vizinhos é o erro típico de quem transcreve à mão, e
    // mantém o comprimento e a soma dos dígitos.
    const bom = 'PT50002700000001234567833';
    const trocado = bom.slice(0, 20) + bom[21] + bom[20] + bom.slice(22);

    expect(trocado).not.toBe(bom);
    expect(isValidIban(trocado)).toBe(false);
  });

  it('recusa um IBAN curto demais', () => {
    expect(isValidIban('PT5000270000')).toBe(false);
  });

  it('recusa texto que nao comeca por duas letras de pais', () => {
    expect(isValidIban('1250002700000001234567833')).toBe(false);
  });

  it('recusa uma string vazia', () => {
    expect(isValidIban('')).toBe(false);
  });

  it('recusa um IBAN com espacos, porque espera o valor ja normalizado', () => {
    // Documenta o contrato, que é fácil de esquecer: quem recebe texto do
    // utilizador tem de chamar o normalizeIban primeiro. Se um dia isto passar
    // a aceitar espaços, este teste falha e obriga a decidir de propósito.
    expect(isValidIban('PT50 0027 0000 0001 2345 6783 3')).toBe(false);
    expect(isValidIban(normalizeIban('PT50 0027 0000 0001 2345 6783 3'))).toBe(true);
  });
});
