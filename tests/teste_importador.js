// Testes unitários do importador (Node 18+). Só dados FICTÍCIOS, escritos aqui no código.
// Rodar a partir da pasta do projeto:  node tests/teste_importador.js
const assert = require("node:assert/strict");
const Importador = require("../js/importador.js");

let ok = 0, falhas = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log("  ok   " + nome); }
  catch (e) { falhas++; console.log("  FALHOU " + nome + "\n         " + e.message.split("\n")[0]); }
}
const CAB = ["SUPERVISOR", "GERENTE", "FUNÇÃO", "MUNICIPIO", "LOJA", "COLABORADOR", "ADMISSÃO", "ULT_ASO", "VENC"];
const linha = (o = {}) => [o.sup ?? "SUP A", o.ger ?? "GER A", o.fun ?? "CAIXA", o.mun ?? "AAA", o.loja ?? 1,
  o.nome ?? "COLABORADOR TESTE 01", o.adm ?? "01/02/2020", o.ult ?? "10/10/2025", o.venc ?? "05/10/2026"];
const D = Importador.converterData;

(async () => {
  console.log("Cabeçalhos");
  await teste("ignora maiúsculas, acentos e espaços", () => {
    assert.equal(Importador.normalizarCabecalho("  função "), "FUNCAO");
    assert.equal(Importador.normalizarCabecalho("Admissao"), "ADMISSAO");
    assert.equal(Importador.normalizarCabecalho("ult_aso   "), "ULT_ASO");
    assert.equal(Importador.normalizarCabecalho("﻿Venc"), "VENC");
  });

  console.log("Datas");
  await teste("Date UTC do .xlsx usa getUTC (sem deslocar o dia)", () => {
    assert.deepEqual(D(new Date(Date.UTC(2025, 9, 10))), { estado: "ok", iso: "2025-10-10" });
  });
  await teste("serial do Excel (número e texto)", () => {
    const serial = Math.round((Date.UTC(2025, 9, 10) - Date.UTC(1899, 11, 30)) / 86400000);
    assert.equal(D(serial).iso, "2025-10-10");
    assert.equal(D(String(serial)).iso, "2025-10-10");
    assert.equal(D(serial + 0.75).iso, "2025-10-10");
  });
  await teste("ISO, ISO com hora, BR com / - .", () => {
    assert.equal(D("2025-10-10").iso, "2025-10-10");
    assert.equal(D("2025-10-10T00:00:00Z").iso, "2025-10-10");
    assert.equal(D("2025-10-10 14:30:00").iso, "2025-10-10");
    assert.equal(D("10/10/2025").iso, "2025-10-10");
    assert.equal(D("5/1/2026").iso, "2026-01-05");
    assert.equal(D("05-01-2026").iso, "2026-01-05");
    assert.equal(D("05.01.2026").iso, "2026-01-05");
    assert.equal(D(" 13/10/2026 00:00:00 ").iso, "2026-10-13");
  });
  await teste("datas impossíveis ou ambíguas viram inválidas (sem adivinhar MM/DD)", () => {
    for (const v of ["31/02/2025", "29/02/2025", "10/13/2026", "00/10/2025", "10/10/25", "2025-13-01", "abc", "#N/A", "1999", new Date("x")])
      assert.equal(D(v).estado, "invalido", String(v));
    assert.equal(D("29/02/2024").iso, "2024-02-29");
  });
  await teste("vazios", () => {
    for (const v of [null, undefined, "", "   ", "-", "—"]) assert.equal(D(v).estado, "vazio", String(v));
  });

  console.log("CSV");
  await teste("aspas, delimitador e quebra de linha dentro do campo, \"\" escapado, CRLF", () => {
    const t = 'a,b,c\r\n"x, y","linha1\nlinha2","diz ""oi"""\r\n1,,3';
    const r = Importador.parseCSV(t, ",");
    assert.deepEqual(r.linhas, [["a", "b", "c"], ["x, y", "linha1\nlinha2", 'diz "oi"'], ["1", "", "3"]]);
    assert.equal(r.aspasAbertas, false);
  });
  await teste("aspas não fechadas são sinalizadas", () => assert.equal(Importador.parseCSV('a,"b\nc', ",").aspasAbertas, true));
  await teste("detecta vírgula, ponto e vírgula e tab (ignorando delimitador entre aspas)", () => {
    assert.equal(Importador.detectarDelimitador("a,b,c\n1,2,3"), ",");
    assert.equal(Importador.detectarDelimitador("a;b;c\n1;2;3"), ";");
    assert.equal(Importador.detectarDelimitador("a\tb\tc"), "\t");
    assert.equal(Importador.detectarDelimitador('"a,b";c;d\n'), ";");
  });

  console.log("Validação da estrutura");
  await teste("planilha válida: 2 registros, só as colunas necessárias, datas ISO, congelado", () => {
    const r = Importador.processarLinhas([CAB, linha(), linha({ nome: "COLABORADOR TESTE 02", loja: 2 })]);
    assert.equal(r.ok, true);
    assert.equal(r.registros.length, 2);
    assert.deepEqual(Object.keys(r.registros[0]).sort(),
      ["admissao", "colaborador", "funcao", "gerente", "linha", "loja", "municipio", "supervisor", "ult_aso", "venc"]);
    assert.equal(r.registros[0].venc, "2026-10-05");
    assert.equal(r.registros[1].loja, "2");
    assert.equal(r.registros[1].linha, 3);
    assert.equal(Object.isFrozen(r.registros[0]), true);
    assert.equal(Object.isFrozen(r.registros), true);
  });
  await teste("cabeçalhos em outra caixa/ordem/com espaços e colunas extras", () => {
    const cab = [" venc ", "Colaborador", "CPNJ", "dt_nasc", "ASO_STATUS", "ult_aso", "admissao", "Loja", "municipio", "funcao", "gerente", "supervisor"];
    const l = ["05/10/2026", "COLABORADOR TESTE 01", "00.000.000/0001-00", "01/01/1990", "VENCIDO", "10/10/2025", "01/02/2020", 3, "AAA", "CAIXA", "GER A", "SUP A"];
    const r = Importador.processarLinhas([cab, l]);
    assert.equal(r.ok, true);
    assert.equal(r.registros[0].colaborador, "COLABORADOR TESTE 01");
    assert.equal(r.registros[0].venc, "2026-10-05");
    assert.deepEqual(r.colunasIgnoradas, ["CPNJ", "dt_nasc", "ASO_STATUS"]);
    const texto = JSON.stringify(r.registros);
    assert.equal(texto.includes("00.000.000"), false, "CNPJ não pode ficar em memória");
    assert.equal(texto.includes("1990"), false, "nascimento não pode ficar em memória");
    assert.equal(texto.includes("VENCIDO"), false, "ASO_STATUS não pode ficar em memória");
  });
  await teste("não exige CPNJ, DT_NASC nem ASO_STATUS", () => assert.equal(Importador.processarLinhas([CAB, linha()]).ok, true));
  await teste("coluna obrigatória ausente: erro listando a coluna", () => {
    const r = Importador.processarLinhas([CAB.filter(c => c !== "VENC"), linha().slice(0, 8)]);
    assert.equal(r.ok, false);
    assert.match(r.erro, /VENC/);
  });
  await teste("cabeçalho que não está na primeira linha", () => {
    const r = Importador.processarLinhas([["Relatório ASO"], [], CAB, linha()]);
    assert.equal(r.ok, true);
    assert.equal(r.linhaCabecalho, 3);
    assert.equal(r.registros[0].linha, 4);
  });
  await teste("arquivo vazio, só cabeçalho e linhas todas vazias", () => {
    assert.equal(Importador.processarLinhas([]).ok, false);
    assert.equal(Importador.processarLinhas([CAB]).ok, false);
    assert.equal(Importador.processarLinhas([CAB, ["", "", ""], []]).ok, false);
  });
  await teste("datas inválidas/vazias e #N/A geram avisos sem derrubar a importação", () => {
    const r = Importador.processarLinhas([CAB,
      linha({ ult: "31/02/2025" }), linha({ venc: "" }), linha({ adm: "-" }), linha({ ger: "#N/A" }), linha({ nome: "" }), ["", "", "", "", "", "", "", "", ""], linha()]);
    assert.equal(r.ok, true);
    assert.equal(r.registros.length, 6);
    assert.equal(r.registros[0].ult_aso, null);
    assert.equal(r.registros[1].venc, null);
    assert.equal(r.registros[3].gerente, "");
    const av = r.avisos.join("\n");
    assert.match(av, /ULT_ASO: 1 valor.*não reconhecido/);
    assert.match(av, /VENC: 1 registro\(s\) sem data/);
    assert.match(av, /ADMISSÃO: 1 registro\(s\) sem data/);
    assert.match(av, /GERENTE: 1 célula\(s\) com erro de fórmula/);
    assert.match(av, /COLABORADOR: 1 registro\(s\) sem nome/);
    assert.match(av, /1 linha\(s\) totalmente vazia/);
  });
  await teste("linhas curtas (menos células que o cabeçalho) não quebram", () => {
    const r = Importador.processarLinhas([CAB, ["SUP A", "GER A"]]);
    assert.equal(r.ok, true);
    assert.equal(r.registros[0].venc, null);
  });
  await teste("avisos não contêm nomes de colaboradores", () => {
    const r = Importador.processarLinhas([CAB, linha({ nome: "FULANO SECRETO", ult: "xx" })]);
    assert.equal(r.avisos.join(" ").includes("FULANO"), false);
  });

  console.log("Arquivos (File/Blob)");
  const arq = (conteudo, nome) => new File([conteudo], nome);
  const csvDe = (linhas, sep = ",") => linhas.map(l => l.map(c => /[",;\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(sep)).join("\r\n");
  await teste("CSV UTF-8 (com BOM) estilo Google Sheets, com acentos e vírgula em campo", async () => {
    const t = "﻿" + csvDe([CAB, linha({ nome: "JOSÉ, DA SILVA (TESTE)", fun: "FARMACÊUTICO" })]);
    const r = await Importador.lerArquivo(arq(t, "base.csv"));
    assert.equal(r.ok, true);
    assert.equal(r.registros[0].colaborador, "JOSÉ, DA SILVA (TESTE)");
    assert.equal(r.registros[0].funcao, "FARMACÊUTICO");
    assert.equal(r.delimitador, ",");
  });
  await teste("CSV com ponto e vírgula", async () => {
    const r = await Importador.lerArquivo(arq(csvDe([CAB, linha()], ";"), "base.csv"));
    assert.equal(r.ok, true);
    assert.equal(r.delimitador, ";");
  });
  await teste("CSV com linha sep=;", async () => {
    const r = await Importador.lerArquivo(arq("sep=;\r\n" + csvDe([CAB, linha()], ";"), "base.csv"));
    assert.equal(r.ok, true);
    assert.equal(r.registros.length, 1);
  });
  await teste("CSV em Windows-1252 é lido com acentos corretos e avisa", async () => {
    const buf = Buffer.from(csvDe([CAB, linha({ fun: "FARMACÊUTICO" })]), "latin1");
    const r = await Importador.lerArquivo(new File([buf], "base.csv"));
    assert.equal(r.ok, true);
    assert.equal(r.registros[0].funcao, "FARMACÊUTICO");
    assert.match(r.avisos[0], /Windows-1252/);
  });
  await teste("CSV com datas ISO e brasileiras misturadas", async () => {
    const r = await Importador.lerArquivo(arq(csvDe([CAB, linha({ ult: "2025-10-10", venc: "05/10/2026" })]), "base.csv"));
    assert.equal(r.registros[0].ult_aso, "2025-10-10");
    assert.equal(r.registros[0].venc, "2026-10-05");
  });
  await teste("extensão não aceita, .xls, vazio, aspas abertas, .xlsx falso", async () => {
    assert.match((await Importador.lerArquivo(arq("x", "a.pdf"))).erro, /\.xlsx ou \.csv/);
    assert.match((await Importador.lerArquivo(arq("x", "a.xls"))).erro, /\.xls/);
    assert.equal((await Importador.lerArquivo(arq("", "a.csv"))).ok, false);
    assert.match((await Importador.lerArquivo(arq('a,"b', "a.csv"))).erro, /aspas/);
    const x = await Importador.lerArquivo(arq("isto não é um xlsx", "a.xlsx"));
    assert.equal(x.ok, false); // sem a biblioteca no Node, ou arquivo inválido: nunca lança
    assert.equal(typeof x.erro, "string");
  });
  await teste("lerArquivo nunca lança exceção", async () => {
    const r = await Importador.lerArquivo({ name: "a.csv", size: 1, arrayBuffer() { throw new Error("boom"); } });
    assert.equal(r.ok, false);
  });

  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})();
