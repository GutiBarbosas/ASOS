// Testes dos cartões (Etapa 5): montagem do HTML, escape, datas, situações e integração com Dados/Aso/eventos.
// Node 18+. Só dados FICTÍCIOS. Rodar a partir da pasta do projeto:  node tests/teste_render.js
// (O comportamento real no navegador — XSS executável, console, importação inválida — está em tests/e2e_cartoes.py.)
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Utils = require("../js/utils.js");
const Aso = require("../js/aso.js");
const Render = require("../js/render.js");
const Importador = require("../js/importador.js");

let ok = 0, falhas = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log("  ok   " + nome); }
  catch (e) { falhas++; console.log("  FALHOU " + nome + "\n         " + e.message.split("\n")[0]); }
}
const HOJE = "2026-10-13";
const soma = (iso, n) => new Date(Utils.isoParaUTC(iso) + n * 86400000).toISOString().slice(0, 10);
const reg = (o = {}) => Object.freeze({ linha: 2, supervisor: "SUP A", gerente: "GER A", funcao: "CAIXA", municipio: "AAA", loja: "7",
  colaborador: "COLABORADOR TESTE 01", admissao: "2020-02-01", ult_aso: "2025-10-10", venc: "2026-10-05", ...o });
const item = (o = {}, hoje = HOJE) => Aso.calcular([reg(o)], hoje)[0];
const cartao = (o, hoje) => Render.html(item(o, hoje));
const texto = h => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); // texto visível aproximado

(async () => {
  console.log("Utils.escapar e formatarDataBR");
  await teste("escapar: & < > \" ' ` ; null/undefined → vazio; números e outros tipos viram texto", () => {
    assert.equal(Utils.escapar('<img src=x onerror="alert(1)">&\'`'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;&#96;");
    assert.equal(Utils.escapar(null), ""); assert.equal(Utils.escapar(undefined), "");
    assert.equal(Utils.escapar(12), "12"); assert.equal(Utils.escapar(0), "0");
    assert.equal(Utils.escapar("&amp;"), "&amp;amp;"); // não "desfaz" nem duplica de forma ambígua: sempre escapa o &
  });
  await teste("formatarDataBR: dd/mm/aaaa; vazio/inválido → null", () => {
    assert.equal(Utils.formatarDataBR("2026-10-05"), "05/10/2026");
    assert.equal(Utils.formatarDataBR("2028-02-29"), "29/02/2028");
    assert.equal(Utils.formatarDataBR("2026-01-09"), "09/01/2026");
    for (const v of [null, undefined, "", "2026-02-31", "05/10/2026", "2026-10-05T00:00:00Z", 20261005]) assert.equal(Utils.formatarDataBR(v), null, String(v));
  });

  console.log("Cartão: conteúdo");
  await teste("exibe nome, loja, função, supervisor, gerente, município, último ASO e vencimento", () => {
    const h = cartao();
    const t = texto(h);
    for (const esperado of ["COLABORADOR TESTE 01", "Loja 7", "CAIXA", "SUP A", "GER A", "AAA", "Último ASO 10/10/2025", "Vencimento 05/10/2026"]) {
      // "Loja 7" = rótulo + valor lado a lado no texto linearizado
      assert.ok(t.includes(esperado.replace("Loja 7", "Loja 7")), esperado + " ausente em: " + t);
    }
    assert.match(h, /<article class="cartao cartao--vencido">/);
  });
  await teste("datas no padrão brasileiro e nunca em ISO", () => {
    const h = cartao({ ult_aso: "2025-01-09", venc: "2026-01-04" });
    assert.ok(h.includes("09/01/2025") && h.includes("04/01/2026"));
    assert.equal(/\d{4}-\d{2}-\d{2}/.test(h), false);
  });
  await teste("não exibe campos sensíveis nem fora do escopo (admissão, CNPJ, nascimento, CPF, salário)", () => {
    const h = cartao({ admissao: "2019-03-04" });
    assert.equal(h.includes("04/03/2019"), false, "admissão não é exibida");
    assert.equal(/admiss|cnpj|cpnj|nasc|cpf|sal[aá]rio/i.test(h), false);
  });
  await teste("campos ausentes: 'Não informada' (datas, loja, supervisor...) e nome vazio", () => {
    const h = cartao({ ult_aso: null, venc: null, loja: "", supervisor: "", gerente: "  ", municipio: "", funcao: "", colaborador: "" });
    const t = texto(h);
    assert.equal((t.match(/Não informada/g) || []).length, 7, t); // loja, função, supervisor, gerente, município, último ASO, vencimento
    assert.ok(t.includes("Nome não informado"));
    assert.ok(t.includes("SEM DATA"));
    assert.equal(/undefined|null|NaN/.test(h), false);
  });
  await teste("FUNÇÃO '0' é exibida como não informada e as demais em maiúsculas (dados originais intactos)", () => {
    const r = reg({ funcao: "0" }), r2 = reg({ funcao: "Gerente" });
    assert.ok(texto(Render.html(Aso.calcular([r], HOJE)[0])).includes("Função Não informada"));
    assert.ok(texto(Render.html(Aso.calcular([r2], HOJE)[0])).includes("Função GERENTE"));
    assert.equal(r.funcao, "0"); assert.equal(r2.funcao, "Gerente");
  });

  console.log("Cartão: as seis situações (hoje = " + HOJE + ")");
  const casos = [
    ["vencido", { ult_aso: "2025-10-01", venc: soma(HOJE, -12) }, "VENCIDO", "Vencido há 12 dias"],
    ["vence-hoje", { ult_aso: "2025-10-18", venc: HOJE }, "VENCE HOJE", "Vence hoje"],
    ["proximo", { ult_aso: "2025-10-20", venc: soma(HOJE, 8) }, "PRÓXIMO DO VENCIMENTO", "Faltam 8 dias para vencer"],
    ["em-dia", { ult_aso: "2026-01-01", venc: soma(HOJE, 200) }, "EM DIA", "Dentro do prazo"],
    ["sem-data", { ult_aso: "2025-10-10", venc: null }, "SEM DATA", "Data de vencimento não informada ou inválida"],
    ["data-inconsistente", { ult_aso: soma(HOJE, 3), venc: soma(HOJE, 363) }, "DATA INCONSISTENTE", "Conferir a data cadastrada"]
  ];
  for (const [cod, dados, rotulo, detalhe] of casos) {
    await teste(cod + ": classe, selo e texto de apoio", () => {
      const h = cartao(dados);
      assert.ok(h.includes('class="cartao cartao--' + cod + '"'), h.slice(0, 80));
      assert.ok(h.includes('<span class="cartao__selo">' + rotulo + "</span>"));
      assert.ok(texto(h).includes(detalhe), texto(h));
    });
  }
  await teste("as seis situações têm aparência (classe + selo) distinta entre si", () => {
    const sig = casos.map(([, d]) => { const h = cartao(d); return /cartao--([a-z-]+)"/.exec(h)[1] + "|" + /selo">([^<]+)</.exec(h)[1]; });
    assert.equal(new Set(sig).size, 6);
  });
  await teste("data inconsistente deixa claro que é preciso conferir a data cadastrada", () => {
    assert.match(texto(cartao(casos[5][1])), /Conferir a data cadastrada/);
  });

  console.log("Cartão: dias de atraso e dias restantes");
  await teste("atraso: 1 dia (singular), 2 dias, 400 dias; nunca número negativo", () => {
    for (const [n, esperado] of [[1, "Vencido há 1 dia"], [2, "Vencido há 2 dias"], [400, "Vencido há 400 dias"]]) {
      const h = cartao({ ult_aso: "2024-01-01", venc: soma(HOJE, -n) });
      assert.ok(texto(h).includes(esperado), esperado);
      assert.equal(/-\d/.test(texto(h)), false, "número negativo em: " + texto(h));
    }
  });
  await teste("restantes: 1 dia (amanhã), 30 dias (limite); hoje não mostra contagem; em dia não mostra atraso", () => {
    assert.ok(texto(cartao({ ult_aso: null, venc: soma(HOJE, 1) })).includes("Faltam 1 dia para vencer"));
    assert.ok(texto(cartao({ ult_aso: null, venc: soma(HOJE, 30) })).includes("Faltam 30 dias para vencer"));
    assert.equal(/Faltam|há \d/.test(texto(cartao({ ult_aso: null, venc: HOJE }))), false);
    assert.equal(/Faltam|há \d/.test(texto(cartao({ ult_aso: null, venc: soma(HOJE, 31) }))), false);
    assert.equal(/-\d/.test(texto(Render.detalheSituacao({ situacao: "proximo", dias: -5 }))), false, "defesa contra dias negativo");
  });

  console.log("Cartão: não recalcula; conteúdo malicioso");
  await teste("usa a situação recebida do módulo Aso (não recalcula a partir das datas)", () => {
    const falso = Object.freeze({ registro: reg({ venc: "2020-01-01" }), situacao: "em-dia", rotulo: "EM DIA", dias: 999 });
    const h = Render.html(falso);
    assert.ok(h.includes("cartao--em-dia") && h.includes("EM DIA") && !h.includes("VENCIDO"));
  });
  await teste("HTML/JS nos campos importados fica escapado (nenhuma tag nova, nenhum atributo injetado)", () => {
    const ataque = '<img src=x onerror="alert(1)"><script>alert(2)</script>"><svg onload=alert(3)>\'`';
    const h = cartao({ colaborador: ataque, loja: ataque, funcao: ataque, supervisor: ataque, gerente: ataque, municipio: ataque });
    assert.equal(/<img|<script|<svg/i.test(h), false, "tag injetada");
    // as únicas tags do cartão são as do próprio template
    const tags = [...h.matchAll(/<\/?([a-z0-9]+)/gi)].map(m => m[1].toLowerCase());
    assert.deepEqual([...new Set(tags)].sort(), ["article", "dd", "div", "dl", "dt", "h3", "header", "p", "span"]);
    assert.ok(h.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  });
  await teste("situação e rótulo desconhecidos não viram classe/HTML livre", () => {
    const h = Render.html({ registro: reg(), situacao: '"><script>x</script>', rotulo: "<b>x</b>", dias: null });
    assert.ok(h.includes("cartao--desconhecida") && !h.includes("<script") && !h.includes("<b>"));
  });

  console.log("Lista e estados");
  await teste("um cartão por registro, na ordem recebida", () => {
    const regs = [1, 2, 3, 4].map(i => reg({ colaborador: "COLABORADOR TESTE " + i, linha: i + 1 }));
    const h = Render.htmlLista(Aso.calcular(regs, HOJE), true);
    assert.equal((h.match(/<article /g) || []).length, 4);
    assert.ok(h.indexOf("TESTE 1") < h.indexOf("TESTE 2") && h.indexOf("TESTE 3") < h.indexOf("TESTE 4"));
  });
  await teste("estado inicial (sem importação) e planilha sem registros", () => {
    assert.match(texto(Render.htmlLista([], false)), /Nenhuma planilha importada.*Importar planilha/);
    assert.match(texto(Render.htmlLista([], true)), /não tem registros/);
    assert.equal(Render.htmlLista(null, false).includes("<article"), false);
  });

  console.log("Integração (Dados + Aso + evento, em contexto isolado)");
  const CAB = ["SUPERVISOR", "GERENTE", "FUNÇÃO", "MUNICIPIO", "LOJA", "COLABORADOR", "ADMISSÃO", "ULT_ASO", "VENC"];
  const planilha = linhas => Importador.processarLinhas([CAB, ...linhas.map((l, i) => ["SUP A", "GER A", "CAIXA", "AAA", 1, l[2] || "COLABORADOR TESTE " + (i + 1), "01/02/2020", l[0], l[1]])]);
  const carregar = () => {
    const area = { innerHTML: "" };
    const document = Object.assign(new EventTarget(), { getElementById: id => (id === "lista-cartoes" ? area : null) });
    const ctx = vm.createContext({ document, CustomEvent, console });
    for (const f of ["dados.js", "utils.js", "aso.js", "render.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), ctx, { filename: f });
    vm.runInContext("Aso.definirRelogio(() => new Date(2026, 9, 13, 15, 0, 0))", ctx);
    return { ctx, area, run: c => vm.runInContext(c, ctx) };
  };
  const importar = (c, p, nome) => { c.ctx.__p = p; c.run("Dados.definir({ registros: __p.registros, arquivo: " + JSON.stringify(nome) + " })"); };
  await teste("antes da primeira importação mostra a orientação; após importar mostra um cartão por registro", () => {
    const c = carregar();
    assert.match(c.area.innerHTML, /Nenhuma planilha importada/);
    importar(c, planilha([["10/10/2025", "05/10/2026"], ["13/10/2025", "13/10/2026"], [null, null]]), "a.xlsx");
    assert.equal((c.area.innerHTML.match(/<article /g) || []).length, 3);
    assert.deepEqual([...c.area.innerHTML.matchAll(/cartao--([a-z-]+)"/g)].map(m => m[1]), ["vencido", "vence-hoje", "sem-data"]);
    assert.equal(c.area.innerHTML.includes("Nenhuma planilha importada"), false);
  });
  await teste("segunda importação válida substitui a listagem anterior", () => {
    const c = carregar();
    importar(c, planilha([["10/10/2025", "05/10/2026", "PRIMEIRA PLANILHA A"], ["10/10/2025", "05/10/2026", "PRIMEIRA PLANILHA B"]]), "a.xlsx");
    assert.ok(c.area.innerHTML.includes("PRIMEIRA PLANILHA A"));
    importar(c, planilha([["01/01/2026", "27/12/2026", "SEGUNDA PLANILHA"]]), "b.xlsx");
    assert.equal((c.area.innerHTML.match(/<article /g) || []).length, 1);
    assert.ok(c.area.innerHTML.includes("SEGUNDA PLANILHA") && !c.area.innerHTML.includes("PRIMEIRA"));
    assert.ok(c.area.innerHTML.includes("cartao--em-dia"));
  });
  await teste("importação inválida não chama Dados.definir: a listagem anterior é preservada", () => {
    const c = carregar();
    importar(c, planilha([["10/10/2025", "05/10/2026", "COLABORADOR MANTIDO"]]), "a.xlsx");
    const antes = c.area.innerHTML;
    const ruim = Importador.processarLinhas([CAB.filter(x => x !== "VENC"), ["a", "b"]]);
    assert.equal(ruim.ok, false); // script.js só chama Dados.definir quando ok
    assert.equal(c.area.innerHTML, antes);
  });
  await teste("planilha importada sem registros mostra o estado vazio próprio", () => {
    const c = carregar();
    c.run("Dados.definir({ registros: Object.freeze([]), arquivo: 'vazia.xlsx' })");
    assert.match(c.area.innerHTML, /não tem registros/);
  });
  await teste("cartões apontam para dados que continuam intactos e congelados", () => {
    const c = carregar();
    const p = planilha([["10/10/2025", "05/10/2026"]]);
    const antes = JSON.stringify(p.registros);
    importar(c, p, "a.xlsx");
    assert.equal(JSON.stringify(c.run("Dados.obter()")), antes);
    assert.equal(c.run("Object.isFrozen(Dados.obter()[0])"), true);
  });

  console.log("Segurança do código novo");
  await teste("render.js e utils.js: sem rede, sem armazenamento, sem eval; innerHTML só recebe htmlLista (escapado)", () => {
    for (const f of ["utils.js", "aso.js", "render.js"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8").replace(/\/\/.*$/gm, "");
      for (const proibido of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/i, /document\.cookie/, /\beval\s*\(/, /new Function/, /insertAdjacentHTML/, /document\.write/, /outerHTML/])
        assert.equal(proibido.test(src), false, f + " contém " + proibido);
    }
    const r = fs.readFileSync(path.join(__dirname, "..", "js", "render.js"), "utf8").replace(/\/\/.*$/gm, "");
    const usos = r.match(/innerHTML[^\n]*/g) || [];
    assert.deepEqual(usos, ["innerHTML = htmlLista(itens, temArquivo, todos.length);"]); // Etapa 7: `itens` = lista filtrada de Aso.obter()
    assert.equal(/innerHTML/.test(fs.readFileSync(path.join(__dirname, "..", "js", "script.js"), "utf8")), false);
  });

  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})();
