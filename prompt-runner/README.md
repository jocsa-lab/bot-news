# Prompt Runner

Runner Python para executar arquivos de prompt em sequência com `claude` ou `codex`, sempre em subprocessos isolados e sempre em modo perigoso.

O runner é orientado exclusivamente por uma pasta de prompts informada pelo usuário. Ele não varre o repositório inteiro atrás de `.md`.

O layout esperado é este:

```text
meu-projeto/
├── prompt-runner/
│   ├── prompt-runner.sh
│   ├── run_prompt_runner.py
│   ├── main.py
│   ├── requirements.txt
│   ├── README.md
│   └── runner/
└── prompts/
```

Quando o runner é executado a partir de `prompt-runner/`, ele assume que o **workspace real** é a **pasta pai** dessa pasta. Ou seja, ele trabalha em `meu-projeto/`.

## O que ele faz

- recebe uma pasta de prompts
- descobre arquivos suportados nessa pasta
- ordena os prompts alfabeticamente pelo nome do arquivo
- executa um prompt por vez
- inicia um subprocesso novo para cada prompt
- persiste estado em JSON
- permite retomar execução
- permite reexecutar um prompt específico
- registra logs por execução
- faz commit automático após cada prompt bem-sucedido, quando estiver em um repositório git e houver mudanças
- reforça o uso do MCP `server-memory` em toda execução

## Estrutura

```text
.
├── run_prompt_runner.py
├── main.py
├── requirements.txt
├── README.md
└── runner/
    ├── __init__.py
    ├── app.py
    ├── cli.py
    ├── config.py
    ├── models.py
    ├── prompt_loader.py
    ├── state_store.py
    ├── retry_policy.py
    ├── logger.py
    ├── git_service.py
    ├── agent_runner.py
    ├── ui.py
    └── adapters/
        ├── __init__.py
        ├── claude_adapter.py
        └── codex_adapter.py
```

## Requisitos

- Python 3.11+
- `claude` ou `codex` já instalados
- autenticação já feita no CLI escolhido
- permissão para ler a pasta de prompts
- permissão para escrever em `.prompt-runner/`

## Bootstrap automático do `venv`

O entrypoint principal é `run_prompt_runner.py`.

Ele:

1. cria `.venv/` automaticamente se ainda não existir
2. recria `.venv/` automaticamente se o Python interno estiver quebrado ou incompleto
3. repara o `pip` dentro do `.venv` com `ensurepip` quando necessário
4. instala dependências a partir de `requirements.txt`
5. grava um marcador de bootstrap com hash do `requirements.txt`
6. reexecuta o runner usando o Python do `.venv`

Você não precisa ativar o ambiente virtual manualmente.

Se você usar o wrapper `prompt-runner.sh`, ele também tenta localizar um Python 3.11+ com suporte a `venv`/`ensurepip`. Em ambientes Debian/Ubuntu com `apt-get`, ele pode instalar `python3`, `python3-venv` e `python3-pip` automaticamente quando não encontrar um runtime compatível. Para desabilitar isso, exporte `PROMPT_RUNNER_AUTO_INSTALL_PYTHON=0`.

## Uso

Exemplo básico:

```bash
python run_prompt_runner.py --prompts-dir ./prompts
```

Wrapper shell com interface mais simples:

```bash
./prompt-runner/prompt-runner.sh run ./prompts --agent codex --model gpt-5 --yes
```

Exemplo com agente e modelo definidos:

```bash
python run_prompt_runner.py --prompts-dir ./prompts --agent codex --model gpt-5
```

Exemplo verboso:

```bash
python run_prompt_runner.py --prompts-dir ./prompts --agent claude --model opus --verbose
```

Exemplo com prompts independentes:

```bash
python run_prompt_runner.py --prompts-dir ./prompts --independent-prompts
```

Exemplo reexecutando um prompt específico por nome:

```bash
python run_prompt_runner.py --prompts-dir ./prompts --rerun-name 07_finalize.md
```

Exemplo reexecutando por índice:

```bash
python run_prompt_runner.py --prompts-dir ./prompts --rerun-index 7
```

Exemplos prontos do wrapper:

```bash
./prompt-runner/prompt-runner.sh --example
```

## Flags principais

- `--prompts-dir`: pasta oficial dos prompts
- `--agent`: `claude` ou `codex`
- `--model`: modelo ou alias do CLI
- `--independent-prompts`: continua após falha terminal de um prompt
- `--verbose`: mostra decisões internas e saída do agente
- `--quiet`: reduz saída de console
- `--rerun-name`: reseta e reexecuta um prompt por nome
- `--rerun-index`: reseta e reexecuta um prompt por índice ordenado
- `--state-dir`: muda a pasta local de estado e logs
- `--max-retries`: número máximo de tentativas por prompt
- `--extensions`: extensões suportadas, padrão `.md .txt`
- `--yes`: pula a confirmação final

## Wrapper `.sh`

O arquivo [prompt-runner.sh](/home/jocsa/environment/my-own-ralph-loop/prompt-runner.sh) encapsula a CLI Python com comandos mais curtos.

Ele assume automaticamente:

- pasta do runner: `./prompt-runner/`
- workspace alvo: pasta pai do runner
- diretório de trabalho real dos agentes: raiz do projeto

Comandos suportados:

- `./prompt-runner.sh run <prompts_dir>`
- `./prompt-runner.sh resume <prompts_dir>`
- `./prompt-runner.sh rerun-name <prompts_dir> <arquivo>`
- `./prompt-runner.sh rerun-index <prompts_dir> <indice>`
- `./prompt-runner.sh --example`

Exemplos:

```bash
./prompt-runner/prompt-runner.sh run ./fake-prompts --agent codex --model gpt-5 --yes
./prompt-runner/prompt-runner.sh resume ./fake-prompts --agent claude --model opus
./prompt-runner/prompt-runner.sh rerun-name ./fake-prompts 07_finalize.md --agent codex --verbose
./prompt-runner/prompt-runner.sh rerun-index ./fake-prompts 7 --agent claude --yes
```

## Estado e retomada

O runner persiste tudo em `.prompt-runner/`.

Arquivos principais:

```text
.prompt-runner/
├── state.json
├── logs/
└── runs/
```

O `state.json` guarda:

- fila descoberta
- status por prompt
- tentativas
- último erro
- timestamps
- hash do commit gerado
- caminho do último log do prompt

Se a execução for interrompida:

- prompts concluídos não são repetidos
- prompts que estavam em `running` voltam para `pending`
- o runner retoma a partir do estado salvo

## Retries

Cada prompt tem até `3` tentativas por padrão.

Sem `--independent-prompts`:

- ao atingir o limite, o runner para

Com `--independent-prompts`:

- o prompt fica marcado como falho
- o runner segue para o próximo

## Commit automático

Após um prompt bem-sucedido, o runner:

1. checa `git status --porcelain`
2. faz `git add -A`
3. cria um commit automático com mensagem derivada do prompt

Se não houver mudanças, ele não falha.

Se o diretório atual não for um repositório git, ele avisa e continua sem commits.

## Modo perigoso

Os adapters estão fixados em modo perigoso.

Comandos usados:

- `codex exec --dangerously-bypass-approvals-and-sandbox`
- `claude -p --dangerously-skip-permissions`

Não há modo sandboxado neste runner.

## Como adicionar novos prompts

1. coloque arquivos `.md` ou `.txt` na pasta de prompts
2. use nomes que expressem a ordem desejada
3. rode o runner novamente

Exemplo:

```text
prompts/
├── 00_setup.md
├── 01_domain.md
├── 02_api.md
└── 03_ui.md
```

## Limitações conhecidas

- a descoberta de prompts é apenas no nível direto da pasta informada
- o adapter do `claude` envia o prompt final como argumento do CLI
- se o repositório já estiver sujo antes da execução, os commits automáticos podem incluir mudanças pré-existentes
- o runner não faz login, não instala o CLI e não valida permissões externas além do básico

## Fluxo recomendado

1. prepare a pasta com os prompts
2. confirme que `claude` ou `codex` já estão instalados e autenticados
3. rode `python run_prompt_runner.py --prompts-dir ./prompts`
4. acompanhe os logs em `.prompt-runner/logs/` e `.prompt-runner/runs/`
