"""Teste no navegador (Chromium/Playwright) dos cartões da Etapa 5. Só dados FICTÍCIOS gerados na hora.
Relógio fixado em 13/10/2026 para que as situações não dependam do dia da execução.
  python3 -I tests/e2e_cartoes.py        (requer: pip install playwright openpyxl)
"""
import datetime as dt, json, os, sys, tempfile
import openpyxl
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file://" + os.path.join(RAIZ, "index.html")
CAB = ["SUPERVISOR", "GERENTE", "FUNÇÃO", "MUNICIPIO", "LOJA", "COLABORADOR", "ADMISSÃO", "ULT_ASO", "VENC"]
HOJE = dt.datetime(2026, 10, 13)
falhas = []
def confere(cond, msg):
    print(("  ok   " if cond else "  FALHOU ") + msg)
    if not cond: falhas.append(msg)

tmp = tempfile.mkdtemp()
D = lambda n: HOJE + dt.timedelta(days=n)
ATAQUE = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'

def xlsx(caminho, linhas, cab=CAB):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "BASE"; ws.append(cab)
    for l in linhas: ws.append(l)
    for row in ws.iter_rows(min_row=2, min_col=7, max_col=9):
        for c in row:
            if isinstance(c.value, dt.datetime): c.number_format = "dd/mm/yyyy"
    wb.save(caminho)

def linha(nome, ult, venc, **o):
    return [o.get("sup", "SUP A"), o.get("ger", "GER A"), o.get("fun", "CAIXA"), o.get("mun", "AAA"), o.get("loja", 7), nome, D(-2000), ult, venc]

A = os.path.join(tmp, "a.xlsx")
xlsx(A, [
    linha("COLABORADOR VENCIDO", D(-400), D(-40)),            # vencido há 40 dias
    linha("COLABORADOR VENCE HOJE", D(-360), D(0)),
    linha("COLABORADOR PROXIMO", D(-350), D(10)),             # faltam 10 dias
    linha("COLABORADOR EM DIA", D(-100), D(260)),
    linha("COLABORADOR SEM DATA", D(-100), None),
    linha("COLABORADOR INCONSISTENTE", D(5), D(365)),
    linha(ATAQUE, D(-100), D(260), sup=ATAQUE, ger=ATAQUE, fun=ATAQUE, mun=ATAQUE, loja=ATAQUE),
    linha("COLABORADOR CAMPOS VAZIOS", None, D(100), sup=None, ger=None, fun=0, mun=None, loja=None),
])
B = os.path.join(tmp, "b.xlsx")
xlsx(B, [linha("SEGUNDA PLANILHA UM", D(-100), D(260)), linha("SEGUNDA PLANILHA DOIS", D(-400), D(-1))])
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

def cartoes(pg): return pg.query_selector_all("#lista-cartoes article.cartao")
def nomes(pg): return [e.inner_text() for e in pg.query_selector_all("#lista-cartoes .cartao__nome")]
def cartao_de(pg, trecho):
    for c in cartoes(pg):
        if trecho in c.query_selector(".cartao__nome").inner_text(): return c
def classe(c): return [x for x in c.get_attribute("class").split() if x.startswith("cartao--")][0]
def campos(c): return {e.query_selector("dt").text_content(): e.query_selector("dd").inner_text() for e in c.query_selector_all(".cartao__campos > div")}

with sync_playwright() as p:
    b = p.chromium.launch()

    print("1) Estado inicial")
    ctx, pg = pagina(b)
    confere(len(cartoes(pg)) == 0, "nenhum cartão antes da importação")
    t = pg.inner_text("#lista-cartoes")
    confere("Nenhuma planilha importada" in t and "Importar planilha" in t, "mensagem orienta a importar a planilha: %r" % t[:90])
    confere(pg.logs == [], "0 erros de console no carregamento: %s" % pg.logs)

    print("2) Importação válida: um cartão por registro, situações e datas")
    importar(pg, A)
    confere(len(cartoes(pg)) == 8, "8 cartões para 8 registros (%d)" % len(cartoes(pg)))
    confere("Nenhuma planilha importada" not in pg.inner_text("#lista-cartoes"), "mensagem inicial some")
    esperado = {"VENCIDO": ("cartao--vencido", "VENCIDO", "Vencido há 40 dias"),
                "VENCE HOJE": ("cartao--vence-hoje", "VENCE HOJE", "Vence hoje"),
                "PROXIMO": ("cartao--proximo", "PRÓXIMO DO VENCIMENTO", "Faltam 10 dias para vencer"),
                "EM DIA": ("cartao--em-dia", "EM DIA", "Dentro do prazo"),
                "SEM DATA": ("cartao--sem-data", "SEM DATA", "Data de vencimento não informada ou inválida"),
                "INCONSISTENTE": ("cartao--data-inconsistente", "DATA INCONSISTENTE", "Conferir a data cadastrada")}
    for chave, (cls, selo, detalhe) in esperado.items():
        c = cartao_de(pg, "COLABORADOR " + chave)
        confere(c is not None and classe(c) == cls and c.query_selector(".cartao__selo").inner_text() == selo and detalhe in c.query_selector(".cartao__situacao").inner_text(),
                "%s: classe, selo e texto (%s)" % (chave, selo))
    cores = {chave: pg.evaluate("c => getComputedStyle(c).borderLeftColor", cartao_de(pg, "COLABORADOR " + chave)) for chave in esperado}
    confere(len(set(cores.values())) == 6, "as 6 situações têm cor de borda distinta: %s" % cores)
    c = cartao_de(pg, "COLABORADOR VENCIDO"); f = campos(c)
    confere(f["Último ASO"] == (D(-400)).strftime("%d/%m/%Y") and f["Vencimento"] == D(-40).strftime("%d/%m/%Y"), "datas em dd/mm/aaaa: %s / %s" % (f["Último ASO"], f["Vencimento"]))
    confere(f["Loja"] == "7" and f["Função"] == "CAIXA" and f["Supervisor"] == "SUP A" and f["Gerente"] == "GER A" and f["Município"] == "AAA", "loja, função, supervisor, gerente e município: %s" % f)
    todo = pg.inner_text("#lista-cartoes")
    import re
    confere(re.search(r"-\d", todo) is None, "nenhum número negativo na tela")
    confere(re.search(r"\d{4}-\d{2}-\d{2}", todo) is None, "nenhuma data em formato ISO na tela")
    confere("CPNJ" not in todo and "Admiss" not in todo and "Nasc" not in todo, "sem CNPJ, admissão ou nascimento nos cartões")
    c = cartao_de(pg, "CAMPOS VAZIOS"); f = campos(c)
    confere(all(f[k] == "Não informada" for k in ("Loja", "Função", "Supervisor", "Gerente", "Município", "Último ASO")) and f["Vencimento"] != "Não informada", "campos ausentes e FUNÇÃO 0 → 'Não informada': %s" % f)

    print("3) Conteúdo malicioso não é executado")
    confere(pg.evaluate("window.__xss") is None, "nenhum script/handler da planilha executou (window.__xss indefinido)")
    confere(pg.evaluate("document.querySelectorAll('#lista-cartoes img, #lista-cartoes script, #lista-cartoes svg').length") == 0, "nenhuma tag <img>/<script>/<svg> criada nos cartões")
    c = cartao_de(pg, "<img")
    confere(c is not None and c.query_selector(".cartao__nome").inner_text() == ATAQUE, "o texto malicioso aparece literalmente como texto do nome")
    confere(all(v == ATAQUE for k, v in campos(c).items() if k in ("Loja", "Função", "Supervisor", "Gerente", "Município")) or
            campos(c)["Função"] == ATAQUE.upper(), "campos de texto também literais (função em maiúsculas por exibição)")

    print("4) Importação inválida preserva a listagem")
    antes = pg.inner_html("#lista-cartoes")
    importar(pg, RUIM)
    confere("não importado" in pg.inner_text("#importacao-status"), "erro de importação exibido")
    confere(pg.inner_html("#lista-cartoes") == antes and len(cartoes(pg)) == 8, "cartões idênticos após importação inválida")

    print("5) Segunda importação válida substitui")
    importar(pg, B)
    confere(nomes(pg) == ["SEGUNDA PLANILHA DOIS", "SEGUNDA PLANILHA UM"], "(Etapa 8: vencido antes de em dia) só os 2 cartões da segunda planilha: %s" % nomes(pg))
    confere(classe(cartao_de(pg, "UM")) == "cartao--em-dia" and classe(cartao_de(pg, "DOIS")) == "cartao--vencido", "situações recalculadas para a nova base")
    confere("Vencido há 1 dia" in cartao_de(pg, "DOIS").inner_text(), "singular: 'Vencido há 1 dia'")

    print("6) Console, rede e armazenamento")
    confere(pg.logs == [], "0 erros/avisos de console durante todo o fluxo: %s" % pg.logs)
    confere(all(u.startswith("file://") for u in pg.reqs), "somente requisições a arquivos locais")
    arm = pg.evaluate("""async () => ({ls: localStorage.length, ss: sessionStorage.length, ck: document.cookie,
        idb: (indexedDB.databases ? (await indexedDB.databases()).length : 0), caches: (await caches.keys()).length})""")
    confere(arm == {"ls": 0, "ss": 0, "ck": "", "idb": 0, "caches": 0}, "nada gravado no navegador: %s" % arm)
    ctx.close()
    ctx, pg = pagina(b)
    confere(len(cartoes(pg)) == 0 and "Nenhuma planilha importada" in pg.inner_text("#lista-cartoes"), "ao recarregar, volta ao estado inicial")
    ctx.close()

    print("7) Layout (claro/escuro × 1280/390 px), fusos")
    for tema in ("light", "dark"):
        for w in (1280, 390):
            ctx, pg = pagina(b, tema, w)
            pg.screenshot(path=os.path.join(tmp, f"vazio_{tema}_{w}.png"))
            importar(pg, A)
            pg.screenshot(path=os.path.join(tmp, f"cartoes_{tema}_{w}.png"), full_page=True)
            importar(pg, GRANDE)
            sw, cw = pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            confere(sw <= cw and pg.logs == [] and len(cartoes(pg)) == 60, "%s %dpx: sem rolagem horizontal, 60 cartões, sem erros" % (tema, w))
            ctx.close()
    for tz in ("America/Los_Angeles", "Pacific/Auckland"):
        ctx, pg = pagina(b, tz=tz)
        importar(pg, B)
        confere(len(cartoes(pg)) == 2 and pg.logs == [], "[%s] cartões exibidos sem erros" % tz)
        ctx.close()
    print("   capturas em", tmp)
    b.close()

print("\nFALHAS: %d" % len(falhas) if falhas else "\nTudo certo.")
sys.exit(1 if falhas else 0)
