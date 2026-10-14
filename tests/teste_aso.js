// Testes unitários e de integração do cálculo da situação do ASO (Etapa 4). Node 18+. Só dados FICTÍCIOS.
// Rodar a partir da pasta do projeto:  node tests/teste_aso.js
// A data de referência é CONTROLADA (HOJE abaixo): o resultado não depende do dia em que o teste roda.
// Depois da suíte no fuso da máquina, o próprio teste se executa de novo em outros fusos (processos filhos com TZ=...).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const Utils = require("../js/utils.js");
const Aso = require("../js/aso.js");
const Importador = require("../js/importador.js");

const EH_FILHO = process.env.ASO_TESTE_FILHO === "1";
const log = (...a) => { if (!EH_FILHO) console.log(...a); };
let ok = 0, falhas = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; log("  ok   " + nome); }
  catch (e) { falhas++; console.log("  FALHOU " + nome + (EH_FILHO ? " [TZ=" + process.env.TZ + "]" : "") + "\n         " + e.message.split("\n")[0]); }
}

const HOJE = "2026-10-13";
const soma = (iso, n) => new Date(Utils.isoParaUTC(iso) + n * 86400000).toISOString().slice(0, 10); // iso + n dias
const S = (ult, venc, hoje = HOJE) => Aso.calcularSituacao(ult, venc, hoje);
const R = Aso.SITUACOES;

(async () => {
  log("Utilitários de data");
  await teste("isoParaUTC: válidas; vazias, mal formadas e impossíveis viram null", () => {
    assert.equal(Utils.isoParaUTC("2026-10-13"), Date.UTC(2026, 9, 13));
    assert.equal(Utils.isoParaUTC("2028-02-29") !== null, true);
    for (const v of [null, undefined, "", "2026-02-31", "2027-02-29", "13/10/2026", "2026-1-3", "2026-10-13T00:00:00Z", 20261013, new Date(), {}])
      assert.equal(Utils.isoParaUTC(v), null, String(v));
  });
  await teste("diferencaDias: simples, virada de mês/ano, bissexto, dias de horário de verão", () => {
    assert.equal(Utils.diferencaDias("2026-10-13", "2026-10-14"), 1);
    assert.equal(Utils.diferencaDias("2026-10-13", "2026-10-12"), -1);
    assert.equal(Utils.diferencaDias("2026-12-31", "2027-01-01"), 1);
    assert.equal(Utils.diferencaDias("2028-02-28", "2028-03-01"), 2);
    assert.equal(Utils.diferencaDias("2027-02-28", "2027-03-01"), 1);
    assert.equal(Utils.diferencaDias("2026-03-07", "2026-03-10"), 3);   // EUA: horário de verão começa em 08/03
    assert.equal(Utils.diferencaDias("2026-10-31", "2026-11-02"), 2);   // EUA: termina em 01/11
    assert.equal(Utils.diferencaDias("2026-09-26", "2026-09-28"), 2);   // Nova Zelândia: começa em 27/09
    assert.equal(Utils.diferencaDias("2026-10-13", null), null);
    assert.equal(Utils.diferencaDias("x", "2026-10-13"), null);
  });
  await teste("dataLocalISO: usa o dia local do instante (qualquer hora do dia)", () => {
    assert.equal(Utils.dataLocalISO(new Date(2026, 9, 13, 0, 0, 0)), "2026-10-13");
    assert.equal(Utils.dataLocalISO(new Date(2026, 9, 13, 12, 30)), "2026-10-13");
    assert.equal(Utils.dataLocalISO(new Date(2026, 9, 13, 23, 59, 59, 999)), "2026-10-13");
    assert.equal(Utils.dataLocalISO(new Date(2027, 0, 1, 0, 0, 1)), "2027-01-01");
  });
  await teste("dataLocalISO: confere com o fuso configurado no processo (TZ=" + (process.env.TZ || "padrão") + ")", () => {
    const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const esperado = i => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(i);
    for (const iso of ["2026-10-14T01:00:00Z", "2026-10-13T03:00:00Z", "2026-10-13T12:00:00Z", "2026-10-13T23:59:59Z", "2026-11-01T06:30:00Z", "2026-12-31T23:30:00Z"]) {
      const i = new Date(iso);
      assert.equal(Utils.dataLocalISO(i), esperado(i), iso);
    }
  });

  log("Situação (hoje controlado = " + HOJE + ")");
  await teste("vencimento ontem → VENCIDO (dias = -1)", () => {
    const r = S("2025-10-12", soma(HOJE, -1));
    assert.deepEqual([r.situacao, r.rotulo, r.dias], [R.VENCIDO, "VENCIDO", -1]);
  });
  await teste("vencimento muito antigo → VENCIDO", () => assert.equal(S("2020-01-01", "2020-12-26").situacao, R.VENCIDO));
  await teste("vencimento hoje → VENCE HOJE (dias = 0)", () => {
    const r = S("2025-10-18", HOJE);
    assert.deepEqual([r.situacao, r.rotulo, r.dias], [R.VENCE_HOJE, "VENCE HOJE", 0]);
  });
  await teste("vencimento amanhã → PRÓXIMO DO VENCIMENTO (dias = 1)", () => {
    const r = S("2025-10-19", soma(HOJE, 1));
    assert.deepEqual([r.situacao, r.rotulo, r.dias], [R.PROXIMO, "PRÓXIMO DO VENCIMENTO", 1]);
  });
  await teste("vencimento exatamente daqui a 30 dias → PRÓXIMO DO VENCIMENTO (inclusive)", () => {
    const r = S("2025-11-17", soma(HOJE, 30));
    assert.deepEqual([r.situacao, r.dias], [R.PROXIMO, 30]);
  });
  await teste("vencimento daqui a 31 dias → EM DIA", () => {
    const r = S("2025-11-18", soma(HOJE, 31));
    assert.deepEqual([r.situacao, r.rotulo, r.dias], [R.EM_DIA, "EM DIA", 31]);
  });
  await teste("fronteiras 29, 30, 31 e 360 dias", () => {
    assert.equal(S(null, soma(HOJE, 29)).situacao, R.PROXIMO);
    assert.equal(S(null, soma(HOJE, 30)).situacao, R.PROXIMO);
    assert.equal(S(null, soma(HOJE, 31)).situacao, R.EM_DIA);
    assert.equal(S(null, soma(HOJE, 360)).situacao, R.EM_DIA);
    assert.equal(Aso.DIAS_ALERTA, 30);
  });
  await teste("VENC vazia ou inválida → SEM DATA (dias = null)", () => {
    for (const v of [null, undefined, "", "   ", "abc", "2026-02-31", "13/10/2026", "2026-10-13T00:00:00Z", 46000, new Date(), NaN]) {
      const r = S("2025-10-10", v);
      assert.deepEqual([r.situacao, r.rotulo, r.dias], [R.SEM_DATA, "SEM DATA", null], String(v));
    }
  });
  await teste("ULT_ASO no futuro → DATA INCONSISTENTE, nunca EM DIA (mesmo com VENC em dia)", () => {
    const ult = soma(HOJE, 5);
    const r = S(ult, soma(ult, 360));
    assert.deepEqual([r.situacao, r.rotulo], [R.DATA_INCONSISTENTE, "DATA INCONSISTENTE"]);
    assert.equal(r.dias, 360 + 5); // dias continua sendo VENC - hoje (informativo)
  });
  await teste("prioridade: ULT_ASO futuro vence VENC ausente, vencida, hoje e próxima", () => {
    const ult = soma(HOJE, 1);
    for (const v of [null, "", "lixo", soma(HOJE, -10), HOJE, soma(HOJE, 10), soma(HOJE, 100)])
      assert.equal(S(ult, v).situacao, R.DATA_INCONSISTENTE, String(v));
  });
  await teste("ULT_ASO = hoje ou ontem não é inconsistente", () => {
    assert.equal(S(HOJE, soma(HOJE, 360)).situacao, R.EM_DIA);
    assert.equal(S(soma(HOJE, -1), soma(HOJE, 359)).situacao, R.EM_DIA);
  });
  await teste("ULT_ASO vazio com VENC válida → situação calculada por VENC (sem inventar ULT_ASO)", () => {
    assert.equal(S(null, soma(HOJE, -3)).situacao, R.VENCIDO);
    assert.equal(S("", HOJE).situacao, R.VENCE_HOJE);
    assert.equal(S(null, soma(HOJE, 7)).situacao, R.PROXIMO);
    assert.equal(S(undefined, soma(HOJE, 200)).situacao, R.EM_DIA);
    const [item] = Aso.calcular([Object.freeze({ ult_aso: null, venc: soma(HOJE, 200) })], HOJE);
    assert.equal(item.registro.ult_aso, null);
  });
  await teste("ULT_ASO inválida não gera inconsistência (valem as regras de VENC)", () => {
    assert.equal(S("lixo", soma(HOJE, 100)).situacao, R.EM_DIA);
    assert.equal(S("2026-02-31", null).situacao, R.SEM_DATA);
  });
  await teste("virada de ano e ano bissexto (30 vs 31 dias)", () => {
    assert.equal(S(null, "2027-01-30", "2026-12-31").situacao, R.PROXIMO);
    assert.equal(S(null, "2027-01-31", "2026-12-31").situacao, R.EM_DIA);
    assert.equal(S(null, "2027-01-01", "2026-12-31").dias, 1);
    assert.equal(S(null, "2028-03-29", "2028-02-28").situacao, R.PROXIMO);  // 2028 é bissexto: 30 dias
    assert.equal(S(null, "2028-03-30", "2028-02-28").situacao, R.EM_DIA);
    assert.equal(S(null, "2027-03-30", "2027-02-28").situacao, R.PROXIMO);  // 2027 não é: 30 dias
    assert.equal(S(null, "2027-03-31", "2027-02-28").situacao, R.EM_DIA);
  });
  await teste("'hoje' inválido lança TypeError (não classifica errado em silêncio)", () => {
    for (const h of [null, "", "13/10/2026", "2026-02-31"]) assert.throws(() => S(null, HOJE, h), TypeError);
  });

  log("Lista de registros");
  await teste("não altera os registros originais; mesma ordem e mesmos objetos; resultado congelado", () => {
    const regs = [
      Object.freeze({ linha: 2, colaborador: "COLABORADOR TESTE 01", ult_aso: "2025-10-10", venc: "2026-10-05", aso_status: "EM DIA" }),
      Object.freeze({ linha: 3, colaborador: "COLABORADOR TESTE 02", ult_aso: null, venc: null }),
      Object.freeze({ linha: 4, colaborador: "COLABORADOR TESTE 03", ult_aso: "2026-11-01", venc: "2027-10-27" })
    ];
    const antes = JSON.stringify(regs);
    const itens = Aso.calcular(regs, HOJE);
    assert.equal(JSON.stringify(regs), antes);
    assert.deepEqual(itens.map(i => i.situacao), [R.VENCIDO, R.SEM_DATA, R.DATA_INCONSISTENTE]); // ignora aso_status da planilha
    assert.deepEqual(itens.map(i => i.registro), regs);
    itens.forEach((i, k) => assert.equal(i.registro, regs[k]));
    assert.equal(Object.isFrozen(itens), true);
    assert.equal(Object.isFrozen(itens[0]), true);
    assert.deepEqual(Aso.calcular(null, HOJE), []);
  });
  await teste("contar: todas as chaves presentes e soma = total", () => {
    const c = Aso.contar(Aso.calcular([{ ult_aso: null, venc: "2026-10-01" }, { ult_aso: null, venc: null }], HOJE));
    assert.deepEqual(c, { total: 2, "data-inconsistente": 0, "sem-data": 1, "vencido": 1, "vence-hoje": 0, "proximo": 0, "em-dia": 0 });
  });
  await teste("conferência da regra com base FICTÍCIA de 341 registros (135 vencidos · 16 próximos · 183 em dia · 7 inconsistentes)", () => {
    const regs = [];
    const add = (ult, venc) => regs.push(Object.freeze({ linha: regs.length + 2, ult_aso: ult, venc }));
    for (let i = 0; i < 135; i++) { const v = soma(HOJE, -1 - i * 4); add(soma(v, -360), v); }
    for (let i = 0; i < 16; i++)  { const v = soma(HOJE, 1 + (i * 2) % 30); add(soma(v, -360), v); }
    for (let i = 0; i < 183; i++) { const v = soma(HOJE, 31 + i); add(soma(v, -360), v); }
    for (let i = 0; i < 7; i++)   { const u = soma(HOJE, 4 + i * 50); add(u, soma(u, 360)); }
    const c = Aso.contar(Aso.calcular(regs, HOJE));
    assert.deepEqual([c.total, c.vencido, c.proximo, c["em-dia"], c["data-inconsistente"], c["vence-hoje"], c["sem-data"]], [341, 135, 16, 183, 7, 0, 0]);
  });

  log("Integração (Dados + evento + recálculo, em contexto isolado)");
  const carregar = () => {
    const ctx = vm.createContext({ document: new EventTarget(), CustomEvent, console });
    for (const f of ["dados.js", "utils.js", "aso.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), ctx, { filename: f });
    return { ctx, run: c => vm.runInContext(c, ctx) };
  };
  const CAB = ["SUPERVISOR", "GERENTE", "FUNÇÃO", "MUNICIPIO", "LOJA", "COLABORADOR", "ADMISSÃO", "ULT_ASO", "VENC"];
  const planilha = linhas => Importador.processarLinhas([CAB, ...linhas.map((l, i) => ["SUP A", "GER A", "CAIXA", "AAA", 1, "COLABORADOR TESTE " + (i + 1), "01/02/2020", l[0], l[1]])]);
  await teste("importar uma segunda planilha após a primeira recalcula e substitui as situações", () => {
    const { ctx, run } = carregar();
    run("Aso.definirRelogio(() => new Date(2026, 9, 13, 15, 0, 0))");
    assert.equal(run("Aso.obter().length"), 0, "antes de importar: vazio");
    let eventos = 0;
    ctx.document.addEventListener("aso:situacoes-calculadas", () => eventos++);

    const p1 = planilha([["10/10/2025", "05/10/2026"], ["20/09/2025", "15/09/2026"], ["01/11/2025", "26/10/2026"]]); // vencido, vencido, próximo (13 dias)
    assert.equal(p1.ok, true);
    ctx.__p1 = p1; run("Dados.definir({ registros: __p1.registros, arquivo: 'primeira.xlsx' })");
    assert.deepEqual(JSON.parse(run("JSON.stringify(Aso.obter().map(i => i.situacao))")), ["vencido", "vencido", "proximo"]);
    assert.equal(eventos, 1);

    const p2 = planilha([["13/10/2025", "13/10/2026"], ["01/01/2026", "27/12/2026"], ["20/10/2026", "15/10/2027"], [null, null], ["01/01/2026", "02/01/2026"]]);
    ctx.__p2 = p2; run("Dados.definir({ registros: __p2.registros, arquivo: 'segunda.xlsx' })");
    assert.deepEqual(JSON.parse(run("JSON.stringify(Aso.obter().map(i => i.situacao))")),
      ["vence-hoje", "em-dia", "data-inconsistente", "sem-data", "vencido"]);
    const c = JSON.parse(run("JSON.stringify(Aso.resumo())"));
    assert.deepEqual([c.total, c.hoje, c["vence-hoje"], c["em-dia"], c["data-inconsistente"], c["sem-data"], c.vencido, c.proximo], [5, "2026-10-13", 1, 1, 1, 1, 1, 0]);
    assert.equal(eventos, 2);
    assert.equal(run("Aso.obter().every(i => Dados.obter().includes(i.registro))"), true, "itens apontam para a base nova");
  });
  await teste("importação inválida não dispara recálculo (Dados não é chamado) e as situações anteriores permanecem", () => {
    const { ctx, run } = carregar();
    run("Aso.definirRelogio(() => new Date(2026, 9, 13, 15, 0, 0))");
    const p = planilha([["10/10/2025", "05/10/2026"]]);
    ctx.__p = p; run("Dados.definir({ registros: __p.registros, arquivo: 'a.xlsx' })");
    const ruim = Importador.processarLinhas([CAB.filter(c => c !== "VENC"), ["a", "b"]]);
    assert.equal(ruim.ok, false); // o fluxo (script.js) só chama Dados.definir quando ok
    assert.deepEqual(JSON.parse(run("JSON.stringify(Aso.obter().map(i => i.situacao))")), ["vencido"]);
  });
  await teste("recalcula ao virar o dia com a página aberta", () => {
    const { ctx, run } = carregar();
    let agora = new Date(2026, 9, 13, 23, 50);
    ctx.__relogio = () => agora;
    run("Aso.definirRelogio(() => __relogio())");
    const p = planilha([["13/10/2025", "13/10/2026"]]);
    ctx.__p = p; run("Dados.definir({ registros: __p.registros, arquivo: 'a.xlsx' })");
    assert.equal(run("Aso.obter()[0].situacao"), "vence-hoje");
    agora = new Date(2026, 9, 14, 0, 10);
    assert.equal(run("Aso.obter()[0].situacao"), "vencido");
    assert.equal(run("Aso.obter()[0].dias"), -1);
    assert.equal(run("Aso.resumo().hoje"), "2026-10-14");
  });
  await teste("os dados importados não são alterados pelo cálculo (registros continuam congelados e iguais)", () => {
    const { ctx, run } = carregar();
    const p = planilha([["10/10/2025", "05/10/2026"], [null, null]]);
    const antes = JSON.stringify(p.registros);
    ctx.__p = p; run("Dados.definir({ registros: __p.registros, arquivo: 'a.xlsx' })");
    run("Aso.obter()");
    assert.equal(JSON.stringify(run("Dados.obter()")), antes);
    assert.equal(run("Object.isFrozen(Dados.obter()[0])"), true);
  });

  log("Segurança e privacidade do código novo");
  await teste("sem rede, sem armazenamento no navegador, sem HTML dinâmico nem dependências nos arquivos novos", () => {
    for (const f of ["utils.js", "aso.js"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8").replace(/\/\/.*$/gm, "");
      for (const proibido of [/\bfetch\s*\(/, /XMLHttpRequest/, /\bWebSocket\b/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/i, /document\.cookie/, /innerHTML/, /\beval\s*\(/, /new Function/])
        assert.equal(proibido.test(src), false, f + " contém " + proibido);
    }
  });

  if (EH_FILHO) { console.log(`FILHO ${process.env.TZ}: ${ok} ok, ${falhas} falha(s)`); process.exit(falhas ? 1 : 0); }

  console.log("\nOutros fusos horários (a mesma suíte, em processos separados)");
  const fusos = ["America/Sao_Paulo", "America/Los_Angeles", "Pacific/Auckland", "Asia/Tokyo", "UTC"];
  for (const tz of fusos) {
    const r = spawnSync(process.execPath, [__filename], { env: { ...process.env, TZ: tz, ASO_TESTE_FILHO: "1" }, encoding: "utf8" });
    const ultima = (r.stdout || "").trim().split("\n").filter(Boolean).pop() || (r.stderr || "").trim().split("\n").pop();
    const bom = r.status === 0;
    if (bom) ok++; else falhas++;
    console.log((bom ? "  ok   " : "  FALHOU ") + "TZ=" + tz + " → " + ultima);
    if (!bom) console.log((r.stdout || "") + (r.stderr || ""));
  }

  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})();
