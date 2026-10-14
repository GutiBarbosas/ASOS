// Testes dos indicadores gerais (Etapa 6). Node 18+. Só dados FICTÍCIOS. Rodar a partir da pasta do projeto:  node tests/teste_indicadores.js
// Integração em contexto isolado (vm) com Dados + Aso + Indicadores e um DOM mínimo falso. O comportamento real no navegador
// (temas, 1280/390 px, rolagem, console) está em tests/e2e_indicadores.py.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Utils = require("../js/utils.js");
const Aso = require("../js/aso.js");
const Indicadores = require("../js/indicadores.js");
const Importador = require("../js/importador.js");

let ok = 0, falhas = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log("  ok   " + nome); }
  catch (e) { falhas++; console.log("  FALHOU " + nome + "\n         " + e.message.split("\n")[0]); }
}
const HOJE = "2026-10-13";
const soma = (iso, n) => new Date(Utils.isoParaUTC(iso) + n * 86400000).toISOString().slice(0, 10);
const COD = Aso.SITUACOES;
const SEIS = Object.values(COD);
const reg = (o = {}) => Object.freeze({ linha: 2, supervisor: "SUP A", gerente: "GER A", funcao: "CAIXA", municipio: "AAA", loja: "7",
  colaborador: "COLABORADOR TESTE 01", admissao: "2020-02-01", ult_aso: "2025-10-10", venc: "2026-10-05", ...o });
// um registro para cada situação (data de referência 2026-10-13)
const POR_SITUACAO = {
  [COD.VENCIDO]: { venc: soma(HOJE, -40) },
  [COD.VENCE_HOJE]: { venc: HOJE },
  [COD.PROXIMO]: { venc: soma(HOJE, 10) },
  [COD.EM_DIA]: { venc: soma(HOJE, 200) },
  [COD.SEM_DATA]: { venc: null },
  [COD.DATA_INCONSISTENTE]: { ult_aso: soma(HOJE, 5), venc: soma(HOJE, 365) }
};
const regsDe = contagens => Object.entries(contagens).flatMap(([cod, n]) => Array.from({ length: n }, (_, i) => reg({ colaborador: "COLABORADOR TESTE " + cod + " " + i, ...POR_SITUACAO[cod] })));

// ---- Contexto isolado com DOM mínimo ----
const CAB = ["SUPERVISOR", "GERENTE", "FUNÇÃO", "MUNICIPIO", "LOJA", "COLABORADOR", "ADMISSÃO", "ULT_ASO", "VENC"];
const carregar = () => {
  const itens = {};
  Indicadores.CODIGOS.forEach(c => { itens[c] = { valor: { textContent: "" } }; });
  const nota = { textContent: "" };
  const secao = {
    attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
    querySelector(sel) {
      let m = sel.match(/^\[data-indicador="([a-z-]+)"\]$/); if (m) return itens[m[1]] ? { querySelector: () => itens[m[1]].valor } : null;
      if (sel === "[data-dias-alerta]") return nota;
      return null;
    }
  };
  const document = Object.assign(new EventTarget(), { getElementById: id => (id === "indicadores" ? secao : null) });
  const ctx = vm.createContext({ document, CustomEvent, console });
  for (const f of ["dados.js", "utils.js", "aso.js", "indicadores.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), ctx, { filename: f });
  vm.runInContext("Aso.definirRelogio(() => new Date(2026, 9, 13, 15, 0, 0))", ctx);
  const lidos = () => Object.fromEntries(Indicadores.CODIGOS.map(c => [c, itens[c].valor.textContent]));
  return { ctx, secao, nota, lidos, run: c => vm.runInContext(c, ctx) };
};
const importar = (c, registros, nome) => { c.ctx.__r = Object.freeze(registros); c.run("Dados.definir({ registros: __r, arquivo: " + JSON.stringify(nome) + " })"); };
const esperado = n => ({ total: String(Object.values(n).reduce((a, b) => a + b, 0)), ...Object.fromEntries(SEIS.map(s => [s, String(n[s] || 0)])) });
const comoTexto = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));

(async () => {
  console.log("Estado inicial");
  await teste("antes de qualquer importação: sem números, estado 'vazio' e nenhum indicador sugere dados", () => {
    const c = carregar();
    assert.equal(c.secao.attrs["data-estado"], "vazio");
    const v = c.lidos();
    assert.deepEqual(Object.keys(v), Indicadores.CODIGOS.slice());
    for (const k of Object.keys(v)) assert.equal(v[k], Indicadores.VAZIO, k);
    assert.equal(c.nota.textContent, "em até 30 dias");
  });

  console.log("Contagem por categoria");
  const N = { [COD.VENCIDO]: 3, [COD.VENCE_HOJE]: 2, [COD.PROXIMO]: 4, [COD.EM_DIA]: 5, [COD.SEM_DATA]: 1, [COD.DATA_INCONSISTENTE]: 2 };
  await teste("cada categoria mostra a quantidade correta e o total = registros retornados por Aso.obter()", () => {
    const c = carregar();
    importar(c, regsDe(N), "a.xlsx");
    const v = c.lidos();
    assert.equal(c.secao.attrs["data-estado"], "carregado");
    assert.equal(v.total, "17");
    for (const s of SEIS) assert.equal(v[s], String(N[s]), s);
    assert.equal(Number(v.total), c.run("Aso.obter().length"));
  });
  await teste("soma das 6 categorias = total; cada registro em uma só categoria", () => {
    const c = carregar();
    importar(c, regsDe(N), "a.xlsx");
    const v = c.lidos();
    assert.equal(SEIS.reduce((a, s) => a + Number(v[s]), 0), Number(v.total));
    const itens = c.run("Aso.obter()");
    assert.equal(itens.every(i => SEIS.includes(i.situacao)), true);
    assert.ok(Indicadores.consistente(Indicadores.valores(itens)));
  });
  await teste("valores() usa o mesmo resultado de Aso.contar() (sem regra paralela)", () => {
    const itens = Aso.calcular(regsDe(N), HOJE);
    assert.deepEqual(Indicadores.valores(itens), Aso.contar(itens));
  });
  await teste("fronteiras: ontem, hoje, amanhã, +30 e +31 dias caem na categoria certa e a soma fecha", () => {
    const regs = [-1, 0, 1, 30, 31].map(n => reg({ venc: soma(HOJE, n) }));
    const v = Indicadores.valores(Aso.calcular(regs, HOJE));
    assert.deepEqual([v.vencido, v["vence-hoje"], v.proximo, v["em-dia"]], [1, 1, 2, 1]);
    assert.ok(Indicadores.consistente(v));
  });
  await teste("data inconsistente não é contada como em dia (mesmo com VENC distante) nem como sem data", () => {
    const regs = [reg({ ult_aso: soma(HOJE, 3), venc: soma(HOJE, 400) }), reg({ ult_aso: soma(HOJE, 1), venc: null })];
    const v = Indicadores.valores(Aso.calcular(regs, HOJE));
    assert.equal(v["data-inconsistente"], 2); assert.equal(v["em-dia"], 0); assert.equal(v["sem-data"], 0);
  });
  await teste("ASO_STATUS da planilha é ignorado: valor conflitante não muda os números", () => {
    const p = Importador.processarLinhas([[...CAB, "ASO_STATUS"], ["S", "G", "CAIXA", "AAA", 1, "COLABORADOR TESTE 1", "01/02/2020", "10/10/2025", "05/10/2026", "EM DIA"]]);
    assert.ok(p.ok);
    const c = carregar(); importar(c, p.registros, "a.xlsx");
    assert.equal(c.lidos().vencido, "1"); assert.equal(c.lidos()["em-dia"], "0");
    assert.equal(/ASO_STATUS/.test(fs.readFileSync(path.join(__dirname, "..", "js", "indicadores.js"), "utf8").replace(/\/\/.*$/gm, "")), false);
  });

  console.log("Atualização e preservação");
  await teste("segunda importação válida substitui os números da primeira", () => {
    const c = carregar();
    importar(c, regsDe(N), "a.xlsx");
    const N2 = { [COD.VENCIDO]: 1, [COD.EM_DIA]: 2 };
    importar(c, regsDe(N2), "b.xlsx");
    assert.deepEqual(c.lidos(), esperado(N2));
  });
  await teste("importação inválida (script.js não chama Dados.definir) preserva os indicadores da última válida", () => {
    const c = carregar();
    importar(c, regsDe(N), "a.xlsx");
    const antes = JSON.stringify(c.lidos());
    const ruim = Importador.processarLinhas([CAB.filter(x => x !== "VENC"), ["a", "b"]]);
    assert.equal(ruim.ok, false);
    assert.equal(JSON.stringify(c.lidos()), antes);
    assert.equal(c.secao.attrs["data-estado"], "carregado");
  });
  await teste("planilha válida sem registros mostra zeros (há arquivo carregado), não o estado inicial", () => {
    const c = carregar();
    importar(c, [], "vazia.xlsx");
    assert.equal(c.secao.attrs["data-estado"], "carregado");
    assert.deepEqual(c.lidos(), esperado({}));
  });
  await teste("só escuta aso:situacoes-calculadas: o evento de dados sozinho não redesenha", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "js", "indicadores.js"), "utf8").replace(/\/\/.*$/gm, "");
    assert.ok(/addEventListener\("aso:situacoes-calculadas"/.test(src));
    assert.equal(/aso:dados-carregados/.test(src), false);
  });

  console.log("Campos opcionais ausentes");
  await teste("registros sem supervisor, gerente, função, município, loja, nome e admissão continuam contados", () => {
    const c = carregar();
    const vazio = { supervisor: "", gerente: "", funcao: "", municipio: "", loja: "", colaborador: "", admissao: null };
    importar(c, [reg({ ...vazio, venc: soma(HOJE, -3) }), reg({ ...vazio, venc: soma(HOJE, 100) }), reg({ ...vazio, venc: null })], "a.xlsx");
    assert.deepEqual(c.lidos(), comoTexto({ total: 3, vencido: 1, "vence-hoje": 0, proximo: 0, "em-dia": 1, "sem-data": 1, "data-inconsistente": 0 }));
  });
  await teste("linhas passadas pelo Importador com campos de texto vazios: contagem correta", () => {
    const p = Importador.processarLinhas([CAB, ["", "", "", "", "", "", "", "10/10/2025", "05/10/2026"], ["", "", "", "", "", "COLABORADOR TESTE 2", "", null, null]]);
    assert.ok(p.ok);
    const c = carregar(); importar(c, p.registros, "a.xlsx");
    assert.deepEqual(c.lidos(), comoTexto({ total: 2, vencido: 1, "vence-hoje": 0, proximo: 0, "em-dia": 0, "sem-data": 1, "data-inconsistente": 0 }));
  });

  console.log("As seis situações já implementadas");
  await teste("uma ocorrência de cada situação: cada indicador mostra 1 e o total 6", () => {
    const c = carregar();
    importar(c, regsDe(Object.fromEntries(SEIS.map(s => [s, 1]))), "a.xlsx");
    assert.deepEqual(c.lidos(), comoTexto({ total: 6, ...Object.fromEntries(SEIS.map(s => [s, 1])) }));
    assert.deepEqual(Indicadores.CODIGOS.slice(1).sort(), SEIS.slice().sort()); // os 6 indicadores = as 6 situações de Aso
  });
  await teste("virada do dia com a página aberta: Aso.obter() recalcula e atualizar() acompanha", () => {
    const c = carregar();
    importar(c, [reg({ venc: "2026-10-14" })], "a.xlsx");
    assert.equal(c.lidos().proximo, "1");
    c.run("Aso.definirRelogio(() => new Date(2026, 9, 14, 9, 0, 0))");
    c.run("Indicadores.atualizar()");
    assert.equal(c.lidos()["vence-hoje"], "1"); assert.equal(c.lidos().proximo, "0");
  });

  console.log("Segurança e escopo");
  await teste("indicadores.js: sem rede, sem armazenamento, sem eval, sem innerHTML; só informativo (sem eventos de clique)", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "js", "indicadores.js"), "utf8").replace(/\/\/.*$/gm, "");
    for (const proibido of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/i, /document\.cookie/, /\beval\s*\(/, /new Function/, /innerHTML/, /insertAdjacentHTML/, /document\.write/, /outerHTML/, /["']click["']/, /\.sort\s*\(/, /\.filter\s*\(/])
      assert.equal(proibido.test(src), false, "indicadores.js contém " + proibido);
  });
  await teste("index.html: indicadores sem botão, link nem foco (não clicáveis); CSP inalterada", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const bloco = html.slice(html.indexOf('<section id="indicadores"'), html.indexOf("</section>", html.indexOf('<section id="indicadores"')));
    assert.ok(bloco.length > 100);
    assert.equal(/<(button|a|input|select)\b|tabindex|onclick|role="button"/i.test(bloco), false);
    assert.ok(html.includes("connect-src 'none'") && html.includes("script-src 'self'"));
    assert.ok(html.indexOf("js/aso.js") < html.indexOf("js/indicadores.js") && html.indexOf("js/indicadores.js") < html.indexOf("js/script.js"));
  });
  await teste("importação não altera os registros originais (congelados e idênticos)", () => {
    const c = carregar();
    const regs = regsDe(N); const antes = JSON.stringify(regs);
    importar(c, regs, "a.xlsx");
    assert.equal(JSON.stringify(c.run("Dados.obter()")), antes);
    assert.equal(c.run("Object.isFrozen(Aso.obter())"), true);
  });

  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})();
