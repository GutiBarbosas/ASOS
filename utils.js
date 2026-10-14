// Utilitários de data (Etapa 4). Só lógica, sem acesso à página: roda também no Node para os testes.
// Regra única de datas do projeto: comparar SOMENTE o dia (AAAA-MM-DD), sem horário, usando Date.UTC.
// Assim o resultado não muda com o fuso horário nem com o horário de verão.
const Utils = (function () {
  "use strict";

  const MS_DIA = 86400000;
  const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

  // "AAAA-MM-DD" (como o importador entrega) -> milissegundos UTC à meia-noite; null se vazio, mal formado ou impossível (ex.: 2026-02-31).
  function isoParaUTC(iso) {
    if (typeof iso !== "string") return null;
    const m = RE_ISO.exec(iso);
    if (!m) return null;
    const a = +m[1], mes = +m[2], d = +m[3];
    const t = Date.UTC(a, mes - 1, d);
    const x = new Date(t);
    if (x.getUTCFullYear() !== a || x.getUTCMonth() !== mes - 1 || x.getUTCDate() !== d) return null;
    return t;
  }

  const dataValida = iso => isoParaUTC(iso) !== null;

  // Dia civil de um instante, no fuso LOCAL de quem está usando a página ("hoje" para o usuário), como "AAAA-MM-DD".
  function dataLocalISO(instante) {
    const d = instante && typeof instante.getFullYear === "function" ? instante : new Date();
    return String(d.getFullYear()).padStart(4, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // Dias inteiros de `de` até `ate` (positivo se `ate` é depois). Os dois como "AAAA-MM-DD" válidos; senão null.
  // Como as duas datas são meia-noite UTC, a diferença é sempre múltiplo exato de 24 h.
  function diferencaDias(de, ate) {
    const a = isoParaUTC(de), b = isoParaUTC(ate);
    if (a === null || b === null) return null;
    return Math.round((b - a) / MS_DIA);
  }

  // "AAAA-MM-DD" -> "dd/mm/aaaa" (padrão brasileiro). Vazio, mal formado ou impossível -> null (quem exibe decide o texto).
  function formatarDataBR(iso) {
    if (!dataValida(iso)) return null;
    const p = iso.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  // Escapa texto para inserir DENTRO de HTML (conteúdo de elemento ou valor de atributo entre aspas): & < > " ' `.
  // Todo texto vindo da planilha que for montado como HTML deve passar por aqui. null/undefined viram "".
  const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
  function escapar(valor) {
    if (valor === null || valor === undefined) return "";
    return String(valor).replace(/[&<>"'`]/g, c => ESCAPES[c]);
  }

  return { isoParaUTC, dataValida, dataLocalISO, diferencaDias, formatarDataBR, escapar };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Utils; // só para os testes em Node
