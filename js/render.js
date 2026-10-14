// Cartões dos colaboradores (Etapa 5). Só exibe: NÃO recalcula situações (isso é do módulo Aso) e não altera os dados.
// Fonte: Aso.obter() -> { registro, situacao, rotulo, dias }. Atualiza sozinho quando "aso:situacoes-calculadas" é disparado.
// Todo texto vindo da planilha passa por Utils.escapar antes de entrar no HTML. Nada é gravado nem enviado.
// A montagem do HTML (html, htmlLista) é lógica pura e roda também no Node para os testes.
const Render = (function () {
  "use strict";

  const U = typeof Utils !== "undefined" ? Utils : require("./utils.js");
  const A = typeof Aso !== "undefined" ? Aso : require("./aso.js");

  const NAO_INFORMADA = "Não informada";
  const plural = (n, um, varios) => n + " " + (n === 1 ? um : varios);

  // Só códigos conhecidos viram nome de classe CSS (nunca texto livre).
  const CODIGOS = new Set(Object.values(A.SITUACOES));

  // Texto de apoio de cada situação. `dias` já vem calculado pelo módulo Aso (VENC − hoje); aqui só se formata.
  // Nunca mostra número negativo: atraso = |dias| (só em VENCIDO), restantes = dias (só em PRÓXIMO).
  function detalheSituacao(item) {
    const dias = typeof item.dias === "number" ? item.dias : null;
    switch (item.situacao) {
      case A.SITUACOES.VENCIDO:
        return dias === null ? "Vencido" : "Vencido há " + plural(Math.abs(dias), "dia", "dias");
      case A.SITUACOES.VENCE_HOJE:
        return "Vence hoje";
      case A.SITUACOES.PROXIMO:
        return dias === null ? "Próximo do vencimento" : "Faltam " + plural(Math.abs(dias), "dia", "dias") + " para vencer";
      case A.SITUACOES.EM_DIA:
        return "Dentro do prazo";
      case A.SITUACOES.SEM_DATA:
        return "Data de vencimento não informada ou inválida";
      case A.SITUACOES.DATA_INCONSISTENTE:
        return "Conferir a data cadastrada: a data do último ASO é posterior a hoje";
      default:
        return "";
    }
  }

  // Exibição (não altera os dados): FUNÇÃO "0" e vazia = não informada; demais em maiúsculas (a planilha mistura caixas).
  function textoFuncao(v) {
    const t = String(v == null ? "" : v).trim();
    return t === "" || t === "0" ? "" : t.toUpperCase();
  }

  function campo(rotulo, valor, vazio) {
    const t = String(valor == null ? "" : valor).trim();
    const conteudo = t === ""
      ? '<span class="cartao__vazio">' + U.escapar(vazio || NAO_INFORMADA) + "</span>"
      : U.escapar(t);
    return "<div><dt>" + U.escapar(rotulo) + "</dt><dd>" + conteudo + "</dd></div>";
  }

  function campoData(rotulo, iso) {
    const f = U.formatarDataBR(iso);
    return campo(rotulo, f, NAO_INFORMADA);
  }

  // HTML de um cartão (item de Aso.obter()).
  function html(item) {
    const r = item.registro || {};
    const cod = CODIGOS.has(item.situacao) ? item.situacao : "desconhecida";
    const nome = String(r.colaborador == null ? "" : r.colaborador).trim();
    return '<article class="cartao cartao--' + cod + '">' +
      '<header class="cartao__topo">' +
        '<h3 class="cartao__nome">' + (nome ? U.escapar(nome) : '<span class="cartao__vazio">Nome não informado</span>') + "</h3>" +
        '<span class="cartao__selo">' + U.escapar(item.rotulo) + "</span>" +
      "</header>" +
      '<p class="cartao__situacao">' + U.escapar(detalheSituacao(item)) + "</p>" +
      '<dl class="cartao__campos">' +
        campo("Loja", r.loja) +
        campo("Função", textoFuncao(r.funcao)) +
        campo("Supervisor", r.supervisor, NAO_INFORMADA) +
        campo("Gerente", r.gerente, NAO_INFORMADA) +
        campo("Município", r.municipio, NAO_INFORMADA) +
        campoData("Último ASO", r.ult_aso) +
        campoData("Vencimento", r.venc) +
      "</dl>" +
    "</article>";
  }

  // Conteúdo da área de cartões. `temArquivo` = já houve alguma importação válida (para diferenciar "nada importado" de "importado sem registros").
  // `totalBase` (opcional, Etapa 7) = quantos registros a base importada tem; se > 0 e `itens` está vazio, a pesquisa/filtros não encontraram ninguém.
  function htmlLista(itens, temArquivo, totalBase) {
    if (!itens || itens.length === 0) {
      if (totalBase > 0) {
        return '<p class="cartoes__vazio" data-vazio="filtro">Nenhum colaborador encontrado com a pesquisa e os filtros selecionados. Altere a pesquisa ou clique em <strong>Limpar filtros</strong>.</p>';
      }
      return temArquivo
        ? '<p class="cartoes__vazio">A planilha importada não tem registros para exibir.</p>'
        : '<p class="cartoes__vazio">Nenhuma planilha importada. Clique em <strong>Importar planilha</strong> e selecione o arquivo baixado do Google Sheets para ver os colaboradores.</p>';
    }
    return '<div class="cartoes__grade">' + itens.map(html).join("") + "</div>";
  }

  // Redesenha a área de cartões a partir do estado atual. Todo conteúdo importado já está escapado em html().
  // Etapa 7: se o módulo Filtros existir, desenha só os itens que atendem à pesquisa e aos filtros (os mesmos objetos de Aso.obter()).
  // Etapa 8: se o módulo Ordenacao existir, a lista filtrada é ordenada por urgência antes de desenhar.
  function atualizar() {
    const area = document.getElementById("lista-cartoes");
    if (!area) return;
    const temArquivo = typeof Dados !== "undefined" && Dados.resumo().arquivo !== null;
    const todos = A.obter();
    const visiveis = typeof Filtros !== "undefined" ? Filtros.itensVisiveis() : todos;
    // Etapa 8: depois da pesquisa e dos filtros, ordena por urgência (lista nova; os itens e a base não são alterados).
    const itens = typeof Ordenacao !== "undefined" ? Ordenacao.ordenar(visiveis) : visiveis;
    area.innerHTML = htmlLista(itens, temArquivo, todos.length);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("aso:situacoes-calculadas", atualizar);
    atualizar(); // estado inicial (antes de qualquer importação)
  }

  return { html, htmlLista, detalheSituacao, atualizar };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Render; // só para os testes em Node
