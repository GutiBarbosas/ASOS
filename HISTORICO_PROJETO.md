# Histórico do Projeto — Dashboard de Controle de ASO

> Documento de continuidade: permite retomar o projeto em outra conta/conversa sem depender das anteriores.
> **Ao iniciar qualquer etapa:** ler este arquivo e o `README.md`, listar os arquivos atuais e só então alterar algo.
> **Ao concluir qualquer etapa:** atualizar este arquivo (etapa, arquivos, testes, problemas, próxima etapa).

## 1. Objetivo
Dashboard simples, profissional e responsivo para acompanhar os ASOs dos colaboradores (vencidos, próximos do
vencimento, em dia), semelhante visualmente ao dashboard de colaboradores. Fonte de dados: a planilha que o RH mantém no
Google Sheets, **importada manualmente** pelo usuário (download em .xlsx ou .csv e seleção do arquivo na página).
Desenvolvimento em etapas pequenas, cada uma só começa após aprovação do usuário.

## 2. Referência (não modificar)
Projeto `dashboard-colaboradores` (enviado em ZIP): site estático HTML/CSS/JS puro, sem build nem bibliotecas.
- Arquivos: `index.html`, `css/styles.css`, `js/{utils,filters,render,birthdays,contracts,gender,script}.js`,
  `data/colaboradores.js` (`window.COLABORADORES_DADOS`), `scripts/xlsx_para_js.py`, README e histórico.
- Padrões reaproveitados: objetos por módulo com `render(lista)`; `Filters.campos` como lista de configuração (selects
  gerados sozinhos, opção "Não informada"); busca sem acento com debounce de 150 ms; datas com `Date.UTC`;
  `Utils.escapar` em todo HTML montado; "visão" normalizada sem alterar os dados originais; script Python que grava só
  uma lista fixa de campos; tema claro/escuro por `prefers-color-scheme`; cabeçalho escuro; cartões em grid `auto-fill`.
- Etapa 2 usou só a paleta/estrutura visual dela; nenhum arquivo da referência foi alterado.

## 3. Fonte de dados: planilha do RH (exemplo analisado: `BASE_ASO.xlsx`, em 13/10/2026)
A planilha **não faz parte do projeto nem do Git**. O arquivo de exemplo tinha a aba `BASE`, **341 registros**, 12 colunas, sem linhas vazias e sem nomes duplicados.

| Coluna | Uso no dashboard |
|---|---|
| SUPERVISOR, GERENTE, FUNÇÃO, MUNICIPIO, LOJA, COLABORADOR | Sim (exibição e filtros) |
| ADMISSÃO | Opcional (exibição) |
| ULT_ASO, VENC | Sim (núcleo do cálculo) |
| ASO_STATUS | Não (fórmula com `TODAY()`; o dashboard recalcula) |
| CPNJ | **Não** (CNPJ da loja; cabeçalho escrito assim na planilha) |
| DT_NASC | **Não** (dado pessoal sem função neste dashboard) |

Fórmulas da planilha: `VENC = ULT_ASO + 360`; `ASO_STATUS = SEM DATA / VENCIDO / PRÓXIMO DO VENCIMENTO (≤30 dias) / EM DIA`.
Os 341 registros têm exatamente 360 dias entre `ULT_ASO` e `VENC`.

Situação em 13/10/2026 (referência histórica; **não** fixar no código): **VENCIDO 135 · PRÓXIMO 16 · EM DIA 190** (soma 341),
igual à coluna `ASO_STATUS` da planilha nessa data (sem contar a regra de data inconsistente, ver abaixo). Com a regra da Etapa 4 os
190 se dividem em **EM DIA 183 + DATA INCONSISTENTE 7**.
Vencidos por faixa: até 30 dias 14 · 31–180 dias 27 · 181–365 dias 15 · mais de 365 dias 79.

Ocorrências conhecidas na planilha (não corrigir a planilha; tratar no script/dashboard e avisar):
- `FUNÇÃO`: 1 registro com valor `0` e 1 com "Gerente" (fora do padrão MAIÚSCULAS) — normalizar com `trim().toUpperCase()` e `0` → "não informada", como na referência.
- `DT_NASC` com `-` em 1 registro (irrelevante: o campo não é carregado).
- **7 registros com `ULT_ASO` no futuro** (de 17/10/2026 a 18/09/2027; lojas 9, 26 e 32). Hoje aparecem como "EM DIA" na planilha.
- 86 registros com `ULT_ASO` anterior à `ADMISSÃO`: normal (ASO admissional), **não é erro**.
- 3 lojas (4, 6, 9) com 2 CNPJs; 3 lojas com mais de um gerente; 3 lojas com mais de um município (irrelevante para CNPJ; relevante para filtros por loja/gerente).
- 2 textos com espaços sobrando (aplicar `trim`).

## 4. Decisões aprovadas pelo usuário
1. **Hospedagem:** uso local para desenvolver e testar. Não publicar dados reais em GitHub Pages público. A forma de disponibilização será decidida depois, restringindo o acesso aos dados dos colaboradores.
2. **Janela de alerta:** 30 dias (mesma da planilha).
3. **Vencimento:** a coluna `VENC` é a referência oficial (`ULT_ASO + 360`). **Não alterar essa regra**; não recalcular `VENC`.
4. **`ULT_ASO` no futuro:** classificar como **"Data inconsistente"**, em grupo separado, **nunca como "Em dia"**. Não corrigir nem descartar automaticamente.

5. **(Etapa 3) Importação manual:** a fonte é a planilha do Google Sheets, baixada pelo usuário e selecionada na página. **Não** buscar pelo link publicado do Google Sheets e não depender de URL pública. Formatos: `.xlsx` e `.csv`.
6. **(Etapa 3) Privacidade:** processar só no navegador; não enviar a servidores; não gravar em `localStorage`/`sessionStorage`/IndexedDB nem em arquivos; **não manter base real fixa** (nada de `data/aso.js`); nenhum dado real no HTML, JS, README, histórico ou repositório; `*.xlsx` e `*.csv` no `.gitignore`. Recarregar a página = importar de novo.
7. **(Etapa 3) Biblioteca:** leitura de `.xlsx` com biblioteca local, sem CDN e sem rastreadores.

**Planejamento corrigido na Etapa 3:** a Etapa 2 previa `scripts/xlsx_para_js.py` gerando `data/aso.js` com dados reais. Isso foi **abandonado**
(contraria as decisões 5 e 6). As pastas `data/` e `scripts/` foram removidas; `data/` ficou no `.gitignore` só como proteção extra.

Decisões técnicas minhas (Etapa 3, podem ser revistas):
- Biblioteca escolhida: **read-excel-file 9.3.12** (MIT, bundle de 48 KB, sem requisições de rede). A alternativa mais comum, SheetJS (`xlsx`), não foi usada: o CDN oficial estava inacessível neste ambiente e a última versão no npm (0.18.5) tem vulnerabilidades conhecidas ao ler arquivos manipulados.
- Política `Content-Security-Policy` na página (`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'`): impede, por construção, qualquer envio de dados pela rede. **Ao adicionar recursos novos (gráficos, fontes, etc.), lembrar de ajustar essa política** — ou será bloqueado.
- Datas ambíguas: só o formato brasileiro (DD/MM/AAAA) é aceito; `10/13/2026` e ano de 2 dígitos viram "data inválida" com aviso (nunca adivinhar).
- Datas do `.xlsx` chegam como `Date` em UTC (meia-noite): usar sempre `getUTC*()`; com `getDate()` o dia sai errado no fuso do Brasil (bug evitado e testado).
- Registros em memória congelados (`Object.freeze`) e só com os 9 campos necessários + `linha` (nº da linha da planilha, usado em avisos).

## 5. Regras de cálculo (implementadas na Etapa 4, em `js/aso.js` + `js/utils.js`)
Datas comparadas sem hora, com `Date.UTC`. `hoje` = dia local do navegador (`Utils.dataLocalISO`); `dias = VENC − hoje`.
Ordem de avaliação (a primeira regra que valer encerra):
1. `ULT_ASO` > hoje → **DATA INCONSISTENTE** (grupo separado; vale mesmo com `VENC` válida; nunca "Em dia").
2. `VENC` ausente ou inválida → **SEM DATA**.
3. `dias < 0` → **VENCIDO** (exibir "vencido há N dias").
4. `dias = 0` → **VENCE HOJE** (situação própria; antes, no planejamento, era parte de "Próximo").
5. `1 ≤ dias ≤ 30` → **PRÓXIMO DO VENCIMENTO**.
6. `dias > 30` → **EM DIA**.
`ULT_ASO` vazio/inválido não gera inconsistência e não é inventado (a situação sai de `VENC`). Constante `Aso.DIAS_ALERTA = 30`.
Na base de 13/10/2026 o efeito esperado era: VENCIDO 135 · PRÓXIMO 16 · EM DIA 183 · DATA INCONSISTENTE 7 (se algum registro vencesse
exatamente em 13/10, ele sairia de "Próximo" para "Vence hoje").

## 6. Estrutura atual (fim da Etapa 8)
```
index.html · css/styles.css · README.md · HISTORICO_PROJETO.md · .gitignore
js/importador.js     lógica de importação (CSV, datas, cabeçalhos, validação) — roda também no Node
js/dados.js          base em memória: Dados.obter() / temDados() / resumo(); evento "aso:dados-carregados"
js/utils.js          (Etapa 4) datas por dia: isoParaUTC, dataValida, dataLocalISO, diferencaDias — roda também no Node
js/aso.js            (Etapa 4) situação do ASO: calcularSituacao (função central), calcular, contar, obter, resumo, recalcular;
                     escuta "aso:dados-carregados" e dispara "aso:situacoes-calculadas" — roda também no Node
js/render.js         (Etapa 5) cartões: html(item), htmlLista(itens, temArquivo), atualizar(); escuta "aso:situacoes-calculadas"; área #lista-cartoes
js/script.js         botão "Importar planilha" e mensagens
js/vendor/           read-excel-file.min.js (+ licença e LEIA-ME.txt)
tests/               teste_importador.js, teste_aso.js, teste_render.js, teste_indicadores.js (Node) e e2e_importacao.py, e2e_cartoes.py, e2e_indicadores.py (Playwright)
js/indicadores.js    (Etapa 6) indicadores gerais: valores(itens) (usa Aso.contar), consistente, atualizar(); escuta "aso:situacoes-calculadas"; seção #indicadores
js/filters.js        (Etapa 7) pesquisa e filtros: normalizar, opcoesDe, filtrar (puras) + itensVisiveis/definir/limpar; escuta "aso:situacoes-calculadas"; entrega a lista filtrada ao Render; sem innerHTML
tests/               (Etapa 7) + teste_filtros.js (Node) e e2e_filtros.py (Playwright)
js/ordenacao.js      (Etapa 8) ordem por urgência: Ordenacao.ordenar(itens) (pura); aplicada pelo Render à lista já filtrada
js/atualizacao.js    (Etapa 8) virada de dia: temporizador único até a meia-noite (máx. 60 s) + visibilitychange/pageshow/focus; chama Aso.verificarDia()
tests/               (Etapa 8) + teste_ordenacao.js, teste_virada_dia.js (Node) e e2e_etapa8.py (Playwright)
```
Ordem dos `<script>` no `index.html` (Etapa 8): vendor → importador → dados → utils → aso → filters → **ordenacao** → render → indicadores → **atualizacao** → script. (Até a Etapa 7: vendor → importador → dados → utils → aso → **filters** → render → indicadores → script; os próximos módulos entram antes de `script.js`).
`filters.js` vem ANTES do `render.js` de propósito: ao importar, o evento chega primeiro aos filtros (que limpam o estado) e só depois ao Render (que desenha).
Módulos de tela devem escutar `aso:situacoes-calculadas` (não `aso:dados-carregados`) e ler `Aso.obter()`.

## 7. Cuidados com dados pessoais e ocupacionais (valem para todas as etapas)
- ASO é dado de saúde ocupacional (sensível na LGPD): minimizar campos, nada de resultado/apto/CID/CPF/salário.
- Não carregar `CPNJ` nem `DT_NASC`; não incluí-los em nenhuma exportação futura.
- Planilha fora do Git; **sem base de dados no projeto** (importação manual, só em memória). Nada de `localStorage`/`sessionStorage`/IndexedDB/cookies. A política CSP bloqueia rede; manter assim.
- Site estático não controla acesso por perfil: quem abre vê tudo. Acesso por loja/supervisor exige arquivos separados ou backend com login (decidir antes de compartilhar).
- Texto vindo do arquivo entra na página só com `textContent` (Etapa 3) ou `Utils.escapar` (cartões, Etapa 5); sem CDN nem rastreadores; bibliotecas só locais em `js/vendor/`.
- Este histórico e o README não devem conter nomes reais nem exemplos da planilha (citar ocorrências por loja/linha).
- Dado já publicado permanece no histórico do Git: manter `*.xlsx`/`*.csv` no `.gitignore`; testes usam só dados fictícios (a planilha real é argumento opcional do teste e nunca é copiada).
- Se a página for publicada, o código não expõe dados, mas a decisão de quem pode abri-la continua pendente (site estático não tem login).

## 8. Etapas

### Etapa 1 — Análise (concluída, sem código)
Análise do dashboard de referência e da planilha, estrutura sugerida, regra de vencimento, cuidados de privacidade e plano. Nada foi criado.

### Etapa 2 — Esqueleto do projeto (concluída em 13/10/2026)
- Confirmado antes de começar: pasta `dashboard-aso` não existia; nada a preservar.
- Criados: `index.html`, `css/styles.css`, `.gitignore`, `README.md`, `HISTORICO_PROJETO.md`, e pastas `js/`, `data/`, `scripts/` (com `.gitkeep`).
- `index.html`: cabeçalho "Controle de ASO" + aviso "Projeto em construção"; `noindex`; sem JavaScript e sem recursos externos.
- `css/styles.css`: paleta da referência (claro/escuro automático) + tokens de status já definidos (vencido, próximo, em dia, inconsistente), ainda sem uso.
- **Não implementado de propósito:** dados, script de conversão, cálculo, resumo, cartões, filtros.
- Dashboard de referência não foi alterado (14 arquivos, checksums SHA-256 idênticos antes e depois).

**Testes realizados (Chromium headless, página aberta via `file://`):**
| Teste | Resultado |
|---|---|
| Tema claro e escuro, 1280 px e 390 px | Página renderiza; título e fundo corretos nos 2 temas |
| Erros/avisos de console e requisições falhas | 0 nos 4 cenários |
| Rolagem horizontal | Nenhuma (scrollWidth = clientWidth) |
| Inspeção visual da captura em 390 px | Cabeçalho e aviso legíveis, sem quebra de layout |
Não foi testado: dados, filtros, cálculos (não existem ainda).

**Problemas conhecidos:** nenhum no esqueleto. Pendências de dados listadas na seção 3.

### Etapa 3 — Importação manual da planilha (concluída em 13/10/2026)
Antes de começar: lidos `HISTORICO_PROJETO.md` e `README.md`; estrutura da Etapa 2 conferida (só `index.html`, `css/styles.css`, docs, `.gitignore`).

**Implementado**
- Botão visível **"Importar planilha"** + seletor de arquivo (`.xlsx`, `.csv`); bloco de status com nome do arquivo, quantidade de registros, colunas descartadas e avisos.
- Leitura de `.xlsx` com `read-excel-file` local (aba `BASE` com prioridade; senão a primeira aba com todas as colunas). Leitura de `.csv` com parser próprio: UTF-8 com/sem BOM (fallback Windows-1252), delimitador detectado (`,` `;` tab), aspas, `""`, quebra de linha dentro de campo, linha `sep=`.
- Validação das 9 colunas obrigatórias (sem diferenciar maiúsculas, acentos nem espaços; cabeçalho pode estar até a 15ª linha). `CPNJ`, `DT_NASC`, `ASO_STATUS` e outras são descartadas na leitura.
- Datas: `Date`/serial do Excel, ISO e brasileiro → `"AAAA-MM-DD"`; vazio/`-` → `null`; inválida → `null` + aviso. Erros de fórmula (`#N/A`) → vazio + aviso.
- Estrutura inválida ou arquivo ilegível: mensagem de erro e **dados anteriores mantidos**. `lerArquivo` nunca lança exceção.
- Dados em memória (`Dados`), sem nenhuma gravação no navegador; evento `aso:dados-carregados`.
- **Não implementado de propósito:** cálculo de situação, indicadores, cartões, filtros.

**Arquivos criados:** `js/importador.js`, `js/dados.js`, `js/script.js`, `js/vendor/read-excel-file.min.js`, `js/vendor/LICENSE-read-excel-file.txt`, `js/vendor/LEIA-ME.txt`, `tests/teste_importador.js`, `tests/e2e_importacao.py`.
**Arquivos modificados:** `index.html` (bloco "Dados", CSP, scripts; removido o aviso "Projeto em construção"), `css/styles.css` (botões e bloco de importação; tokens `--msg-*`), `.gitignore`, `README.md`, `HISTORICO_PROJETO.md`.
**Removidos:** `data/` e `scripts/` (vazios, planejados na Etapa 2) e `js/.gitkeep`. Dashboard de referência não foi alterado (checksums SHA-256 idênticos).

**Testes realizados**
| Teste | Resultado |
|---|---|
| `node tests/teste_importador.js` (dados fictícios): cabeçalhos, datas (Date UTC, serial, ISO, BR, impossíveis, vazias), CSV (aspas, vírgula em campo, CRLF, `;`, `sep=`, BOM, Windows-1252, aspas abertas), validação, avisos sem nomes, extensões, `.xlsx` falso, nunca lançar exceção | 25 ok, 0 falhas |
| Navegador (Chromium): página carrega; 0 erros de console; só requisições `file://`; `fetch` externo bloqueado pela CSP | ok |
| XLSX fictício (datas Excel, texto BR, ISO, serial, inválida, vazia, linha vazia, colunas extras, 2 abas) | ok |
| CSV fictício (aspas, vírgula, acentos, ISO + BR) | ok |
| Arquivo sem coluna `VENC` e arquivo `.txt`: recusados; dados anteriores mantidos | ok |
| Reimportar o mesmo arquivo; recarregar a página zera os dados | ok |
| Nada em `localStorage`, `sessionStorage`, cookies, IndexedDB e Cache após importar | ok |
| **Planilha real (`BASE_ASO.xlsx`) em 3 fusos** (São Paulo, Los Angeles, Auckland): 341 registros, comparados campo a campo com a leitura independente (Python/openpyxl) | 0 divergências nos 3 |
| Mesma planilha convertida para CSV (datas `dd/mm/aaaa`): 341 registros | 0 divergências |
| CNPJ, nascimento e `ASO_STATUS` ausentes da memória; registros só com os 9 campos + `linha` | ok |
| Layout em claro/escuro × 1280/390 px, estados vazio/aviso/erro: sem rolagem horizontal, sem erros; capturas conferidas visualmente | ok |

**Ainda falta validar (não testado)**
- Importar **um arquivo baixado de fato do Google Sheets** (`.xlsx` e `.csv`) pelo usuário: os testes usaram arquivos gerados por Excel/openpyxl/Python. Atenção especial ao CSV: se a planilha estiver com região dos EUA, as datas virão `mm/dd/aaaa` e serão tratadas como inválidas (aviso) ou, se o dia for ≤ 12, lidas como `dd/mm` (ambíguo); conferir o formato das datas no arquivo baixado.
- Outros navegadores (só Chromium foi testado; Firefox/Safari/Edge pelo usuário) e o seletor de arquivo real (os testes usaram upload programático).
- Publicação no GitHub Pages (caminhos são relativos e não há módulos ES; CSP usa `'self'`), ainda não testada.
- Desempenho com arquivos muito maiores que ~350 linhas (limite de 25 MB implementado, não testado).

**Problemas conhecidos / observações**
- `FUNÇÃO` = `0` e `Gerente` (caixa diferente) continuam como estão na planilha; normalizar no módulo que usar (Etapa 5/7).
- Os 7 registros com `ULT_ASO` futuro continuam sendo importados normalmente (decisão 4 só entra no cálculo, Etapa 4).
- O aviso de "linhas totalmente vazias" conta também linhas em branco no fim da planilha.

### Etapa 4 — Cálculo da situação dos ASOs (concluída em 13/10/2026)
Antes de começar: lidos `HISTORICO_PROJETO.md` e `README.md`; analisados `importador.js`, `dados.js`, `script.js`, `index.html` e os testes;
`node tests/teste_importador.js` confirmado verde (25 ok). Importação e demais funcionalidades **não foram alteradas**.

**Implementado** (sem nenhuma interface nova: sem cartões, indicadores, filtros, gráficos nem exportações)
- `Aso.calcularSituacao(ult_aso, venc, hoje)`: função única com as regras da seção 5 e prioridade explícita no código; `hoje` inválido lança `TypeError`.
- `Aso.calcular(registros, hoje)` → lista congelada `{ registro, situacao, rotulo, dias }`, mesma ordem e **mesmos objetos** de `Dados.obter()` (nada é copiado nem alterado).
- `Aso.obter()` / `Aso.resumo()` / `Aso.contar()`; `Aso.recalcular()` é chamado ao ouvir `aso:dados-carregados` (cada importação válida substitui as situações) e dispara `aso:situacoes-calculadas`.
- `Aso.obter()` recalcula sozinho se o dia virou com a página aberta. `Aso.definirRelogio(fn)` existe só para testes.
- `Utils` (datas): comparação só por dia (`AAAA-MM-DD` + `Date.UTC`); "hoje" = dia local do navegador.
- Decisão: `VENC` ou `ULT_ASO` fora do formato `AAAA-MM-DD` (o importador já normaliza) são tratados como ausentes; não se reaproveitou `Importador.converterData` por aceitar vários formatos (aqui os dados já chegam normalizados).

**Arquivos criados:** `js/utils.js`, `js/aso.js`, `tests/teste_aso.js`.
**Arquivos modificados:** `index.html` (2 `<script>` novos, antes de `script.js`), `README.md`, `HISTORICO_PROJETO.md`.
**Não modificados:** `importador.js`, `dados.js`, `script.js`, `css/styles.css`, `tests/teste_importador.js`, `tests/e2e_importacao.py`, biblioteca em `js/vendor/`. CSP inalterada.

**Testes realmente executados (13/10/2026)**
| Teste | Resultado |
|---|---|
| `node tests/teste_importador.js` (existente, sem alteração) | 25 ok, 0 falhas |
| `node tests/teste_aso.js` (data controlada `2026-10-13`): vencimento ontem / hoje / amanhã / +30 / +31; fronteiras 29-360 dias; `VENC` vazia ou inválida (11 variações); `ULT_ASO` futuro (e prioridade sobre todas as faixas de `VENC`); `ULT_ASO` vazio ou inválido com `VENC` válida; virada de ano e ano bissexto; `hoje` inválido; originais intactos e `ASO_STATUS` ignorado; conferência com base fictícia de 341 registros (135/16/183/7); segunda importação após a primeira; importação inválida mantém situações; virada de dia com a página aberta; ausência de rede/armazenamento/`innerHTML` nos arquivos novos | 27 ok, 0 falhas no fuso da máquina |
| Mesma suíte em processos separados com `TZ` = São Paulo, Los Angeles, Auckland, Tóquio e UTC (`teste_aso.js` faz isso sozinho) | 27 ok, 0 falhas em cada um; total do comando: 32 ok, 0 falhas |
| `python3 -I tests/e2e_importacao.py` (Chromium, existente) | "Tudo certo": 0 erros de console, sem rede, nada gravado no navegador, sem rolagem horizontal |
| Navegador (Chromium, relógio fixado, planilhas fictícias `.xlsx`, 2 importações seguidas) em São Paulo, Los Angeles e Auckland | situações corretas em cada importação; a 2ª substituiu a 1ª; 0 erros de console. Em Auckland o "hoje" foi 14/10 (dia local de lá, como esperado) |

**Conferência dos números anteriores:** a planilha real (`BASE_ASO.xlsx`) **não foi enviada nesta etapa**, então a conferência com a base de
13/10/2026 **não foi feita com os dados reais**. Foi feita com uma base **fictícia** montada para ter a mesma distribuição (135 vencidos ·
16 próximos · 183 em dia · 7 inconsistentes = 341): a regra reproduz exatamente esses números. Falta rodar com a planilha real
(ver "Ainda falta validar").

**Ainda falta validar**
- Conferir `Aso.resumo()` com a planilha real, na mesma data de referência (13/10/2026 → esperado 135 · 16 · 183 · 7, com "vence hoje" = 0; se a base tiver
  vencimento exatamente nesse dia, ele sairá do grupo "próximos"). Se o relógio do computador estiver em outra data, os números mudam, como deve ser.
  Após carregar a planilha, no console do navegador: `Aso.resumo()`.
- Itens da Etapa 3 que continuam pendentes (arquivo baixado de fato do Google Sheets, outros navegadores, GitHub Pages).

**Limitações / observações**
- "Hoje" vem do relógio do computador do usuário; relógio errado = situações erradas (não há como evitar sem servidor).
- A lista `dias` e o cálculo usam só o dia; `ULT_ASO` futuro é comparado com o dia local de hoje (um ASO de amanhã já é inconsistente).
- `ULT_ASO` vazio com `VENC` válida é classificado normalmente por `VENC` (sem aviso próprio; os avisos de data vazia já vêm da importação).
- Registros com `ULT_ASO` futuro e `VENC` vazia/inválida ficam em DATA INCONSISTENTE (regra 1 tem prioridade sobre SEM DATA).
- Sem tela: nada do resultado é exibido ainda (só via `Aso.obter()` / `Aso.resumo()`).

### Etapa 5 — Cartões dos colaboradores (concluída em 13/10/2026)
Antes de começar: lidos `HISTORICO_PROJETO.md` e `README.md`; analisados `index.html`, `css/styles.css`, `aso.js`, `utils.js`, `dados.js`, `script.js`
e os testes. Importação, cálculo da situação e regras **não foram alterados** (`importador.js`, `dados.js`, `aso.js`, `script.js` intactos).

**Implementado**
- `js/render.js`: `Render.html(item)` (um cartão), `Render.htmlLista(itens, temArquivo)`, `Render.atualizar()`. Lê só `Aso.obter()`; **não recalcula** (testado com um
  item de situação "forçada"). Redesenha ao receber `aso:situacoes-calculadas` e uma vez ao carregar a página (estado inicial).
- Conteúdo do cartão: nome, selo da situação, texto de apoio, loja, função, supervisor, gerente, município, último ASO e vencimento (`dd/mm/aaaa`).
  Admissão **não** é exibida (não pedida); CNPJ/nascimento nunca chegam à memória.
- Textos de apoio: "Vencido há N dias" · "Vence hoje" · "Faltam N dias para vencer" · "Dentro do prazo" · "Data de vencimento não informada ou inválida" ·
  "Conferir a data cadastrada: a data do último ASO é posterior a hoje". Singular/plural tratado; nunca número negativo (atraso = |dias|, só em VENCIDO).
- Ausentes: "Não informada" (nome: "Nome não informado"). **Decisão:** na exibição, `FUNÇÃO` `0` = não informada e funções em maiúsculas (pendência registrada na
  seção 3); só na exibição, dados originais intactos.
- Estados: sem importação → mensagem orientando a importar; importação válida → um cartão por registro; 2ª importação válida → substitui a listagem;
  importação inválida → `script.js` não chama `Dados.definir`, logo nada muda (listagem preservada); planilha sem registros → "A planilha importada não tem registros para exibir."
- `Utils.escapar` (não existia; escapa `& < > " ' \``) e `Utils.formatarDataBR`. Única atribuição de `innerHTML` no projeto: `area.innerHTML = htmlLista(...)`, onde todo texto
  importado já passou por `escapar`; a classe CSS vem de lista fixa de códigos (nunca de texto livre). Um teste automático trava esse padrão.
- Visual: grade `auto-fill` (mín. 300 px), borda esquerda + selo coloridos por situação (6 distintas), tema claro/escuro; novos tokens `--vencehoje*` e `--semdata*`.
- **Não implementado de propósito:** indicadores/contadores, filtros, pesquisa, gráficos, exportações, ordenação por urgência (ordem = a da planilha).

**Arquivos criados:** `js/render.js`, `tests/teste_render.js`, `tests/e2e_cartoes.py`.
**Arquivos modificados:** `index.html` (seção "Colaboradores" com `#lista-cartoes` e `<script src="js/render.js">` antes de `script.js`), `css/styles.css` (cartões e 4 tokens),
`js/utils.js` (+`escapar`, +`formatarDataBR`), `README.md`, `HISTORICO_PROJETO.md`. CSP inalterada (nada novo precisou).

**Testes realmente executados (13/10/2026)**
| Teste | Resultado |
|---|---|
| `node tests/teste_importador.js` (existente) | 25 ok, 0 falhas |
| `node tests/teste_aso.js` (existente; inclui 5 fusos) | 32 ok, 0 falhas |
| `node tests/teste_render.js`: `escapar`, `formatarDataBR`, conteúdo, datas BR, sem campos fora do escopo, ausentes, `FUNÇÃO` 0, 6 situações (classe/selo/texto, distintas), atraso/restantes (1, 2, 400, 30 dias; sem negativos), não recalcula, XSS (só as tags do template existem), classe desconhecida, 1 cartão por registro, estados inicial/vazio, integração Dados→Aso→Render com 2ª importação, importação inválida, escaneamento de segurança | 28 ok, 0 falhas |
| `python3 -I tests/e2e_importacao.py` (existente) | "Tudo certo" |
| `python3 -I tests/e2e_cartoes.py` (Chromium, relógio fixado, arquivos `.xlsx` fictícios): estado inicial; 8 cartões; 6 situações com cores de borda distintas; datas `dd/mm/aaaa`; ausentes; payload `<img onerror>`/`<script>` em todos os campos → `window.__xss` indefinido, nenhuma tag injetada, texto literal; importação inválida mantém o HTML idêntico; 2ª importação substitui; 0 erros de console; só `file://`; nada em localStorage/sessionStorage/cookies/IndexedDB/Cache; recarregar volta ao estado inicial; claro/escuro × 1280/390 px com 60 cartões sem rolagem horizontal; fusos Los Angeles e Auckland | todos ok ("Tudo certo") |
Capturas conferidas visualmente (claro 1280 px e escuro 390 px): selos e faixas legíveis, texto malicioso quebra linha sem estourar o cartão.

**Ainda falta validar (não testado)**
- Com a **planilha real** (não enviada nas Etapas 4 e 5): conferir `Aso.resumo()` (esperado em 13/10/2026: 135 · 16 · 183 · 7) e a aparência/desempenho com ~341 cartões
  (testado com 60 fictícios). Também as pendências da Etapa 3 (arquivo baixado do Google Sheets, Firefox/Safari/Edge, GitHub Pages).

**Limitações / observações**
- Sem ordenação: os cartões seguem a ordem da planilha (urgência vem na Etapa 8). Sem contadores, filtros nem pesquisa (Etapas 6 e 7).
- Se a página ficar aberta e o dia virar, os cartões só se atualizam na próxima importação ou recarga (`Aso.obter()` recalcula, mas não há evento disparado por ele sozinho).
- Os cartões são redesenhados por completo a cada importação (simples e rápido para centenas de registros; revisar se a base crescer muito).
- Nomes longos ou texto sem espaços quebram linha dentro do cartão (`overflow-wrap:anywhere`).
- `FUNÇÃO` e demais textos continuam sem normalização nos dados; só a exibição trata `0` e maiúsculas. Filtros (Etapa 7) precisarão da mesma normalização.
- Lojas com mais de um gerente/município seguem como na planilha (cada registro mostra o próprio valor).

### Etapa 6 — Indicadores gerais (concluída em 13/10/2026)
Antes de começar: lidos `README.md` e `HISTORICO_PROJETO.md`; analisados `index.html`, `css/styles.css`, `aso.js`, `render.js`, `script.js`, `dados.js` e os testes;
`teste_importador`, `teste_aso` e `teste_render` confirmados verdes (25 + 32 + 28). Importação, cálculo da situação e cartões **não foram alterados**
(`importador.js`, `dados.js`, `utils.js`, `aso.js`, `render.js`, `script.js` intactos).

**Indicadores implementados** (somente informativos): Total de registros · Vencidos · Vencem hoje · Próximos do vencimento (em até 30 dias, `Aso.DIAS_ALERTA`) ·
Em dia · Sem data de vencimento válida · Data inconsistente.
- `js/indicadores.js`: `Indicadores.valores(itens)` devolve `Aso.contar(itens)` (nenhuma regra de cálculo nova); `consistente(v)` confere soma das 6 = total; `atualizar()` escreve os
  números com `textContent` nos elementos `[data-indicador]` do `index.html`. Escuta `aso:situacoes-calculadas` (e desenha uma vez ao carregar). Lê `Aso.obter()`; não usa `ASO_STATUS`.
- Estado inicial: "–" em tom neutro (`data-estado="vazio"`), sem sugerir dados. Após importação válida: números e bordas nas cores de situação (`data-estado="carregado"`). Planilha válida sem registros: zeros.
- Importação inválida: `script.js` não chama `Dados.definir`, nenhum evento é disparado, então indicadores e cartões ficam como na última importação válida.
- Interface: seção "Indicadores" entre "Dados" e "Colaboradores"; grade `auto-fit` (7 em uma linha em 1280 px; 2 colunas em 390 px com o total em linha própria); blocos sem botão/link/foco;
  números alinhados na base do bloco; tokens de cor dos cartões reaproveitados (claro/escuro). Nenhum redesenho do restante da página.
- **Não implementado de propósito:** filtros, pesquisa, indicadores clicáveis, gráficos, exportações, ordenação por urgência.

**Arquivos criados:** `js/indicadores.js`, `tests/teste_indicadores.js`, `tests/e2e_indicadores.py`.
**Arquivos modificados:** `index.html` (seção `#indicadores` e `<script src="js/indicadores.js">` entre `render.js` e `script.js`), `css/styles.css` (bloco "Indicadores gerais" no fim; comentário do cabeçalho),
`README.md`, `HISTORICO_PROJETO.md`. CSP inalterada (nada novo precisou). Nenhuma dependência nova, nenhuma requisição de rede.

**Testes realmente executados (13/10/2026, Node 22, Chromium via Playwright)**
| Teste | Resultado |
|---|---|
| `node tests/teste_importador.js` (existente) | 25 ok, 0 falhas |
| `node tests/teste_aso.js` (existente; inclui 5 fusos) | 32 ok, 0 falhas |
| `node tests/teste_render.js` (existente) | 28 ok, 0 falhas |
| `node tests/teste_indicadores.js` (novo): estado inicial; contagem de cada categoria; soma = total = `Aso.obter().length`; igualdade com `Aso.contar`; fronteiras (ontem, hoje, amanhã, +30, +31); data inconsistente fora de "Em dia"; `ASO_STATUS` ignorado; 2ª importação; importação inválida; planilha sem registros; só escuta `aso:situacoes-calculadas`; campos opcionais ausentes; 6 situações; virada de dia; segurança (sem rede/armazenamento/`innerHTML`/clique); HTML sem elementos clicáveis; dados originais intactos | 18 ok, 0 falhas |
| `python3 -I tests/e2e_importacao.py` (existente) | "Tudo certo" |
| `python3 -I tests/e2e_cartoes.py` (existente; 37 verificações) | "Tudo certo" |
| `python3 -I tests/e2e_indicadores.py` (novo; 50 verificações; relógio fixado em 13/10/2026): estado inicial ("–", sem cartões); 17 registros fictícios → 3·2·4·5·2·1 e total 17 = cartões; indicadores = selos dos cartões; cores distintas; sem elementos clicáveis e clique sem efeito; importação inválida mantém tudo; 2ª importação atualiza; campos opcionais ausentes; 0 erros/avisos de console; só `file://`; nada em localStorage/sessionStorage/cookies/IndexedDB/Cache; recarregar volta ao inicial; claro/escuro × 1280/390 px com 60 registros: sem rolagem horizontal (vazio e com dados), soma = total = 60, textos dentro dos blocos; 1280 px = 7 colunas, 390 px = 2 colunas; 320 px sem rolagem; fusos Los Angeles e Auckland | "Tudo certo" |
Capturas conferidas visualmente (estado inicial claro 1280 px; claro 1280 px e escuro 390 px com dados). Um ajuste feito após a inspeção: números alinhados na base dos blocos (o rótulo de 3 linhas de "Próximos" os desalinhava).

**Ainda falta validar (não testado)**
- Com a **planilha real** (não enviada nas Etapas 4, 5 e 6): conferir `Aso.resumo()` e os indicadores (esperado em 13/10/2026: total 341 · vencidos 135 · vencem hoje 0 · próximos 16 · em dia 183 ·
  sem data 0 · data inconsistente 7). Os testes usaram só dados fictícios.
- Pendências da Etapa 3 (arquivo baixado de fato do Google Sheets, Firefox/Safari/Edge, GitHub Pages).

**Limitações / observações**
- Se a página ficar aberta e o dia virar, os indicadores (como os cartões) só se atualizam na próxima importação ou recarga: `Aso.obter()` recalcula, mas não dispara evento sozinho
  (o teste cobre `Indicadores.atualizar()` chamado depois da virada).
- O total conta os registros **importados**: linhas totalmente vazias da planilha são descartadas pelo importador (com aviso) e não entram.
- Antes da importação o "–" é lido por leitores de tela como o próprio sinal; não há texto oculto adicional (decisão de manter o HTML simples).
- Indicadores não são clicáveis: a decisão de torná-los atalhos de filtro fica para a Etapa 7.
- Só Chromium foi usado nos testes de navegador.

### Etapa 7 — Pesquisa e filtros (concluída em 13/10/2026)
Antes de começar: lidos `README.md` e `HISTORICO_PROJETO.md`; analisados `index.html`, `css/styles.css`, `aso.js`, `render.js`, `indicadores.js`, `script.js`, `dados.js`, `utils.js` e os testes;
os 7 testes existentes confirmados verdes (25 + 32 + 28 + 18 no Node; 31 + 37 + 50 verificações no navegador).

**Implementado**
- `js/filters.js` (módulo `Filtros`): pesquisa por nome (sem diferenciar caixa nem acentos; trecho do nome) + 6 filtros (Situação do ASO, Supervisor, Gerente, Loja, Função, Município), usados sozinhos ou em conjunto (interseção).
  Opções geradas da base importada, ordenadas (lojas em ordem numérica); `Não informada` só existe se houver registro sem o campo (mesma regra dos cartões: vazio ou, em Função, `0`). Situação lista só as presentes.
- Os filtros atuam sobre os cartões existentes: `Render.atualizar()` passa a desenhar `Filtros.itensVisiveis()` (mesmos objetos de `Aso.obter()`, ordem da planilha). Continua havendo uma única lista; situações não são recalculadas.
- Contador `Exibindo N de T registros`; botão `Limpar filtros`; mensagem "Nenhum colaborador encontrado…" quando nada atende (distinta de "nenhuma planilha importada" e "planilha sem registros").
- Importação válida: opções reconstruídas e pesquisa/seleções limpas. Importação inválida: nada muda (script.js não chama `Dados.definir`). Controles desativados enquanto não há registros.
- Indicadores gerais **inalterados e globais** (decisão: continuam somente informativos e mostrando a base inteira; não viraram atalhos de filtro).
- Decisão: valores que diferem só por caixa/espaços (ex.: `Gerente`/`GERENTE`, `"  ana   teste "`/`ANA TESTE`) viram uma opção; o rótulo é o primeiro texto encontrado (Função em maiúsculas, como nos cartões). Acentos **não** são unificados nas opções (`JOSE` ≠ `JOSÉ`): não se adivinha.
- Decisão: sem debounce na pesquisa (redesenho completo de 341 cartões ≈ 50–65 ms até a pintura); sem opções em cascata (as opções vêm sempre da base inteira; combinações sem resultado mostram a mensagem).
- Tratamento da virada de dia: se o dia virar com a página aberta e as situações forem recalculadas sobre a MESMA base, as escolhas que ainda existem são mantidas (só importação nova limpa tudo). Distingue-se pela identidade de `Dados.obter()`.
- Segurança: nenhum `innerHTML` em `filters.js` (opções por `createElement`/`textContent`/`value`); sem rede, sem armazenamento, sem CDN, CSP idêntica; nada de dados reais.

**Arquivos criados:** `js/filters.js`, `tests/teste_filtros.js`, `tests/e2e_filtros.py`.
**Arquivos modificados:** `index.html` (bloco `#filtros` dentro de "Colaboradores" e `<script src="js/filters.js">` antes de `render.js`), `css/styles.css` (bloco "Pesquisa e filtros" no fim; comentário do cabeçalho),
`js/render.js` (somente `htmlLista`: 3º parâmetro opcional `totalBase`, e `atualizar`: lista vem de `Filtros.itensVisiveis()` quando existir), `tests/teste_render.js` (uma asserção), `README.md`, `HISTORICO_PROJETO.md`.
**Não modificados:** `importador.js`, `dados.js`, `utils.js`, `aso.js`, `indicadores.js`, `script.js`, `js/vendor/`, `.gitignore`, `tests/teste_importador.js`, `teste_aso.js`, `teste_indicadores.js`, `e2e_importacao.py`, `e2e_cartoes.py`, `e2e_indicadores.py`. CSP inalterada.
**Única alteração em teste existente:** `teste_render.js` fixava o texto literal `innerHTML = htmlLista(A.obter(), temArquivo);`; passou a `innerHTML = htmlLista(itens, temArquivo, todos.length);`. A intenção (único `innerHTML` do projeto, só com a saída escapada de `htmlLista`) foi mantida e agora também é verificada para todos os arquivos de `js/`.

**Testes realmente executados (13/10/2026, Node 22, Chromium via Playwright)**
| Teste | Resultado |
|---|---|
| `node tests/teste_importador.js` (existente) | 25 ok, 0 falhas |
| `node tests/teste_aso.js` (existente; inclui 5 fusos) | 32 ok, 0 falhas |
| `node tests/teste_render.js` (existente; 1 asserção atualizada) | 28 ok, 0 falhas |
| `node tests/teste_indicadores.js` (existente) | 18 ok, 0 falhas |
| `node tests/teste_filtros.js` (novo): normalização; opções dinâmicas (ordenação, caixa/espaços, só situações presentes, `Não informada`, FUNÇÃO `0`); cada um dos 6 filtros com todas as opções (soma = 12); 7 combinações + interseção; 13 pesquisas (acento, maiúsculas, cedilha, trecho, espaços); pesquisa+filtros; coerência com os cartões; integração (estado inicial, contador, limpar, vazio, 2ª importação, reimportação, importação inválida, planilha sem registros, indicadores globais, dados intactos, virada de dia); segurança e estrutura do `index.html` | 55 ok, 0 falhas |
| Verificação dos testes novos por mutação: 12 defeitos injetados em `filters.js` (sem acento, sem caixa, OU em vez de E, `Não informada` como "sem filtro", não limpar na importação, limpar tudo na virada de dia, `0` como função, ordem textual de loja, texto do contador, limpar sem zerar pesquisa, `Não informada` sempre presente, `innerHTML`) | os 12 detectados; controle sem mutação 55/55 |
| `python3 -I tests/e2e_importacao.py` (existente) | "Tudo certo" (31 verificações) |
| `python3 -I tests/e2e_cartoes.py` (existente) | "Tudo certo" (37 verificações) |
| `python3 -I tests/e2e_indicadores.py` (existente) | "Tudo certo" (50 verificações) |
| `python3 -I tests/e2e_filtros.py` (novo; relógio fixado em 13/10/2026): estado inicial desativado; opções da planilha; todas as opções dos 6 filtros pela interface; combinações; pesquisa digitada (foco permanece); Limpar; nenhum resultado; indicadores globais; teclado/rótulos/`role=status`; 2ª importação; importação inválida; console, rede e armazenamento; CSP; recarregar; XSS em todos os campos e valores muito longos; 341 registros; fusos Los Angeles e Auckland; claro/escuro × 1280/390 px (rolagem, contraste ≥ 4,5:1, colunas 6/2); 320 px | "Tudo certo" (109 verificações) |
Capturas conferidas visualmente (claro 1280 px e escuro 390 px, com pesquisa e filtro aplicados).

**Ainda falta validar (não testado)**
- Com a **planilha real** (não enviada nas Etapas 4 a 7): conferir as opções reais dos filtros (valores duplicados por acento/grafia, lojas com mais de um gerente/município) e os indicadores (esperado em 13/10/2026: 341 · 135 · 0 · 16 · 183 · 0 · 7). Os testes usaram só dados fictícios.
- Pendências da Etapa 3 (arquivo baixado de fato do Google Sheets, Firefox/Safari/Edge, GitHub Pages). Só Chromium foi usado; o desempenho foi medido em Chromium headless (rasterização por software).

**Limitações / observações**
- Em 390 px os filtros ficam em 2 colunas e alguns rótulos selecionados aparecem cortados com reticências (ex.: "Todas as situ…"); o texto completo está na lista aberta e no rótulo do campo.
- As opções não são em cascata: a combinação de filtros pode resultar em zero registros (a mensagem orienta a limpar).
- Opções que diferem só por acento são mantidas separadas (não se adivinha que são o mesmo valor).
- A pesquisa localiza o trecho contíguo do nome ("silva jose" não acha "JOSÉ DA SILVA").
- Redesenha-se a lista inteira a cada tecla (rápido para centenas de registros; revisar se a base crescer muito).

### Etapa 8 — Ordenação por urgência, atualização automática e refinamento visual (concluída em 14/10/2026)
Antes de começar: lidos `README.md` e `HISTORICO_PROJETO.md`; ZIP da Etapa 7 inspecionado (estrutura completa; `filters.js`, 6 filtros, pesquisa, contador e `Limpar filtros` presentes; 7 indicadores globais); lidos `aso.js`, `filters.js`, `render.js`, `indicadores.js`, `script.js`, `utils.js`, `index.html`, CSS.
Os 5 testes Node da Etapa 7 foram executados antes de alterar e estavam verdes (25 + 32 + 28 + 18 + 55). Sem falhas preexistentes.

**Implementado**
- `js/ordenacao.js` (`Ordenacao.ordenar`): ordem automática DATA INCONSISTENTE → VENCIDO (maior atraso primeiro) → VENCE HOJE → PRÓXIMO (vencimento mais próximo) → EM DIA (vencimento mais próximo) → SEM DATA. Usa a situação e `dias` (= `VENC − hoje`) do `Aso`; não recalcula nem usa `ULT_ASO`. Desempate pela posição original (ordem da planilha); lista nova, mesmos objetos. Aplicada em `Render.atualizar()` depois de pesquisa e filtros. Sem botão nem filtro de ordenação.
- `js/atualizacao.js` (`Atualizacao`): um temporizador por vez até a próxima meia-noite local (máx. 60 s, mín. 250 ms, margem de 500 ms); aba oculta cancela o temporizador; `visibilitychange` (visível), `pageshow` e `focus` verificam o dia; `iniciar()` idempotente. Só chama `Aso.verificarDia()`.
- `js/aso.js` (acréscimos, sem tocar nas regras): `verificarDia()` e `agora()`. O recálculo dispara o mesmo evento `aso:situacoes-calculadas`, que já atualizava Filtros (opções), Render (cartões+ordem), Indicadores e contador.
- Decisão: na virada de dia a escolha de **Situação** é preservada mesmo que a opção fique sem registros (antes da Etapa 8 ela era descartada em silêncio). Isto mudou uma asserção da Etapa 7 (ver abaixo).
- Refinamento visual (só o necessário): filtros com texto cortado ("Todas as situ…", "Todos os superviso…") em 390 px e 1280 px → 3 colunas (6 só ≥ 1500 px), 2 até 700 px, 1 até 480 px. Cartões, indicadores, pesquisa e identidade visual não foram alterados. Nomes longos e textos sem espaços já quebravam linha corretamente (conferido).

**Arquivos criados:** `js/ordenacao.js`, `js/atualizacao.js`, `tests/teste_ordenacao.js`, `tests/teste_virada_dia.js`, `tests/e2e_etapa8.py`.
**Arquivos modificados:** `js/aso.js` (+`verificarDia`, +`agora`), `js/render.js` (ordenação em `atualizar`), `js/filters.js` (preserva a Situação escolhida na virada de dia), `index.html` (2 `<script>`), `css/styles.css` (bloco "Refinamento visual (Etapa 8)" no fim), `README.md`, `HISTORICO_PROJETO.md`.
**Testes antigos alterados (e por quê):** `teste_filtros.js` — o teste de virada de dia agora exige que a Situação escolhida seja preservada; `e2e_filtros.py` — as listas de cartões são comparadas ordenadas (a ordem passou a ser por urgência) e o nº de colunas esperado mudou (3 em 1280 px, 1 em 390 px); `e2e_cartoes.py` — uma ordem esperada (vencido antes de em dia). Nenhuma regra de datas, importação ou indicadores foi alterada. CSP inalterada; nenhuma dependência nem requisição nova; nada em armazenamento.

**Testes realmente executados (14/10/2026, Node 22, Chromium via Playwright)**
| Teste | Resultado |
|---|---|
| Node: importador 25 · aso 32 · render 28 · indicadores 18 · filtros 55 (existentes) | todos ok, 0 falhas |
| `teste_ordenacao.js` (novo): 6 grupos, atrasos 400/100/10/1, próximos e em dia, sem data por último, inconsistente primeiro, empates e determinismo, usa VENC e não ULT_ASO, não altera entrada, entradas inesperadas, filtros+pesquisa, contador, indicadores globais, nova importação, segurança | 22 ok |
| `teste_virada_dia.js` (novo; relógio e temporizador falsos): amanhã→hoje, hoje→ontem, fronteira de 30 dias, 2 e 3 dias de uma vez, data inconsistente que passa a válida, indicadores/contador/mensagem vazia, base+pesquisa+filtros preservados, nova importação ainda limpa, sem planilha, aba oculta/visível, pageshow/focus, temporizador atrasado, sem duplicar cartões/ouvintes/temporizadores, 1 evento por virada, sem erros de console, `Aso.verificarDia`, regras intactas, segurança | 30 ok |
| Navegador existentes: `e2e_importacao`, `e2e_cartoes`, `e2e_indicadores`, `e2e_filtros` | "Tudo certo" (com as 3 adaptações acima) |
| `e2e_etapa8.py` (novo; `page.clock`): ordem real no DOM, filtros/pesquisa/limpar, indicadores globais, meia-noite simulada com pesquisa+filtro preservados, 12 viradas sem novos ouvintes, escolha "Vence hoje" preservada sem registros, aba suspensa 3 dias, claro/escuro × 1280/390/320 px (sem rolagem horizontal, nada fora da tela, nomes sem corte, texto dos 6 filtros cabe inteiro, sem erros de console), só `file://`, armazenamento vazio | "Tudo certo" |
| Verificação por mutação (6 defeitos injetados em ordenacao.js/atualizacao.js: inverter atraso, inverter empate, mudar prioridade, não cancelar na aba oculta, remover guarda de `iniciar`, ouvinte duplicado) | 5 detectados; 1 sobreviveu: remover a guarda de `iniciar()` é inócuo (o navegador já ignora o mesmo ouvinte repetido e `agendar()` cancela o temporizador anterior), ou seja, é redundância defensiva |

**Validação com a planilha real (feita à parte, somente leitura local; nada foi copiado, salvo ou incluído no ZIP):** `BASE_DASH.xlsx` (aba `BASE`, cabeçalho na 2ª linha) importada no navegador com o relógio fixado em 13/10/2026: 341 registros, 341 cartões, ordem de urgência correta (verificada por regra, sem imprimir nomes), 0 erros de console, só `file://`. Distribuição obtida: vencidos 129 · vencem hoje 0 · próximos 16 · em dia 189 · sem data 0 · inconsistentes 7 (total 341). Difere da referência histórica de 13/10 (135 · 16 · 183 · 7): a soma bate e próximos/inconsistentes coincidem, mas 6 registros estão em "em dia" em vez de "vencido"; não investigado se a planilha foi atualizada desde então. Não foi feita conferência campo a campo com a planilha real nesta etapa (`e2e_importacao.py` aceita o caminho para isso).

**Ainda falta validar / limitações**
- A virada de dia foi testada com relógio simulado (Playwright) e com `visibilitychange` disparado por script; suspensão real do navegador/computador, outros navegadores (só Chromium) e arquivo baixado de fato do Google Sheets continuam sem teste. Pendências da Etapa 3 (GitHub Pages etc.) seguem.
- Se o relógio do computador estiver errado, as situações ficam erradas (como antes).
- Itens com o mesmo grupo "inconsistente" ou "sem data" não têm critério interno além da ordem da planilha (não foi pedido outro).
- A Situação escolhida pode ficar sem registros após a virada do dia; é o comportamento escolhido (ver acima).
- Os filtros ocupam mais altura em telas estreitas (1 coluna até 480 px), em troca de leitura completa dos rótulos.

## 9. Plano das próximas etapas (cada uma só após aprovação)
| Etapa | Entrega | Verificação |
|---|---|---|
| ~~3~~ | ~~Importação manual da planilha~~ (**concluída**) | ver seção 8 |
| ~~4~~ | ~~`js/utils.js` + `js/aso.js`: situação de cada registro~~ (**concluída**; conferência com a planilha real ainda pendente) | ver seção 8 |
| ~~5~~ | ~~`js/render.js`: cartões com etiqueta de status~~ (**concluída**; conferência com a planilha real pendente) | ver seção 8 |
| ~~6~~ | ~~`js/indicadores.js`: totais informativos (7 indicadores)~~ (**concluída**; conferência com a planilha real pendente) | ver seção 8 |
| ~~7~~ | ~~`js/filters.js`: busca + Situação, Supervisor, Gerente, Loja, Função, Município~~ (**concluída**; indicadores seguem globais e não clicáveis; conferência com a planilha real pendente) | ver seção 8 |
| ~~8~~ | ~~Ordenação por urgência, atualização na virada do dia, refinamento visual~~ (**concluída**; conferência campo a campo com a planilha real pendente) | ver seção 8 |
| 9 | Revisão de privacidade e fechamento da documentação | Busca por dados indevidos nos arquivos |
Opcionais depois: exportação Excel/CSV da lista filtrada (sem CPNJ/DT_NASC), gráfico por mês, regra de acesso por loja, decisão de publicação.

## 10. Para continuar em outra conta do Claude.ai
Anexar: este `HISTORICO_PROJETO.md`, o `README.md` e a pasta do projeto (ZIP, que **não contém dados**). Para testar, o usuário
precisa da planilha baixada do Google Sheets (arquivo à parte; **nunca** dentro do projeto). Opcional: o ZIP do dashboard de
referência. Instruir: "ler o histórico e o README, analisar os arquivos atuais e executar somente a próxima etapa pendente".
Antes de alterar: rodar `node tests/teste_importador.js`, `node tests/teste_aso.js`, `node tests/teste_render.js`, `node tests/teste_indicadores.js` e `node tests/teste_filtros.js`, `node tests/teste_ordenacao.js` e `node tests/teste_virada_dia.js` para confirmar que a base está íntegra.

## 11. Próxima etapa pendente
**Etapa 9 — Revisão de privacidade e fechamento da documentação** (busca por dados indevidos nos arquivos, revisão de CSP/armazenamento/XSS, documentação final). Não iniciar sem aprovação.
Antes de começar: rodar os 12 testes (`teste_importador`, `teste_aso`, `teste_render`, `teste_indicadores`, `teste_filtros`, `teste_ordenacao`, `teste_virada_dia` em Node; `e2e_importacao`, `e2e_cartoes`, `e2e_indicadores`, `e2e_filtros`, `e2e_etapa8` com Playwright).
