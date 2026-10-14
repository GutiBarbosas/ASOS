// Ponto de entrada (Etapa 3): botão "Importar planilha", leitura do arquivo e mensagens de resultado.
// Usa só textContent (nada do arquivo é inserido como HTML). Não grava nada no navegador.
(function () {
  "use strict";
  const botao = document.getElementById("btn-importar");
  const campo = document.getElementById("arquivo");
  const status = document.getElementById("importacao-status");
  const titulo = document.getElementById("importacao-titulo-status");
  const detalhe = document.getElementById("importacao-detalhe");
  const listaAvisos = document.getElementById("importacao-avisos");

  function mostrar(tipo, textoTitulo, textoDetalhe, avisos) {
    status.className = "importacao__status importacao__status--" + tipo;
    titulo.textContent = textoTitulo;
    detalhe.textContent = textoDetalhe || "";
    detalhe.hidden = !textoDetalhe;
    listaAvisos.replaceChildren();
    (avisos || []).forEach(a => {
      const li = document.createElement("li");
      li.textContent = a;
      listaAvisos.appendChild(li);
    });
    listaAvisos.hidden = !(avisos && avisos.length);
  }

  async function importar(arquivo) {
    botao.disabled = true;
    mostrar("lendo", "Lendo " + arquivo.name + "…");
    const res = await Importador.lerArquivo(arquivo);
    botao.disabled = false;

    if (!res.ok) {
      const anterior = Dados.temDados()
        ? "Os dados importados antes (" + Dados.resumo().arquivo + ") foram mantidos."
        : "Nenhum dado está carregado.";
      mostrar("erro", "Arquivo não importado: " + res.arquivo, res.erro + " " + anterior);
      return;
    }

    Dados.definir(res);
    const hora = Dados.resumo().importadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const n = res.registros.length;
    const partes = [
      res.aba ? "Aba: " + res.aba : null,
      res.colunasIgnoradas.length ? "Colunas não utilizadas (descartadas na leitura): " + res.colunasIgnoradas.join(", ") : null,
      "Importado às " + hora
    ].filter(Boolean);
    mostrar(res.avisos.length ? "aviso" : "ok",
      "Planilha importada: " + res.arquivo + " — " + n + " " + (n === 1 ? "registro" : "registros"),
      partes.join(" · "),
      res.avisos);
  }

  botao.addEventListener("click", () => campo.click());
  campo.addEventListener("change", () => {
    const arquivo = campo.files && campo.files[0];
    campo.value = ""; // permite escolher o mesmo arquivo de novo depois de atualizá-lo
    if (arquivo) importar(arquivo);
  });
})();
