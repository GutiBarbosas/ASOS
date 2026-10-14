// Testes dos filtros e da pesquisa (Etapa 7). Node 18+. Só dados FICTÍCIOS. Rodar a partir da pasta do projeto:  node tests/teste_filtros.js
// 1) lógica pura (normalizar, opcoesDe, filtrar) com a base fictícia abaixo, contagens conferidas à mão;
// 2) integração em contexto isolado (vm) com Dados + Aso + Filtros + Render + Indicadores: importação válida/inválida, virada de dia, indicadores globais.
// O comportamento real dos controles no navegador (selects, campo de busca, temas, 1280/390/320 px, console) está em tests/e2e_filtros.py.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Utils = require("../js/utils.js");
const Aso = require("../js/aso.js");
const Filtros = require("../js/filters.js");
const Render = require("../js/render.js");
const Importador = require("../js/importador.js");

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
const POR_SITUACAO = {
  [COD.VENCIDO]: { venc: soma(HOJE, -40) },
  [COD.VENCE_HOJE]: { venc: HOJE },
  [COD.PROXIMO]: { venc: soma(HOJE, 10) },
  [COD.EM_DIA]: { venc: soma(HOJE, 200) },
  [COD.SEM_DATA]: { venc: null },
  [COD.DATA_INCONSISTENTE]: { ult_aso: soma(HOJE, 5), venc: soma(HOJE, 365) }
};
const reg = o => Object.freeze({ linha: 2, supervisor: "SUP X", gerente: "GER X", funcao: "CAIXA", municipio: "AAA", loja: "1", colaborador: "COLABORADOR X",
  admissao: "2020-02-01", ult_aso: "2025-10-10", venc: "2026-10-05", ...o });

// ---------- Base fictícia A (12 registros) ----------
// [nome, supervisor, gerente, loja, função, município, situação] — com acentos, caixa mista, espaços sobrando, vazios e função "0".
const LINHAS = [
  /* 1 */ ["JOSÉ DA SILVA TESTE", "ANA TESTE", "GER UM", "7", "CAIXA", "ALFA", COD.VENCIDO],
  /* 2 */ ["MARIA CONCEIÇÃO TESTE", "ANA TESTE", "GER UM", "7", "caixa", "ALFA", COD.EM_DIA],
  /* 3 */ ["JOAO PEREIRA TESTE", "BRUNO TESTE", "GER DOIS", "26", "FARMACÊUTICO", "BETA", COD.PROXIMO],
  /* 4 */ ["ÁLVARO NUNES TESTE", "BRUNO TESTE", "GER DOIS", "26", "GERENTE", "BETA", COD.VENCE_HOJE],
  /* 5 */ ["LÚCIA AÇAÍ TESTE", "", "GER DOIS", "9", "0", "GAMA", COD.SEM_DATA],
  /* 6 */ ["PAULO ROCHA TESTE", "  ana   teste ", null, "", "CAIXA", "", COD.DATA_INCONSISTENTE],
  /* 7 */ ["BEATRIZ LIMA TESTE", "BRUNO TESTE", "GER UM", "7", "Gerente", "ALFA", COD.VENCIDO],
  /* 8 */ ["CARLOS DIAS TESTE", "CARLA TESTE", "GER TRES", "100", "AUXILIAR", "DELTA", COD.EM_DIA],
  /* 9 */ ["DANIELA MOTA TESTE", "CARLA TESTE", "GER TRES", "100", "", "DELTA", COD.EM_DIA],
  /* 10 */ ["EDUARDO REIS TESTE", "CARLA TESTE", "GER TRES", "9", "CAIXA", "GAMA", COD.VENCIDO],
  /* 11 */ ["FÁBIO SANTOS TESTE", "ANA TESTE", "GER UM", "26", "FARMACÊUTICO", "BETA", COD.VENCIDO],
  /* 12 */ ["GABRIELA CRUZ TESTE", "BRUNO TESTE", "GER DOIS", "26", "FARMACÊUTICO", "BETA", COD.EM_DIA]
];
const NOME = LINHAS.map(l => l[0]);
const registrosA = () => Object.freeze(LINHAS.map((l, i) => reg({ linha: i + 2, colaborador: l[0], supervisor: l[1], gerente: l[2], loja: l[3], funcao: l[4], municipio: l[5], ...POR_SITUACAO[l[6]] })));
const itensA = () => Aso.calcular(registrosA(), HOJE);
const nomes = itens => itens.map(i => i.registro.colaborador);
const nums = ns => ns.map(n => NOME[n - 1]); // números 1..12 -> nomes, na ordem da planilha
const NI = Filtros.SEM_VALOR;

// Resultado esperado de cada opção de cada filtro (índices da tabela acima)
const ESPERADO = {
  situacao: { [COD.VENCIDO]: [1, 7, 10, 11], [COD.VENCE_HOJE]: [4], [COD.PROXIMO]: [3], [COD.EM_DIA]: [2, 8, 9, 12], [COD.SEM_DATA]: [5], [COD.DATA_INCONSISTENTE]: [6] },
  supervisor: { "ANA TESTE": [1, 2, 6, 11], "BRUNO TESTE": [3, 4, 7, 12], "CARLA TESTE": [8, 9, 10], [NI]: [5] },
  gerente: { "GER UM": [1, 2, 7, 11], "GER DOIS": [3, 4, 5, 12], "GER TRES": [8, 9, 10], [NI]: [6] },
  loja: { "7": [1, 2, 7], "9": [5, 10], "26": [3, 4, 11, 12], "100": [8, 9], [NI]: [6] },
  funcao: { "CAIXA": [1, 2, 6, 10], "FARMACÊUTICO": [3, 11, 12], "GERENTE": [4, 7], "AUXILIAR": [8], [NI]: [5, 9] },
  municipio: { "ALFA": [1, 2, 7], "BETA": [3, 4, 11, 12], "DELTA": [8, 9], "GAMA": [5, 10], [NI]: [6] }
};

(async () => {
  console.log("Normalização da pesquisa");
  await teste("normalizar: ignora maiúsculas, acentos, cedilha, til e espaços repetidos/nas pontas; null/undefined viram vazio", () => {
    assert.equal(Filtros.normalizar("  JOSÉ   da  Conceição  "), "jose da conceicao");
    assert.equal(Filtros.normalizar("ÁÀÂÃÄ éèêë íî óôõ úü Ç ñ"), "aaaaa eeee ii ooo uu c n");
    assert.equal(Filtros.normalizar("Lúcia\u00A0Açaí"), "lucia acai"); // espaço não separável também
    assert.equal(Filtros.normalizar(null), "");
    assert.equal(Filtros.normalizar(undefined), "");
    assert.equal(Filtros.normalizar(123), "123");
  });

  console.log("Opções dinâmicas (geradas pela base importada)");
  await teste("cada filtro tem as opções da base, sem repetição, ordenadas; números em ordem numérica; \"Não informada\" por último", () => {
    const o = Filtros.opcoesDe(itensA());
    const rot = id => o[id].map(x => x.rotulo);
    assert.deepEqual(rot("situacao"), [Aso.ROTULOS[COD.VENCIDO], Aso.ROTULOS[COD.VENCE_HOJE], Aso.ROTULOS[COD.PROXIMO], Aso.ROTULOS[COD.EM_DIA], Aso.ROTULOS[COD.SEM_DATA], Aso.ROTULOS[COD.DATA_INCONSISTENTE]]);
    assert.deepEqual(rot("supervisor"), ["ANA TESTE", "BRUNO TESTE", "CARLA TESTE", "Não informada"]);
    assert.deepEqual(rot("gerente"), ["GER DOIS", "GER TRES", "GER UM", "Não informada"]);
    assert.deepEqual(rot("loja"), ["7", "9", "26", "100", "Não informada"]); // 26 depois de 9, não "100, 26, 7"
    assert.deepEqual(rot("funcao"), ["AUXILIAR", "CAIXA", "FARMACÊUTICO", "GERENTE", "Não informada"]);
    assert.deepEqual(rot("municipio"), ["ALFA", "BETA", "DELTA", "GAMA", "Não informada"]);
    assert.deepEqual(Object.keys(o), Filtros.IDS.slice());
  });
  await teste("diferenças só de caixa/espaços viram uma opção (\"caixa\" = \"CAIXA\"; \"  ana   teste \" = \"ANA TESTE\"); função sai em maiúsculas como nos cartões", () => {
    const o = Filtros.opcoesDe(itensA());
    assert.equal(o.funcao.filter(x => x.rotulo === "CAIXA").length, 1);
    assert.equal(o.funcao.filter(x => x.rotulo === "GERENTE").length, 1); // "GERENTE" e "Gerente"
    assert.equal(o.supervisor.filter(x => x.rotulo === "ANA TESTE").length, 1);
    assert.equal(o.supervisor.some(x => x.rotulo !== x.rotulo.trim() || /\s{2}/.test(x.rotulo)), false);
  });
  await teste("só aparecem situações presentes na base; \"Não informada\" só existe se algum registro estiver sem o campo", () => {
    const completos = Aso.calcular([reg({ colaborador: "A", ...POR_SITUACAO[COD.VENCIDO] }), reg({ colaborador: "B", ...POR_SITUACAO[COD.EM_DIA] })], HOJE);
    const o = Filtros.opcoesDe(completos);
    assert.deepEqual(o.situacao.map(x => x.valor), [COD.VENCIDO, COD.EM_DIA]);
    for (const id of ["supervisor", "gerente", "loja", "funcao", "municipio"]) assert.equal(o[id].some(x => x.valor === NI), false, id);
    const vazias = Filtros.opcoesDe([]);
    for (const id of Filtros.IDS) assert.deepEqual(vazias[id], [], id);
  });
  await teste("campos vazios, só espaços, nulos e FUNÇÃO \"0\" viram \"Não informada\" (sem inventar valor)", () => {
    const itens = Aso.calcular([
      reg({ colaborador: "V1", supervisor: "", gerente: "   ", loja: null, funcao: "0", municipio: undefined, ...POR_SITUACAO[COD.EM_DIA] })
    ], HOJE);
    const o = Filtros.opcoesDe(itens);
    for (const id of ["supervisor", "gerente", "loja", "funcao", "municipio"]) assert.deepEqual(o[id], [{ valor: NI, rotulo: "Não informada" }], id);
    for (const id of ["supervisor", "gerente", "loja", "funcao", "municipio"]) assert.equal(Filtros.filtrar(itens, { [id]: NI }).length, 1, id);
    assert.equal(Filtros.filtrar(itens, { supervisor: "" }).length, 1); // "" = sem filtro, não "Não informada"
  });
  await teste("nova base gera novas opções (opções não são fixas no código)", () => {
    const b = Aso.calcular([reg({ colaborador: "N1", supervisor: "SUP NOVO", loja: "55", ...POR_SITUACAO[COD.PROXIMO] })], HOJE);
    const o = Filtros.opcoesDe(b);
    assert.deepEqual(o.supervisor.map(x => x.rotulo), ["SUP NOVO"]);
    assert.deepEqual(o.loja.map(x => x.rotulo), ["55"]);
    assert.deepEqual(o.situacao.map(x => x.valor), [COD.PROXIMO]);
  });

  console.log("Cada um dos seis filtros, individualmente");
  for (const id of Filtros.IDS) {
    await teste("filtro \"" + id + "\": cada opção devolve exatamente os colaboradores esperados, na ordem da planilha", () => {
      const itens = itensA();
      const o = Filtros.opcoesDe(itens);
      assert.deepEqual(o[id].map(x => x.valor).sort(), Object.keys(ESPERADO[id]).sort(), "as opções geradas são as esperadas");
      let soma = 0;
      for (const [valor, esperados] of Object.entries(ESPERADO[id])) {
        const r = Filtros.filtrar(itens, { [id]: valor });
        assert.deepEqual(nomes(r), nums(esperados), id + " = " + valor);
        soma += r.length;
      }
      assert.equal(soma, 12, "cada registro cai em exatamente uma opção do filtro");
    });
  }

  console.log("Combinações de filtros");
  const COMBOS = [
    ["supervisor ANA + situação vencido", { supervisor: "ANA TESTE", situacao: COD.VENCIDO }, [1, 11]],
    ["gerente GER DOIS + loja 26", { gerente: "GER DOIS", loja: "26" }, [3, 4, 12]],
    ["função CAIXA + município ALFA + situação em dia", { funcao: "CAIXA", municipio: "ALFA", situacao: COD.EM_DIA }, [2]],
    ["loja 7 + função GERENTE", { loja: "7", funcao: "GERENTE" }, [7]],
    ["supervisor e função \"Não informada\"", { supervisor: NI, funcao: NI }, [5]],
    ["os seis filtros juntos", { supervisor: "BRUNO TESTE", gerente: "GER DOIS", loja: "26", funcao: "FARMACÊUTICO", municipio: "BETA", situacao: COD.EM_DIA }, [12]],
    ["combinação sem resultado (supervisor CARLA + município ALFA)", { supervisor: "CARLA TESTE", municipio: "ALFA" }, []]
  ];
  for (const [nome, estado, esperados] of COMBOS)
    await teste(nome, () => assert.deepEqual(nomes(Filtros.filtrar(itensA(), estado)), nums(esperados)));
  await teste("combinação é a interseção: aplicar um filtro de cada vez dá o mesmo resultado que todos de uma vez", () => {
    const itens = itensA();
    const todos = { supervisor: "BRUNO TESTE", gerente: "GER DOIS", loja: "26" };
    let passo = itens;
    for (const [k, v] of Object.entries(todos)) passo = Filtros.filtrar(passo, { [k]: v });
    assert.deepEqual(nomes(passo), nomes(Filtros.filtrar(itens, todos)));
    assert.deepEqual(nomes(passo), nums([3, 4, 12]));
  });

  console.log("Pesquisa por nome");
  const BUSCAS = [
    ["sem acento acha nome com acento (\"jose\" -> JOSÉ)", "jose", [1]],
    ["com acento e maiúsculas (\"JOSÉ\")", "JOSÉ", [1]],
    ["minúsculas (\"josé da silva\")", "josé da silva", [1]],
    ["cedilha e til (\"conceicao\" -> CONCEIÇÃO)", "conceicao", [2]],
    ["acento na busca, sem acento no nome (\"JOÃO\" -> JOAO)", "JOÃO", [3]],
    ["\"alvaro\" -> ÁLVARO", "alvaro", [4]],
    ["\"lucia acai\" -> LÚCIA AÇAÍ", "lucia acai", [5]],
    ["parte do nome (\"jo\" -> JOSÉ e JOAO)", "jo", [1, 3]],
    ["espaços repetidos e nas pontas (\"  da   silva \")", "  da   silva ", [1]],
    ["todos têm TESTE no nome", "teste", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
    ["sem correspondência", "zzz", []],
    ["vazia = sem pesquisa", "", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
    ["só espaços = sem pesquisa", "   ", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]
  ];
  for (const [nome, busca, esperados] of BUSCAS)
    await teste(nome, () => assert.deepEqual(nomes(Filtros.filtrar(itensA(), { busca })), nums(esperados)));
  await teste("pesquisa só olha o nome: texto de outro campo não é encontrado (\"ALFA\", \"GER UM\", \"ANA\")", () => {
    for (const b of ["ALFA", "GER UM", "ANA TESTE", "CAIXA"]) assert.deepEqual(nomes(Filtros.filtrar(itensA(), { busca: b })), [], b);
  });
  await teste("pesquisa + filtros trabalham juntos (\"teste\" + supervisor CARLA; \"a\" + loja 26 + vencido)", () => {
    assert.deepEqual(nomes(Filtros.filtrar(itensA(), { busca: "teste", supervisor: "CARLA TESTE" })), nums([8, 9, 10]));
    assert.deepEqual(nomes(Filtros.filtrar(itensA(), { busca: "fabio", loja: "26", situacao: COD.VENCIDO })), nums([11]));
    assert.deepEqual(nomes(Filtros.filtrar(itensA(), { busca: "silva", supervisor: "BRUNO TESTE" })), []);
  });
  await teste("filtrar devolve os MESMOS objetos de Aso.obter() (nada é copiado) e não altera a lista recebida", () => {
    const itens = itensA();
    const copia = itens.slice();
    const r = Filtros.filtrar(itens, { supervisor: "ANA TESTE" });
    assert.ok(r.every(x => itens.includes(x)));
    assert.deepEqual(itens, copia);
    assert.equal(r.every(x => Object.isFrozen(x) && Object.isFrozen(x.registro)), true);
  });

  console.log("Coerência com os cartões");
  await teste("\"Não informada\" no filtro = \"Não informada\" no cartão (mesma regra de campos vazios e FUNÇÃO 0)", () => {
    const itens = itensA();
    const rotulo = { supervisor: "Supervisor", gerente: "Gerente", loja: "Loja", funcao: "Função", municipio: "Município" };
    for (const id of Object.keys(rotulo)) {
      for (const item of itens) {
        const html = Render.html(item);
        const dd = html.match(new RegExp("<dt>" + rotulo[id] + "</dt><dd>(.*?)</dd>"))[1];
        const cartaoDizNI = /Não informada/.test(dd);
        const filtroDizNI = Filtros.filtrar([item], { [id]: NI }).length === 1;
        assert.equal(filtroDizNI, cartaoDizNI, id + " / " + item.registro.colaborador);
      }
    }
  });
  await teste("o rótulo da opção de função é o mesmo texto exibido no cartão (maiúsculas)", () => {
    const itens = itensA();
    const rotulos = Filtros.opcoesDe(itens).funcao.map(x => x.rotulo).filter(x => x !== "Não informada");
    for (const item of itens) {
      const dd = Render.html(item).match(/<dt>Função<\/dt><dd>(.*?)<\/dd>/)[1];
      if (!/Não informada/.test(dd)) assert.ok(rotulos.includes(dd), dd);
    }
  });

  console.log("Integração (Dados + Aso + Filtros + Render + Indicadores, em contexto isolado)");
  const CAB = ["SUPERVISOR", "GERENTE", "FUNÇÃO", "MUNICIPIO", "LOJA", "COLABORADOR", "ADMISSÃO", "ULT_ASO", "VENC"];
  const carregar = () => {
    const area = { innerHTML: "" };
    const document = Object.assign(new EventTarget(), { getElementById: id => (id === "lista-cartoes" ? area : null) });
    const ctx = vm.createContext({ document, CustomEvent, console });
    for (const f of ["dados.js", "utils.js", "aso.js", "filters.js", "render.js", "indicadores.js"]) vm.runInContext(lerJS(f), ctx, { filename: f });
    vm.runInContext("Aso.definirRelogio(() => new Date(2026, 9, 13, 15, 0, 0))", ctx);
    const run = c => vm.runInContext(c, ctx);
    const json = c => JSON.parse(run("JSON.stringify(" + c + ")"));
    return { ctx, area, run, json };
  };
  const importar = (c, registros, nome) => { c.ctx.__r = registros; c.run("Dados.definir({ registros: __r, arquivo: " + JSON.stringify(nome) + " })"); };
  const cartoes = c => (c.area.innerHTML.match(/<article /g) || []).length;
  const nomesNaTela = c => [...c.area.innerHTML.matchAll(/<h3 class="cartao__nome">(.*?)<\/h3>/g)].map(m => m[1]);
  const contador = c => c.run("Filtros.textoContador(Filtros.contagem())");
  const estadoLimpo = { busca: "", situacao: "", supervisor: "", gerente: "", loja: "", funcao: "", municipio: "" };

  await teste("antes da primeira importação: nada a filtrar, contador zerado, estado limpo, orientação de importar", () => {
    const c = carregar();
    assert.equal(contador(c), "Exibindo 0 de 0 registros");
    assert.deepEqual(c.json("Filtros.obterEstado()"), estadoLimpo);
    assert.match(c.area.innerHTML, /Nenhuma planilha importada/);
    assert.equal(cartoes(c), 0);
  });
  await teste("após importar: opções da base, 12 cartões e contador \"Exibindo 12 de 12 registros\"", () => {
    const c = carregar();
    importar(c, registrosA(), "a.xlsx");
    assert.equal(cartoes(c), 12);
    assert.equal(contador(c), "Exibindo 12 de 12 registros");
    assert.deepEqual(c.json("Filtros.obterOpcoes().supervisor.map(o => o.rotulo)"), ["ANA TESTE", "BRUNO TESTE", "CARLA TESTE", "Não informada"]);
  });
  await teste("definir filtro/pesquisa redesenha a MESMA lista só com os que atendem; contador acompanha; ordem da planilha preservada", () => {
    const c = carregar();
    importar(c, registrosA(), "a.xlsx");
    c.run("Filtros.definir('supervisor', 'ANA TESTE')");
    assert.equal(cartoes(c), 4);
    assert.deepEqual(nomesNaTela(c), nums([1, 2, 6, 11]));
    assert.equal(contador(c), "Exibindo 4 de 12 registros");
    c.run("Filtros.definir('situacao', '" + COD.VENCIDO + "')");
    assert.deepEqual(nomesNaTela(c), nums([1, 11]));
    assert.equal(contador(c), "Exibindo 2 de 12 registros");
    c.run("Filtros.definir('busca', 'fabio')");
    assert.deepEqual(nomesNaTela(c), nums([11]));
    assert.equal(contador(c), "Exibindo 1 de 12 registros");
    assert.equal((c.area.innerHTML.match(/cartoes__grade/g) || []).length, 1, "continua existindo uma única grade de cartões");
  });
  await teste("Limpar filtros restaura pesquisa e os seis filtros e mostra os 12 cartões", () => {
    const c = carregar();
    importar(c, registrosA(), "a.xlsx");
    for (const [k, v] of [["busca", "silva"], ["situacao", COD.VENCIDO], ["supervisor", "ANA TESTE"], ["gerente", "GER UM"], ["loja", "7"], ["funcao", "CAIXA"], ["municipio", "ALFA"]]) c.run("Filtros.definir(" + JSON.stringify(k) + ", " + JSON.stringify(v) + ")");
    assert.equal(cartoes(c), 1);
    c.run("Filtros.limpar()");
    assert.deepEqual(c.json("Filtros.obterEstado()"), estadoLimpo);
    assert.equal(cartoes(c), 12);
    assert.deepEqual(nomesNaTela(c), NOME);
    assert.equal(contador(c), "Exibindo 12 de 12 registros");
  });
  await teste("nenhum resultado: mensagem clara, nenhum cartão, contador \"Exibindo 0 de 12\"; limpar volta a mostrar tudo", () => {
    const c = carregar();
    importar(c, registrosA(), "a.xlsx");
    c.run("Filtros.definir('supervisor', 'CARLA TESTE'); Filtros.definir('municipio', 'ALFA')");
    assert.equal(cartoes(c), 0);
    assert.match(c.area.innerHTML, /Nenhum colaborador encontrado/);
    assert.match(c.area.innerHTML, /Limpar filtros/);
    assert.equal(/não tem registros|Nenhuma planilha importada/.test(c.area.innerHTML), false, "não confunde com planilha vazia ou sem importação");
    assert.equal(contador(c), "Exibindo 0 de 12 registros");
    c.run("Filtros.limpar()");
    assert.equal(cartoes(c), 12);
    assert.equal(c.area.innerHTML.includes("Nenhum colaborador encontrado"), false);
  });
  await teste("pesquisa sem resultado também mostra a mensagem (\"zzz\")", () => {
    const c = carregar();
    importar(c, registrosA(), "a.xlsx");
    c.run("Filtros.definir('busca', 'zzz')");
    assert.match(c.area.innerHTML, /Nenhum colaborador encontrado/);
    assert.equal(cartoes(c), 0);
  });
  await teste("nova importação válida: opções e resultados vêm da nova base; pesquisa e seleções anteriores são limpas", () => {
    const c = carregar();
    importar(c, registrosA(), "a.xlsx");
    c.run("Filtros.definir('busca', 'jose'); Filtros.definir('supervisor', 'ANA TESTE'); Filtros.definir('loja', '7')");
    assert.equal(cartoes(c), 1);
    const B = Object.freeze([
      reg({ colaborador: "SEGUNDA BASE UM", supervisor: "SUP B1", gerente: "GER B", loja: "3", funcao: "AUXILIAR", municipio: "OMEGA", ...POR_SITUACAO[COD.VENCIDO] }),
      reg({ colaborador: "SEGUNDA BASE DOIS", supervisor: "SUP B2", gerente: "GER B", loja: "4", funcao: "CAIXA", municipio: "OMEGA", ...POR_SITUACAO[COD.EM_DIA] }),
      reg({ colaborador: "SEGUNDA BASE TRES", supervisor: "SUP B2", gerente: "GER B", loja: "4", funcao: "CAIXA", municipio: "SIGMA", ...POR_SITUACAO[COD.EM_DIA] })
    ]);
    importar(c, B, "b.xlsx");
    assert.deepEqual(c.json("Filtros.obterEstado()"), estadoLimpo);
    assert.equal(cartoes(c), 3);
    assert.deepEqual(nomesNaTela(c), ["SEGUNDA BASE UM", "SEGUNDA BASE DOIS", "SEGUNDA BASE TRES"]);
    assert.equal(contador(c), "Exibindo 3 de 3 registros");
    assert.deepEqual(c.json("Filtros.obterOpcoes().supervisor.map(o => o.rotulo)"), ["SUP B1", "SUP B2"]);
    assert.deepEqual(c.json("Filtros.obterOpcoes().municipio.map(o => o.rotulo)"), ["OMEGA", "SIGMA"]);
    assert.deepEqual(c.json("Filtros.obterOpcoes().situacao.map(o => o.valor)"), [COD.VENCIDO, COD.EM_DIA]);
    assert.equal(c.json("Filtros.obterOpcoes().supervisor.some(o => o.rotulo === 'ANA TESTE')"), false, "nada da base anterior sobrou");
    c.run("Filtros.definir('supervisor', 'SUP B2')");
    assert.equal(cartoes(c), 2);
  });
  await teste("reimportar o mesmo arquivo (nova leitura) também limpa as seleções", () => {
    const c = carregar();
    importar(c, registrosA(), "a.xlsx");
    c.run("Filtros.definir('supervisor', 'ANA TESTE')");
    assert.equal(cartoes(c), 4);
    importar(c, registrosA(), "a.xlsx"); // outra leitura do mesmo arquivo = outro array de registros
    assert.deepEqual(c.json("Filtros.obterEstado()"), estadoLimpo);
    assert.equal(cartoes(c), 12);
  });
  await teste("importação inválida (script.js não chama Dados.definir): base, filtros, pesquisa, opções, contador e cartões ficam como estavam", () => {
    const c = carregar();
    importar(c, registrosA(), "a.xlsx");
    c.run("Filtros.definir('supervisor', 'BRUNO TESTE'); Filtros.definir('busca', 'a')");
    const antes = { html: c.area.innerHTML, estado: c.json("Filtros.obterEstado()"), opcoes: c.json("Filtros.obterOpcoes()"), contador: contador(c), arquivo: c.json("Dados.resumo().arquivo") };
    const ruim = Importador.processarLinhas([CAB.filter(x => x !== "VENC"), ["a", "b"]]);
    assert.equal(ruim.ok, false); // script.js só chama Dados.definir quando ok
    assert.equal(c.area.innerHTML, antes.html);
    assert.deepEqual(c.json("Filtros.obterEstado()"), antes.estado);
    assert.deepEqual(c.json("Filtros.obterOpcoes()"), antes.opcoes);
    assert.equal(contador(c), antes.contador);
    assert.equal(c.json("Dados.resumo().arquivo"), "a.xlsx");
    assert.equal(antes.estado.supervisor, "BRUNO TESTE");
  });
  await teste("planilha válida sem registros: filtros sem opções, contador \"Exibindo 0 de 0\" e a mensagem de planilha vazia (não a de \"nenhum encontrado\")", () => {
    const c = carregar();
    importar(c, registrosA(), "a.xlsx");
    c.run("Filtros.definir('supervisor', 'ANA TESTE')");
    importar(c, Object.freeze([]), "vazia.xlsx");
    assert.deepEqual(c.json("Filtros.obterEstado()"), estadoLimpo);
    assert.equal(contador(c), "Exibindo 0 de 0 registros");
    assert.match(c.area.innerHTML, /não tem registros/);
    assert.equal(c.area.innerHTML.includes("Nenhum colaborador encontrado"), false);
    for (const id of Filtros_IDS(c)) assert.deepEqual(c.json("Filtros.obterOpcoes()." + id), [], id);
  });
  function Filtros_IDS(c) { return c.json("Filtros.IDS"); }

  await teste("indicadores gerais continuam GLOBAIS: não mudam com pesquisa nem filtros", () => {
    const c = carregar();
    importar(c, registrosA(), "a.xlsx");
    const global = () => c.json("Indicadores.valores(Aso.obter())");
    const antes = global();
    assert.deepEqual(antes, { total: 12, [COD.VENCIDO]: 4, [COD.VENCE_HOJE]: 1, [COD.PROXIMO]: 1, [COD.EM_DIA]: 4, [COD.SEM_DATA]: 1, [COD.DATA_INCONSISTENTE]: 1 });
    c.run("Filtros.definir('supervisor', 'CARLA TESTE'); Filtros.definir('busca', 'daniela')");
    assert.equal(cartoes(c), 1);
    assert.deepEqual(global(), antes);
    c.run("Filtros.definir('municipio', 'ALFA')"); // resultado vazio
    assert.equal(cartoes(c), 0);
    assert.deepEqual(global(), antes);
    assert.equal(c.run("Indicadores.consistente(Indicadores.valores(Aso.obter()))"), true);
    assert.equal(/Filtros|filters/.test(semComentarios(lerJS("indicadores.js"))), false, "indicadores.js não depende dos filtros");
  });
  await teste("filtrar não altera dados nem situações: registros congelados e idênticos; situação/rótulo/dias vêm do Aso", () => {
    const c = carregar();
    importar(c, registrosA(), "a.xlsx");
    const dadosAntes = c.run("JSON.stringify(Dados.obter())");
    const itensAntes = c.run("JSON.stringify(Aso.obter())");
    c.run("Filtros.definir('supervisor', 'ANA TESTE'); Filtros.definir('busca', 'jose'); Filtros.limpar()");
    assert.equal(c.run("JSON.stringify(Dados.obter())"), dadosAntes);
    assert.equal(c.run("JSON.stringify(Aso.obter())"), itensAntes);
    assert.equal(c.run("Object.isFrozen(Dados.obter()) && Dados.obter().every(Object.isFrozen)"), true);
    c.run("Filtros.definir('situacao', '" + COD.VENCIDO + "')");
    assert.equal(c.run("Filtros.itensVisiveis().every(i => Aso.obter().includes(i) && i.situacao === '" + COD.VENCIDO + "')"), true);
  });
  await teste("campo desconhecido em definir() é rejeitado (não cria estado paralelo)", () => {
    const c = carregar();
    assert.throws(() => c.run("Filtros.definir('naoexiste', 'x')"), /campo desconhecido/);
  });
  await teste("virada de dia com a página aberta: mantém pesquisa e filtros escolhidos (Etapa 8: inclusive a Situação que ficou sem registros)", () => {
    const c = carregar();
    importar(c, registrosA(), "a.xlsx");
    c.run("Filtros.definir('supervisor', 'BRUNO TESTE'); Filtros.definir('situacao', '" + COD.VENCE_HOJE + "')");
    assert.deepEqual(nomesNaTela(c), nums([4])); // venc = hoje
    c.run("Aso.definirRelogio(() => new Date(2026, 9, 14, 9, 0, 0))"); // virou o dia
    c.run("Filtros.itensVisiveis()"); // Aso.obter() recalcula e dispara o evento
    const e = c.json("Filtros.obterEstado()");
    assert.equal(e.supervisor, "BRUNO TESTE", "filtro que continua válido é mantido");
    assert.equal(e.situacao, COD.VENCE_HOJE, "a escolha do usuário é preservada mesmo sem ninguém vencendo hoje");
    assert.ok(c.json("Filtros.obterOpcoes().situacao").some(o => o.valor === COD.VENCE_HOJE), "a opção escolhida continua listada");
    assert.deepEqual(nomesNaTela(c), []);
    assert.equal(contador(c), "Exibindo 0 de 12 registros");
    c.run("Filtros.definir('situacao', '')"); // o usuário limpa a Situação
    assert.deepEqual(nomesNaTela(c), nums([3, 4, 7, 12]));
    assert.equal(contador(c), "Exibindo 4 de 12 registros");
  });

  console.log("Segurança, privacidade e estrutura da página");
  await teste("filters.js: sem rede, sem armazenamento, sem eval, sem innerHTML/outerHTML/insertAdjacentHTML/document.write", () => {
    const src = semComentarios(lerJS("filters.js"));
    for (const proibido of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/i, /document\.cookie/, /\beval\s*\(/, /new Function/, /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\bimport\s*\(/, /https?:\/\//])
      assert.equal(proibido.test(src), false, "filters.js contém " + proibido);
  });
  await teste("o único innerHTML do projeto continua em render.js (recebe só htmlLista, já escapado); nenhum outro arquivo de js/ usa", () => {
    for (const f of fs.readdirSync(path.join(__dirname, "..", "js")).filter(n => n.endsWith(".js"))) {
      const usos = semComentarios(lerJS(f)).match(/innerHTML[^\n]*/g) || [];
      if (f === "render.js") assert.deepEqual(usos, ["innerHTML = htmlLista(itens, temArquivo, todos.length);"]);
      else assert.equal(usos.length, 0, f + " usa innerHTML");
    }
  });
  await teste("index.html: CSP inalterada, sem recursos externos, sem JS/estilo inline, todos os controles presentes, ordem dos scripts correta", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    assert.ok(html.includes("content=\"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'\""), "CSP alterada");
    assert.equal(/(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i.test(html), false, "recurso externo");
    assert.equal(/\son[a-z]+\s*=/i.test(html), false, "manipulador de evento inline");
    assert.equal(/\sstyle\s*=/i.test(html), false, "estilo inline");
    for (const id of ["filtro-busca", "filtros-contador", "btn-limpar-filtros", ...Filtros.IDS.map(i => "filtro-" + i)])
      assert.ok(new RegExp('id="' + id + '"').test(html), "falta #" + id);
    for (const id of Filtros.IDS.map(i => "filtro-" + i).concat("filtro-busca")) assert.ok(new RegExp('<label for="' + id + '">').test(html), "falta <label> de #" + id);
    const pos = n => html.indexOf('src="js/' + n + '"');
    assert.ok(pos("aso.js") < pos("filters.js") && pos("filters.js") < pos("render.js") && pos("render.js") < pos("indicadores.js") && pos("indicadores.js") < pos("script.js"));
    assert.ok(html.indexOf('id="filtros"') < html.indexOf('id="lista-cartoes"'), "filtros ficam acima dos cartões");
    assert.ok(html.indexOf('id="indicadores"') < html.indexOf('id="filtros"'), "indicadores continuam acima, fora da área filtrada");
    assert.equal((html.match(/id="lista-cartoes"/g) || []).length, 1, "uma única lista de colaboradores");
  });

  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})();
