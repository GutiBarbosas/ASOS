"""Teste no navegador (Chromium/Playwright) dos filtros e da pesquisa da Etapa 7. Só dados FICTÍCIOS gerados na hora.
Relógio fixado em 13/10/2026 para que as situações não dependam do dia da execução.
  python3 -I tests/e2e_filtros.py        (requer: pip install playwright openpyxl)
Os controles são usados como o usuário usa (select_option, digitação, clique); nada é chamado direto no JavaScript da página,
exceto leituras (estado do DOM, armazenamento, estilos calculados).
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
ATAQUE = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'

def xlsx(caminho, linhas, cab=CAB):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "BASE"; ws.append(cab)
    for l in linhas: ws.append(l)
    for row in ws.iter_rows(min_row=2, min_col=7, max_col=9):
        for c in row:
            if isinstance(c.value, dt.datetime): c.number_format = "dd/mm/yyyy"
    wb.save(caminho)

DATAS = {  # situação -> (ULT_ASO, VENC)
    "vencido": (D(-400), D(-40)), "vence-hoje": (D(-360), D(0)), "proximo": (D(-350), D(10)),
    "em-dia": (D(-100), D(200)), "sem-data": (D(-100), None), "data-inconsistente": (D(5), D(365)),
}
def linha(nome, sit, sup, ger, loja, fun, mun):
    ult, venc = DATAS[sit]
    return [sup, ger, fun, mun, loja, nome, D(-2000), ult, venc]

# ---------- Base A: 12 colaboradores (a mesma tabela do teste Node) ----------
LINHAS_A = [
    ("JOSÉ DA SILVA TESTE", "vencido", "ANA TESTE", "GER UM", 7, "CAIXA", "ALFA"),
    ("MARIA CONCEIÇÃO TESTE", "em-dia", "ANA TESTE", "GER UM", 7, "caixa", "ALFA"),
    ("JOAO PEREIRA TESTE", "proximo", "BRUNO TESTE", "GER DOIS", 26, "FARMACÊUTICO", "BETA"),
    ("ÁLVARO NUNES TESTE", "vence-hoje", "BRUNO TESTE", "GER DOIS", 26, "GERENTE", "BETA"),
    ("LÚCIA AÇAÍ TESTE", "sem-data", None, "GER DOIS", 9, 0, "GAMA"),
    ("PAULO ROCHA TESTE", "data-inconsistente", "  ana   teste ", None, None, "CAIXA", None),
    ("BEATRIZ LIMA TESTE", "vencido", "BRUNO TESTE", "GER UM", 7, "Gerente", "ALFA"),
    ("CARLOS DIAS TESTE", "em-dia", "CARLA TESTE", "GER TRES", 100, "AUXILIAR", "DELTA"),
    ("DANIELA MOTA TESTE", "em-dia", "CARLA TESTE", "GER TRES", 100, None, "DELTA"),
    ("EDUARDO REIS TESTE", "vencido", "CARLA TESTE", "GER TRES", 9, "CAIXA", "GAMA"),
    ("FÁBIO SANTOS TESTE", "vencido", "ANA TESTE", "GER UM", 26, "FARMACÊUTICO", "BETA"),
    ("GABRIELA CRUZ TESTE", "em-dia", "BRUNO TESTE", "GER DOIS", 26, "FARMACÊUTICO", "BETA"),
]
NOME = [l[0] for l in LINHAS_A]
nums = lambda ns: sorted(NOME[n - 1] for n in ns)  # composição (ordenada); a ordem de exibição é testada em e2e_etapa8.py
A = os.path.join(tmp, "a.xlsx"); xlsx(A, [linha(*l) for l in LINHAS_A])

# opções esperadas (texto exibido) e colaboradores esperados por opção (números = posição na tabela)
OPCOES = {
    "situacao": ["VENCIDO", "VENCE HOJE", "PRÓXIMO DO VENCIMENTO", "EM DIA", "SEM DATA", "DATA INCONSISTENTE"],
    "supervisor": ["ANA TESTE", "BRUNO TESTE", "CARLA TESTE", "Não informada"],
    "gerente": ["GER DOIS", "GER TRES", "GER UM", "Não informada"],
    "loja": ["7", "9", "26", "100", "Não informada"],
    "funcao": ["AUXILIAR", "CAIXA", "FARMACÊUTICO", "GERENTE", "Não informada"],
    "municipio": ["ALFA", "BETA", "DELTA", "GAMA", "Não informada"],
}
ESP = {
    "situacao": {"VENCIDO": [1, 7, 10, 11], "VENCE HOJE": [4], "PRÓXIMO DO VENCIMENTO": [3], "EM DIA": [2, 8, 9, 12], "SEM DATA": [5], "DATA INCONSISTENTE": [6]},
    "supervisor": {"ANA TESTE": [1, 2, 6, 11], "BRUNO TESTE": [3, 4, 7, 12], "CARLA TESTE": [8, 9, 10], "Não informada": [5]},
    "gerente": {"GER UM": [1, 2, 7, 11], "GER DOIS": [3, 4, 5, 12], "GER TRES": [8, 9, 10], "Não informada": [6]},
    "loja": {"7": [1, 2, 7], "9": [5, 10], "26": [3, 4, 11, 12], "100": [8, 9], "Não informada": [6]},
    "funcao": {"CAIXA": [1, 2, 6, 10], "FARMACÊUTICO": [3, 11, 12], "GERENTE": [4, 7], "AUXILIAR": [8], "Não informada": [5, 9]},
    "municipio": {"ALFA": [1, 2, 7], "BETA": [3, 4, 11, 12], "DELTA": [8, 9], "GAMA": [5, 10], "Não informada": [6]},
}
TODOS_TXT = {"situacao": "Todas as situações", "supervisor": "Todos os supervisores", "gerente": "Todos os gerentes", "loja": "Todas as lojas", "funcao": "Todas as funções", "municipio": "Todos os municípios"}
IDS = list(OPCOES)
IND_A = {"total": "12", "vencido": "4", "vence-hoje": "1", "proximo": "1", "em-dia": "4", "sem-data": "1", "data-inconsistente": "1"}

# ---------- Base B (segunda importação) ----------
B = os.path.join(tmp, "b.xlsx")
xlsx(B, [linha("SEGUNDA BASE UM", "vencido", "SUP B1", "GER B", 3, "AUXILIAR", "OMEGA"),
         linha("SEGUNDA BASE DOIS", "em-dia", "SUP B2", "GER B", 4, "CAIXA", "OMEGA"),
         linha("SEGUNDA BASE TRES", "em-dia", "SUP B2", "GER B", 4, "CAIXA", "SIGMA")])
RUIM = os.path.join(tmp, "sem_venc.xlsx")
xlsx(RUIM, [l[:8] for l in [linha("X", "em-dia", "S", "G", 1, "F", "M")]], [c for c in CAB if c != "VENC"])

# ---------- Base X: ataque HTML em todos os campos de texto + valores muito longos ----------
LONGO = "SUPERVISOR COM NOME EXTREMAMENTE LONGO PARA TESTAR ESTOURO DE LAYOUT NO SELECT DE FILTRO " * 2
X = os.path.join(tmp, "x.xlsx")
xlsx(X, [linha(ATAQUE, "em-dia", ATAQUE, ATAQUE, ATAQUE, ATAQUE, ATAQUE),
         linha("COLABORADOR NORMAL", "vencido", "SUP NORMAL", "GER NORMAL", 7, "CAIXA", "ALFA"),
         linha("COLABORADOR VALORES LONGOS", "proximo", LONGO.strip(), LONGO.strip(), 8, LONGO.strip(), LONGO.strip())])

# ---------- Base G: 60 colaboradores (layout) e Base P: 341 (desempenho; mesma escala da planilha real) ----------
def gerar(n):
    sits = list(DATAS)
    return [linha("COLABORADOR TESTE %03d" % i, sits[i % 6], "SUP %d" % (i % 7), "GER %d" % (i % 5), (i % 40) + 1,
                  ["CAIXA", "FARMACÊUTICO", "GERENTE", "AUXILIAR", "BALCONISTA", "CONFERENTE"][i % 6], "MUN %d" % (i % 9)) for i in range(n)]
G = os.path.join(tmp, "g60.xlsx"); xlsx(G, gerar(60))
P_N = 341
PRI = ["ANA", "BRUNO", "CARLA", "DIOGO", "ELIANA", "FABIO", "GISELE", "HUGO", "IRENE", "JOAO", "KARLA", "LUCAS", "MARIA", "NELSON", "OLGA", "PAULO", "RITA", "SERGIO", "TANIA", "VITOR"]
SOB = ["SILVA", "SANTOS", "OLIVEIRA", "SOUZA", "LIMA", "PEREIRA", "COSTA", "RODRIGUES", "ALMEIDA", "NASCIMENTO", "CARVALHO", "ARAUJO"]
P_NOMES = ["%s %s %s TESTE" % (PRI[i % 20], SOB[(i // 20) % 12], SOB[(i * 5 + 3) % 12]) for i in range(P_N)]  # nomes variados: a pesquisa descarta registros como na vida real
_g = gerar(P_N)
for i, l in enumerate(_g): l[5] = P_NOMES[i]
P = os.path.join(tmp, "p341.xlsx"); xlsx(P, _g)

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

# ----- leituras do que o usuário vê -----
# Etapa 8: os cartões agora saem em ordem de urgência (testada em e2e_etapa8.py). Aqui se confere a COMPOSIÇÃO do resultado dos filtros, por isso a lista é ordenada.
def nomes(pg): return sorted(e.inner_text() for e in pg.query_selector_all("#lista-cartoes article.cartao .cartao__nome"))
def n_cartoes(pg): return len(pg.query_selector_all("#lista-cartoes article.cartao"))
def contador(pg): return pg.inner_text("#filtros-contador").strip()
def opcoes(pg, i): return [o.inner_text() for o in pg.query_selector_all("#filtro-%s option" % i)]
def selecionado(pg, i): return pg.evaluate("document.getElementById('filtro-%s').value" % i)
def indicadores(pg): return {e.get_attribute("data-indicador"): e.query_selector(".indicador__valor").inner_text() for e in pg.query_selector_all("#indicadores [data-indicador]")}
def escolher(pg, i, rotulo): pg.select_option("#filtro-" + i, label=rotulo)
def todos(pg, i): pg.select_option("#filtro-" + i, value="")
def limpar(pg): pg.click("#btn-limpar-filtros")
def estado_ui(pg): return {"busca": pg.input_value("#filtro-busca"), **{i: selecionado(pg, i) for i in IDS}}
LIMPO = {"busca": "", **{i: "" for i in IDS}}
def pesquisar(pg, texto):
    pg.fill("#filtro-busca", texto)
def sem_rolagem(pg):
    sw, cw = pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    return sw <= cw
def dentro_da_tela(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('#filtros input, #filtros select, #filtros button, #filtros label, #filtros-contador')].every(el => {
        const r = el.getBoundingClientRect(); return r.left >= -0.5 && r.right <= document.documentElement.clientWidth + 0.5; })""")
def luminancia(css):
    import re
    r, g, b = [int(float(x)) for x in re.findall(r"[\d.]+", css)[:3]]
    f = lambda c: (c / 255 / 12.92) if c / 255 <= 0.03928 else (((c / 255) + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
def contraste(c1, c2):
    a, b = sorted([luminancia(c1), luminancia(c2)], reverse=True)
    return (a + 0.05) / (b + 0.05)

with sync_playwright() as p:
    b = p.chromium.launch()

    print("1) Estado inicial (sem importação)")
    ctx, pg = pagina(b)
    confere(contador(pg) == "Exibindo 0 de 0 registros", "contador zerado: %r" % contador(pg))
    desativados = pg.evaluate("[...document.querySelectorAll('#filtros input, #filtros select, #filtros button')].map(e => e.disabled)")
    confere(len(desativados) == 8 and all(desativados), "pesquisa, 6 filtros e 'Limpar filtros' desativados (nada a filtrar): %s" % desativados)
    confere(all(opcoes(pg, i) == [TODOS_TXT[i]] for i in IDS), "cada filtro só tem a opção 'Todos...' (nada inventado)")
    confere(n_cartoes(pg) == 0 and "Nenhuma planilha importada" in pg.inner_text("#lista-cartoes"), "orientação de importar, sem cartões")
    confere(pg.logs == [], "0 erros de console no carregamento: %s" % pg.logs)

    print("2) Importação: opções geradas da planilha, contador, ordem")
    importar(pg, A)
    confere(n_cartoes(pg) == 12 and nomes(pg) == sorted(NOME), "12 cartões (composição da planilha; a ordem é por urgência, ver e2e_etapa8.py)")
    confere(contador(pg) == "Exibindo 12 de 12 registros", "contador: %r" % contador(pg))
    ativos = pg.evaluate("[...document.querySelectorAll('#filtros input, #filtros select, #filtros button')].map(e => e.disabled)")
    confere(not any(ativos), "controles ativados após importar")
    for i in IDS:
        confere(opcoes(pg, i) == [TODOS_TXT[i]] + OPCOES[i], "opções de %s: %s" % (i, opcoes(pg, i)))
    confere(estado_ui(pg) == LIMPO, "tudo em 'Todos' e pesquisa vazia")
    confere(len(pg.query_selector_all("#lista-cartoes .cartoes__grade")) == 1 and len(pg.query_selector_all("article.cartao")) == 12, "uma única lista de colaboradores (sem lista paralela)")
    ref_card = pg.inner_html("#lista-cartoes article.cartao:first-child")

    print("3) Cada filtro individualmente (todas as opções)")
    for i in IDS:
        ok_i = True
        for rot, esp in ESP[i].items():
            escolher(pg, i, rot)
            got = nomes(pg)
            if got != nums(esp) or contador(pg) != "Exibindo %d de 12 registros" % len(esp) or n_cartoes(pg) != len(esp):
                ok_i = False; print("      divergência em %s = %s: %s | %s" % (i, rot, got, contador(pg)))
        todos(pg, i)
        confere(ok_i and n_cartoes(pg) == 12, "filtro %s: %d opções conferidas (cartões e contador) e 'Todos' restaura" % (i, len(ESP[i])))
    escolher(pg, "situacao", "VENCIDO")
    selos = {e.inner_text() for e in pg.query_selector_all("#lista-cartoes .cartao__selo")}
    confere(selos == {"VENCIDO"}, "filtro de situação mostra só selos VENCIDO")
    todos(pg, "situacao")
    escolher(pg, "funcao", "Não informada")
    textos = [e.inner_text() for e in pg.query_selector_all("#lista-cartoes article.cartao")]
    confere(len(textos) == 2 and all("Função\nNão informada" in t or "FUNÇÃO\nNão informada" in t or "Não informada" in t.split("Função")[1][:40] for t in textos), "função 'Não informada' = cartões que exibem 'Não informada' em Função (inclui o valor 0)")
    todos(pg, "funcao")
    confere(pg.inner_html("#lista-cartoes article.cartao:first-child") == ref_card, "o conteúdo do cartão não muda com a filtragem")

    print("4) Combinações")
    for desc, escolhas, esp in [
        ("supervisor ANA + situação VENCIDO", {"supervisor": "ANA TESTE", "situacao": "VENCIDO"}, [1, 11]),
        ("gerente GER DOIS + loja 26", {"gerente": "GER DOIS", "loja": "26"}, [3, 4, 12]),
        ("função CAIXA + município ALFA + EM DIA", {"funcao": "CAIXA", "municipio": "ALFA", "situacao": "EM DIA"}, [2]),
        ("supervisor e função 'Não informada'", {"supervisor": "Não informada", "funcao": "Não informada"}, [5]),
        ("seis filtros juntos", {"supervisor": "BRUNO TESTE", "gerente": "GER DOIS", "loja": "26", "funcao": "FARMACÊUTICO", "municipio": "BETA", "situacao": "EM DIA"}, [12]),
    ]:
        for i, r in escolhas.items(): escolher(pg, i, r)
        confere(nomes(pg) == nums(esp) and contador(pg) == "Exibindo %d de 12 registros" % len(esp), "%s -> %s" % (desc, contador(pg)))
        limpar(pg)
    escolher(pg, "supervisor", "BRUNO TESTE"); escolher(pg, "gerente", "GER DOIS"); escolher(pg, "loja", "26")
    todos(pg, "gerente")
    confere(nomes(pg) == nums([3, 4, 12]), "ao voltar um filtro para 'Todos' os outros continuam valendo (BRUNO + loja 26)")
    limpar(pg)

    print("5) Pesquisa por nome (digitando)")
    for desc, texto, esp in [
        ("sem acento acha nome com acento ('jose')", "jose", [1]), ("maiúsculas e acento ('JOSÉ')", "JOSÉ", [1]),
        ("minúsculas ('josé da silva')", "josé da silva", [1]), ("'conceicao' -> CONCEIÇÃO", "conceicao", [2]),
        ("'JOÃO' -> JOAO", "JOÃO", [3]), ("'alvaro' -> ÁLVARO", "alvaro", [4]), ("'lucia acai' -> LÚCIA AÇAÍ", "lucia acai", [5]),
        ("parte do nome ('jo')", "jo", [1, 3]), ("espaços sobrando", "  da   silva ", [1]), ("sem resultado ('zzz')", "zzz", []),
    ]:
        pesquisar(pg, texto)
        confere(nomes(pg) == nums(esp) and contador(pg) == "Exibindo %d de 12 registros" % len(esp), "%s -> %d" % (desc, len(esp)))
    pg.fill("#filtro-busca", ""); pg.click("#filtro-busca"); pg.keyboard.type("Álvaro")
    confere(nomes(pg) == nums([4]) and pg.evaluate("document.activeElement.id") == "filtro-busca", "digitação tecla a tecla funciona e o foco permanece no campo")
    pg.keyboard.press("Control+A"); pg.keyboard.press("Backspace")
    confere(n_cartoes(pg) == 12 and contador(pg) == "Exibindo 12 de 12 registros", "apagar a pesquisa volta a mostrar todos")
    pesquisar(pg, "teste"); escolher(pg, "supervisor", "CARLA TESTE")
    confere(nomes(pg) == nums([8, 9, 10]), "pesquisa + filtro funcionam juntos")
    limpar(pg)

    print("6) Botão 'Limpar filtros'")
    pesquisar(pg, "silva")
    for i, r in {"situacao": "VENCIDO", "supervisor": "ANA TESTE", "gerente": "GER UM", "loja": "7", "funcao": "CAIXA", "municipio": "ALFA"}.items(): escolher(pg, i, r)
    confere(n_cartoes(pg) == 1 and estado_ui(pg)["busca"] == "silva", "pesquisa + 6 filtros aplicados: %s" % contador(pg))
    limpar(pg)
    confere(estado_ui(pg) == LIMPO and n_cartoes(pg) == 12 and contador(pg) == "Exibindo 12 de 12 registros", "pesquisa e 6 filtros restaurados; 12 cartões")

    print("7) Nenhum resultado")
    escolher(pg, "supervisor", "CARLA TESTE"); escolher(pg, "municipio", "ALFA")
    msg = pg.inner_text("#lista-cartoes")
    confere(n_cartoes(pg) == 0 and "Nenhum colaborador encontrado" in msg and "Limpar filtros" in msg, "mensagem clara e nenhum cartão: %r" % msg[:90])
    confere(contador(pg) == "Exibindo 0 de 12 registros", "contador: %r" % contador(pg))
    confere("Nenhuma planilha importada" not in msg and "não tem registros" not in msg, "não confunde com 'sem planilha' nem 'planilha vazia'")
    pesquisar(pg, "zzz"); limpar(pg)
    confere(n_cartoes(pg) == 12 and "Nenhum colaborador" not in pg.inner_text("#lista-cartoes"), "limpar tira a mensagem e volta a lista")

    print("8) Indicadores gerais permanecem globais")
    confere(indicadores(pg) == IND_A, "antes de filtrar: %s" % indicadores(pg))
    escolher(pg, "supervisor", "CARLA TESTE"); pesquisar(pg, "daniela")
    confere(n_cartoes(pg) == 1 and indicadores(pg) == IND_A, "com 1 cartão filtrado os 7 indicadores seguem iguais")
    escolher(pg, "municipio", "ALFA")
    confere(n_cartoes(pg) == 0 and indicadores(pg) == IND_A, "com resultado vazio os 7 indicadores seguem iguais")
    limpar(pg)

    print("9) Teclado e acessibilidade")
    pg.click("#filtro-busca")
    ordem = [pg.evaluate("document.activeElement.id")]
    for _ in range(7):
        pg.keyboard.press("Tab"); ordem.append(pg.evaluate("document.activeElement.id"))
    confere(ordem == ["filtro-busca", "filtro-situacao", "filtro-supervisor", "filtro-gerente", "filtro-loja", "filtro-funcao", "filtro-municipio", "btn-limpar-filtros"], "ordem do Tab: %s" % ordem)
    contorno = pg.evaluate("(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth]; })()")
    confere(contorno[0] != "none" and contorno[1] != "0px", "foco visível no botão: %s" % contorno)
    rot = pg.evaluate("[...document.querySelectorAll('#filtros input, #filtros select')].map(e => e.labels.length === 1 ? e.labels[0].textContent : null)")
    confere(None not in rot and rot == ["Pesquisar colaborador", "Situação do ASO", "Supervisor", "Gerente", "Loja", "Função", "Município"], "todos os controles têm <label>: %s" % rot)
    confere(pg.get_attribute("#filtros-contador", "role") == "status" and pg.get_attribute("#filtros-contador", "aria-live") == "polite", "contador anunciado (role=status, aria-live=polite)")
    pg.keyboard.press("Enter")
    confere(pg.evaluate("document.activeElement.id") == "btn-limpar-filtros", "Enter no botão não quebra a página")

    print("10) Segunda importação válida: opções e resultados novos, seleções anteriores limpas")
    pesquisar(pg, "jose"); escolher(pg, "supervisor", "ANA TESTE")
    importar(pg, B)
    confere(estado_ui(pg) == LIMPO, "pesquisa e filtros voltaram ao estado inicial: %s" % estado_ui(pg))
    confere(nomes(pg) == sorted(["SEGUNDA BASE UM", "SEGUNDA BASE DOIS", "SEGUNDA BASE TRES"]) and contador(pg) == "Exibindo 3 de 3 registros", "3 cartões da nova base; contador %r" % contador(pg))
    confere(opcoes(pg, "supervisor") == [TODOS_TXT["supervisor"], "SUP B1", "SUP B2"] and opcoes(pg, "municipio") == [TODOS_TXT["municipio"], "OMEGA", "SIGMA"], "opções vêm só da nova base: %s" % opcoes(pg, "supervisor"))
    confere(opcoes(pg, "situacao") == [TODOS_TXT["situacao"], "VENCIDO", "EM DIA"], "situações só as presentes: %s" % opcoes(pg, "situacao"))
    confere(not any("Não informada" in opcoes(pg, i) for i in IDS), "sem 'Não informada' quando nenhum registro está sem o campo")
    escolher(pg, "supervisor", "SUP B2")
    confere(n_cartoes(pg) == 2 and indicadores(pg)["total"] == "3", "filtrar na nova base: 2 de 3; indicador total = 3")

    print("11) Importação inválida preserva tudo")
    pesquisar(pg, "base"); escolher(pg, "gerente", "GER B")
    antes = {"html": pg.inner_html("#lista-cartoes"), "ui": estado_ui(pg), "contador": contador(pg), "ops": {i: opcoes(pg, i) for i in IDS}, "ind": indicadores(pg)}
    importar(pg, RUIM)
    confere("não importado" in pg.inner_text("#importacao-status"), "erro de importação exibido")
    confere(pg.inner_html("#lista-cartoes") == antes["html"] and estado_ui(pg) == antes["ui"] and contador(pg) == antes["contador"], "cartões, pesquisa, filtros e contador mantidos: %s" % contador(pg))
    confere({i: opcoes(pg, i) for i in IDS} == antes["ops"] and indicadores(pg) == antes["ind"], "opções e indicadores mantidos")
    confere(not pg.evaluate("document.getElementById('filtro-busca').disabled"), "controles continuam ativos")
    limpar(pg)

    print("12) Console, rede e armazenamento")
    confere(pg.logs == [], "0 erros/avisos de console no fluxo todo: %s" % pg.logs)
    confere(all(u.startswith("file://") for u in pg.reqs), "somente requisições a arquivos locais (%d)" % len(pg.reqs))
    arm = pg.evaluate("""async () => ({ls: localStorage.length, ss: sessionStorage.length, ck: document.cookie,
        idb: (indexedDB.databases ? (await indexedDB.databases()).length : 0), caches: (await caches.keys()).length})""")
    confere(arm == {"ls": 0, "ss": 0, "ck": "", "idb": 0, "caches": 0}, "nada gravado no navegador (nem pesquisa nem filtros): %s" % arm)
    csp = pg.get_attribute("meta[http-equiv=Content-Security-Policy]", "content")
    confere(csp == "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'", "CSP original mantida")
    ctx.close()
    ctx, pg = pagina(b)
    confere(contador(pg) == "Exibindo 0 de 0 registros" and estado_ui(pg) == LIMPO, "ao recarregar, volta ao estado inicial (nada persistido)")
    ctx.close()

    print("13) Texto malicioso e valores muito longos nos filtros")
    ctx, pg = pagina(b)
    importar(pg, X)
    confere(pg.evaluate("window.__xss") is None, "nenhum script executou")
    confere(pg.evaluate("document.querySelectorAll('#filtros img, #filtros script, #filtros select *:not(option)').length") == 0, "nenhuma tag injetada nos filtros")
    ataque_norm = " ".join(ATAQUE.split())
    confere(ataque_norm in opcoes(pg, "supervisor") and ataque_norm.upper() in opcoes(pg, "funcao"), "o ataque aparece como TEXTO literal nas opções (função em maiúsculas, como nos cartões)")
    escolher(pg, "supervisor", ataque_norm)
    confere(n_cartoes(pg) == 1 and pg.evaluate("window.__xss") is None and pg.evaluate("document.querySelectorAll('#lista-cartoes img, #lista-cartoes script').length") == 0, "filtrar pelo valor malicioso: 1 cartão, texto escapado, nada executa")
    limpar(pg)
    pesquisar(pg, "onerror")
    confere(n_cartoes(pg) == 1 and pg.evaluate("window.__xss") is None, "pesquisar pelo texto do ataque acha o cartão sem executar")
    pesquisar(pg, "")
    for w in (1280, 390):
        pg.set_viewport_size({"width": w, "height": 900})
        confere(sem_rolagem(pg) and dentro_da_tela(pg), "%dpx: valores longos não geram rolagem horizontal nem estouram o bloco de filtros" % w)
    confere(pg.logs == [], "0 erros de console: %s" % pg.logs)
    ctx.close()

    print("14) Desempenho e escala (341 registros, como a planilha real)")
    ctx, pg = pagina(b)
    importar(pg, P)
    confere(n_cartoes(pg) == P_N and contador(pg) == "Exibindo %d de %d registros" % (P_N, P_N), "341 cartões, contador %r" % contador(pg))
    esp_sup3 = len([i for i in range(P_N) if i % 7 == 3])
    escolher(pg, "supervisor", "SUP 3")
    confere(n_cartoes(pg) == esp_sup3, "supervisor SUP 3: %d cartões" % n_cartoes(pg))
    esp_comb = len([i for i in range(P_N) if i % 7 == 3 and i % 5 == 1])
    escolher(pg, "gerente", "GER 1")
    confere(n_cartoes(pg) == esp_comb, "SUP 3 + GER 1: %d cartões (esperado %d)" % (n_cartoes(pg), esp_comb))
    limpar(pg)
    esp_maria = len([n for n in P_NOMES if "maria" in n.lower()])
    pesquisar(pg, "maria")
    confere(n_cartoes(pg) == esp_maria and contador(pg) == "Exibindo %d de %d registros" % (esp_maria, P_N), "pesquisa 'maria': %d cartões (esperado %d)" % (n_cartoes(pg), esp_maria))
    limpar(pg)
    # tempo até a PINTURA (2 quadros) dentro da página: redesenho da lista inteira (pior caso) e 1ª letra digitada (descarta pouco)
    med = pg.evaluate("""async () => {
        const inp = document.getElementById('filtro-busca');
        const quadros = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const tempo = async fn => { const t0 = performance.now(); fn(); await quadros(); return performance.now() - t0; };
        const mediana = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
        const digitar = v => { inp.value = v; inp.dispatchEvent(new Event('input', {bubbles: true})); };
        const inteira = [], letra = [];
        for (let i = 0; i < 9; i++) { digitar(''); await quadros(); inteira.push(await tempo(() => digitar(' '))); letra.push(await tempo(() => digitar(i % 2 ? 'a' : 'e'))); }
        digitar(''); await quadros();
        return [Math.round(mediana(inteira)), Math.round(mediana(letra))]; }""")
    confere(med[0] < 500 and med[1] < 500, "341 cartões: redesenho completo até pintar = %d ms; 1ª letra digitada = %d ms (limite folgado: 500 ms)" % tuple(med))
    ctx.close()

    print("15) Fusos horários (filtro de situação coerente com os selos)")
    for tz in ("America/Los_Angeles", "Pacific/Auckland"):
        ctx, pg = pagina(b, tz=tz)
        importar(pg, A)
        soma, coerente = 0, True
        for rot in opcoes(pg, "situacao")[1:]:
            escolher(pg, "situacao", rot)
            selos = {e.inner_text() for e in pg.query_selector_all("#lista-cartoes .cartao__selo")}
            coerente &= selos == {rot} and contador(pg) == "Exibindo %d de 12 registros" % n_cartoes(pg)
            soma += n_cartoes(pg)
        confere(coerente and soma == 12 and pg.logs == [], "[%s] cada situação mostra só o seu selo; soma das opções = 12" % tz)
        ctx.close()

    print("16) Temas claro/escuro × 1280/390 px (layout e contraste)")
    for tema in ("light", "dark"):
        for w in (1280, 390):
            ctx, pg = pagina(b, tema, w)
            sw0 = sem_rolagem(pg) and dentro_da_tela(pg)
            pg.screenshot(path=os.path.join(tmp, f"filtros_vazio_{tema}_{w}.png"))
            importar(pg, G)
            sw1 = sem_rolagem(pg) and dentro_da_tela(pg)
            pg.screenshot(path=os.path.join(tmp, f"filtros_{tema}_{w}.png"), full_page=True)
            escolher(pg, "supervisor", "SUP 2"); pesquisar(pg, "teste")
            sw2 = sem_rolagem(pg) and dentro_da_tela(pg)
            confere(n_cartoes(pg) > 0, "%s %dpx: SUP 2 + pesquisa 'teste' ainda tem resultados (%s)" % (tema, w, contador(pg)))
            pesquisar(pg, "zzz")
            vazio = n_cartoes(pg) == 0 and "Nenhum colaborador encontrado" in pg.inner_text("#lista-cartoes")
            sw3 = sem_rolagem(pg) and dentro_da_tela(pg)
            pg.screenshot(path=os.path.join(tmp, f"filtros_vazio_resultado_{tema}_{w}.png"), full_page=True)
            confere(sw0 and sw1 and sw2 and sw3 and vazio and pg.logs == [], "%s %dpx: sem rolagem horizontal e tudo dentro da tela (sem dados, com dados, filtrado, sem resultado), sem erros" % (tema, w))
            colunas = pg.evaluate("getComputedStyle(document.querySelector('.filtros__campos')).gridTemplateColumns.split(' ').length")
            confere(colunas == (3 if w == 1280 else 1), "%s %dpx: filtros em %d coluna(s)" % (tema, w, colunas))
            pares = pg.evaluate("""() => [['#filtro-busca', null], ['#filtro-situacao', null], ['#filtros-contador', null], ['#btn-limpar-filtros', null]].map(([s]) => {
                const el = document.querySelector(s); const cs = getComputedStyle(el);
                let bg = cs.backgroundColor; let n = el;
                while ((bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && n.parentElement) { n = n.parentElement; bg = getComputedStyle(n).backgroundColor; }
                return [s, cs.color, bg]; })""")
            lab = pg.evaluate("[getComputedStyle(document.querySelector('.filtros label')).color, getComputedStyle(document.querySelector('.filtros')).backgroundColor]")
            baixos = [(s, round(contraste(c, bg), 2)) for s, c, bg in pares if contraste(c, bg) < 4.5]
            if contraste(lab[0], lab[1]) < 4.5: baixos.append(("label", round(contraste(lab[0], lab[1]), 2)))
            confere(not baixos, "%s %dpx: contraste de texto >= 4.5:1 (busca, select, contador, botão, rótulos)%s" % (tema, w, (" — baixos: %s" % baixos) if baixos else ""))
            borda = pg.evaluate("[getComputedStyle(document.querySelector('#filtro-busca')).borderTopColor, getComputedStyle(document.querySelector('.filtros')).backgroundColor, getComputedStyle(document.querySelector('#filtro-busca')).backgroundColor]")
            confere(borda[2] != borda[1] or borda[0] != borda[1], "%s %dpx: o campo se distingue do fundo do bloco" % (tema, w))
            ctx.close()
    ctx, pg = pagina(b, "light", 320); importar(pg, G)
    colunas = pg.evaluate("getComputedStyle(document.querySelector('.filtros__campos')).gridTemplateColumns.split(' ').length")
    confere(sem_rolagem(pg) and dentro_da_tela(pg) and colunas == 1 and pg.logs == [], "320px: 1 coluna, sem rolagem horizontal, tudo dentro da tela")
    ctx.close()
    print("   capturas em", tmp)
    b.close()

print("\nFALHAS: %d" % len(falhas) if falhas else "\nTudo certo.")
sys.exit(1 if falhas else 0)
