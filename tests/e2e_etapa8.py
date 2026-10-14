"""Teste no navegador (Chromium/Playwright) da Etapa 8: ordenação por urgência, virada de dia e refinamento visual. Só dados FICTÍCIOS gerados na hora.
  python3 -I tests/e2e_etapa8.py [caminho/BASE_ASO.xlsx]     (requer: pip install playwright openpyxl)
O relógio do navegador é controlado pelo Playwright (page.clock): a meia-noite é "simulada", nunca esperada.
Argumento opcional: planilha real, usada só para leitura local (nada é copiado nem impresso com nomes); a conferência é por contagens e por regras de ordem.
"""
import datetime as dt, os, sys, tempfile
import openpyxl
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file://" + os.path.join(RAIZ, "index.html")
CAB = ["SUPERVISOR", "GERENTE", "FUNÇÃO", "MUNICIPIO", "LOJA", "COLABORADOR", "ADMISSÃO", "ULT_ASO", "VENC"]
HOJE = dt.datetime(2026, 10, 13)
D = lambda n: HOJE + dt.timedelta(days=n)
falhas = []
def confere(c, m):
    print(("  ok   " if c else "  FALHOU ") + m)
    if not c: falhas.append(m)

tmp = tempfile.mkdtemp()
def xlsx(caminho, linhas):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "BASE"; ws.append(CAB)
    for l in linhas: ws.append(l)
    for row in ws.iter_rows(min_row=2, min_col=7, max_col=9):
        for c in row:
            if isinstance(c.value, dt.datetime): c.number_format = "dd/mm/yyyy"
    wb.save(caminho)
L = lambda nome, ult, venc, sup="SUP TESTE", ger="GER TESTE", loja=7, fun="CAIXA", mun="ALFA": [sup, ger, fun, mun, loja, nome, D(-3000), ult, venc]

# Base A, embaralhada: [nome, ult, venc]
A_LINHAS = [
    L("EM DIA 200", D(-160), D(200)), L("SEM DATA A", D(-100), None), L("VENCIDO 10", D(-370), D(-10)), L("PROXIMO 25", D(-335), D(25)),
    L("INCONSISTENTE A", D(5), D(365)), L("VENCE HOJE A", D(-360), D(0)), L("VENCIDO 400", D(-760), D(-400)), L("EM DIA 31", D(-329), D(31)),
    L("PROXIMO 1", D(-359), D(1)), L("VENCIDO 1", D(-361), D(-1), sup="OUTRA SUP"), L("SEM DATA B", None, None), L("INCONSISTENTE B", D(30), None),
    L("VENCE HOJE B", D(-360), D(0)), L("PROXIMO 25 BIS", D(-335), D(25)), L("VENCIDO 10 BIS", D(-370), D(-10)), L("EM DIA 90", D(-270), D(90)), L("VENCIDO 100", D(-460), D(-100), sup="OUTRA SUP"),
]
A_ESP = ["INCONSISTENTE A", "INCONSISTENTE B", "VENCIDO 400", "VENCIDO 100", "VENCIDO 10", "VENCIDO 10 BIS", "VENCIDO 1", "VENCE HOJE A", "VENCE HOJE B",
         "PROXIMO 1", "PROXIMO 25", "PROXIMO 25 BIS", "EM DIA 31", "EM DIA 90", "EM DIA 200", "SEM DATA A", "SEM DATA B"]
A = os.path.join(tmp, "a.xlsx"); xlsx(A, A_LINHAS)

# Base V (virada de dia): em 13/10 -> HOJE vence hoje, AMANHA vence 14/10, FUTURO tem ULT_ASO em 14/10
V_LINHAS = [L("VENCE AMANHA", D(-359), D(1), sup="S1"), L("VENCE HOJE", D(-360), D(0), sup="S1"), L("FUTURO TESTE", D(1), D(366), sup="S1"),
            L("EM DIA LONGE", D(-100), D(260), sup="S2"), L("VENCIDO ANTIGO", D(-460), D(-100), sup="S2")]
V = os.path.join(tmp, "v.xlsx"); xlsx(V, V_LINHAS)

# Base de layout: nomes e campos longos
LONGO = "MARIA APARECIDA DOS SANTOS OLIVEIRA DE ALMEIDA E SOUZA TESTE"
G_LINHAS = [L(LONGO, D(-400), D(-40), sup="SUPERVISORA COM NOME BEM LONGO DE TESTE", ger="GERENTE REGIONAL COM NOME MUITO LONGO TESTE", fun="AUXILIAR DE FARMÁCIA ESPECIALIZADO", mun="MUNICÍPIO COM NOME EXTREMAMENTE COMPRIDO", loja=1234),
            L("SEMESPACOS" + "X" * 70, D(-350), D(10))] + [L("COLABORADOR TESTE %03d" % i, D(-300), D(i * 7 - 100)) for i in range(60)]
G = os.path.join(tmp, "g.xlsx"); xlsx(G, G_LINHAS)

def pagina(b, tema="light", w=1280, instalar=True, tz="America/Sao_Paulo"):
    ctx = b.new_context(viewport={"width": w, "height": 900}, color_scheme=tema, timezone_id=tz)
    pg = ctx.new_page(); pg.logs, pg.reqs = [], []
    pg.on("console", lambda m: pg.logs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: pg.logs.append("pageerror: " + str(e)))
    pg.on("request", lambda r: pg.reqs.append(r.url))
    # conta ouvintes de aba/janela adicionados pela página (para provar que não se acumulam)
    pg.add_init_script("""window.__ouv = {}; const _a = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(t, f, o){ if (['visibilitychange','focus','pageshow','aso:situacoes-calculadas'].includes(t)) window.__ouv[t] = (window.__ouv[t]||0)+1; return _a.call(this, t, f, o); };""")
    if instalar: pg.clock.install(time=dt.datetime(2026, 10, 13, 12, 0, 0))
    else: pg.clock.set_fixed_time(dt.datetime(2026, 10, 13, 12, 0, 0))
    pg.goto(URL)
    return ctx, pg
def importar(pg, caminho):
    pg.set_input_files("#arquivo", caminho); pg.wait_for_function("document.querySelectorAll('#lista-cartoes article').length > 0 || document.querySelector('#importacao-status').className.includes('erro')")
nomes = lambda pg: [e.inner_text() for e in pg.query_selector_all("#lista-cartoes article.cartao .cartao__nome")]
selo = lambda pg, n: pg.evaluate("n => { for (const a of document.querySelectorAll('#lista-cartoes article')) if (a.querySelector('.cartao__nome').innerText === n) return a.querySelector('.cartao__selo').innerText; return null }", n)
ind = lambda pg: pg.evaluate("Object.fromEntries([...document.querySelectorAll('[data-indicador]')].map(e => [e.dataset.indicador, e.querySelector('.indicador__valor').innerText]))")
contador = lambda pg: pg.inner_text("#filtros-contador")
def armazenamento_vazio(pg):
    return pg.evaluate("""async () => localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === '' &&
      (!indexedDB.databases || (await indexedDB.databases()).length === 0)""")

real = sys.argv[1] if len(sys.argv) > 1 else None
with sync_playwright() as p:
    b = p.chromium.launch()

    print("1) Ordenação por urgência no navegador")
    ctx, pg = pagina(b, instalar=False); importar(pg, A)
    confere(nomes(pg) == A_ESP, "17 cartões na ordem: inconsistente, vencidos (maior atraso), vence hoje, próximos, em dia, sem data")
    confere(contador(pg) == "Exibindo 17 de 17 registros", "contador: " + contador(pg))
    ordem_selos = pg.evaluate("[...document.querySelectorAll('#lista-cartoes .cartao__selo')].map(e => e.innerText).filter((s,i,a) => i === 0 || s !== a[i-1])")
    confere(ordem_selos == ["DATA INCONSISTENTE", "VENCIDO", "VENCE HOJE", "PRÓXIMO DO VENCIMENTO", "EM DIA", "SEM DATA"], "grupos de selos em ordem: %s" % ordem_selos)
    ind0 = ind(pg)
    pg.select_option("#filtro-supervisor", label="OUTRA SUP")
    confere(nomes(pg) == ["VENCIDO 100", "VENCIDO 1"] and contador(pg) == "Exibindo 2 de 17 registros", "filtro de supervisor mantém a ordem de urgência: %s" % nomes(pg))
    pg.select_option("#filtro-supervisor", value="")
    pg.select_option("#filtro-situacao", label="VENCIDO")
    confere(nomes(pg) == ["VENCIDO 400", "VENCIDO 100", "VENCIDO 10", "VENCIDO 10 BIS", "VENCIDO 1"], "filtro de situação VENCIDO: do maior atraso ao menor")
    pg.select_option("#filtro-situacao", value="")
    pg.fill("#filtro-busca", "bis")
    confere(nomes(pg) == ["VENCIDO 10 BIS", "PROXIMO 25 BIS"] and contador(pg) == "Exibindo 2 de 17 registros", "pesquisa 'bis' ordenada: %s" % nomes(pg))
    confere(ind(pg) == ind0, "sete indicadores globais inalterados pela pesquisa/ordenação: %s" % ind(pg))
    pg.click("#btn-limpar-filtros")
    confere(nomes(pg) == A_ESP, "Limpar filtros volta aos 17 cartões em ordem de urgência")
    confere(pg.logs == [] and all(u.startswith("file://") for u in pg.reqs) and armazenamento_vazio(pg), "sem erros de console, só file://, nada em armazenamento")
    ctx.close()

    print("2) Virada do dia com a página aberta (relógio do navegador controlado)")
    ctx, pg = pagina(b); importar(pg, V)
    confere(nomes(pg) == ["FUTURO TESTE", "VENCIDO ANTIGO", "VENCE HOJE", "VENCE AMANHA", "EM DIA LONGE"], "13/10 ao meio-dia: %s" % nomes(pg))
    confere(selo(pg, "VENCE AMANHA") == "PRÓXIMO DO VENCIMENTO" and selo(pg, "VENCE HOJE") == "VENCE HOJE" and selo(pg, "FUTURO TESTE") == "DATA INCONSISTENTE", "situações antes da virada")
    pg.select_option("#filtro-supervisor", label="S1"); pg.fill("#filtro-busca", "e")
    antes_nomes = nomes(pg); antes_ind = ind(pg)
    ouv0 = pg.evaluate("window.__ouv")
    pg.clock.run_for(11 * 3600 * 1000)  # 23:00 de 13/10: ainda é o mesmo dia
    confere(selo(pg, "VENCE HOJE") == "VENCE HOJE" and nomes(pg) == antes_nomes, "23:00 (mesmo dia): nada muda")
    pg.clock.run_for(2 * 3600 * 1000)   # 01:00 de 14/10: virou o dia
    confere(selo(pg, "VENCE HOJE") == "VENCIDO" and selo(pg, "VENCE AMANHA") == "VENCE HOJE" and selo(pg, "FUTURO TESTE") == "EM DIA", "após a meia-noite, sem recarregar nem importar: hoje->VENCIDO, amanhã->VENCE HOJE, futuro->EM DIA")
    confere(nomes(pg) == ["VENCE HOJE", "VENCE AMANHA", "FUTURO TESTE"], "ordem atualizada com pesquisa 'e' + supervisor S1 preservados: %s" % nomes(pg))
    confere(pg.input_value("#filtro-busca") == "e" and pg.evaluate("document.querySelector('#filtro-supervisor').selectedOptions[0].text") == "S1", "pesquisa digitada e filtro selecionado preservados")
    confere(contador(pg) == "Exibindo 3 de 5 registros", "contador: " + contador(pg))
    i = ind(pg)
    confere(i == {"total": "5", "vencido": "2", "vence-hoje": "1", "proximo": "0", "em-dia": "2", "sem-data": "0", "data-inconsistente": "0"} and i != antes_ind, "indicadores atualizados: %s" % i)
    confere(pg.inner_text("#importacao-titulo-status").startswith("Planilha importada: v.xlsx"), "base importada mantida (nenhuma nova importação solicitada)")
    confere(len(nomes(pg)) == len(set(nomes(pg))) and pg.evaluate("document.querySelectorAll('#lista-cartoes article').length") == 3, "sem cartões duplicados")
    pg.select_option("#filtro-situacao", label="VENCE HOJE")
    pg.fill("#filtro-busca", "")
    pg.clock.run_for(24 * 3600 * 1000)  # 15/10: ninguém mais vence hoje; a escolha do usuário continua
    confere(nomes(pg) == [] and "Nenhum colaborador encontrado" in pg.inner_text("#lista-cartoes") and contador(pg) == "Exibindo 0 de 5 registros", "escolha 'VENCE HOJE' preservada sem registros: mensagem e contador corretos")
    ind_final = ind(pg)
    pg.click("#btn-limpar-filtros")
    confere(len(nomes(pg)) == 5 and ind(pg) == ind_final, "Limpar filtros volta a mostrar os 5 cartões")
    for d in range(10): pg.clock.run_for(24 * 3600 * 1000)
    ouv1 = pg.evaluate("window.__ouv")
    confere(ouv1 == ouv0, "nenhum ouvinte novo após 12 viradas: %s" % ouv1)
    confere(pg.evaluate("Atualizacao.estado().temporizadorAtivo") is True and pg.evaluate("Atualizacao.estado().ligado") is True, "um único agendador ativo")
    confere(pg.logs == [] and all(u.startswith("file://") for u in pg.reqs) and armazenamento_vazio(pg), "sem erros de console, só file://, nada em armazenamento")
    ctx.close()

    print("3) Aba suspensa e retomada")
    ctx, pg = pagina(b); importar(pg, V)
    pg.evaluate("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))")
    confere(pg.evaluate("Atualizacao.estado().temporizadorAtivo") is False, "aba oculta: temporizador cancelado")
    pg.clock.fast_forward(3 * 24 * 3600 * 1000)  # o navegador ficou suspenso 3 dias (relógio avança de uma vez)
    confere(selo(pg, "VENCE AMANHA") == "PRÓXIMO DO VENCIMENTO", "enquanto suspensa, nada é atualizado")
    pg.evaluate("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'))")
    confere(selo(pg, "VENCE AMANHA") == "VENCIDO" and selo(pg, "VENCE HOJE") == "VENCIDO" and "Vencido há 3 dias" in pg.inner_text("#lista-cartoes"), "ao voltar a ficar visível: situações recalculadas (3 dias depois)")
    confere(pg.evaluate("Atualizacao.estado().temporizadorAtivo") is True and pg.evaluate("window.__ouv['visibilitychange']") == 1, "temporizador rearmado, 1 ouvinte de visibilidade")
    confere(pg.logs == [], "sem erros de console")
    ctx.close()

    print("4) Layout e legibilidade: claro/escuro × 1280/390/320 px")
    for tema in ("light", "dark"):
        for w in (1280, 390, 320):
            ctx, pg = pagina(b, tema, w, instalar=False); importar(pg, G)
            r = pg.evaluate("""() => {
              const doc = document.documentElement;
              const fora = [...document.querySelectorAll('.cartao, .filtros, .indicador, .filtros select, .filtros input, .filtros .btn')].filter(e => { const b = e.getBoundingClientRect(); return b.left < -1 || b.right > innerWidth + 1; }).length;
              const nomes = [...document.querySelectorAll('.cartao__nome, .cartao__campos dd, .cartao__situacao')].filter(e => e.scrollWidth > e.clientWidth + 1).length;
              // texto das opções cabe no select (descontando padding e seta)? medido com canvas na mesma fonte
              const cv = document.createElement('canvas').getContext('2d'); let cortadas = [];
              document.querySelectorAll('.filtros select').forEach(s => { const cs = getComputedStyle(s); cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
                const util = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 22;
                [...s.options].slice(0, 1).forEach(o => { if (cv.measureText(o.text).width > util) cortadas.push(o.text); }); });
              return { sw: doc.scrollWidth, cw: doc.clientWidth, fora, nomes, cortadas, cols: getComputedStyle(document.querySelector('.filtros__campos')).gridTemplateColumns.split(' ').length };
            }""")
            confere(r["sw"] <= r["cw"] and r["fora"] == 0, "%s %dpx: sem rolagem horizontal, nada fora da tela (%d colunas de filtros)" % (tema, w, r["cols"]))
            confere(r["nomes"] == 0, "%s %dpx: nomes, campos e textos de situação sem corte" % (tema, w))
            confere(r["cortadas"] == [], "%s %dpx: texto padrão dos seis filtros cabe inteiro %s" % (tema, w, r["cortadas"]))
            confere(pg.logs == [], "%s %dpx: sem erros de console" % (tema, w))
            ctx.close()

    if real:
        print("5) Planilha real (somente leitura local; nenhum nome é impresso)")
        ctx, pg = pagina(b, instalar=False); importar(pg, real)
        r = pg.evaluate("""() => { const itens = Aso.obter(); const ordem = Ordenacao.PRIORIDADE; const vis = Ordenacao.ordenar(itens);
          let ok = true; for (let i = 1; i < vis.length; i++) { const a = vis[i-1], c = vis[i];
            if (ordem[a.situacao] > ordem[c.situacao]) ok = false;
            if (a.situacao === c.situacao && ['vencido','proximo','em-dia'].includes(a.situacao) && a.dias > c.dias) ok = false; }
          return { total: itens.length, ordemOk: ok, cartoes: document.querySelectorAll('#lista-cartoes article').length, resumo: Aso.resumo(), contador: document.querySelector('#filtros-contador').innerText }; }""")
        confere(r["total"] == r["cartoes"] and r["ordemOk"], "real: %d registros, %d cartões, ordem de urgência correta" % (r["total"], r["cartoes"]))
        print("      resumo real em 13/10/2026 (relógio fixado):", {k: v for k, v in r["resumo"].items() if k != "hoje"}, "|", r["contador"])
        confere(pg.logs == [] and all(u.startswith("file://") for u in pg.reqs), "real: sem erros de console e sem requisições externas")
        ctx.close()
    b.close()

print("\nTudo certo." if not falhas else "\nFALHAS: %d" % len(falhas))
sys.exit(1 if falhas else 0)
