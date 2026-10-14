// Cálculo da situação de cada ASO (Etapa 4). Sem interface: só calcula e disponibiliza o resultado.
// Fonte: os registros importados na sessão (Dados.obter()). Os dados originais NUNCA são alterados:
// o resultado é uma lista nova, na mesma ordem, com { registro, situacao, rotulo, dias }.
// A coluna ASO_STATUS da planilha não é usada (nem chega à memória); VENC é a referência oficial e não é recalculada.
const Aso = (function () {
  "use strict";

  const U = typeof Utils !== "undefined" ? Utils : require("./utils.js"); // navegador: global; Node: módulo

  const DIAS_ALERTA = 30; // "próximo do vencimento": de amanhã até hoje + 30 dias, inclusive

  const SITUACOES = Object.freeze({
    DATA_INCONSISTENTE: "data-inconsistente",
    SEM_DATA: "sem-data",
    VENCIDO: "vencido",
    VENCE_HOJE: "vence-hoje",
    PROXIMO: "proximo",
    EM_DIA: "em-dia"
  });
  const ROTULOS = Object.freeze({
    "data-inconsistente": "DATA INCONSISTENTE",
    "sem-data": "SEM DATA",
    "vencido": "VENCIDO",
    "vence-hoje": "VENCE HOJE",
    "proximo": "PRÓXIMO DO VENCIMENTO",
    "em-dia": "EM DIA"
  });

  // Função central. Ordem de prioridade (a primeira regra que valer encerra a avaliação):
  //   1. ULT_ASO posterior a hoje          -> DATA INCONSISTENTE (mesmo que VENC seja válida)
  //   2. VENC ausente ou inválida          -> SEM DATA
  //   3. VENC anterior a hoje              -> VENCIDO
  //   4. VENC igual a hoje                 -> VENCE HOJE
  //   5. VENC de amanhã até hoje + 30 dias -> PRÓXIMO DO VENCIMENTO
  //   6. VENC além de hoje + 30 dias       -> EM DIA
  // `ultAso` e `venc`: "AAAA-MM-DD", null ou qualquer outro valor (tratado como ausente/inválido).
  // `hoje`: "AAAA-MM-DD" (data local do usuário; ver Utils.dataLocalISO). Se `hoje` for inválido, lança TypeError.
  // ULT_ASO vazio ou inválido não gera inconsistência e nunca é "inventado": a situação sai de VENC.
  // Retorna { situacao, rotulo, dias }, com dias = VENC - hoje (negativo = vencido há |dias|; null se VENC ausente/inválida).
  function calcularSituacao(ultAso, venc, hoje) {
    if (!U.dataValida(hoje)) throw new TypeError("Aso.calcularSituacao: 'hoje' deve ser uma data AAAA-MM-DD válida.");
    const dias = U.diferencaDias(hoje, venc); // null se VENC ausente/inválida
    const ultFuturo = U.diferencaDias(hoje, ultAso); // ULT_ASO - hoje; > 0 = no futuro
    let s;
    if (ultFuturo !== null && ultFuturo > 0) s = SITUACOES.DATA_INCONSISTENTE;
    else if (dias === null) s = SITUACOES.SEM_DATA;
    else if (dias < 0) s = SITUACOES.VENCIDO;
    else if (dias === 0) s = SITUACOES.VENCE_HOJE;
    else if (dias <= DIAS_ALERTA) s = SITUACOES.PROXIMO;
    else s = SITUACOES.EM_DIA;
    return { situacao: s, rotulo: ROTULOS[s], dias };
  }

  // Calcula a situação de uma lista de registros ({ ult_aso, venc, ... }). Não altera os registros.
  // Retorna lista congelada, mesma ordem: { registro (o objeto original), situacao, rotulo, dias }.
  function calcular(registros, hoje) {
    return Object.freeze((registros || []).map(r => {
      const c = calcularSituacao(r.ult_aso, r.venc, hoje);
      return Object.freeze({ registro: r, situacao: c.situacao, rotulo: c.rotulo, dias: c.dias });
    }));
  }

  // Quantidade de itens por situação (todas as chaves sempre presentes) + total.
  function contar(itens) {
    const c = { total: itens.length };
    Object.values(SITUACOES).forEach(s => { c[s] = 0; });
    itens.forEach(i => { c[i.situacao]++; });
    return c;
  }

  // ---------- Estado da sessão ----------
  let relogio = () => new Date(); // só os testes trocam (definirRelogio)
  let estado = { itens: Object.freeze([]), hoje: null, base: null };

  // Recalcula a partir de Dados.obter() com a data de HOJE (agora). Chamado a cada importação válida.
  function recalcular() {
    const base = typeof Dados !== "undefined" ? Dados.obter() : [];
    const hoje = U.dataLocalISO(relogio());
    estado = { itens: calcular(base, hoje), hoje, base };
    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent("aso:situacoes-calculadas", { detail: { total: estado.itens.length, hoje } }));
    }
    return estado.itens;
  }

  // Situações da sessão atual. Se a página ficou aberta e o dia virou, recalcula antes de responder.
  function obter() {
    if (estado.hoje !== null && estado.hoje !== U.dataLocalISO(relogio())) recalcular();
    return estado.itens;
  }

  // Etapa 8: verifica se o dia local mudou desde o último cálculo e, só então, recalcula (e dispara o evento).
  // Devolve true se recalculou. Sem base importada não há o que recalcular. Não altera nenhuma regra de situação.
  function verificarDia() {
    if (estado.hoje === null || estado.hoje === U.dataLocalISO(relogio())) return false;
    recalcular();
    return true;
  }

  const resumo = () => Object.assign({ hoje: estado.hoje }, contar(obter()));

  // Só para testes: troca o relógio (função que devolve Date) ou restaura o real (null).
  function definirRelogio(fn) { relogio = typeof fn === "function" ? fn : () => new Date(); }
  // Instante atual segundo o mesmo relógio usado nos cálculos (Etapa 8: o agendador de virada de dia usa este, para testes controlarem tudo).
  const agora = () => relogio();

  // Reage a cada importação válida (Dados.definir dispara o evento depois de trocar a base).
  if (typeof document !== "undefined") document.addEventListener("aso:dados-carregados", recalcular);

  return { DIAS_ALERTA, SITUACOES, ROTULOS, calcularSituacao, calcular, contar, recalcular, obter, verificarDia, resumo, definirRelogio, agora };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Aso; // só para os testes em Node
