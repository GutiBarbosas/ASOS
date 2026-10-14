// Indicadores gerais (Etapa 6). Só exibe totais: NÃO calcula situações nem cria regra própria.
// Fonte única: Aso.obter() (registros + situação). A contagem usa Aso.contar(), do próprio módulo Aso.
// Atualiza sozinho quando "aso:situacoes-calculadas" é disparado (cada importação válida). Importação inválida não dispara
// o evento, então os indicadores da última importação válida permanecem. Somente informativos: sem clique, filtro ou ordenação.
// Os valores entram na página só com textContent (nenhum texto da planilha é usado aqui; nada é gravado nem enviado).
const Indicadores = (function () {
  "use strict";

  const A = typeof Aso !== "undefined" ? Aso : require("./aso.js");
  const S = A.SITUACOES;

  const VAZIO = "–"; // exibido antes da primeira importação (não sugere que há dados carregados)

  // Ordem de exibição. As 6 situações são exatamente as de Aso.SITUACOES; "total" vem de itens.length.
  const CODIGOS = Object.freeze(["total", S.VENCIDO, S.VENCE_HOJE, S.PROXIMO, S.EM_DIA, S.SEM_DATA, S.DATA_INCONSISTENTE]);

  // Valores a exibir a partir da lista de Aso.obter(): { total, <situação>: quantidade, ... } (todas as chaves sempre presentes).
  function valores(itens) {
    return A.contar(itens || []);
  }

  // true se cada registro caiu em exatamente uma situação (soma das 6 = total). Usado pelos testes.
  function consistente(v) {
    return Object.values(S).reduce((soma, cod) => soma + v[cod], 0) === v.total;
  }

  // Desenha na página (elementos [data-indicador="<código>"] > .indicador__valor, definidos no index.html).
  function atualizar() {
    const secao = document.getElementById("indicadores");
    if (!secao) return;
    const temArquivo = typeof Dados !== "undefined" && Dados.resumo().arquivo !== null;
    const v = valores(A.obter());
    secao.setAttribute("data-estado", temArquivo ? "carregado" : "vazio");
    CODIGOS.forEach(cod => {
      const item = secao.querySelector('[data-indicador="' + cod + '"]');
      const valor = item && item.querySelector(".indicador__valor");
      if (valor) valor.textContent = temArquivo ? String(v[cod]) : VAZIO;
    });
    const nota = secao.querySelector("[data-dias-alerta]");
    if (nota) nota.textContent = "em até " + A.DIAS_ALERTA + " dias";
  }

  if (typeof document !== "undefined") {
    document.addEventListener("aso:situacoes-calculadas", atualizar);
    atualizar(); // estado inicial (antes de qualquer importação)
  }

  return { CODIGOS, VAZIO, valores, consistente, atualizar };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Indicadores; // só para os testes em Node
