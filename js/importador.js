// Importação manual da planilha (.xlsx ou .csv). Tudo roda no navegador; nada é enviado nem gravado.
// Este arquivo só tem lógica (sem acesso à página), por isso também roda no Node para os testes.
// Entrada: arquivo escolhido pelo usuário. Saída: registros normalizados em memória (ver `processarLinhas`).
// Só as colunas de COLUNAS são copiadas; qualquer outra (CPNJ, DT_NASC, ASO_STATUS...) é descartada na leitura.
const Importador = (function () {
  "use strict";

  const TAMANHO_MAXIMO = 25 * 1024 * 1024; // 25 MB
  const LINHAS_PARA_ACHAR_CABECALHO = 15;
  const MAX_LINHAS_CITADAS = 10;

  // Colunas obrigatórias. `chave` é o nome do campo no registro em memória.
  const COLUNAS = [
    { chave: "supervisor",  cabecalho: "SUPERVISOR",  tipo: "texto" },
    { chave: "gerente",     cabecalho: "GERENTE",     tipo: "texto" },
    { chave: "funcao",      cabecalho: "FUNÇÃO",      tipo: "texto" },
    { chave: "municipio",   cabecalho: "MUNICIPIO",   tipo: "texto" },
    { chave: "loja",        cabecalho: "LOJA",        tipo: "texto" },
    { chave: "colaborador", cabecalho: "COLABORADOR", tipo: "texto" },
    { chave: "admissao",    cabecalho: "ADMISSÃO",    tipo: "data"  },
    { chave: "ult_aso",     cabecalho: "ULT_ASO",     tipo: "data"  },
    { chave: "venc",        cabecalho: "VENC",        tipo: "data"  }
  ];

  // Cabeçalho comparável: sem acento, sem espaços sobrando, maiúsculas.
  function normalizarCabecalho(v) {
    return String(v == null ? "" : v)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ").trim().toUpperCase();
  }

  const ERRO_EXCEL = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NULL!|NUM!|SPILL!|CALC!|GETTING_DATA)/i;
  const ehVazio = v => v == null || (typeof v === "string" && v.trim() === "");

  // ---------- Datas ----------
  // Devolve { estado: "ok" | "vazio" | "invalido", iso: "AAAA-MM-DD" | null }.
  // Aceita: objeto Date (as datas do .xlsx chegam em UTC, meia-noite), número serial do Excel,
  // ISO (AAAA-MM-DD, com ou sem hora) e formato brasileiro (DD/MM/AAAA, também com - ou .).
  // Não tenta adivinhar MM/DD/AAAA: um dia/mês impossível vira "invalido" em vez de ser reinterpretado.
  function montar(a, m, d) {
    if (a < 1900 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const t = new Date(Date.UTC(a, m - 1, d));
    if (t.getUTCFullYear() !== a || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null; // ex.: 31/02
    return String(a).padStart(4, "0") + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }
  function dePartes(a, m, d) {
    const iso = montar(a, m, d);
    return iso ? { estado: "ok", iso } : { estado: "invalido", iso: null };
  }
  function doSerial(n) {
    if (!isFinite(n) || n < 1) return { estado: "invalido", iso: null };
    const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
    return dePartes(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const RE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
  const RE_BR = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/;
  const RE_SERIAL = /^\d{5}(?:[.,]\d+)?$/; // serial do Excel gravado como texto (ex.: 45940)

  function converterData(valor) {
    if (ehVazio(valor)) return { estado: "vazio", iso: null };
    if (valor instanceof Date) {
      if (isNaN(valor.getTime())) return { estado: "invalido", iso: null };
      return dePartes(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate());
    }
    if (typeof valor === "number") return doSerial(valor);
    if (typeof valor !== "string") return { estado: "invalido", iso: null };
    const s = valor.trim();
    if (/^[-–—]+$/.test(s)) return { estado: "vazio", iso: null }; // "-" usado como "sem data"
    let m;
    if ((m = RE_ISO.exec(s))) return dePartes(+m[1], +m[2], +m[3]);
    if ((m = RE_BR.exec(s))) return dePartes(+m[3], +m[2], +m[1]);
    if (RE_SERIAL.test(s)) return doSerial(parseFloat(s.replace(",", ".")));
    return { estado: "invalido", iso: null };
  }

  // ---------- Texto ----------
  // { texto, erro } — erro de fórmula do Excel (#N/A etc.) vira texto vazio com erro = true.
  function paraTexto(v) {
    if (v == null) return { texto: "", erro: false };
    if (v instanceof Date) return { texto: isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10), erro: false };
    const s = String(v).trim();
    if (typeof v === "string" && ERRO_EXCEL.test(s)) return { texto: "", erro: true };
    return { texto: s, erro: false };
  }

  // ---------- CSV ----------
  // Aceita aspas, aspas duplicadas (""), quebras de linha dentro de aspas e o delimitador dado.
  function parseCSV(texto, delimitador) {
    const linhas = [];
    let campo = "", linha = [], aspas = false, i = 0;
    const n = texto.length;
    const fimDeLinha = () => { linha.push(campo); linhas.push(linha); campo = ""; linha = []; };
    while (i < n) {
      const c = texto[i];
      if (aspas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i += 2; continue; }
          aspas = false; i++; continue;
        }
        campo += c; i++; continue;
      }
      if (c === '"' && campo === "") { aspas = true; i++; continue; }
      if (c === delimitador) { linha.push(campo); campo = ""; i++; continue; }
      if (c === "\r") { if (texto[i + 1] === "\n") i++; fimDeLinha(); i++; continue; }
      if (c === "\n") { fimDeLinha(); i++; continue; }
      campo += c; i++;
    }
    if (campo !== "" || linha.length) fimDeLinha();
    return { linhas, aspasAbertas: aspas };
  }

  // Descobre o delimitador pela primeira linha (fora de aspas): vírgula (Google Sheets), ponto e vírgula ou tab.
  function detectarDelimitador(texto) {
    const cont = { ",": 0, ";": 0, "\t": 0 };
    let aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (c === '"') aspas = !aspas;
      else if (!aspas && (c === "\n" || c === "\r")) break;
      else if (!aspas && c in cont) cont[c]++;
    }
    let melhor = ",";
    for (const d of [",", ";", "\t"]) if (cont[d] > cont[melhor]) melhor = d;
    return melhor;
  }

  // UTF-8 (padrão do Google Sheets); se o arquivo não for UTF-8 válido, tenta Windows-1252 (CSV do Excel antigo).
  function decodificar(buffer) {
    try {
      return { texto: new TextDecoder("utf-8", { fatal: true }).decode(buffer), codificacao: "UTF-8" };
    } catch (e) {
      return { texto: new TextDecoder("windows-1252").decode(buffer), codificacao: "Windows-1252" };
    }
  }

  // ---------- Validação e conversão ----------
  const listarLinhas = ls => ls.slice(0, MAX_LINHAS_CITADAS).join(", ") + (ls.length > MAX_LINHAS_CITADAS ? "…" : "");

  // `linhas` = matriz (array de arrays) lida do arquivo. Retorna { ok:false, erro } ou
  // { ok:true, registros, avisos:[texto], colunasIgnoradas:[nome], linhaCabecalho }.
  function processarLinhas(linhas) {
    if (!Array.isArray(linhas) || linhas.length === 0) return { ok: false, erro: "O arquivo está vazio." };

    // 1) localizar a linha de cabeçalho (a que tiver mais colunas obrigatórias, entre as primeiras)
    const esperados = COLUNAS.map(c => normalizarCabecalho(c.cabecalho));
    let melhor = null;
    for (let i = 0; i < Math.min(linhas.length, LINHAS_PARA_ACHAR_CABECALHO); i++) {
      const mapa = new Map(), repetidas = new Set();
      (linhas[i] || []).forEach((cel, j) => {
        const nome = normalizarCabecalho(cel);
        if (!nome) return;
        if (mapa.has(nome)) repetidas.add(nome); else mapa.set(nome, j);
      });
      const achadas = esperados.filter(e => mapa.has(e)).length;
      if (!melhor || achadas > melhor.achadas) melhor = { indice: i, achadas, mapa, repetidas };
    }
    const faltando = COLUNAS.filter(c => !melhor.mapa.has(normalizarCabecalho(c.cabecalho))).map(c => c.cabecalho);
    if (faltando.length) {
      const encontradas = [...new Set((linhas[melhor.indice] || []).map(c => String(c == null ? "" : c).trim()).filter(Boolean))];
      return {
        ok: false,
        erro: "Colunas obrigatórias não encontradas: " + faltando.join(", ") + "." +
          (encontradas.length ? " Cabeçalhos lidos: " + encontradas.slice(0, 30).join(", ") + (encontradas.length > 30 ? "…" : "") + "." : "")
      };
    }

    // 2) converter as linhas de dados (só as colunas obrigatórias são copiadas)
    const registros = [], avisos = [];
    const indice = {};
    COLUNAS.forEach(c => { indice[c.chave] = melhor.mapa.get(normalizarCabecalho(c.cabecalho)); });
    const prob = { dataInvalida: {}, dataVazia: {}, erroFormula: {}, semNome: [] };
    let linhasVazias = 0;

    for (let r = melhor.indice + 1; r < linhas.length; r++) {
      const linha = linhas[r] || [];
      if (linha.every(ehVazio)) { linhasVazias++; continue; }
      const reg = { linha: r + 1 }; // número da linha na planilha
      COLUNAS.forEach(c => {
        const bruto = linha[indice[c.chave]];
        if (c.tipo === "data") {
          const d = converterData(bruto);
          reg[c.chave] = d.iso;
          if (d.estado === "invalido") (prob.dataInvalida[c.cabecalho] = prob.dataInvalida[c.cabecalho] || []).push(reg.linha);
          else if (d.estado === "vazio") (prob.dataVazia[c.cabecalho] = prob.dataVazia[c.cabecalho] || []).push(reg.linha);
        } else {
          const t = paraTexto(bruto);
          reg[c.chave] = t.texto;
          if (t.erro) (prob.erroFormula[c.cabecalho] = prob.erroFormula[c.cabecalho] || []).push(reg.linha);
        }
      });
      if (!reg.colaborador) prob.semNome.push(reg.linha);
      registros.push(Object.freeze(reg));
    }

    if (registros.length === 0) return { ok: false, erro: "Nenhum registro encontrado abaixo do cabeçalho." };

    // 3) avisos (sem nomes de pessoas: só colunas e números de linha)
    melhor.repetidas.forEach(nome => {
      if (esperados.includes(nome)) avisos.push("A coluna " + nome + " aparece mais de uma vez; foi usada a primeira.");
    });
    COLUNAS.filter(c => c.tipo === "data").forEach(c => {
      const inv = prob.dataInvalida[c.cabecalho], vaz = prob.dataVazia[c.cabecalho];
      if (inv) avisos.push(c.cabecalho + ": " + inv.length + " valor(es) não reconhecido(s) como data (linhas " + listarLinhas(inv) + "); ficaram vazios.");
      if (vaz) avisos.push(c.cabecalho + ": " + vaz.length + " registro(s) sem data (linhas " + listarLinhas(vaz) + ").");
    });
    Object.keys(prob.erroFormula).forEach(cab => {
      const ls = prob.erroFormula[cab];
      avisos.push(cab + ": " + ls.length + " célula(s) com erro de fórmula (ex.: #N/A) tratadas como vazias (linhas " + listarLinhas(ls) + ").");
    });
    if (prob.semNome.length) avisos.push("COLABORADOR: " + prob.semNome.length + " registro(s) sem nome (linhas " + listarLinhas(prob.semNome) + ").");
    if (linhasVazias) avisos.push(linhasVazias + " linha(s) totalmente vazia(s) ignorada(s).");

    const usadas = new Set(esperados);
    const colunasIgnoradas = [];
    (linhas[melhor.indice] || []).forEach(cel => {
      const nome = String(cel == null ? "" : cel).trim();
      if (nome && !usadas.has(normalizarCabecalho(nome)) && !colunasIgnoradas.includes(nome)) colunasIgnoradas.push(nome);
    });

    return { ok: true, registros: Object.freeze(registros), avisos, colunasIgnoradas, linhaCabecalho: melhor.indice + 1 };
  }

  // ---------- Leitura do arquivo ----------
  function lerBuffer(file) {
    if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
    return new Promise((resolve, reject) => { // navegadores antigos
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(file);
    });
  }

  async function lerXlsx(file) {
    if (typeof readXlsxFile !== "function") {
      return { ok: false, erro: "A biblioteca de leitura de Excel (js/vendor/read-excel-file.min.js) não foi carregada." };
    }
    let folhas = await readXlsxFile(file);
    if (folhas.length && Array.isArray(folhas[0])) folhas = [{ sheet: null, data: folhas }]; // formato antigo da biblioteca
    if (!folhas.length) return { ok: false, erro: "O arquivo não tem nenhuma aba." };
    // A aba "BASE" tem prioridade; depois, as demais na ordem do arquivo.
    const ordem = folhas.slice().sort((a, b) => (normalizarCabecalho(b.sheet) === "BASE") - (normalizarCabecalho(a.sheet) === "BASE"));
    let primeiroErro = null;
    for (const folha of ordem) {
      const res = processarLinhas(folha.data);
      if (res.ok) { res.aba = folha.sheet; return res; }
      if (!primeiroErro) primeiroErro = (folha.sheet ? "Aba \"" + folha.sheet + "\": " : "") + res.erro;
    }
    return { ok: false, erro: primeiroErro + (folhas.length > 1 ? " Nenhuma das " + folhas.length + " abas tem todas as colunas obrigatórias." : "") };
  }

  async function lerCsv(file) {
    const dec = decodificar(await lerBuffer(file));
    let texto = dec.texto.replace(/^﻿/, "");
    let delimitador;
    const diretiva = /^sep=(.)\r?\n/i.exec(texto); // linha "sep=;" que o Excel grava
    if (diretiva) { delimitador = diretiva[1]; texto = texto.slice(diretiva[0].length); }
    else delimitador = detectarDelimitador(texto);
    const csv = parseCSV(texto, delimitador);
    if (csv.aspasAbertas) return { ok: false, erro: "CSV com aspas não fechadas (arquivo truncado ou corrompido)." };
    const res = processarLinhas(csv.linhas);
    if (res.ok) {
      res.delimitador = delimitador;
      if (dec.codificacao !== "UTF-8") res.avisos.unshift("O arquivo não estava em UTF-8; foi lido como " + dec.codificacao + ". Confira os acentos.");
    }
    return res;
  }

  // Ponto de entrada. Nunca lança: sempre devolve { ok, arquivo, ... }.
  async function lerArquivo(file) {
    const arquivo = file && file.name ? file.name : "(sem nome)";
    try {
      const m = /\.([^.]+)$/.exec(arquivo.toLowerCase());
      const ext = m ? m[1] : "";
      if (ext === "xls") return { ok: false, arquivo, erro: "Formato .xls (Excel antigo) não é aceito. Baixe do Google Sheets como .xlsx ou .csv." };
      if (ext !== "xlsx" && ext !== "csv") return { ok: false, arquivo, erro: "Formato não aceito. Selecione um arquivo .xlsx ou .csv." };
      if (file.size > TAMANHO_MAXIMO) return { ok: false, arquivo, erro: "Arquivo grande demais (limite de 25 MB)." };
      const res = ext === "xlsx" ? await lerXlsx(file) : await lerCsv(file);
      res.arquivo = arquivo;
      res.tipo = ext;
      return res;
    } catch (e) {
      return { ok: false, arquivo, erro: "Não foi possível ler o arquivo. Ele pode estar corrompido, protegido por senha ou ter outro formato além da extensão." };
    }
  }

  return { COLUNAS, normalizarCabecalho, converterData, parseCSV, detectarDelimitador, decodificar, processarLinhas, lerArquivo };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Importador; // só para os testes em Node
