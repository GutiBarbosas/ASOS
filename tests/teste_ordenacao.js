// Testes da ordenação por urgência (Etapa 8). Node 18+. Só dados FICTÍCIOS. Rodar a partir da pasta do projeto:  node tests/teste_ordenacao.js
// 1) lógica pura (Ordenacao.ordenar) sobre itens calculados pelo módulo Aso, com data controlada;
// 2) integração em contexto isolado (vm): Dados + Aso + Filtros + Ordenacao + Render + Indicadores — ordem dos cartões com pesquisa e filtros, contador, indicadores.
// O comportamento no navegador (cartões reais, temas, 1280/390/320 px) está em tests/e2e_ordenacao.py.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Utils = require("../js/utils.js");
const Aso = require("../js/aso.js");
const Ordenacao = require("../js/ordenacao.js");

let ok = 0, falhas = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log("  ok   " + nome); }
  catch (e) { falhas++; console.log("  FALHOU " + nome + "\n         " + e.message.split("\n")[0]); }
}
const lerJS = f => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");
const semComentarios = s => s.replace(/\/\/.*$/gm, "");

const HOJE = "2026-10-13";
const soma = (iso, n) => new Date(Utils.isoParaUTC(iso) + n * 86400000).toISOString().slice(0, 10);
const COD = Aso.SITUACOES;
const reg = o => Object.freeze({ linha: 2, supervisor: "SUP X", gerente: "GER X", funcao: "CAIXA", municipio: "AAA", loja: "1", colaborador: "COLABORADOR X",
  admissao: "2020-02-01", ult_aso: "2025-10-10", venc: "2026-10-05", ...o });

// Base fictícia embaralhada de propósito (ordem da planilha != ordem de urgência). [nome, ult_aso, venc, situação esperada]
const LINHAS = [
  /*  1 */ ["EM DIA 200", soma(HOJE, -160), soma(HOJE, 200), COD.EM_DIA],
  /*  2 */ ["SEM DATA A", "2025-01-01", null, COD.SEM_DATA],
  /*  3 */ ["VENCIDO 10", soma(HOJE, -370), soma(HOJE, -10), COD.VENCIDO],
  /*  4 */ ["PROXIMO 25", soma(HOJE, -335), soma(HOJE, 25), COD.PROXIMO],
  /*  5 */ ["INCONSISTENTE A", soma(HOJE, 5), soma(HOJE, 365), COD.DATA_INCONSISTENTE],
  /*  6 */ ["VENCE HOJE A", soma(HOJE, -360), HOJE, COD.VENCE_HOJE],
  /*  7 */ ["VENCIDO 400", soma(HOJE, -760), soma(HOJE, -400), COD.VENCIDO],
  /*  8 */ ["EM DIA 31", soma(HOJE, -329), soma(HOJE, 31), COD.EM_DIA],
  /*  9 */ ["PROXIMO 1", soma(HOJE, -359), soma(HOJE, 1), COD.PROXIMO],
  /* 10 */ ["VENCIDO 1", soma(HOJE, -361), soma(HOJE, -1), COD.VENCIDO],
  /* 11 */ ["SEM DATA B", null, "lixo", COD.SEM_DATA],
  /* 12 */ ["INCONSISTENTE B", soma(HOJE, 30), null, COD.DATA_INCONSISTENTE],
  /* 13 */ ["VENCE HOJE B", soma(HOJE, -360), HOJE, COD.VENCE_HOJE],
  /* 14 */ ["PROXIMO 25 BIS", soma(HOJE, -335), soma(HOJE, 25), COD.PROXIMO], // empate com o 4: mantém a ordem da planilha
  /* 15 */ ["VENCIDO 10 BIS", soma(HOJE, -370), soma(HOJE, -10), COD.VENCIDO], // empate com o 3
  /* 16 */ ["EM DIA 90", soma(HOJE, -270), soma(HOJE, 90), COD.EM_DIA],
  /* 17 */ ["VENCIDO 100", soma(HOJE, -460), soma(HOJE, -100), COD.VENCIDO]
];
const registros = () => Object.freeze(LINHAS.map((l, i) => reg({ linha: i + 2, colaborador: l[0], ult_aso: l[1], venc: l[2] })));
const itens = () => Aso.calcular(registros(), HOJE);
const nomes = lista => lista.map(i => i.registro.colaborador);

// Ordem esperada, escrita à mão (não derivada do código):
const ESPERADO = [
  "INCONSISTENTE A", "INCONSISTENTE B",                                   // 1. data inconsistente (ordem da planilha)
  "VENCIDO 400", "VENCIDO 100", "VENCIDO 10", "VENCIDO 10 BIS", "VENCIDO 1", // 2. vencidos: maior atraso primeiro
  "VENCE HOJE A", "VENCE HOJE B",                                          // 3. vence hoje
  "PROXIMO 1", "PROXIMO 25", "PROXIMO 25 BIS",                             // 4. próximos: vencimento mais próximo primeiro
  "EM DIA 31", "EM DIA 90", "EM DIA 200",                                  // 5. em dia: vencimento mais próximo primeiro
  "SEM DATA A", "SEM DATA B"                                               // 6. sem data por último
];

(async () => {
  console.log("Ordenação (lógica)");
  await teste("a base de teste cai nas situações esperadas (premissa dos testes seguintes)", () => {
    itens().forEach((it, i) => assert.equal(it.situacao, LINHAS[i][3], LINHAS[i][0]));
  });
  await teste("as seis categorias aparecem na ordem definida e cada registro aparece uma vez", () => {
    const r = Ordenacao.ordenar(itens());
    assert.deepEqual(nomes(r), ESPERADO);
    assert.equal(r.length, LINHAS.length);
    const grupos = r.map(i => i.situacao).filter((s, k, a) => k === 0 || s !== a[k - 1]);
    assert.deepEqual(grupos, [COD.DATA_INCONSISTENTE, COD.VENCIDO, COD.VENCE_HOJE, COD.PROXIMO, COD.EM_DIA, COD.SEM_DATA]);
  });
  await teste("vencidos: do maior atraso para o menor (400, 100, 10, 1 dias)", () => {
    const v = Ordenacao.ordenar(itens()).filter(i => i.situacao === COD.VENCIDO).map(i => i.dias);
    assert.deepEqual(v, [-400, -100, -10, -10, -1]);
  });
  await teste("próximos e em dia: vencimento mais próximo primeiro", () => {
    const r = Ordenacao.ordenar(itens());
    assert.deepEqual(r.filter(i => i.situacao === COD.PROXIMO).map(i => i.dias), [1, 25, 25]);
    assert.deepEqual(r.filter(i => i.situacao === COD.EM_DIA).map(i => i.dias), [31, 90, 200]);
  });
  await teste("sem data fica por último, depois de todos os outros grupos", () => {
    const r = Ordenacao.ordenar(itens());
    assert.deepEqual(r.slice(-2).map(i => i.situacao), [COD.SEM_DATA, COD.SEM_DATA]);
  });
  await teste("data inconsistente fica primeiro, mesmo com VENC muito antiga ou muito futura", () => {
    const base = [
      reg({ colaborador: "VENCIDO ANTIGO", ult_aso: "2020-01-01", venc: "2020-12-26" }),
      reg({ colaborador: "INCONSISTENTE", ult_aso: soma(HOJE, 3), venc: soma(HOJE, 363) })
    ];
    assert.deepEqual(nomes(Ordenacao.ordenar(Aso.calcular(base, HOJE))), ["INCONSISTENTE", "VENCIDO ANTIGO"]);
  });
  await teste("empates mantêm a ordem da planilha (determinístico) e repetir dá o mesmo resultado", () => {
    const r1 = nomes(Ordenacao.ordenar(itens()));
    const r2 = nomes(Ordenacao.ordenar(itens()));
    assert.deepEqual(r1, r2);
    assert.ok(r1.indexOf("VENCIDO 10") < r1.indexOf("VENCIDO 10 BIS"));
    assert.ok(r1.indexOf("PROXIMO 25") < r1.indexOf("PROXIMO 25 BIS"));
    assert.ok(r1.indexOf("VENCE HOJE A") < r1.indexOf("VENCE HOJE B"));
    // mesma lista em ordem invertida: os empates seguem a ordem recebida (a da planilha), não uma ordem fixa por nome
    const inv = itens().slice().reverse();
    const rInv = nomes(Ordenacao.ordenar(inv));
    assert.ok(rInv.indexOf("VENCIDO 10 BIS") < rInv.indexOf("VENCIDO 10"));
  });
  await teste("muitos registros com o mesmo vencimento: ordem original preservada", () => {
    const base = Array.from({ length: 200 }, (_, i) => reg({ colaborador: "N" + String(i).padStart(3, "0"), ult_aso: soma(HOJE, -300), venc: soma(HOJE, -50) }));
    const r = nomes(Ordenacao.ordenar(Aso.calcular(base, HOJE)));
    assert.deepEqual(r, base.map(b => b.colaborador));
  });
  await teste("usa a data oficial VENC (dias do Aso), não ULT_ASO + 360: ULT_ASO mais recente não muda a ordem", () => {
    const base = [
      reg({ colaborador: "VENC MAIS ANTIGA", ult_aso: soma(HOJE, -20), venc: soma(HOJE, -90) }), // ULT_ASO recente, mas VENC é a oficial
      reg({ colaborador: "VENC MAIS RECENTE", ult_aso: soma(HOJE, -700), venc: soma(HOJE, -5) })
    ];
    assert.deepEqual(nomes(Ordenacao.ordenar(Aso.calcular(base, HOJE))), ["VENC MAIS ANTIGA", "VENC MAIS RECENTE"]);
  });
  await teste("não altera a lista recebida nem os itens (mesmos objetos, congelados); devolve lista nova", () => {
    const lista = itens();
    const antes = nomes(lista);
    const r = Ordenacao.ordenar(lista);
    assert.deepEqual(nomes(lista), antes);
    assert.notEqual(r, lista);
    assert.ok(r.every(x => lista.includes(x) && Object.isFrozen(x) && Object.isFrozen(x.registro)));
  });
  await teste("entradas vazias ou inesperadas não quebram (vazia, null, situação desconhecida vai para o fim)", () => {
    assert.deepEqual(Ordenacao.ordenar([]), []);
    assert.deepEqual(Ordenacao.ordenar(null), []);
    const estranho = { registro: reg({ colaborador: "ESTRANHO" }), situacao: "xyz", rotulo: "XYZ", dias: 3 };
    const r = Ordenacao.ordenar([estranho, ...itens().slice(0, 3)]);
    assert.equal(r[r.length - 1], estranho);
  });
  await teste("não duplica nem recalcula regras: ordenacao.js só usa Aso.SITUACOES e não menciona ULT_ASO/VENC/ASO_STATUS no código", () => {
    const src = semComentarios(lerJS("ordenacao.js"));
    assert.equal(/ult_aso|venc\b|ASO_STATUS|calcularSituacao|diferencaDias|DIAS_ALERTA/.test(src), false);
  });

  console.log("Integração (Dados + Aso + Filtros + Ordenacao + Render + Indicadores, em contexto isolado)");
  const carregar = () => {
    const area = { innerHTML: "" };
    const valores = {};
    const sec = { setAttribute() {}, querySelector: sel => { const m = sel.match(/^\[data-indicador="([a-z-]+)"\]$/); return m ? { querySelector: () => (valores[m[1]] = valores[m[1]] || { textContent: "" }) } : null; } };
    const document = Object.assign(new EventTarget(), { getElementById: id => (id === "lista-cartoes" ? area : id === "indicadores" ? sec : null) });
    const ctx = vm.createContext({ document, CustomEvent, console });
    for (const f of ["dados.js", "utils.js", "aso.js", "filters.js", "ordenacao.js", "render.js", "indicadores.js"]) vm.runInContext(lerJS(f), ctx, { filename: f });
    vm.runInContext("Aso.definirRelogio(() => new Date(2026, 9, 13, 15, 0, 0))", ctx);
    const run = c => vm.runInContext(c, ctx);
    const json = c => JSON.parse(run("JSON.stringify(" + c + ")"));
    return { ctx, area, valores, run, json };
  };
  const importar = (c, regs, nome) => { c.ctx.__r = regs; c.run("Dados.definir({ registros: __r, arquivo: " + JSON.stringify(nome) + " })"); };
  const naTela = c => [...c.area.innerHTML.matchAll(/<h3 class="cartao__nome">(.*?)<\/h3>/g)].map(m => m[1]);
  const contador = c => c.run("Filtros.textoContador(Filtros.contagem())");
  const indicadores = c => Object.fromEntries(Object.entries(c.valores).map(([k, v]) => [k, v.textContent]));

  await teste("após importar: os cartões saem em ordem de urgência; Dados.obter() e Aso.obter() continuam na ordem da planilha", () => {
    const c = carregar();
    importar(c, registros(), "a.xlsx");
    assert.deepEqual(naTela(c), ESPERADO);
    assert.deepEqual(c.json("Dados.obter().map(r => r.colaborador)"), LINHAS.map(l => l[0]));
    assert.deepEqual(c.json("Aso.obter().map(i => i.registro.colaborador)"), LINHAS.map(l => l[0]));
  });
  await teste("a ordenação é aplicada depois dos filtros: situação, supervisor e pesquisa mantêm a ordem de urgência dentro do resultado", () => {
    const c = carregar();
    importar(c, registros(), "a.xlsx");
    c.run("Filtros.definir('situacao', '" + COD.VENCIDO + "')");
    assert.deepEqual(naTela(c), ["VENCIDO 400", "VENCIDO 100", "VENCIDO 10", "VENCIDO 10 BIS", "VENCIDO 1"]);
    assert.equal(contador(c), "Exibindo 5 de 17 registros");
    c.run("Filtros.limpar(); Filtros.definir('busca', 'em dia')");
    assert.deepEqual(naTela(c), ["EM DIA 31", "EM DIA 90", "EM DIA 200"]);
    c.run("Filtros.definir('busca', 'bis')");
    assert.deepEqual(naTela(c), ["VENCIDO 10 BIS", "PROXIMO 25 BIS"]); // vencido antes de próximo, mesmo com 'PROXIMO' antes na planilha
    assert.equal(contador(c), "Exibindo 2 de 17 registros");
  });
  await teste("os seis filtros e a pesquisa combinados continuam funcionando e ordenados (loja/função/município/gerente/supervisor)", () => {
    const c = carregar();
    const base = Object.freeze([
      reg({ colaborador: "A EM DIA", loja: "7", supervisor: "S1", gerente: "G1", funcao: "CAIXA", municipio: "M1", venc: soma(HOJE, 100) }),
      reg({ colaborador: "B VENCIDO", loja: "7", supervisor: "S1", gerente: "G1", funcao: "CAIXA", municipio: "M1", venc: soma(HOJE, -3) }),
      reg({ colaborador: "C VENCIDO LONGE", loja: "7", supervisor: "S1", gerente: "G1", funcao: "CAIXA", municipio: "M1", venc: soma(HOJE, -90) }),
      reg({ colaborador: "D OUTRA LOJA", loja: "8", supervisor: "S1", gerente: "G1", funcao: "CAIXA", municipio: "M1", venc: soma(HOJE, -500) })
    ]);
    importar(c, base, "b.xlsx");
    for (const [k, v] of [["supervisor", "S1"], ["gerente", "G1"], ["loja", "7"], ["funcao", "CAIXA"], ["municipio", "M1"]]) c.run("Filtros.definir(" + JSON.stringify(k) + ", " + JSON.stringify(v) + ")");
    assert.deepEqual(naTela(c), ["C VENCIDO LONGE", "B VENCIDO", "A EM DIA"]);
    assert.equal(contador(c), "Exibindo 3 de 4 registros");
    c.run("Filtros.definir('situacao', '" + COD.VENCIDO + "'); Filtros.definir('busca', 'longe')");
    assert.deepEqual(naTela(c), ["C VENCIDO LONGE"]);
  });
  await teste("o contador reflete a quantidade filtrada (não o total), e nenhum resultado mostra a mensagem", () => {
    const c = carregar();
    importar(c, registros(), "a.xlsx");
    c.run("Filtros.definir('busca', 'inconsistente')");
    assert.equal(contador(c), "Exibindo 2 de 17 registros");
    c.run("Filtros.definir('busca', 'zzz')");
    assert.equal(contador(c), "Exibindo 0 de 17 registros");
    assert.match(c.area.innerHTML, /Nenhum colaborador encontrado/);
  });
  await teste("os sete indicadores são globais: iguais com e sem ordenação, pesquisa ou filtros", () => {
    const c = carregar();
    importar(c, registros(), "a.xlsx");
    const antes = indicadores(c);
    assert.deepEqual(antes, { total: "17", [COD.VENCIDO]: "5", [COD.VENCE_HOJE]: "2", [COD.PROXIMO]: "3", [COD.EM_DIA]: "3", [COD.SEM_DATA]: "2", [COD.DATA_INCONSISTENTE]: "2" });
    c.run("Filtros.definir('situacao', '" + COD.VENCIDO + "'); Filtros.definir('busca', 'bis')");
    assert.deepEqual(indicadores(c), antes);
    c.run("Filtros.limpar()");
    assert.deepEqual(indicadores(c), antes);
  });
  await teste("nova importação válida substitui tudo e a ordem vale para a nova base", () => {
    const c = carregar();
    importar(c, registros(), "a.xlsx");
    importar(c, Object.freeze([
      reg({ colaborador: "NOVO EM DIA", venc: soma(HOJE, 60) }),
      reg({ colaborador: "NOVO VENCIDO", venc: soma(HOJE, -2) })
    ]), "b.xlsx");
    assert.deepEqual(naTela(c), ["NOVO VENCIDO", "NOVO EM DIA"]);
    assert.equal(contador(c), "Exibindo 2 de 2 registros");
  });
  await teste("um único cartão por registro (sem duplicar) e uma única grade", () => {
    const c = carregar();
    importar(c, registros(), "a.xlsx");
    assert.equal((c.area.innerHTML.match(/<article /g) || []).length, 17);
    assert.equal((c.area.innerHTML.match(/cartoes__grade/g) || []).length, 1);
    assert.equal(new Set(naTela(c)).size, 17);
  });
  await teste("sem Ordenacao carregada (Etapa 7 pura) o Render continua na ordem da planilha: o módulo é opcional como Filtros", () => {
    const src = semComentarios(lerJS("render.js"));
    assert.match(src, /typeof Ordenacao !== "undefined"/);
  });

  console.log("Segurança e estrutura da página");
  await teste("ordenacao.js: sem rede, sem armazenamento, sem eval, sem innerHTML, sem URL externa", () => {
    const src = semComentarios(lerJS("ordenacao.js"));
    for (const proibido of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/i, /document\.cookie/, /\beval\s*\(/, /new Function/, /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /https?:\/\//])
      assert.equal(proibido.test(src), false, "ordenacao.js contém " + proibido);
  });
  await teste("index.html: ordenacao.js entra depois de filters.js e antes de render.js; sem botão ou filtro de ordenação; CSP inalterada", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const pos = n => html.indexOf('src="js/' + n + '"');
    assert.ok(pos("filters.js") < pos("ordenacao.js") && pos("ordenacao.js") < pos("render.js"));
    assert.equal(/ordenar|ordena[cç]/i.test(html.replace(/<!--[\s\S]*?-->/g, "").replace(/src="js\/ordenacao\.js"/, "")), false, "controle de ordenação visível na página");
    assert.ok(html.includes("content=\"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'\""));
    assert.equal((html.match(/<select /g) || []).length, 6, "continuam só os seis filtros");
  });

  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})();
