// Testes da atualização automática na virada do dia (Etapa 8). Node 18+. Só dados FICTÍCIOS. Rodar a partir da pasta do projeto:  node tests/teste_virada_dia.js
// Tudo em contexto isolado (vm) com relógio controlado (Aso.definirRelogio) e temporizador falso (Atualizacao.definirAgendador): nenhum teste espera a meia-noite real.
// Módulos reais: Dados + Aso + Filtros + Ordenacao + Render + Indicadores + Atualizacao. O comportamento no navegador (relógio do Playwright) está em tests/e2e_virada_dia.py.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Atualizacao = require("../js/atualizacao.js");

let ok = 0, falhas = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log("  ok   " + nome); }
  catch (e) { falhas++; console.log("  FALHOU " + nome + "\n         " + e.message.split("\n")[0]); }
}
const lerJS = f => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");
const semComentarios = s => s.replace(/\/\/.*$/gm, "");

const dia = (a, m, d, h = 12, mi = 0, s = 0) => new Date(a, m - 1, d, h, mi, s); // data/hora LOCAL
const iso = (a, m, d) => String(a).padStart(4, "0") + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
const reg = o => Object.freeze({ linha: 2, supervisor: "SUP X", gerente: "GER X", funcao: "CAIXA", municipio: "AAA", loja: "1", colaborador: "COLABORADOR X",
  admissao: "2020-02-01", ult_aso: "2025-01-10", venc: "2026-10-05", ...o });

// Base fictícia. Em 13/10/2026 (hoje): AMANHA vence 14/10 (próximo, 1 dia) · HOJE vence 13/10 · EM DIA 30 dias vence 12/11 (próximo, 30) · EM DIA 31 vence 13/11 · VENCIDO vence 01/10.
const BASE = () => Object.freeze([
  reg({ colaborador: "EM DIA 31", supervisor: "S1", loja: "7", venc: "2026-11-13" }),
  reg({ colaborador: "VENCE AMANHA", supervisor: "S1", loja: "7", venc: "2026-10-14" }),
  reg({ colaborador: "VENCE HOJE", supervisor: "S2", loja: "8", venc: "2026-10-13" }),
  reg({ colaborador: "VENCIDO ANTIGO", supervisor: "S2", loja: "8", venc: "2026-10-01" }),
  reg({ colaborador: "PROXIMO 30", supervisor: "S1", loja: "8", venc: "2026-11-12" }),
  reg({ colaborador: "SEM DATA", supervisor: "S2", loja: "7", venc: null })
]);

// ---------- Ambiente falso (relógio, temporizador, documento e janela controlados) ----------
// O setTimeout do contexto é o falso, para o módulo (que se inicia sozinho ao carregar) já usar o temporizador controlado.
function carregar() {
  const area = { innerHTML: "" };
  const valores = {};
  const sec = { setAttribute() {}, querySelector: sel => { const m = sel.match(/^\[data-indicador="([a-z-]+)"\]$/); return m ? { querySelector: () => (valores[m[1]] = valores[m[1]] || { textContent: "" }) } : null; } };
  const erros = [];
  const contagem = {};
  const rastrear = (alvo, nome) => {
    const add = alvo.addEventListener.bind(alvo), rem = alvo.removeEventListener.bind(alvo);
    const ativos = new Map();
    alvo.addEventListener = (t, f, o) => { const k = nome + ":" + t; if (!ativos.has(f) || !ativos.get(f).has(t)) { ativos.set(f, (ativos.get(f) || new Set()).add(t)); contagem[k] = (contagem[k] || 0) + 1; } add(t, f, o); };
    alvo.removeEventListener = (t, f, o) => { const k = nome + ":" + t; if (ativos.has(f) && ativos.get(f).delete(t)) contagem[k]--; rem(t, f, o); };
  };
  const document = Object.assign(new EventTarget(), { visibilityState: "visible", getElementById: id => (id === "lista-cartoes" ? area : id === "indicadores" ? sec : null) });
  const window = new EventTarget();
  rastrear(document, "document"); rastrear(window, "window");
  const pendentes = new Map(); let proximoId = 1, armados = 0;
  const timers = { definir: (fn, ms) => { const id = proximoId++; pendentes.set(id, { fn, ms }); armados++; return id; }, cancelar: id => pendentes.delete(id) };
  const consoleFalso = { log() {}, warn: m => erros.push("warn: " + m), error: m => erros.push("error: " + m) };
  const ctx = vm.createContext({ document, window, CustomEvent, console: consoleFalso,
    setTimeout: (fn, ms) => timers.definir(fn, ms), clearTimeout: id => timers.cancelar(id) });
  let relogio = dia(2026, 10, 13, 15, 0, 0);
  ctx.__agora = () => relogio;
  for (const f of ["dados.js", "utils.js", "aso.js", "filters.js", "ordenacao.js", "render.js", "indicadores.js"]) vm.runInContext(lerJS(f), ctx, { filename: f });
  vm.runInContext("Aso.definirRelogio(() => __agora())", ctx);
  vm.runInContext(lerJS("atualizacao.js"), ctx, { filename: "atualizacao.js" });
  const run = c => vm.runInContext(c, ctx);
  const t = {
    ctx, area, valores, document, window, erros, contagem, pendentes, armados: () => armados,
    run, json: c => JSON.parse(run("JSON.stringify(" + c + ")")),
    importar: (regs, nome = "a.xlsx") => { ctx.__r = regs; run("Dados.definir({ registros: __r, arquivo: " + JSON.stringify(nome) + " })"); },
    definirRelogio: d => { relogio = d; },
    disparar: () => { const [id, p] = [...pendentes][0]; pendentes.delete(id); p.fn(); }, // executa o único temporizador pendente
    nomes: () => [...area.innerHTML.matchAll(/<h3 class="cartao__nome">(.*?)<\/h3>/g)].map(m => m[1]),
    selo: nome => { const m = area.innerHTML.match(new RegExp('<h3 class="cartao__nome">' + nome + '</h3><span class="cartao__selo">(.*?)</span>')); return m && m[1]; },
    indicadores: () => Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v.textContent])),
    contador: () => run("Filtros.textoContador(Filtros.contagem())"),
    ocultar() { document.visibilityState = "hidden"; document.dispatchEvent(new Event("visibilitychange")); },
    mostrar() { document.visibilityState = "visible"; document.dispatchEvent(new Event("visibilitychange")); }
  };
  return t;
}
const COD = { V: "vencido", H: "vence-hoje", P: "proximo", E: "em-dia", S: "sem-data", I: "data-inconsistente" };

(async () => {
  console.log("Agendamento (Atualizacao)");
  await teste("msAteMeiaNoite: 12:00 = 12 h; 23:59:59 = 1 s; 00:00:00 = 24 h; fim de ano e fevereiro bissexto", () => {
    assert.equal(Atualizacao.msAteMeiaNoite(dia(2026, 10, 13, 12)), 12 * 3600000);
    assert.equal(Atualizacao.msAteMeiaNoite(dia(2026, 10, 13, 23, 59, 59)), 1000);
    assert.equal(Atualizacao.msAteMeiaNoite(dia(2026, 10, 13, 0, 0, 0)), 24 * 3600000);
    assert.equal(Atualizacao.msAteMeiaNoite(dia(2026, 12, 31, 23, 0, 0)), 3600000);
    assert.equal(Atualizacao.msAteMeiaNoite(dia(2028, 2, 28, 23, 0, 0)), 3600000); // 29/02/2028 existe: continua sendo o dia seguinte
  });
  await teste("ao carregar, arma exatamente UM temporizador, limitado a 60 s, e nenhum quando a aba está oculta", () => {
    const t = carregar();
    assert.equal(t.pendentes.size, 1);
    assert.equal([...t.pendentes.values()][0].ms, Atualizacao.MAXIMO_MS);
    assert.deepEqual(t.json("Atualizacao.estado()"), { ligado: true, temporizadorAtivo: true, verificacoes: 0 });
  });
  await teste("perto da meia-noite o temporizador é curto (23:59:59,8 -> espera até 00:00:00 + margem)", () => {
    const t = carregar();
    t.definirRelogio(new Date(2026, 9, 13, 23, 59, 59, 800));
    t.run("Atualizacao.agendar()");
    assert.equal(t.pendentes.size, 1);
    assert.equal([...t.pendentes.values()][0].ms, 200 + Atualizacao.MARGEM_MS);
  });

  console.log("Mudança de dia: situações, cartões, ordem, filtros e indicadores");
  await teste("dia igual: verificar não recalcula nem dispara evento (nenhum redesenho à toa)", () => {
    const t = carregar();
    t.importar(BASE());
    let eventos = 0; t.document.addEventListener("aso:situacoes-calculadas", () => eventos++);
    const html = t.area.innerHTML;
    t.run("Atualizacao.verificar(); Atualizacao.verificar()");
    t.disparar();
    assert.equal(eventos, 0);
    assert.equal(t.area.innerHTML, html);
  });
  await teste("vencimento que passa de amanhã para hoje vira VENCE HOJE (cartão, indicadores, ordem e opção de filtro)", () => {
    const t = carregar();
    t.importar(BASE());
    assert.equal(t.selo("VENCE AMANHA"), "PRÓXIMO DO VENCIMENTO");
    assert.deepEqual(t.indicadores(), { total: "6", [COD.V]: "1", [COD.H]: "1", [COD.P]: "2", [COD.E]: "1", [COD.S]: "1", [COD.I]: "0" });
    t.definirRelogio(dia(2026, 10, 14, 0, 0, 1)); // virou o dia
    t.disparar(); // o temporizador detecta a virada sozinho, sem importar nada
    assert.equal(t.selo("VENCE AMANHA"), "VENCE HOJE");
    assert.match(t.area.innerHTML, /<p class="cartao__situacao">Vence hoje<\/p>/);
    assert.equal(t.selo("VENCE HOJE"), "VENCIDO"); // o que vencia hoje venceu ontem
    assert.equal(t.selo("PROXIMO 30"), "PRÓXIMO DO VENCIMENTO"); // 12/11 - 14/10 = 29
    assert.equal(t.selo("EM DIA 31"), "PRÓXIMO DO VENCIMENTO"); // 13/11 - 14/10 = 30 dias: entrou na janela de 30 dias
  });
  await teste("fronteira de 30 dias após a virada: 31 dias vira PRÓXIMO, 30 vira PRÓXIMO (ainda), 32 continua EM DIA", () => {
    const t = carregar();
    t.importar(Object.freeze([
      reg({ colaborador: "LIMITE 31", venc: "2026-11-13" }), // em 13/10: 31 dias = EM DIA; em 14/10: 30 dias = PRÓXIMO
      reg({ colaborador: "LIMITE 32", venc: "2026-11-14" }) // em 14/10: 31 dias = EM DIA
    ]));
    assert.equal(t.selo("LIMITE 31"), "EM DIA");
    t.definirRelogio(dia(2026, 10, 14, 8));
    t.disparar();
    assert.equal(t.selo("LIMITE 31"), "PRÓXIMO DO VENCIMENTO");
    assert.equal(t.selo("LIMITE 32"), "EM DIA");
  });
  await teste("vencimento que passa de hoje para ontem vira VENCIDO (\"Vencido há 1 dia\") e sobe na ordem de urgência", () => {
    const t = carregar();
    t.importar(BASE());
    assert.deepEqual(t.nomes(), ["VENCIDO ANTIGO", "VENCE HOJE", "VENCE AMANHA", "PROXIMO 30", "EM DIA 31", "SEM DATA"]);
    t.definirRelogio(dia(2026, 10, 14, 7, 30));
    t.disparar();
    assert.equal(t.selo("VENCE HOJE"), "VENCIDO");
    assert.match(t.area.innerHTML, /<h3 class="cartao__nome">VENCE HOJE<\/h3>[\s\S]*?Vencido há 1 dia/);
    // nova ordem: vencidos (maior atraso primeiro) -> vence hoje (quem vencia amanhã) -> próximos por vencimento -> em dia -> sem data
    assert.deepEqual(t.nomes(), ["VENCIDO ANTIGO", "VENCE HOJE", "VENCE AMANHA", "PROXIMO 30", "EM DIA 31", "SEM DATA"]);
    assert.equal(t.selo("VENCE AMANHA"), "VENCE HOJE");
  });
  await teste("a ordem dos cartões muda de fato com a virada (data inconsistente sai do topo; vencimentos passam para vencidos), em 2 dias de uma vez", () => {
    const t = carregar();
    t.importar(Object.freeze([
      reg({ colaborador: "A VENCE HOJE", venc: "2026-10-13" }),
      reg({ colaborador: "B VENCE AMANHA", venc: "2026-10-14" }),
      reg({ colaborador: "C FUTURO", ult_aso: "2026-10-14", venc: "2027-10-09" }),
      reg({ colaborador: "D PROXIMO 20", venc: "2026-11-02" })
    ]));
    assert.deepEqual(t.nomes(), ["C FUTURO", "A VENCE HOJE", "B VENCE AMANHA", "D PROXIMO 20"]);
    t.definirRelogio(dia(2026, 10, 15, 10)); // virou DOIS dias (aba suspensa)
    t.disparar();
    assert.equal(t.selo("A VENCE HOJE"), "VENCIDO");
    assert.equal(t.selo("B VENCE AMANHA"), "VENCIDO");
    assert.equal(t.selo("C FUTURO"), "EM DIA");
    assert.deepEqual(t.nomes(), ["A VENCE HOJE", "B VENCE AMANHA", "D PROXIMO 20", "C FUTURO"]); // A: 2 dias de atraso, vem antes de B
    assert.deepEqual(t.json("Aso.obter().map(i => i.dias)"), [-2, -1, 359, 18]); // lista do Aso segue a ordem da planilha
  });
  await teste("indicadores globais acompanham a virada (soma das 6 situações = total)", () => {
    const t = carregar();
    t.importar(BASE());
    t.definirRelogio(dia(2026, 10, 14, 9));
    t.disparar();
    const i = t.indicadores();
    assert.deepEqual(i, { total: "6", [COD.V]: "2", [COD.H]: "1", [COD.P]: "2", [COD.E]: "0", [COD.S]: "1", [COD.I]: "0" });
    assert.equal([COD.V, COD.H, COD.P, COD.E, COD.S, COD.I].reduce((s, c) => s + Number(i[c]), 0), Number(i.total));
  });
  await teste("data inconsistente: ULT_ASO que era de amanhã passa a ser de hoje e deixa de ser inconsistente", () => {
    const t = carregar();
    t.importar(Object.freeze([reg({ colaborador: "FUTURO", ult_aso: "2026-10-14", venc: "2027-10-09" })]));
    assert.equal(t.selo("FUTURO"), "DATA INCONSISTENTE");
    t.definirRelogio(dia(2026, 10, 14, 6));
    t.disparar();
    assert.equal(t.selo("FUTURO"), "EM DIA");
    assert.equal(t.indicadores()[COD.I], "0");
  });
  await teste("contador e mensagem de resultado vazio acompanham a virada", () => {
    const t = carregar();
    t.importar(BASE());
    t.run("Filtros.definir('situacao', '" + COD.H + "')");
    assert.equal(t.contador(), "Exibindo 1 de 6 registros");
    t.definirRelogio(dia(2026, 10, 14, 9));
    t.disparar();
    assert.equal(t.contador(), "Exibindo 1 de 6 registros"); // agora quem vence hoje é "VENCE AMANHA"
    assert.deepEqual(t.nomes(), ["VENCE AMANHA"]);
    t.definirRelogio(dia(2026, 10, 15, 9));
    t.disparar(); // ninguém vence em 15/10: a escolha "Vence hoje" fica ativa e a mensagem aparece
    assert.equal(t.contador(), "Exibindo 0 de 6 registros");
    assert.match(t.area.innerHTML, /Nenhum colaborador encontrado/);
  });

  console.log("Preservação de base, pesquisa e filtros");
  await teste("a base importada, a pesquisa digitada e os filtros selecionados são preservados; nada é limpo nem reimportado", () => {
    const t = carregar();
    t.importar(BASE());
    const baseAntes = t.run("Dados.obter()");
    t.ctx.__base = baseAntes;
    t.run("Filtros.definir('supervisor', 'S1'); Filtros.definir('loja', '7'); Filtros.definir('busca', 'vence')");
    assert.deepEqual(t.nomes(), ["VENCE AMANHA"]);
    t.definirRelogio(dia(2026, 10, 14, 9));
    t.disparar();
    assert.deepEqual(t.json("Filtros.obterEstado()"), { busca: "vence", situacao: "", supervisor: "S1", gerente: "", loja: "7", funcao: "", municipio: "" });
    assert.equal(t.run("Dados.obter() === __base"), true, "mesma base em memória (sem reimportar)");
    assert.equal(t.run("Dados.resumo().arquivo"), "a.xlsx");
    assert.deepEqual(t.nomes(), ["VENCE AMANHA"]);
    assert.equal(t.selo("VENCE AMANHA"), "VENCE HOJE");
    assert.equal(t.contador(), "Exibindo 1 de 6 registros");
  });
  await teste("opções dos filtros são atualizadas: a Situação passa a listar as situações novas; a escolhida é preservada mesmo sem registros", () => {
    const t = carregar();
    t.importar(Object.freeze([reg({ colaborador: "UM", venc: "2026-10-14" }), reg({ colaborador: "DOIS", venc: "2027-05-01" })]));
    assert.deepEqual(t.json("Filtros.obterOpcoes().situacao.map(o => o.valor)"), [COD.P, COD.E]);
    t.run("Filtros.definir('situacao', '" + COD.P + "')");
    t.definirRelogio(dia(2026, 10, 14, 9));
    t.disparar();
    assert.deepEqual(t.json("Filtros.obterOpcoes().situacao.map(o => o.valor)"), [COD.H, COD.P, COD.E]); // "vence hoje" é nova; "próximo" é a escolha preservada
    assert.equal(t.json("Filtros.obterEstado().situacao"), COD.P, "escolha preservada");
    assert.equal(t.json("Filtros.obterOpcoes().situacao.some(o => o.valor === '" + COD.P + "')"), true, "a opção escolhida continua listada");
  });
  await teste("depois da virada, uma NOVA importação ainda limpa pesquisa e filtros (regra da Etapa 7 intacta)", () => {
    const t = carregar();
    t.importar(BASE());
    t.run("Filtros.definir('supervisor', 'S1')");
    t.definirRelogio(dia(2026, 10, 14, 9));
    t.disparar();
    assert.equal(t.json("Filtros.obterEstado().supervisor"), "S1");
    t.importar(BASE(), "b.xlsx");
    assert.equal(t.json("Filtros.obterEstado().supervisor"), "");
    assert.equal(t.nomes().length, 6);
  });
  await teste("sem planilha importada: virar o dia não faz nada e não dá erro", () => {
    const t = carregar();
    t.definirRelogio(dia(2026, 10, 14, 9));
    t.disparar();
    t.run("Atualizacao.verificar()");
    assert.match(t.area.innerHTML, /Nenhuma planilha importada/);
    assert.deepEqual(t.erros, []);
  });

  console.log("Aba suspensa e retomada");
  await teste("aba oculta cancela o temporizador; ao voltar a ficar visível com o dia diferente, atualiza e rearma UM temporizador", () => {
    const t = carregar();
    t.importar(BASE());
    t.ocultar();
    assert.equal(t.pendentes.size, 0, "nada roda em segundo plano");
    t.definirRelogio(dia(2026, 10, 16, 8)); // o computador/aba ficou suspenso por 3 dias
    assert.equal(t.selo("VENCE AMANHA"), "PRÓXIMO DO VENCIMENTO", "ainda não atualizou (aba suspensa)");
    t.mostrar();
    assert.equal(t.selo("VENCE AMANHA"), "VENCIDO");
    assert.equal(t.selo("VENCE HOJE"), "VENCIDO");
    assert.equal(t.pendentes.size, 1);
    assert.match(t.area.innerHTML, /Vencido há 3 dias/);
  });
  await teste("retomar sem mudança de dia não redesenha", () => {
    const t = carregar();
    t.importar(BASE());
    let eventos = 0; t.document.addEventListener("aso:situacoes-calculadas", () => eventos++);
    t.ocultar(); t.mostrar();
    assert.equal(eventos, 0);
  });
  await teste("pageshow e focus também verificam o dia", () => {
    const t = carregar();
    t.importar(BASE());
    t.definirRelogio(dia(2026, 10, 14, 10));
    t.window.dispatchEvent(new Event("pageshow"));
    assert.equal(t.selo("VENCE AMANHA"), "VENCE HOJE");
    t.definirRelogio(dia(2026, 10, 15, 10));
    t.window.dispatchEvent(new Event("focus"));
    assert.equal(t.selo("VENCE AMANHA"), "VENCIDO");
  });
  await teste("temporizador atrasado (aba throttled): dispara depois do horário e ainda assim atualiza", () => {
    const t = carregar();
    t.importar(BASE());
    t.definirRelogio(dia(2026, 10, 14, 11, 45)); // o navegador só acordou quase 12 h depois
    t.disparar();
    assert.equal(t.selo("VENCE AMANHA"), "VENCE HOJE");
    assert.equal(t.pendentes.size, 1, "e rearmou para a próxima verificação");
  });

  console.log("Sem duplicação de cartões, temporizadores nem ouvintes");
  await teste("iniciar() repetido e muitas viradas não acumulam ouvintes nem temporizadores", () => {
    const t = carregar();
    const base = JSON.stringify(t.contagem);
    for (let i = 0; i < 5; i++) t.run("Atualizacao.iniciar()");
    assert.equal(t.pendentes.size, 1);
    assert.equal(JSON.stringify(t.contagem), base, "ouvintes iguais");
    t.importar(BASE());
    const ouvintesDepois = JSON.stringify(t.contagem);
    for (let d = 14; d <= 30; d++) { t.definirRelogio(dia(2026, 10, d, 9)); t.disparar(); t.ocultar(); t.mostrar(); }
    assert.equal(t.pendentes.size, 1, "sempre um único temporizador");
    assert.equal(JSON.stringify(t.contagem), ouvintesDepois, "nenhum ouvinte novo");
    assert.equal(t.contagem["document:visibilitychange"], 1);
    assert.equal(t.contagem["window:pageshow"], 1);
    assert.equal(t.contagem["window:focus"], 1);
    assert.equal((t.area.innerHTML.match(/<article /g) || []).length, 6, "sem cartões duplicados");
    assert.equal(new Set(t.nomes()).size, 6);
  });
  await teste("ouvintes do evento de situações não se acumulam (Filtros, Render e Indicadores escutam uma vez cada)", () => {
    const t = carregar();
    t.importar(BASE());
    const antes = t.contagem["document:aso:situacoes-calculadas"];
    for (let d = 14; d <= 20; d++) { t.definirRelogio(dia(2026, 10, d, 9)); t.disparar(); }
    assert.equal(t.contagem["document:aso:situacoes-calculadas"], antes);
    assert.equal(antes, 3);
  });
  await teste("cada virada gera exatamente um recálculo (um evento) mesmo com vários gatilhos no mesmo instante", () => {
    const t = carregar();
    t.importar(BASE());
    let eventos = 0; t.document.addEventListener("aso:situacoes-calculadas", () => eventos++);
    t.definirRelogio(dia(2026, 10, 14, 9));
    t.window.dispatchEvent(new Event("focus"));
    t.window.dispatchEvent(new Event("pageshow"));
    t.mostrar();
    t.disparar();
    assert.equal(eventos, 1);
  });
  await teste("parar() remove os ouvintes e o temporizador", () => {
    const t = carregar();
    t.run("Atualizacao.parar()");
    assert.equal(t.pendentes.size, 0);
    assert.equal(t.contagem["document:visibilitychange"], 0);
    assert.equal(t.contagem["window:focus"], 0);
    assert.deepEqual(t.json("Atualizacao.estado()"), { ligado: false, temporizadorAtivo: false, verificacoes: 0 });
  });
  await teste("nenhum erro nem aviso no console durante todo o ciclo", () => {
    const t = carregar();
    t.importar(BASE());
    t.run("Filtros.definir('busca', 'vence')");
    for (let d = 14; d <= 18; d++) { t.definirRelogio(dia(2026, 10, d, 9)); t.disparar(); t.ocultar(); t.mostrar(); }
    assert.deepEqual(t.erros, []);
  });

  console.log("Regras de datas e Aso intactos");
  await teste("Aso.verificarDia: false sem base e com o mesmo dia; true só quando o dia muda; as seis regras seguem as mesmas", () => {
    const t = carregar();
    assert.equal(t.run("Aso.verificarDia()"), false);
    t.importar(BASE());
    assert.equal(t.run("Aso.verificarDia()"), false);
    t.definirRelogio(dia(2026, 10, 14, 0, 0, 0));
    assert.equal(t.run("Aso.verificarDia()"), true);
    assert.equal(t.run("Aso.verificarDia()"), false);
    const s = t.run("Aso.calcularSituacao");
    const hoje = "2026-10-13";
    assert.equal(s("2026-10-14", "2027-10-09", hoje).situacao, COD.I);
    assert.equal(s("2026-01-01", null, hoje).situacao, COD.S);
    assert.equal(s("2026-01-01", "2026-10-12", hoje).situacao, COD.V);
    assert.equal(s("2026-01-01", "2026-10-13", hoje).situacao, COD.H);
    assert.equal(s("2026-01-01", "2026-11-12", hoje).situacao, COD.P);
    assert.equal(s("2026-01-01", "2026-11-13", hoje).situacao, COD.E);
  });
  await teste("a virada é decidida pelo dia local, não pelo horário: 23:59:59 -> 00:00:00 muda; 00:00:00 -> 23:59:59 não muda", () => {
    const t = carregar();
    t.importar(BASE());
    t.definirRelogio(dia(2026, 10, 13, 23, 59, 59));
    assert.equal(t.run("Aso.verificarDia()"), false);
    t.definirRelogio(dia(2026, 10, 14, 0, 0, 0));
    assert.equal(t.run("Aso.verificarDia()"), true);
    t.definirRelogio(dia(2026, 10, 14, 23, 59, 59));
    assert.equal(t.run("Aso.verificarDia()"), false);
  });
  await teste("o valor de VENC e os registros importados não são alterados pela virada (objetos congelados e idênticos)", () => {
    const t = carregar();
    const base = BASE();
    t.importar(base);
    const antes = JSON.stringify(base);
    t.definirRelogio(dia(2026, 10, 20, 9));
    t.disparar();
    assert.equal(JSON.stringify(t.json("Dados.obter()")), antes);
    assert.ok(t.run("Dados.obter().every(r => Object.isFrozen(r))"));
  });

  console.log("Segurança e estrutura da página");
  await teste("atualizacao.js: sem rede, sem armazenamento, sem eval, sem innerHTML, sem URL externa, sem setInterval", () => {
    const src = semComentarios(lerJS("atualizacao.js"));
    for (const proibido of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/i, /document\.cookie/, /\beval\s*\(/, /new Function/, /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /https?:\/\//, /setInterval/])
      assert.equal(proibido.test(src), false, "atualizacao.js contém " + proibido);
  });
  await teste("atualizacao.js não calcula situações nem ordena: só chama Aso.verificarDia", () => {
    const src = semComentarios(lerJS("atualizacao.js"));
    assert.equal(/calcularSituacao|diferencaDias|DIAS_ALERTA|\.sort\(|ult_aso|\bvenc\b/.test(src), false);
    assert.match(src, /verificarDia\(\)/);
  });
  await teste("index.html: atualizacao.js entra depois de indicadores.js e antes de script.js; CSP inalterada; sem recurso externo", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const pos = n => html.indexOf('src="js/' + n + '"');
    assert.ok(pos("indicadores.js") < pos("atualizacao.js") && pos("atualizacao.js") < pos("script.js"));
    assert.ok(pos("aso.js") < pos("atualizacao.js"));
    assert.ok(html.includes("content=\"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'\""));
    assert.equal(/(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i.test(html), false);
  });

  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})();
