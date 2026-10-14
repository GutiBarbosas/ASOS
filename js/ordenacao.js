// Ordenação dos cartões por urgência (Etapa 8). Só decide a ORDEM de exibição: NÃO calcula situações (isso é do módulo Aso),
// não altera os itens nem a base importada e não cria uma segunda lista. Recebe uma lista de itens de Aso.obter()
// ({ registro, situacao, rotulo, dias }) — normalmente já filtrada por Filtros — e devolve uma lista NOVA, com os mesmos objetos.
//
// Ordem dos grupos (automática, sem botão nem filtro de ordenação):
//   1. DATA INCONSISTENTE   2. VENCIDO (maior atraso primeiro)   3. VENCE HOJE
//   4. PRÓXIMO DO VENCIMENTO (vencimento mais próximo primeiro)   5. EM DIA (vencimento mais próximo primeiro)   6. SEM DATA
// A data relevante é a oficial (VENC), já convertida por Aso em `dias` = VENC − hoje: não se recalcula nada a partir de ULT_ASO.
// Empates (mesmo grupo e mesmo `dias`, e os grupos sem data relevante) mantêm a ordem em que chegaram, que é a da planilha.
// A lógica é pura e roda também no Node para os testes.
const Ordenacao = (function () {
  "use strict";

  const A = typeof Aso !== "undefined" ? Aso : require("./aso.js");
  const S = A.SITUACOES;

  // Prioridade de cada situação (menor = aparece antes). Só apresentação: a regra de cada situação continua sendo do Aso.
  const PRIORIDADE = Object.freeze({
    [S.DATA_INCONSISTENTE]: 0,
    [S.VENCIDO]: 1,
    [S.VENCE_HOJE]: 2,
    [S.PROXIMO]: 3,
    [S.EM_DIA]: 4,
    [S.SEM_DATA]: 5
  });
  const DESCONHECIDA = 99; // situação fora da lista (não deve ocorrer): vai para o fim, sem quebrar

  // Grupos em que a data de vencimento decide a ordem interna. Em VENCIDO, `dias` é negativo: o mais negativo (maior atraso) vem antes.
  // Em PRÓXIMO e EM DIA, o menor `dias` (vencimento mais próximo) vem antes. VENCE HOJE tem sempre dias = 0 (empate -> ordem original).
  const ORDENA_POR_DIAS = new Set([S.VENCIDO, S.PROXIMO, S.EM_DIA]);

  const prioridade = item => (Object.prototype.hasOwnProperty.call(PRIORIDADE, item.situacao) ? PRIORIDADE[item.situacao] : DESCONHECIDA);
  const diasDe = item => (ORDENA_POR_DIAS.has(item.situacao) && typeof item.dias === "number" ? item.dias : null);

  // Devolve uma lista nova ordenada por urgência. `itens` não é modificada. Determinístico: o desempate usa a posição original.
  function ordenar(itens) {
    return (itens || [])
      .map((item, posicao) => ({ item, posicao, p: prioridade(item), dias: diasDe(item) }))
      .sort((a, b) => {
        if (a.p !== b.p) return a.p - b.p;
        if (a.dias !== null && b.dias !== null && a.dias !== b.dias) return a.dias - b.dias;
        if (a.dias !== b.dias && (a.dias === null || b.dias === null)) return a.dias === null ? 1 : -1; // sem `dias` válido no fim do grupo
        return a.posicao - b.posicao;
      })
      .map(x => x.item);
  }

  return { PRIORIDADE, ordenar };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Ordenacao; // só para os testes em Node
