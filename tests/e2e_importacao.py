"""Teste de ponta a ponta da importação, no Chromium (Playwright). Usa só dados FICTÍCIOS gerados na hora.
Opcional: passe o caminho da planilha real como argumento para conferir os valores contra ela
(a planilha é lida apenas por este teste e nada dela é gravado em arquivo ou impresso além de contagens).

  python3 -I tests/e2e_importacao.py [caminho/BASE_ASO.xlsx]
Requer: pip install playwright openpyxl (e o Chromium já instalado).
"""
import csv, datetime as dt, json, os, sys, tempfile
import openpyxl
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file://" + os.path.join(RAIZ, "index.html")
REAL = sys.argv[1] if len(sys.argv) > 1 else None
CAB = ["SUPERVISOR", "GERENTE", "FUNÇÃO", "MUNICIPIO", "CPNJ", "DT_NASC", "LOJA", "COLABORADOR", "ADMISSÃO", "ULT_ASO", "VENC", "ASO_STATUS"]
falhas = []

def confere(cond, msg):
    print(("  ok   " if cond else "  FALHOU ") + msg)
    if not cond: falhas.append(msg)

tmp = tempfile.mkdtemp()
def xlsx_ficticio(caminho, cabecalho=CAB, extra_aba=True):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "BASE"
    ws.append(cabecalho)
    linhas = [
      ["SUP A", "GER A", "CAIXA", "AAA", "00.000.000/0001-00", dt.datetime(1990, 1, 1), 1, "COLABORADOR TESTE 01", dt.datetime(2020, 2, 1), dt.datetime(2025, 10, 10), dt.datetime(2026, 10, 5), "VENCIDO"],
      ["SUP A", "GER A", "BALCONISTA", "BBB", "00.000.000/0001-00", "-", 1, "COLABORADOR TESTE 02", "01/03/2021", "2025-11-20", 46000, "EM DIA"],   # texto BR, ISO e serial
      ["SUP B", "GER B", 0, "AAA", "00.000.000/0002-00", dt.datetime(1985, 5, 5), 2, "COLABORADOR TESTE 03", dt.datetime(2022, 1, 1), "xx/xx/xxxx", None, "SEM DATA"],
      [None] * 12,
    ]
    for l in linhas: ws.append(l)
    for r in ws.iter_rows(min_row=2, min_col=9, max_col=11):
        for c in r:
            if isinstance(c.value, dt.datetime): c.number_format = "dd/mm/yyyy"
    if extra_aba:
        w2 = wb.create_sheet("OUTRA"); w2.append(["nada", "disso"])
    wb.save(caminho)

x_ok = os.path.join(tmp, "teste_ok.xlsx"); xlsx_ficticio(x_ok)
x_sem_venc = os.path.join(tmp, "sem_venc.xlsx"); xlsx_ficticio(x_sem_venc, [c for c in CAB if c != "VENC"])
c_ok = os.path.join(tmp, "teste_ok.csv")
with open(c_ok, "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f); w.writerow(CAB)
    w.writerow(["SUP A", "GER A", "FARMACÊUTICO", "AAA", "00.000.000/0001-00", "01/01/1990", 1, 'NOME "COM ASPAS", TESTE', "01/02/2020", "10/10/2025", "05/10/2026", "VENCIDO"])
    w.writerow(["SUP A", "GER A", "CAIXA", "AAA", "00.000.000/0001-00", "01/01/1991", 2, "COLABORADOR TESTE 05", "2021-03-01", "2025-11-20", "15/11/2026", "EM DIA"])
txt = os.path.join(tmp, "dados.txt"); open(txt, "w").write("x")

def pagina(b, tema="light", w=1280, tz="America/Sao_Paulo"):
    ctx = b.new_context(viewport={"width": w, "height": 900}, color_scheme=tema, timezone_id=tz)
    pg = ctx.new_page()
    pg.logs, pg.reqs = [], []
    pg.on("console", lambda m: pg.logs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: pg.logs.append("pageerror: " + str(e)))
    pg.on("request", lambda r: pg.reqs.append(r.url))
    pg.goto(URL)
    return ctx, pg

def importar(pg, caminho):
    pg.set_input_files("#arquivo", caminho)
    # (sem wait_for_function: ele usa eval no navegador, que a CSP da página bloqueia de propósito)
    for _ in range(300):
        if not pg.evaluate("document.getElementById('btn-importar').disabled"): break
        pg.wait_for_timeout(100)
    pg.wait_for_timeout(100)

def status(pg): return pg.inner_text("#importacao-status")
def dados(pg): return pg.evaluate("Dados.obter().map(r => ({...r}))")

with sync_playwright() as p:
    b = p.chromium.launch()

    print("1) Carga da página, CSP e rede")
    ctx, pg = pagina(b)
    confere(pg.evaluate("typeof readXlsxFile === 'function' && typeof Importador === 'object' && typeof Dados === 'object'"), "scripts locais carregaram (biblioteca XLSX, importador, dados)")
    confere(pg.logs == [], "0 erros/avisos no console (inclui violações de CSP): %s" % pg.logs)
    confere(all(u.startswith("file://") for u in pg.reqs), "somente requisições a arquivos locais: %s" % [u for u in pg.reqs if not u.startswith("file://")])
    confere("Nenhuma planilha importada" in status(pg), "estado inicial: nenhuma planilha importada")
    confere(pg.is_visible("#btn-importar") and pg.inner_text("#btn-importar") == "Importar planilha", "botão 'Importar planilha' visível")
    confere(pg.evaluate("document.getElementById('arquivo').accept") == ".xlsx,.csv", "seletor aceita .xlsx e .csv")
    # tentativa de rede deve ser bloqueada pela CSP
    bloq = pg.evaluate("fetch('https://example.com/x').then(() => 'passou', () => 'bloqueado')")
    confere(bloq == "bloqueado", "fetch externo bloqueado pela CSP (connect-src 'none')")
    pg.logs.clear()  # o erro de console acima é esperado (foi provocado de propósito)

    print("2) XLSX fictício (datas Excel, texto BR, ISO, serial, inválida, vazia)")
    importar(pg, x_ok)
    d = dados(pg)
    confere(len(d) == 3, "3 registros (linha vazia ignorada): %d" % len(d))
    confere("teste_ok.xlsx" in status(pg) and "3 registros" in status(pg), "status mostra nome do arquivo e quantidade")
    confere([r["venc"] for r in d] == ["2026-10-05", "2025-12-09", None], "VENC: Date Excel, serial 46000 e vazio -> %s" % [r["venc"] for r in d])
    confere(d[1]["admissao"] == "2021-03-01" and d[1]["ult_aso"] == "2025-11-20", "texto BR e ISO convertidos")
    confere(d[2]["ult_aso"] is None and "ULT_ASO" in status(pg) and "não reconhecido" in status(pg), "data inválida vira vazia e gera aviso")
    confere("CPNJ" in status(pg) and "DT_NASC" in status(pg) and "ASO_STATUS" in status(pg), "status lista colunas descartadas")
    j = json.dumps(d)
    confere("00.000.000" not in j and "1990" not in j and "VENCIDO" not in j, "CNPJ, nascimento e ASO_STATUS não estão em memória")
    confere(d[2]["funcao"] == "0", "FUNÇÃO 0 preservada como texto (tratamento fica para etapa futura)")

    print("3) Arquivo inválido não substitui os dados")
    importar(pg, x_sem_venc)
    confere("não importado" in status(pg) and "VENC" in status(pg) and "mantidos" in status(pg), "erro cita VENC e informa que os dados anteriores foram mantidos")
    confere(len(dados(pg)) == 3 and pg.evaluate("Dados.resumo().arquivo") == "teste_ok.xlsx", "dados anteriores intactos")
    importar(pg, txt)
    confere("não importado" in status(pg) and ".xlsx ou .csv" in status(pg), ".txt recusado")
    confere(len(dados(pg)) == 3, "dados anteriores intactos após .txt")

    print("4) CSV fictício (UTF-8, aspas, vírgula em campo, acentos)")
    importar(pg, c_ok)
    d = dados(pg)
    confere(len(d) == 2 and d[0]["colaborador"] == 'NOME "COM ASPAS", TESTE' and d[0]["funcao"] == "FARMACÊUTICO", "campos com aspas/vírgula/acentos corretos")
    confere(d[1]["admissao"] == "2021-03-01" and d[1]["venc"] == "2026-11-15", "ISO e BR no mesmo arquivo")
    confere("teste_ok.csv" in status(pg) and "2 registros" in status(pg), "status do CSV")
    importar(pg, c_ok)
    confere(pg.evaluate("Dados.obter().length") == 2, "mesmo arquivo pode ser importado de novo")

    print("5) Nada gravado no navegador")
    arm = pg.evaluate("""async () => ({ls: localStorage.length, ss: sessionStorage.length, ck: document.cookie,
        idb: (indexedDB.databases ? (await indexedDB.databases()).length : 0), caches: (await caches.keys()).length})""")
    confere(arm == {"ls": 0, "ss": 0, "ck": "", "idb": 0, "caches": 0}, "localStorage, sessionStorage, cookies, IndexedDB e Cache vazios: %s" % arm)
    confere(all(u.startswith("file://") for u in pg.reqs), "nenhuma requisição de rede durante as importações")
    confere(pg.logs == [], "0 erros no console após as importações: %s" % pg.logs)
    ctx.close()
    ctx, pg = pagina(b)
    confere(pg.evaluate("Dados.obter().length") == 0, "ao recarregar a página os dados somem")
    ctx.close()

    if REAL and os.path.exists(REAL):
        print("6) Planilha real (somente contagens e conferência campo a campo)")
        ws = openpyxl.load_workbook(REAL, data_only=True)["BASE"]
        linhas = list(ws.iter_rows(values_only=True)); h = linhas[0]; ix = {n: i for i, n in enumerate(h)}
        iso = lambda v: v.strftime("%Y-%m-%d") if isinstance(v, (dt.datetime, dt.date)) else None
        esperado = [{"supervisor": r[ix["SUPERVISOR"]], "gerente": r[ix["GERENTE"]], "funcao": str(r[ix["FUNÇÃO"]]), "municipio": r[ix["MUNICIPIO"]],
                     "loja": str(r[ix["LOJA"]]), "colaborador": r[ix["COLABORADOR"]].strip(), "admissao": iso(r[ix["ADMISSÃO"]]),
                     "ult_aso": iso(r[ix["ULT_ASO"]]), "venc": iso(r[ix["VENC"]])} for r in linhas[1:]]
        for tz in ("America/Sao_Paulo", "America/Los_Angeles", "Pacific/Auckland"):
            ctx, pg = pagina(b, tz=tz)
            importar(pg, REAL)
            d = dados(pg)
            obtido = [{k: v for k, v in r.items() if k != "linha"} for r in d]
            dif = [i for i, (a, e) in enumerate(zip(obtido, esperado)) if a != e]
            confere(len(d) == len(esperado) == 341 and not dif, "[%s] %d registros, %d divergências campo a campo contra a planilha" % (tz, len(d), len(dif)))
            ctx.close()
        ctx, pg = pagina(b)
        importar(pg, REAL)
        j = json.dumps(dados(pg))
        confere("19.147" not in j, "CNPJ da planilha real não está em memória")
        confere(set(dados(pg)[0]) == {"linha", "supervisor", "gerente", "funcao", "municipio", "loja", "colaborador", "admissao", "ult_aso", "venc"}, "registros só têm os 9 campos necessários (+ nº da linha)")
        print("       status real:", status(pg).replace("\n", " | ")[:300])
        # CSV equivalente ao que o Google Sheets exporta (datas dd/mm/aaaa, UTF-8)
        csv_real = os.path.join(tmp, "real.csv")
        with open(csv_real, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f); w.writerow(h)
            for r in linhas[1:]:
                w.writerow([v.strftime("%d/%m/%Y") if isinstance(v, dt.datetime) else ("" if v is None else v) for v in r])
        importar(pg, csv_real)
        d2 = [{k: v for k, v in r.items() if k != "linha"} for r in dados(pg)]
        dif = [i for i, (a, e) in enumerate(zip(d2, esperado)) if a != e]
        confere(len(d2) == 341 and not dif, "CSV equivalente (datas dd/mm/aaaa): %d registros, %d divergências" % (len(d2), len(dif)))
        ctx.close()

    print("7) Layout")
    for tema in ("light", "dark"):
        for w in (1280, 390):
            ctx, pg = pagina(b, tema, w)
            pg.screenshot(path=os.path.join(tmp, f"vazio_{tema}_{w}.png"))
            importar(pg, x_ok)
            pg.screenshot(path=os.path.join(tmp, f"aviso_{tema}_{w}.png"))
            importar(pg, x_sem_venc)
            pg.screenshot(path=os.path.join(tmp, f"erro_{tema}_{w}.png"))
            sw, cw = pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            confere(sw <= cw and pg.logs == [], "%s %dpx: sem rolagem horizontal e sem erros de console" % (tema, w))
            ctx.close()
    print("   capturas em", tmp)
    b.close()

print("\nFALHAS: %d" % len(falhas) if falhas else "\nTudo certo.")
sys.exit(1 if falhas else 0)
