// Atualização automática na virada do dia (Etapa 8). Só DETECTA que o dia local mudou e pede o recálculo ao módulo Aso
// (Aso.verificarDia), que recalcula as situações e dispara "aso:situacoes-calculadas". Quem escuta esse evento (Filtros, Render, Indicadores)
// atualiza opções, cartões, ordem, indicadores e contador SEM nova importação: a base e as escolhas do usuário são preservadas.
// Este módulo não calcula situações, não ordena e não desenha nada. Sem rede, sem armazenamento, sem bibliotecas.
//
// Estratégia (barata e sem acúmulo):
//   - UM único temporizador por vez, armado para o próximo meia-noite local (limitado a 60 s, o que também cobre ajuste manual do relógio);
//   - aba oculta: o temporizador é cancelado (nada roda em segundo plano); ao voltar a ficar visível, verifica na hora e rearma;
//   - também verifica em "pageshow" (volta do cache de navegação) e "focus";
//   - iniciar() é idempotente: ouvintes e temporizador nunca se duplicam.
const Atualizacao = (function () {
  "use strict";

  const A = typeof Aso !== "undefined" ? Aso : require("./aso.js");

  const MARGEM_MS = 500;       // depois da meia-noite, para não acordar antes da virada
  const MAXIMO_MS = 60000;     // no máximo 1 min entre verificações (relógio ajustado, suspensão, temporizador atrasado)
  const MINIMO_MS = 250;

  let agendador = { definir: (fn, ms) => setTimeout(fn, ms), cancelar: id => clearTimeout(id) };
  let temporizador = null;
  let ligado = false;
  let verificacoes = 0;

  // Milissegundos até a próxima meia-noite local (construída por componentes locais, sem somar 24 h).
  function msAteMeiaNoite(instante) {
    const d = instante instanceof Date ? instante : new Date(instante);
    const proximo = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
    return proximo.getTime() - d.getTime();
  }

  const aba = () => (typeof document !== "undefined" ? document : null);
  const oculta = () => !!(aba() && aba().visibilityState === "hidden");

  function cancelar() {
    if (temporizador !== null) { agendador.cancelar(temporizador); temporizador = null; }
  }

  // Arma o próximo (e único) temporizador. Aba oculta: não arma nada.
  function agendar() {
    cancelar();
    if (!ligado || oculta()) return;
    const espera = Math.min(MAXIMO_MS, Math.max(MINIMO_MS, msAteMeiaNoite(A.agora()) + MARGEM_MS));
    temporizador = agendador.definir(aoTemporizador, espera);
  }

  // Pede ao Aso para conferir o dia. Devolve true se o dia mudou (e as situações foram recalculadas).
  function verificar() {
    verificacoes++;
    return A.verificarDia();
  }

  function aoTemporizador() {
    temporizador = null;
    verificar();
    agendar();
  }
  function aoMudarVisibilidade() {
    if (oculta()) { cancelar(); return; }
    verificar();
    agendar();
  }
  function aoVoltar() { // pageshow / focus
    if (oculta()) return;
    verificar();
    agendar();
  }

  // Liga a atualização automática. Idempotente: chamar de novo não duplica ouvintes nem temporizadores.
  function iniciar() {
    if (ligado) { agendar(); return; }
    ligado = true;
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", aoMudarVisibilidade);
    if (typeof window !== "undefined") { window.addEventListener("pageshow", aoVoltar); window.addEventListener("focus", aoVoltar); }
    agendar();
  }

  // Desliga tudo (usado só pelos testes).
  function parar() {
    ligado = false;
    cancelar();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    if (typeof window !== "undefined") { window.removeEventListener("pageshow", aoVoltar); window.removeEventListener("focus", aoVoltar); }
  }

  // Só para testes: troca setTimeout/clearTimeout por versões controladas.
  function definirAgendador(a) {
    cancelar();
    agendador = a || { definir: (fn, ms) => setTimeout(fn, ms), cancelar: id => clearTimeout(id) };
  }

  const estado = () => ({ ligado, temporizadorAtivo: temporizador !== null, verificacoes });

  if (typeof document !== "undefined") iniciar();

  return { MAXIMO_MS, MARGEM_MS, msAteMeiaNoite, iniciar, parar, verificar, agendar, estado, definirAgendador };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Atualizacao; // só para os testes em Node
