"""Teste no navegador (Chromium/Playwright) dos indicadores da Etapa 6. Só dados FICTÍCIOS gerados na hora.
Relógio fixado em 13/10/2026 para que as situações não dependam do dia da execução.
  python3 -I tests/e2e_indicadores.py        (requer: pip install playwright openpyxl)
"""
import datetime as dt, os, sys, tempfile
import openpyxl
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file://" + os.path.join(RAIZ, "index.html")
CAB = ["SUPERVISOR", "GERENTE", "FUNÇÃO", "MUNICIPIO", "LOJA", "COLABORADOR", "ADMISSÃO", "ULT_ASO", "VENC"]
HOJE = dt.datetime(2026, 10, 13)
COD = ["vencido", "vence-hoje", "proximo", "em-dia", "sem-data", "data-inconsistente"]
falhas = []
def confere(cond, msg):
    print(("  ok   " if cond else "  FALHOU ") + msg)
    if not cond: falhas.append(msg)

tmp = tempfile.mkdtemp()
D = lambda n: HOJE + dt.timedelta(days=n)

def xlsx(caminho, linhas, cab=CAB):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "BASE"; ws.append(cab)
    for l in linhas: ws.append(l)
    for row in ws.iter_rows(min_row=2, min_col=7, max_col=9):
        for c in row:
            if isinstance(c.value, dt.datetime): c.number_format = "dd/mm/yyyy"
    wb.save(caminho)

def linha(nome, ult, venc, **o):
    return [o.get("sup", "SUP A"), o.get("ger", "GER A"), o.get("fun", "CAIXA"), o.get("mun", "AAA"), o.get("loja", 7), nome, D(-2000), ult, venc]

# Planilha A: 3 vencidos, 2 vencem hoje, 4 próximos, 5 em dia, 2 sem data, 1 data inconsistente = 17
A_QTD = {"vencido": 3, "vence-hoje": 2, "proximo": 4, "em-dia": 5, "sem-data": 2, "data-inconsistente": 1}
GER = {
    "vencido": lambda i: (D(-400), D(-40 - i)), "vence-hoje": lambda i: (D(-360), D(0)), "proximo": lambda i: (D(-350), D(5 + i)),
    "em-dia": lambda i: (D(-100), D(100 + i)), "sem-data": lambda i: (D(-100), None), "data-inconsistente": lambda i: (D(5), D(365)),
}
def linhas_de(qtd, prefixo="COLABORADOR"):
    return [linha("%s %s %d" % (prefixo, c.upper(), i), *GER[c](i)) for c in COD for i in range(qtd.get(c, 0))]
A = os.path.join(tmp, "a.xlsx"); xlsx(A, linhas_de(A_QTD))
B_QTD = {"vencido": 1, "em-dia": 2}
B = os.path.join(tmp, "b.xlsx"); xlsx(B, linhas_de(B_QTD, "SEGUNDA"))
# Planilha só com colunas obrigatórias e campos opcionais ausentes
C = os.path.join(tmp, "c.xlsx")
xlsx(C, [[None, None, None, None, None, None, None, D(-100), D(100)], [None, None, None, None, None, "SEM OPCIONAIS", None, None, D(-1)], [None, None, None, None, None, None, None, None, None]])
RUIM = os.path.join(tmp, "sem_venc.xlsx")
xlsx(RUIM, [l[:8] for l in [linha("X", D(-1), D(1))]], [c for c in CAB if c != "VENC"])
GRANDE = os.path.join(tmp, "grande.xlsx")
xlsx(GRANDE, [linha("COLABORADOR TESTE %03d" % i, D(-300 + i), D(60 + i - 100 if i % 3 else -5 - i)) for i in range(60)])

def pagina(b, tema="light", w=1280, tz="America/Sao_Paulo"):
    ctx = b.new_context(viewport={"width": w, "height": 900}, color_scheme=tema, timezone_id=tz)
    pg = ctx.new_page(); pg.logs, pg.reqs = [], []
    pg.on("console", lambda m: pg.logs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: pg.logs.append("pageerror: " + str(e)))
    pg.on("request", lambda r: pg.reqs.append(r.url))
    pg.clock.set_fixed_time(dt.datetime(2026, 10, 13, 12, 0, 0))
    pg.goto(URL)
    return ctx, pg

def importar(pg, caminho):
    pg.set_input_files("#arquivo", caminho)
    for _ in range(300):
        if not pg.evaluate("document.getElementById('btn-importar').disabled"): break
        pg.wait_for_timeout(50)
    pg.wait_for_timeout(100)

def valores(pg):
    return {e.get_attribute("data-indicador"): e.query_selector(".indicador__valor").inner_text() for e in pg.query_selector_all("#indicadores [data-indicador]")}
def esperado(q): return {"total": str(sum(q.values())), **{c: str(q.get(c, 0)) for c in COD}}
def cartoes(pg): return len(pg.query_selector_all("#lista-cartoes article.cartao"))
def sem_rolagem(pg):
    sw, cw = pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    return sw <= cw

with sync_playwright() as p:
    b = p.chromium.launch()

    print("1) Estado inicial (sem importação)")
    ctx, pg = pagina(b)
    v = valores(pg)
    confere(len(v) == 7 and list(v) == ["total"] + COD, "7 indicadores na ordem esperada: %s" % list(v))
    confere(all(x == "–" for x in v.values()), "nenhum número exibido antes da importação: %s" % v)
    confere(pg.get_attribute("#indicadores", "data-estado") == "vazio", "estado visual 'vazio'")
    confere(cartoes(pg) == 0, "nenhum cartão")
    rot = pg.inner_text("#indicadores")
    for t in ("Total de registros", "Vencidos", "Vencem hoje", "Próximos do vencimento", "em até 30 dias", "Em dia", "Sem data de vencimento válida", "Data inconsistente"):
        confere(t in rot, "rótulo presente: %s" % t)
    cor_vazio = pg.evaluate("getComputedStyle(document.querySelector('[data-indicador=vencido] .indicador__valor')).color")
    confere(pg.logs == [], "0 erros de console no carregamento: %s" % pg.logs)

    print("2) Primeira importação: contagens corretas")
    importar(pg, A)
    v = valores(pg)
    confere(v == esperado(A_QTD), "valores = %s" % v)
    confere(int(v["total"]) == cartoes(pg) == 17, "total = quantidade de cartões = 17")
    confere(sum(int(v[c]) for c in COD) == int(v["total"]), "soma das 6 categorias = total")
    confere(pg.get_attribute("#indicadores", "data-estado") == "carregado", "estado 'carregado'")
    cor_carregado = pg.evaluate("getComputedStyle(document.querySelector('[data-indicador=vencido] .indicador__valor')).color")
    confere(cor_carregado != cor_vazio, "aparência muda de neutra para a cor da situação (%s → %s)" % (cor_vazio, cor_carregado))
    cartao_por_cod = {c: len(pg.query_selector_all("#lista-cartoes .cartao--" + c)) for c in COD}
    confere(all(str(cartao_por_cod[c]) == v[c] for c in COD), "indicadores batem com a contagem dos selos nos cartões: %s" % cartao_por_cod)
    cores = {c: pg.evaluate("c => getComputedStyle(document.querySelector('[data-indicador=%s]')).borderTopColor" % c) for c in COD}
    confere(len(set(cores.values())) == 6, "as 6 categorias têm cor de borda distinta")

    print("3) Somente informativos")
    foco = pg.evaluate("document.querySelectorAll('#indicadores button, #indicadores a, #indicadores input, #indicadores select, #indicadores [tabindex]').length")
    confere(foco == 0, "nenhum elemento clicável/focável nos indicadores")
    antes_html = pg.inner_html("#lista-cartoes")
    pg.click("[data-indicador=vencido]")
    confere(pg.inner_html("#lista-cartoes") == antes_html and valores(pg) == esperado(A_QTD), "clicar num indicador não filtra nem altera nada")
    confere(pg.evaluate("getComputedStyle(document.querySelector('[data-indicador=vencido]')).cursor") != "pointer", "cursor não sugere clique")

    print("4) Importação inválida preserva indicadores e cartões")
    antes_cartoes = pg.inner_html("#lista-cartoes")
    importar(pg, RUIM)
    confere("não importado" in pg.inner_text("#importacao-status"), "erro de importação exibido")
    confere(valores(pg) == esperado(A_QTD) and pg.inner_html("#lista-cartoes") == antes_cartoes, "indicadores e cartões da última importação válida mantidos")

    print("5) Segunda importação válida atualiza")
    importar(pg, B)
    confere(valores(pg) == esperado(B_QTD) and cartoes(pg) == 3, "valores = %s" % valores(pg))

    print("6) Campos opcionais ausentes")
    importar(pg, C)
    v = valores(pg)
    confere(v["total"] == "2" and v["em-dia"] == "1" and v["vencido"] == "1" and sum(int(v[c]) for c in COD) == 2, "2 registros contados (linha totalmente vazia ignorada pelo importador): %s" % v)

    print("7) Console, rede e armazenamento")
    confere(pg.logs == [], "0 erros/avisos de console no fluxo todo: %s" % pg.logs)
    confere(all(u.startswith("file://") for u in pg.reqs), "somente requisições a arquivos locais")
    arm = pg.evaluate("""async () => ({ls: localStorage.length, ss: sessionStorage.length, ck: document.cookie,
        idb: (indexedDB.databases ? (await indexedDB.databases()).length : 0), caches: (await caches.keys()).length})""")
    confere(arm == {"ls": 0, "ss": 0, "ck": "", "idb": 0, "caches": 0}, "nada gravado no navegador: %s" % arm)
    ctx.close()
    ctx, pg = pagina(b)
    confere(all(x == "–" for x in valores(pg).values()), "ao recarregar, volta ao estado inicial")
    ctx.close()

    print("8) Temas claro/escuro × 1280/390 px")
    for tema in ("light", "dark"):
        for w in (1280, 390):
            ctx, pg = pagina(b, tema, w)
            sw0 = sem_rolagem(pg)
            pg.screenshot(path=os.path.join(tmp, f"ind_vazio_{tema}_{w}.png"))
            importar(pg, A)
            pg.screenshot(path=os.path.join(tmp, f"ind_{tema}_{w}.png"), full_page=True)
            importar(pg, GRANDE)
            v = valores(pg)
            ok_soma = sum(int(v[c]) for c in COD) == int(v["total"]) == 60 == cartoes(pg)
            confere(sem_rolagem(pg) and sw0 and ok_soma and pg.logs == [], "%s %dpx: sem rolagem horizontal (vazio e com dados), soma = total = 60, sem erros" % (tema, w))
            # legibilidade: texto de todos os indicadores dentro da caixa e número com contraste diferente do fundo
            dentro = pg.evaluate("""() => [...document.querySelectorAll('#indicadores .indicador')].every(el => {
                const r = el.getBoundingClientRect(); const d = el.querySelector('.indicador__valor').getBoundingClientRect(); const t = el.querySelector('dt').getBoundingClientRect();
                return d.right <= r.right + 0.5 && t.right <= r.right + 0.5 && r.right <= document.documentElement.clientWidth + 0.5; })""")
            confere(dentro, "%s %dpx: rótulos e números dentro dos blocos e da tela" % (tema, w))
            fundo, num = pg.evaluate("""() => [getComputedStyle(document.querySelector('.indicador')).backgroundColor, getComputedStyle(document.querySelector('[data-indicador=em-dia] .indicador__valor')).color]""")
            confere(fundo != num, "%s %dpx: número com cor diferente do fundo (%s / %s)" % (tema, w, num, fundo))
            if w == 390:
                colunas = pg.evaluate("getComputedStyle(document.querySelector('.indicadores__grade')).gridTemplateColumns.split(' ').length")
                confere(colunas == 2, "390px: indicadores reorganizados em 2 colunas (%d)" % colunas)
            else:
                colunas = pg.evaluate("getComputedStyle(document.querySelector('.indicadores__grade')).gridTemplateColumns.split(' ').length")
                confere(colunas == 7, "1280px: 7 indicadores em uma linha (%d colunas)" % colunas)
            ctx.close()
    # largura mínima de celulares pequenos
    ctx, pg = pagina(b, "light", 320); importar(pg, A)
    confere(sem_rolagem(pg) and pg.logs == [], "320px: sem rolagem horizontal")
    ctx.close()

    print("9) Fusos horários")
    for tz in ("America/Los_Angeles", "Pacific/Auckland"):
        ctx, pg = pagina(b, tz=tz)
        importar(pg, B)
        v = valores(pg)
        confere(sum(int(v[c]) for c in COD) == int(v["total"]) == 3 and pg.logs == [], "[%s] total = soma = 3, sem erros: %s" % (tz, v))
        ctx.close()
    print("   capturas em", tmp)
    b.close()

print("\nFALHAS: %d" % len(falhas) if falhas else "\nTudo certo.")
sys.exit(1 if falhas else 0)
