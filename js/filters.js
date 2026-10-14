// Filtros e pesquisa (Etapa 7). Só decide QUAIS cartões aparecem: NÃO calcula situações (isso é do módulo Aso) e não altera os dados.
// Fonte: Aso.obter() -> { registro, situacao, rotulo, dias }. A lista filtrada (os MESMOS objetos, na ordem da planilha) é entregue a
// Render.atualizar(), que continua sendo a única lista de colaboradores da página (não existe uma segunda lista).
// As opções de cada filtro vêm dos registros importados; nada é inventado: "Não informada" só aparece se algum registro estiver sem o campo.
// Os controles são preenchidos com createElement / textContent / value (nenhum innerHTML: texto da planilha nunca vira HTML aqui).
// Nada é gravado nem enviado. Os indicadores gerais (Indicadores) não usam este módulo e continuam mostrando a base inteira.
// A lógica (normalizar, opcoesDe, filtrar) é pura e roda também no Node para os testes.
const Filtros = (function () {
  "use strict";

  const A = typeof Aso !== "undefined" ? Aso : require("./aso.js");

  const NAO_INFORMADA = "Não informada";
  // Valor da opção "Não informada". Minúsculo de propósito: as chaves dos valores reais são sempre MAIÚSCULAS, então nunca colidem.
  const SEM_VALOR = "__nao_informada__";

  // Ordem de exibição das situações no filtro (a mesma dos indicadores). Só apresentação: a regra de cada situação é do módulo Aso.
  const S = A.SITUACOES;
  const ORDEM_SITUACOES = Object.freeze([S.VENCIDO, S.VENCE_HOJE, S.PROXIMO, S.EM_DIA, S.SEM_DATA, S.DATA_INCONSISTENTE]);

  // Texto sem espaços repetidos/nas pontas (os valores originais nunca são alterados; isto só gera a chave de comparação).
  const compactar = v => String(v == null ? "" : v).replace(/\s+/g, " ").trim();

  // Pesquisa: ignora maiúsculas/minúsculas, acentos (inclusive ç) e espaços repetidos. "JOSÉ  da Silva" -> "jose da silva".
  function normalizar(v) {
    return compactar(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // Valor de um campo de texto para o filtro: { chave, rotulo } ou null (vazio = "Não informada").
  // A chave ignora diferenças de caixa e espaços (ex.: "Gerente" e "GERENTE" viram uma opção só); o rótulo é o primeiro texto encontrado.
  const campoTexto = nome => item => {
    const t = compactar((item.registro || {})[nome]);
    return t === "" ? null : { chave: t.toUpperCase(), rotulo: t };
  };

  // Mesma regra dos cartões (Render): FUNÇÃO "0" ou vazia = não informada; as demais em maiúsculas.
  const campoFuncao = item => {
    const t = compactar((item.registro || {}).funcao);
    return t === "" || t === "0" ? null : { chave: t.toUpperCase(), rotulo: t.toUpperCase() };
  };

  // Campos filtráveis, na ordem de exibição. `id` liga ao elemento #filtro-<id> do index.html.
  const CAMPOS = Object.freeze([
    { id: "situacao", valor: item => ({ chave: item.situacao, rotulo: item.rotulo }) }, // sempre existe (calculada pelo Aso)
    { id: "supervisor", valor: campoTexto("supervisor") },
    { id: "gerente", valor: campoTexto("gerente") },
    { id: "loja", valor: campoTexto("loja") },
    { id: "funcao", valor: campoFuncao },
    { id: "municipio", valor: campoTexto("municipio") }
  ]);
  const IDS = Object.freeze(CAMPOS.map(c => c.id));

  // Opções de cada filtro a partir de uma lista de itens do Aso: { <campo>: [{ valor, rotulo }, ...] }.
  // Ordem alfabética (números em ordem numérica: loja 7 antes de 26); "Não informada" por último e só se existir registro sem o campo.
  function opcoesDe(itens) {
    const saida = {};
    CAMPOS.forEach(c => {
      const mapa = new Map();
      let semValor = false;
      (itens || []).forEach(item => {
        const v = c.valor(item);
        if (v === null) semValor = true;
        else if (!mapa.has(v.chave)) mapa.set(v.chave, v.rotulo);
      });
      const lista = [...mapa].map(([valor, rotulo]) => ({ valor, rotulo }));
      if (c.id === "situacao") lista.sort((a, b) => ORDEM_SITUACOES.indexOf(a.valor) - ORDEM_SITUACOES.indexOf(b.valor));
      else lista.sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true, sensitivity: "base" }));
      if (semValor) lista.push({ valor: SEM_VALOR, rotulo: NAO_INFORMADA });
      saida[c.id] = lista;
    });
    return saida;
  }

  const estadoInicial = () => {
    const e = { busca: "" };
    IDS.forEach(id => { e[id] = ""; }); // "" = sem filtro (opção "Todos")
    return e;
  };

  // Itens que atendem à pesquisa E a todos os filtros escolhidos. Devolve os mesmos objetos recebidos, na mesma ordem.
  function filtrar(itens, estado) {
    const e = estado || {};
    const busca = normalizar(e.busca);
    return (itens || []).filter(item => {
      if (busca && !normalizar((item.registro || {}).colaborador).includes(busca)) return false;
      return CAMPOS.every(c => {
        const escolhido = e[c.id];
        if (!escolhido) return true;
        const v = c.valor(item);
        return (v === null ? SEM_VALOR : v.chave) === escolhido;
      });
    });
  }

  // ---------- Estado da sessão (só em memória) ----------
  let estado = estadoInicial();
  let opcoes = opcoesDe([]);
  let baseConhecida = null; // Dados.obter() da última importação vista: distingue importação nova de simples recálculo (virada de dia)

  function itensVisiveis() { return filtrar(A.obter(), estado); }
  function contagem() {
    const todos = A.obter();
    return { exibidos: filtrar(todos, estado).length, total: todos.length };
  }
  const textoContador = c => "Exibindo " + c.exibidos + " de " + c.total + " registros";
  const obterEstado = () => Object.assign({}, estado);
  const obterOpcoes = () => opcoes;

  // ---------- Página ----------
  const el = id => (typeof document !== "undefined" ? document.getElementById(id) : null);

  function atualizarContador() {
    const alvo = el("filtros-contador");
    if (alvo) alvo.textContent = textoContador(contagem());
  }

  // Redesenha os cartões (Render é quem desenha) e o contador.
  function aplicar() {
    if (typeof Render !== "undefined") Render.atualizar();
    atualizarContador();
  }

  // Reflete estado e opções nos controles. Sem base importada, os controles ficam desativados.
  function sincronizarControles() {
    const vazio = A.obter().length === 0;
    const busca = el("filtro-busca");
    if (busca) { busca.value = estado.busca; busca.disabled = vazio; }
    CAMPOS.forEach(c => {
      const sel = el("filtro-" + c.id);
      if (!sel) return;
      while (sel.options.length > 1) sel.remove(1); // a 1ª opção ("Todos...") é fixa no index.html
      opcoes[c.id].forEach(o => {
        const op = document.createElement("option");
        op.value = o.valor;
        op.textContent = o.rotulo;
        sel.appendChild(op);
      });
      sel.value = estado[c.id];
      sel.disabled = vazio;
    });
    const botao = el("btn-limpar-filtros");
    if (botao) botao.disabled = vazio;
    atualizarContador();
  }

  function atribuir(campo, valor) {
    if (!Object.prototype.hasOwnProperty.call(estado, campo)) throw new TypeError("Filtros.definir: campo desconhecido: " + campo);
    estado[campo] = String(valor == null ? "" : valor);
  }

  // Uso por código/testes: define um campo ("busca" ou o id de um filtro) e atualiza controles e cartões.
  function definir(campo, valor) {
    atribuir(campo, valor);
    sincronizarControles();
    aplicar();
  }

  // Restaura a pesquisa e todos os filtros para o estado inicial.
  function limpar() {
    estado = estadoInicial();
    sincronizarControles();
    aplicar();
  }

  // Disparado a cada recálculo das situações (importação válida OU virada de dia com a página aberta).
  // Importação nova: reconstrói as opções e LIMPA pesquisa e seleções. Mesma base (virada de dia): mantém pesquisa e escolhas (Etapa 8: inclusive uma Situação que ficou sem registros).
  // Importação inválida não chega aqui (script.js não chama Dados.definir), então o estado atual é preservado.
  // Este módulo é carregado antes do Render, portanto este tratamento acontece antes de os cartões serem redesenhados.
  function aoSituacoesCalculadas() {
    const todos = A.obter();
    const base = typeof Dados !== "undefined" ? Dados.obter() : null;
    const importacaoNova = base !== baseConhecida;
    baseConhecida = base;
    opcoes = opcoesDe(todos);
    if (importacaoNova) estado = estadoInicial();
    else {
      // Etapa 8: na virada de dia a escolha do usuário é preservada. Só a Situação pode perder uma opção com a mesma base
      // (ex.: ninguém mais "Vence hoje"): a opção escolhida continua listada e a tela mostra "nenhum colaborador encontrado".
      const sit = estado.situacao;
      if (sit && !opcoes.situacao.some(o => o.valor === sit) && A.ROTULOS[sit]) {
        opcoes.situacao.push({ valor: sit, rotulo: A.ROTULOS[sit] });
        opcoes.situacao.sort((a, b) => ORDEM_SITUACOES.indexOf(a.valor) - ORDEM_SITUACOES.indexOf(b.valor));
      }
      IDS.forEach(id => { if (estado[id] && !opcoes[id].some(o => o.valor === estado[id])) estado[id] = ""; });
    }
    sincronizarControles();
  }

  function ligarControles() {
    const busca = el("filtro-busca");
    if (busca) busca.addEventListener("input", () => { atribuir("busca", busca.value); aplicar(); });
    CAMPOS.forEach(c => {
      const sel = el("filtro-" + c.id);
      if (sel) sel.addEventListener("change", () => { atribuir(c.id, sel.value); aplicar(); });
    });
    const botao = el("btn-limpar-filtros");
    if (botao) botao.addEventListener("click", limpar);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("aso:situacoes-calculadas", aoSituacoesCalculadas);
    ligarControles();
    sincronizarControles(); // estado inicial (antes de qualquer importação): controles desativados, contador zerado
  }

  return {
    IDS, NAO_INFORMADA, SEM_VALOR,
    normalizar, opcoesDe, filtrar, textoContador,
    itensVisiveis, contagem, obterEstado, obterOpcoes, definir, limpar
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Filtros; // só para os testes em Node
