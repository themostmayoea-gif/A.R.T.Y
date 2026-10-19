# A.R.T.Y — assistente pessoal no estilo JARVIS

HUD holográfico, voz em pt-BR e um cérebro que usa o **Claude Code** que já está no seu PC (sem chave de API).

## 1. O que precisa ter instalado

| Programa | Pra quê | Como ver se tem |
|---|---|---|
| **Node.js 20 ou mais novo** (versão LTS) — https://nodejs.org | rodar e empacotar o app | `node -v` no terminal |
| **Claude Code**, já logado na sua conta | cérebro do A.R.T.Y | `claude --version` e depois `claude` uma vez para fazer login |
| Internet | voz (fala e reconhecimento) e clima | — |

## 2. Primeira vez

1. Copie **as suas imagens** para a pasta `assets` (substitua as provisórias):
   - `ARTY_floco.png` (o floco do centro, sem fundo)
   - `ARTY.ico` (ícone do app)
2. Dê dois cliques em **`1_instalar.bat`** (baixa as dependências).
3. Dê dois cliques em **`2_testar.bat`** (abre o A.R.T.Y).
4. Clique na **engrenagem** lá em cima, coloque seu `nome` e sua `cidade` no `config.json`, salve e clique em **recarregar** (a setinha do lado).

## 3. Gerar o aplicativo (ARTY.exe + instalador)

Dê dois cliques em **`3_gerar_instalador.bat`**. No fim abre a pasta `dist` com o **`Setup_ARTY.exe`**.
Instale: ele cria atalho na área de trabalho e no menu Iniciar.

> Também dá pra baixar o instalador pronto pelo GitHub: aba **Actions** → **Gerar instalador do Windows** → último build → **Setup_ARTY**.
> (Nesse caso ele vem com as imagens que estiverem na pasta `assets` do repositório.)

## 4. Como usar

- **Falar:** com o *modo escuta* ligado, diga **"Arty"** + o pedido ("Arty, abre o Spotify").
  Se disser só "Arty", ele responde "fala aí" e escuta o próximo comando.
- **Microfone:** clique no botão do microfone (ou **Ctrl+Alt+A** de qualquer lugar) e fale direto, sem "Arty".
- **Digitar:** escreva e aperte **Enter**. **Ctrl+Espaço** ou **/** foca o campo. Ele responde falando (a não ser que o botão de **mudo** esteja ligado).
- **Esc** interrompe a fala.
- **Planos de hoje / Objetivos:** adicione pelos campos `+`, clique no hexágono para marcar feito, clique na barra para mudar a %, ou peça por voz:
  - "Arty, anota aí pra hoje: estudar matemática"
  - "Arty, meu jogo do Roblox tá 40% pronto"
- Fechar a janela só esconde na **bandeja** (perto do relógio). Botão direito no floco da bandeja: Abrir, Modo escuta, Iniciar com o Windows, Sair.

### Exemplos de pedidos
"abre o Discord" · "pesquisa no YouTube tutorial de Lua" · "toca Matuê no Spotify" · "aumenta o volume" · "próxima música" ·
"como tá o PC?" · "vai chover amanhã?" · "me lembra em 10 minutos de tirar a pizza" · "bloqueia o PC" · "o que eu tenho pra hoje?"

## 5. Configuração (`%APPDATA%\ARTY\config.json`)

| Campo | O que é |
|---|---|
| `nome`, `cidade` | seu nome e sua cidade (para o clima) |
| `voz.motor` | `"edge"` (voz neural da Microsoft, melhor, precisa de internet) ou `"windows"` (vozes instaladas) |
| `voz.edgeVoz` | ex.: `pt-BR-AntonioNeural` (masculina). Outras: `pt-BR-FranciscaNeural`, `pt-BR-ThalitaMultilingualNeural` |
| `voz.windowsVoz` | parte do nome da voz do Windows, ex.: `Daniel` |
| `voz.velocidade`, `voz.tom` | ex.: `"+8%"`, `"+4Hz"` |
| `escuta.palavrasAtivacao` | variações aceitas de "Arty" |
| `programas` | lista do que ele pode abrir. `abrir` pode ser um nome registrado no Windows (`chrome`, `calc`), um caminho de `.exe` ou um link (`spotify:`, `steam://open/main`) |
| `cerebro.modo` | `"claude-code"` (padrão) ou `"api"` |
| `cerebro.modelo` | modelo do Claude Code: `haiku` (mais rápido) ou `sonnet` |
| `cerebro.apiKey`, `cerebro.apiModelo` | para usar uma chave da API no futuro: coloque a chave e mude `modo` para `"api"` |
| `atalhoGlobal` | padrão `Control+Alt+A` |

Planos, objetivos, lembretes e log ficam em `%APPDATA%\ARTY\dados.json`.

## 6. Como funciona (resumo técnico)

- **Electron**: janela própria sem moldura, bandeja, atalho global, uma cópia só.
- **Cérebro**: roda `claude -p --output-format json --json-schema ... --tools "" --resume <sessão>`.
  `--tools ""` desliga **todas** as ferramentas do Claude Code: ele só responde um JSON `{fala, acoes}` e **quem executa é o A.R.T.Y**,
  e só ações da lista (abrir programas do config, sites http/https, teclas de mídia, planos, objetivos, lembretes, bloquear o PC).
  Nada de comandos arbitrários, desligar o PC ou apagar arquivos.
- **Voz**: reconhecimento de fala do Google (o mesmo do Chrome) e fala com as vozes neurais do Edge; se a internet cair, usa as vozes do Windows.
- **Clima**: Open-Meteo (grátis, sem chave).
- **Segurança**: o app não abre nenhuma porta de rede (nem em 127.0.0.1): a interface conversa com o processo principal por IPC interno,
  e a interface é proibida de acessar a internet.

## 7. Problemas comuns

- **"não achei o Claude Code"**: rode `claude --version` no terminal. Se funcionar lá, coloque o caminho em `cerebro.claudeCaminho`
  (descubra com `where claude`).
- **"o Claude Code não está logado"**: abra o terminal, rode `claude` e faça login.
- **Não reconhece a voz**: confira o microfone padrão do Windows e a internet. Fale "Arty" no começo da frase.
- **Voz robótica**: a voz neural precisa de internet; sem ela entra a voz do Windows. Para instalar a voz "Daniel":
  Configurações → Hora e idioma → Fala → Adicionar vozes → Português (Brasil).
