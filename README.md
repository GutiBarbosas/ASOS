# Dashboard de Controle de ASO

Dashboard simples para acompanhar os vencimentos de ASO (Atestado de Saúde Ocupacional) dos colaboradores da rede.
Os dados vêm da planilha que o RH mantém no Google Sheets: o usuário **baixa o arquivo e o importa manualmente na página**.
Visual e estrutura baseados no dashboard de colaboradores (projeto de referência, que **não é alterado** por este projeto).

> **Status:** Etapa 8 concluída (ordenação por urgência, atualização automática na virada do dia e refinamento visual pontual). Ainda **não** há indicadores clicáveis,
> gráficos nem exportações.
> A situação atual e a próxima etapa estão em [`HISTORICO_PROJETO.md`](HISTORICO_PROJETO.md) — leia-o primeiro.

## Como usar
1. Abra o `index.html` no navegador (duplo clique; não precisa instalar nada nem de servidor).
2. No Google Sheets: **Arquivo → Fazer download → Microsoft Excel (.xlsx)** ou **Valores separados por vírgula (.csv)**.
3. Na página, clique em **Importar planilha** e escolha o arquivo.
4. A página mostra o nome do arquivo, a quantidade de registros importados e eventuais avisos, depois os **indicadores gerais** e, logo abaixo,
   **a pesquisa e os filtros** e **um cartão por colaborador**. Antes da primeira importação os indicadores aparecem com "–" (sem números) e uma mensagem orienta a importar a planilha.

Para atualizar os dados, baixe a planilha de novo e importe outra vez. **Os dados ficam só na memória da página:** ao recarregar
(F5) ou fechar, é preciso importar novamente. Se o arquivo escolhido for inválido, os dados, os indicadores e os cartões já carregados são mantidos; uma nova importação válida substitui toda a listagem.

## Ordenação por urgência e virada de dia (Etapa 8)
**Ordem dos cartões (automática, sem botão nem filtro de ordenação):** 1. DATA INCONSISTENTE · 2. VENCIDO (maior atraso primeiro) · 3. VENCE HOJE · 4. PRÓXIMO DO VENCIMENTO (vencimento mais próximo primeiro) ·
5. EM DIA (vencimento mais próximo primeiro) · 6. SEM DATA.
- `js/ordenacao.js` (`Ordenacao.ordenar(itens)`) só decide a ordem: usa a situação e o campo `dias` (= `VENC − hoje`) já calculados pelo módulo `Aso`; não recalcula nada nem usa `ULT_ASO`. Devolve uma lista nova, com os mesmos objetos.
- Aplicada pelo `Render.atualizar()` **depois** da pesquisa e dos filtros (`Filtros.itensVisiveis()` → `Ordenacao.ordenar()` → cartões). O contador continua `Exibindo N de T` (N = filtrados) e os sete indicadores seguem globais.
- Empates (mesma situação e mesmo vencimento; e os grupos sem data relevante: inconsistente e sem data) mantêm a ordem da planilha. `Aso.obter()` e `Dados.obter()` continuam na ordem da planilha.
- **Virada de dia:** `js/atualizacao.js` (`Atualizacao`) detecta a mudança da data local e chama `Aso.verificarDia()`, que recalcula as situações e dispara `aso:situacoes-calculadas`; cartões, ordem, opções de filtro, indicadores e contador se atualizam sozinhos.
  Base importada, pesquisa digitada e filtros escolhidos são preservados (uma nova *importação* continua limpando tudo). Se a Situação escolhida ficou sem registros (ex.: "Vence hoje"), ela continua selecionada e aparece "Nenhum colaborador encontrado"; **Limpar filtros** resolve.
- **Estratégia:** um único temporizador, armado para a próxima meia-noite local (no máximo 60 s, o que também cobre ajuste do relógio); aba oculta = temporizador cancelado; ao voltar a ficar visível (`visibilitychange`), em `pageshow` e `focus` verifica na hora. `iniciar()` é idempotente: ouvintes e temporizador não se acumulam. Sem serviços externos, sem armazenamento.
- **Refinamento visual:** os rótulos dos filtros apareciam cortados ("Todas as situ…") em 390 px e também em 1280 px. Agora os filtros ficam em 3 colunas (6 apenas a partir de 1500 px), 2 colunas até 700 px e 1 coluna até 480 px. Nada mais foi redesenhado.

## Pesquisa e filtros (Etapa 7)
Bloco acima dos cartões, dentro de "Colaboradores": um campo **Pesquisar colaborador**, seis filtros (**Situação do ASO**, **Supervisor**, **Gerente**, **Loja**, **Função**, **Município**),
o contador **`Exibindo N de T registros`** e o botão **Limpar filtros**.
- **Funcionam sozinhos ou juntos** (todos precisam ser atendidos: pesquisa E filtros). Os filtros atuam sobre os próprios cartões: `Filtros` entrega uma lista filtrada de `Aso.obter()` ao `Render`,
  que continua sendo a única lista da página. Desde a Etapa 8 a lista filtrada é ordenada por urgência antes de desenhar; as situações vêm do módulo `Aso` (nada é recalculado) e o conteúdo dos cartões não muda.
- **Pesquisa por nome:** ignora maiúsculas/minúsculas, acentos (inclusive `ç`) e espaços repetidos; acha qualquer trecho do nome (`jose` encontra `JOSÉ DA SILVA`). Só olha o nome. Atualiza a cada tecla.
- **Opções geradas da planilha importada** (nada fixo no código): ordem alfabética (lojas em ordem numérica: 7, 9, 26, 100). `Situação` lista só as situações presentes na base.
  Valores que diferem só por caixa ou espaços viram uma opção (`Gerente` = `GERENTE`); `Função` aparece em maiúsculas, como nos cartões.
- **Não informada:** campo vazio (ou só espaços) vira a opção `Não informada`, que só existe se algum registro estiver sem o campo. Em `Função`, o valor `0` também conta como não informada
  (mesma regra dos cartões). Nada é inventado: o filtro mostra exatamente o que o cartão mostra.
- **Contador:** `Exibindo N de T registros`, N = registros que atendem à pesquisa e aos filtros, T = total da base importada.
- **Limpar filtros:** restaura a pesquisa e os seis filtros ao estado inicial.
- **Nenhum resultado:** mensagem "Nenhum colaborador encontrado com a pesquisa e os filtros selecionados…" (diferente das mensagens de "nenhuma planilha importada" e "planilha sem registros").
- **Importação válida:** reconstrói as opções e **limpa** pesquisa e seleções. **Importação inválida:** nada muda (base, pesquisa, filtros, contador e cartões ficam como estavam).
  Antes da primeira importação (e com planilha sem registros) os controles ficam desativados.
- **Os sete indicadores continuam globais:** não são afetados pela pesquisa nem pelos filtros (`indicadores.js` não usa `Filtros`) e seguem não clicáveis.
- Segurança: opções montadas com `createElement`/`textContent`/`value` (nenhum `innerHTML` em `filters.js`); o único `innerHTML` do projeto continua em `Render.atualizar`, que só recebe a saída escapada de `htmlLista`.
  Nada é gravado (nem pesquisa nem filtros) e não há requisições; a CSP não mudou.
- Desempenho (Chromium headless, 341 registros fictícios): redesenhar a lista inteira até a pintura ≈ 50–65 ms.

## Indicadores gerais (Etapa 6)
Sete blocos entre o bloco "Dados" e os cartões: **Total de registros**, **Vencidos**, **Vencem hoje**, **Próximos do vencimento** (em até 30 dias, valor de `Aso.DIAS_ALERTA`),
**Em dia**, **Sem data de vencimento válida** e **Data inconsistente**.
- Não há regra de cálculo nova: `js/indicadores.js` lê `Aso.obter()` e conta com `Aso.contar()`. Cada registro está em **uma só** situação, a soma das 6 situações é igual ao total
  e o total é igual à quantidade de registros de `Aso.obter()` (e de cartões). Data inconsistente nunca entra em "Em dia". `ASO_STATUS` da planilha não é usado.
- Atualizam a cada importação válida (evento `aso:situacoes-calculadas`). Importação inválida não dispara o evento: indicadores e cartões da última importação válida permanecem.
  Planilha válida sem registros mostra zeros (há arquivo carregado).
- Antes da primeira importação: "–" em tom neutro (`data-estado="vazio"` na seção), sem cor de situação; depois da importação, número e borda superior na cor da situação (o rótulo em texto
  é sempre o sinal principal, a cor é só apoio). Tema claro/escuro automático (reaproveita os tokens dos cartões).
- Somente informativos: sem botão, link, foco, filtro ou ordenação. Só `textContent` (nenhuma atribuição de `innerHTML`; o único do projeto continua em `Render.atualizar`).
- Responsivo: 7 em uma linha em 1280 px; 2 colunas em 390 px (o total ocupa a linha inteira), sem rolagem horizontal (testado também em 320 px).

## Cartões (Etapa 5)
Cada cartão mostra: nome, situação (selo + faixa de texto), loja, função, supervisor, gerente, município, data do último ASO e vencimento (`dd/mm/aaaa`).
- Campos ausentes aparecem como *Não informada* (nome vazio: *Nome não informado*). Na exibição, `FUNÇÃO` `0` conta como não informada e as demais
  funções saem em maiúsculas (a planilha mistura caixas); os dados originais não são alterados.
- **Vencido:** "Vencido há N dias". **Próximo do vencimento:** "Faltam N dias para vencer". **Vence hoje:** "Vence hoje". Nunca aparece número negativo.
  **Em dia:** "Dentro do prazo". **Sem data:** "Data de vencimento não informada ou inválida".
  **Data inconsistente:** "Conferir a data cadastrada: a data do último ASO é posterior a hoje".
- Cada situação tem cor de borda e selo próprios (a cor nunca é o único sinal: o selo traz o texto). Tema claro/escuro automático.
- Não são exibidos admissão, CNPJ, CPF, nascimento nem salário.
- Os cartões **não calculam nada**: usam `Aso.obter()` e se redesenham no evento `aso:situacoes-calculadas`.
- Segurança: todo texto da planilha passa por `Utils.escapar` antes de entrar no HTML (única atribuição de `innerHTML` do projeto: `Render.atualizar`);
  HTML/script escrito numa célula aparece como texto, sem executar.

## Arquivo esperado
Colunas obrigatórias (em qualquer ordem; maiúsculas/minúsculas, acentos e espaços nas pontas são ignorados):
`SUPERVISOR`, `GERENTE`, `FUNÇÃO`, `MUNICIPIO`, `LOJA`, `COLABORADOR`, `ADMISSÃO`, `ULT_ASO`, `VENC`.

- `CPNJ`, `DT_NASC`, `ASO_STATUS` e quaisquer outras colunas **não são necessárias** e são descartadas na leitura (nunca ficam em memória).
- **Excel (.xlsx):** usa a aba `BASE`, se existir; senão, a primeira aba que tenha todas as colunas. Fórmulas são lidas pelo último valor calculado.
- **CSV:** UTF-8 (ou Windows-1252), delimitador vírgula, ponto e vírgula ou tab (detectado), aspas e quebras de linha dentro de campos.
- **Datas aceitas:** datas do Excel, número serial do Excel, ISO (`2026-10-13`) e brasileiro (`13/10/2026`, também com `-` ou `.`).
  Ano com 2 dígitos e formato americano (`10/13/2026`) **não** são interpretados: viram data inválida e geram aviso.
  Se o Google Sheets estiver com idioma/região dos EUA, exporte o CSV com datas no formato `dd/mm/aaaa` (ou use o `.xlsx`).
- Células vazias, `-`, erros de fórmula (`#N/A`) e datas inválidas **não travam** a importação: o campo fica vazio e aparece um aviso
  (com coluna e número da linha, sem nomes de pessoas).
- Estrutura inválida (coluna obrigatória ausente, arquivo vazio, formato diferente de .xlsx/.csv, arquivo corrompido): nada é importado.

## Estrutura de arquivos
```
dashboard-aso/
├── index.html                # página principal: cabeçalho + bloco "Dados" (botão Importar planilha)
├── css/styles.css            # tokens de cor (claro/escuro), botões, bloco de importação, cartões, indicadores
├── js/
│   ├── importador.js         # lógica pura: CSV, datas, cabeçalhos, validação, leitura de .xlsx/.csv
│   ├── dados.js              # base em memória: Dados.obter(), Dados.resumo(), evento "aso:dados-carregados"
│   ├── utils.js              # datas: comparação só por dia (AAAA-MM-DD, Date.UTC), "hoje" local, diferença em dias
│   ├── aso.js                # situação de cada ASO (função única), recálculo automático a cada importação
│   ├── filters.js            # pesquisa e filtros (Filtros.filtrar/opcoesDe/itensVisiveis/definir/limpar); carregado ANTES do render.js; sem innerHTML
│   ├── ordenacao.js          # (Etapa 8) ordem por urgência: Ordenacao.ordenar(itens); lógica pura, sem innerHTML; carregado entre filters.js e render.js
│   ├── atualizacao.js        # (Etapa 8) detecta a virada do dia (temporizador + visibilitychange/pageshow/focus) e chama Aso.verificarDia(); carregado antes de script.js
│   ├── render.js             # cartões dos colaboradores (Render.html/htmlLista/atualizar), usa Aso.obter() e Utils.escapar
│   ├── indicadores.js        # indicadores gerais (Indicadores.valores/consistente/atualizar), usa Aso.obter() e Aso.contar(); só textContent
│   ├── script.js             # ponto de entrada: botão, mensagens de sucesso/aviso/erro
│   └── vendor/               # biblioteca de terceiros guardada localmente (sem CDN)
│       ├── read-excel-file.min.js   # leitura de .xlsx (v9.3.12, MIT)
│       ├── LICENSE-read-excel-file.txt
│       └── LEIA-ME.txt       # origem, versão e como atualizar
├── tests/
│   ├── teste_importador.js   # testes unitários da importação (Node), só dados fictícios
│   ├── teste_aso.js          # testes do cálculo da situação (Node): data controlada, 5 fusos horários, integração com Dados
│   ├── teste_render.js       # testes dos cartões (Node): HTML, escape, datas, 6 situações, dias, ausentes, integração
│   ├── teste_indicadores.js  # testes dos indicadores (Node): estado inicial, contagens, soma, 2ª importação, inválida, opcionais ausentes, 6 situações
│   ├── teste_filtros.js      # testes dos filtros (Node): 6 filtros, combinações, pesquisa, opções, Não informada, contador, limpar, vazio, importações, indicadores globais, segurança
│   ├── teste_ordenacao.js    # (Etapa 8) ordenação (Node): 6 grupos, atrasos, empates, filtros+pesquisa, contador, indicadores globais, segurança
│   ├── teste_virada_dia.js   # (Etapa 8) virada de dia (Node): relógio e temporizador controlados, preservação, aba suspensa, sem duplicação, regras de datas
│   ├── e2e_etapa8.py         # (Etapa 8) navegador (Playwright, page.clock): ordem real, virada de dia, aba suspensa, 1280/390/320 px claro/escuro; aceita a planilha real como argumento
│   ├── e2e_filtros.py        # filtros no navegador (Playwright): controles reais, temas claro/escuro, 1280/390/320 px, XSS, 341 registros, teclado, contraste
│   ├── e2e_indicadores.py    # indicadores no navegador (Playwright): temas claro/escuro, 1280/390/320 px, sem rolagem horizontal, console, não clicáveis
│   ├── e2e_cartoes.py        # cartões no navegador (Playwright): XSS, importação inválida/2ª importação, console, layout
│   └── e2e_importacao.py     # teste no navegador (Playwright), gera arquivos fictícios; aceita a planilha real como argumento
├── README.md · HISTORICO_PROJETO.md · .gitignore
```

## Para os próximos módulos (Etapa 9 em diante)
Os registros ficam em `Dados.obter()` (lista somente leitura). Cada registro tem:
`linha, supervisor, gerente, funcao, municipio, loja, colaborador, admissao, ult_aso, venc` — textos já sem espaços nas pontas;
as 3 datas como `"AAAA-MM-DD"` ou `null`. O evento `aso:dados-carregados` (em `document`) é disparado a cada importação válida.
Os valores não são corrigidos (ex.: `FUNÇÃO` = `0` continua `"0"`); a normalização fica com os módulos que a usam.

**Situação (Etapa 4):** use sempre o módulo `Aso`; não reimplemente as regras.
- `Aso.obter()` → lista (congelada, na ordem da planilha) de `{ registro, situacao, rotulo, dias }`. `registro` é o próprio objeto de
  `Dados.obter()` (não é copiado nem alterado); `situacao` é um código (`Aso.SITUACOES`: `data-inconsistente`, `sem-data`, `vencido`,
  `vence-hoje`, `proximo`, `em-dia`); `rotulo` é o texto de exibição (`DATA INCONSISTENTE`, `SEM DATA`, `VENCIDO`, `VENCE HOJE`,
  `PRÓXIMO DO VENCIMENTO`, `EM DIA`); `dias` = `VENC − hoje` (negativo = vencido há |dias|; `null` sem `VENC` válida).
- `Aso.resumo()` → `{ hoje, total, <código>: quantidade, ... }` (todas as situações sempre presentes).
- `Aso.calcularSituacao(ult_aso, venc, hoje)` → `{ situacao, rotulo, dias }` (a função central; `hoje` como `"AAAA-MM-DD"`).
- Evento `aso:situacoes-calculadas` (em `document`): disparado depois de cada recálculo, logo após `aso:dados-carregados`. Os módulos de
  tela devem escutar **este** evento (e não o de dados) para desenhar, pois ele garante que as situações já estão atualizadas.
- Em `Utils`: `dataLocalISO`, `isoParaUTC`, `dataValida`, `diferencaDias`, `formatarDataBR` (`AAAA-MM-DD` → `dd/mm/aaaa`, `null` se inválida) e
  `escapar` (texto → HTML seguro). Reutilizar em vez de criar outra lógica.
- Em `Indicadores`: `valores(itens)` (= `Aso.contar`), `consistente(valores)` (soma das 6 = total), `atualizar()`. Os blocos são `[data-indicador="<código>"]` dentro de `#indicadores`.
  Filtros futuros devem reutilizar os códigos de `Aso.SITUACOES`; não recontar por outra regra.
- Em `Render`: `html(item)`, `htmlLista(itens, temArquivo, totalBase?)`, `atualizar()`. A área de cartões é `#lista-cartoes`. `atualizar()` desenha `Filtros.itensVisiveis()` (se o módulo existir);
  a ordenação (Etapa 8) é aplicada à lista filtrada por `Ordenacao.ordenar`, sem recalcular situações. `totalBase > 0` com lista vazia = "nenhum colaborador encontrado".
- Em `Aso` (Etapa 8, adicionados): `verificarDia()` (recalcula só se o dia local mudou; devolve `true`/`false`) e `agora()` (instante do relógio usado nos cálculos). Em `Ordenacao`: `ordenar(itens)` e `PRIORIDADE`. Em `Atualizacao`: `iniciar()`, `parar()`, `verificar()`, `estado()`.
- Em `Filtros` (`js/filters.js`): `filtrar(itens, estado)`, `opcoesDe(itens)`, `normalizar(texto)`, `itensVisiveis()`, `contagem()`, `definir(campo, valor)`, `limpar()`, `obterEstado()`, `obterOpcoes()`.
  Campos: `busca` e `situacao|supervisor|gerente|loja|funcao|municipio` ("" = sem filtro; `Filtros.SEM_VALOR` = "Não informada"). Os controles são `#filtro-<campo>`, `#filtro-busca`, `#filtros-contador` e `#btn-limpar-filtros`.

## Regras de negócio (implementadas na Etapa 4)
- **Vencimento:** vale a data da coluna `VENC` (= `ULT_ASO + 360 dias`). Não é recalculada nem alterada.
- **"Hoje":** o dia atual do navegador de quem usa a página (fuso local), sem horário. Todas as comparações são feitas por dia com
  `Date.UTC`, então o resultado não muda com fuso nem com horário de verão. Se a página ficar aberta e o dia virar, as situações são recalculadas e a tela se atualiza sozinha (Etapa 8).
- **Situação** — a primeira regra que valer encerra a avaliação (ordem de prioridade):

| # | Condição | Situação |
|---|---|---|
| 1 | `ULT_ASO` posterior a hoje | **DATA INCONSISTENTE** (vale mesmo se `VENC` for válida; nunca "Em dia") |
| 2 | `VENC` ausente ou inválida | **SEM DATA** |
| 3 | `VENC` anterior a hoje | **VENCIDO** |
| 4 | `VENC` igual a hoje | **VENCE HOJE** |
| 5 | `VENC` de amanhã até hoje + 30 dias (inclusive) | **PRÓXIMO DO VENCIMENTO** |
| 6 | `VENC` depois de hoje + 30 dias | **EM DIA** |

- `ULT_ASO` vazio (ou inválido) **não** gera inconsistência e não é inventado: a situação sai só de `VENC`.
- A coluna `ASO_STATUS` da planilha **não** é usada (nem chega à memória). A situação é recalculada no navegador a cada abertura e a
  cada importação válida (a nova importação substitui as situações anteriores).
- "Vence hoje" é uma situação própria (na Etapa 1 estava dentro de "Próximo do vencimento"). A janela de 30 dias é a constante `Aso.DIAS_ALERTA`.

## Testes
```bash
node tests/teste_importador.js                       # importação (Node 18+), não precisa de nada instalado
node tests/teste_aso.js                              # cálculo da situação; roda também em 5 fusos horários (processos filhos)
node tests/teste_render.js                           # cartões (HTML, escape, situações, integração)
node tests/teste_indicadores.js                      # indicadores (contagens, soma = total, importações, opcionais ausentes, escopo)
node tests/teste_filtros.js                          # filtros e pesquisa (lógica, opções, combinações, importações, indicadores globais, segurança)
node tests/teste_ordenacao.js                        # ordenação por urgência (Etapa 8)
node tests/teste_virada_dia.js                       # virada de dia com relógio/temporizador controlados (Etapa 8)
python3 -I tests/e2e_etapa8.py                       # navegador: ordenação, virada de dia, aba suspensa, layout (pip install playwright openpyxl); aceita caminho/BASE_ASO.xlsx
python3 -I tests/e2e_filtros.py                      # filtros no navegador, relógio fixado em 13/10/2026 (pip install playwright openpyxl)
python3 -I tests/e2e_indicadores.py                  # indicadores no navegador, relógio fixado em 13/10/2026 (pip install playwright openpyxl)
python3 -I tests/e2e_cartoes.py                      # cartões no navegador, relógio fixado em 13/10/2026 (pip install playwright openpyxl)
python3 -I tests/e2e_importacao.py                   # navegador, arquivos fictícios (pip install playwright openpyxl)
python3 -I tests/e2e_importacao.py caminho/BASE_ASO.xlsx   # idem + conferência campo a campo com a planilha real
```

## Dados pessoais e ocupacionais
ASO é dado de saúde ocupacional (dado pessoal sensível na LGPD).
- O arquivo é processado **somente no navegador**: não é enviado a servidor algum. A página tem uma política de segurança
  (`Content-Security-Policy` com `connect-src 'none'`) que bloqueia requisições de rede, e não usa CDN nem rastreadores.
- Nada é gravado em `localStorage`, `sessionStorage`, IndexedDB, cookies ou arquivos. **Não existe base de dados fixa no projeto.**
- `CPNJ` e `DT_NASC` nunca são carregados. Nada de resultado de exame, CID, CPF ou salário.
- A planilha (`*.xlsx`, `*.csv`) está no `.gitignore`. **Não colocar dados reais** no HTML, JavaScript, README, histórico ou repositório.
- A biblioteca de leitura faz parte do projeto; os dados reais, não.
- Como o projeto não contém dados, publicar o código não expõe a base. O que precisa de proteção é a planilha baixada
  (guardar com acesso restrito, apagar cópias antigas) e, se a página for publicada, quem deve poder abri-la: essa decisão
  (forma de disponibilização) continua pendente. Site estático não controla acesso por perfil: quem importa o arquivo vê tudo.
