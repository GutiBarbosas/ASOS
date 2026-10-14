// Armazenamento em memória dos registros importados. Existe só enquanto a página estiver aberta:
// NÃO usa localStorage, sessionStorage, IndexedDB, cookies nem arquivos. Recarregar = importar de novo.
// Os módulos das próximas etapas leem com Dados.obter() e reagem ao evento "aso:dados-carregados".
const Dados = (function () {
  "use strict";
  let estado = { registros: Object.freeze([]), arquivo: null, importadoEm: null };

  return {
    // Substitui os dados. Só deve ser chamado com uma importação válida (a anterior fica intacta se for inválida).
    definir(resultado) {
      estado = { registros: resultado.registros, arquivo: resultado.arquivo, importadoEm: new Date() };
      document.dispatchEvent(new CustomEvent("aso:dados-carregados", { detail: { total: estado.registros.length } }));
    },
    // Registros normalizados (somente leitura): { linha, supervisor, gerente, funcao, municipio, loja,
    // colaborador, admissao, ult_aso, venc } — datas como "AAAA-MM-DD" ou null; demais campos como texto.
    obter() { return estado.registros; },
    temDados() { return estado.registros.length > 0; },
    resumo() { return { arquivo: estado.arquivo, total: estado.registros.length, importadoEm: estado.importadoEm }; }
  };
})();
