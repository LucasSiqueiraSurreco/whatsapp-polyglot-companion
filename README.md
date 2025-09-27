# Polyglot Companion 🎤📱

Um assistente inteligente para WhatsApp que ajuda a melhorar sua pronúncia em diversos idiomas através de transcrição e avaliação usando as APIs da OpenAI.

## 🚀 Funcionalidades

- **🌐 Detecção de Idioma**: Identifica automaticamente o idioma falado no áudio.
- **🔗 Integração WhatsApp Web**: Conecta-se ao WhatsApp através de QR code.
- **🎧 Transcrição de Áudio**: Converte mensagens de voz em texto usando OpenAI Whisper.
- **📝 Análise de Texto**: Analisa textos digitados.
- **📊 Avaliação de Pronúncia**: Analisa e pontua sua pronúncia de 1 a 10 usando GPT-4.
- **💡 Feedback Personalizado**: Dicas específicas para melhorar sua pronúncia.
- **🇧🇷 Interface em Português**: Feedback e instruções em português brasileiro.
- **⚡ Processamento em Tempo Real**: Resposta rápida após envio do áudio ou texto.

## 🛠️ Tecnologias Utilizadas

- **NestJS** - Framework Node.js para backend
- **TypeScript** - Linguagem de programação
- **WhatsApp Web.js** - Integração com WhatsApp
- **OpenAI Whisper** - Transcrição de áudio de alta qualidade
- **OpenAI (GPT-4 e GPT-3.5-turbo)** - Análise de pronúncia e detecção de idioma
- **QRCode Terminal** - Exibição do QR code no terminal

## 📋 Pré-requisitos

- Node.js (versão 16 ou superior)
- NPM ou Yarn
- Conta na OpenAI com API key
- WhatsApp instalado no celular

## ⚙️ Instalação

1. **Clone o repositório:**
   ```bash
   git clone git@github.com:LucasSiqueiraSurreco/whatsapp-polyglot-companion.git
   cd WhatsApp_english_companion
   ```

2. **Instale as dependências:**
   ```bash
   npm i
   ```

3. **Configure as variáveis de ambiente:**
   ```bash
   cp .env.example .env
   ```

   Edite o arquivo `.env` e adicione sua API key da OpenAI:
   ```
   OPENAI_API_KEY=sua_api_key_aqui
   ```

## 🚀 Como Usar

1. **Inicie o servidor:**
   ```bash
   npm run start:dev
   ```

2. **Escaneie o QR code:**
   - Um QR code aparecerá no terminal.
   - Abra o WhatsApp no seu celular, vá em **Configurações > Dispositivos conectados > Conectar um dispositivo** e escaneie o QR code.

3. **Envie áudios ou textos:**
   - **Áudio**: Grave uma mensagem de voz em qualquer idioma e envie.
   - **Texto**: Digite qualquer frase e envie.
   - **Comandos**: Digite `ajuda`, `help` ou `/start` para instruções.
   - Aguarde o feedback automático.

4. **Logout:**
    - Para deslogar, pare o servidor (`Ctrl+C`) e rode o comando:
    ```bash
    npm run logout
    ```
    - Isso removerá a sessão salva, e você precisará escanear o QR code novamente na próxima vez.

## 📱 Exemplo de Uso

**Você envia:** *[áudio falando "J'adore faire du skateboard."]*

**Bot responde:**
```
🇫🇷 Idioma detectado: francês

🎤 Transcrição:
"J'adore faire du skateboard."

📊 Avaliação da Pronúncia:
Sua pronúncia foi bastante clara e natural. No entanto, a entonação e o ritmo poderiam ser melhorados para dar mais fluência à frase.

⭐ Pontuação: 7/10

💡 Dicas:
Pratique a entonação, colocando mais ênfase nas sílabas corretas.,Tente falar a frase de maneira mais fluida, sem pausas desnecessárias.,Ouça falantes nativos de francês para melhorar a naturalidade da sua pronúncia.
```

## 🏗️ Arquitetura do Projeto

```
src/
├── whatsapp/           # Integração WhatsApp Web
│   └── whatsapp.service.ts
├── evaluation/         # Avaliação de pronúncia
│   └── evaluation.service.ts
├── app.module.ts       # Módulo principal
└── main.ts            # Ponto de entrada
```

### Fluxo de Funcionamento

1. **Recebimento**: WhatsApp detecta mensagem de voz ou texto.
2. **Download/Processamento**: Áudio é baixado; texto é lido.
3. **Detecção e Transcrição**: O idioma é detectado e o áudio transcrito pela API da OpenAI.
4. **Análise e Avaliação**: GPT-4 avalia a pronúncia (para áudios) ou o texto e gera feedback.
5. **Resposta**: Mensagem formatada é enviada de volta ao usuário.

## 📦 Scripts Disponíveis

- `npm run start:dev` - Inicia servidor de desenvolvimento.
- `npm run start:debug` - Inicia com debugger.
- `npm run build` - Compila TypeScript para produção.
- `npm run start` - Inicia servidor de produção.
- `npm run logout` - Remove a sessão do WhatsApp salva.

## 🔧 Configuração Avançada

### Personalizando Avaliações
Edite `src/evaluation/evaluation.service.ts` para ajustar os critérios de avaliação (prompt, escala de pontuação, etc.).

### Configurando Filtros
Por padrão, o bot processa mensagens de voz (`ptt`) e texto. Para modificar, edite `src/whatsapp/whatsapp.service.ts`.

## 🚨 Limitações

- Requer conexão estável com a internet.
- APIs da OpenAI são pagas.
- Funciona apenas com mensagens de voz (não áudio de mídia).
- Necessita manter o terminal/servidor rodando.
- Melhor qualidade com áudios claros e ambiente silencioso.

## 🔒 Segurança

- ✅ API keys ficam em variáveis de ambiente (`.env`).
- ✅ Arquivos temporários são automaticamente removidos.
- ✅ Sessão do WhatsApp é armazenada localmente. Use `npm run logout` para remover.
- ❌ Não armazene dados sensíveis no código.

## 🐛 Troubleshooting

### QR Code não aparece
- Verifique se não há firewall bloqueando a conexão.
- Reinicie o servidor.

### Erro de autenticação WhatsApp
- Use o comando `npm run logout` para limpar a sessão antiga.
- Reinicie o servidor e escaneie o QR code novamente.

### Erro na API da OpenAI
- Verifique se a API key está correta no arquivo `.env`.
- Confirme se há créditos na sua conta OpenAI.

##  Estimativa de Custos

**OpenAI API (muito acessível):**
- **Whisper**: $0.006 por minuto de áudio.
- **GPT-4**: ~$0.02 por análise de texto.
- **Custo total por áudio**: ~$0.03 (3 centavos de dólar).
- **100 áudios/mês**: ~$3 USD.

## Como os Tokens são Utilizados

A cobrança da OpenAI é baseada no uso de seus modelos, e este projeto utiliza dois tipos principais:

1.  **Transcrição de Áudio (Whisper)**
    - **Como é cobrado:** Por minuto de áudio enviado para a API.
    - **Otimização:** O projeto já é eficiente, pois o Whisper também detecta o idioma do áudio na mesma requisição, evitando uma chamada extra à API.

2.  **Análise e Avaliação (GPT)**
    - **Como é cobrado:** Por **tokens**. Um token equivale a aproximadamente 4 caracteres de texto. A cobrança inclui tanto os tokens que você **envia** (seu prompt + o texto do usuário) quanto os tokens que você **recebe** (a resposta gerada pela API).
    - **Otimização:** Para equilibrar custo e qualidade, o projeto usa estratégias diferentes:
        - **Detecção de Idioma (para textos):** Utiliza o modelo `gpt-3.5-turbo`, que é mais rápido e muito mais barato, ideal para tarefas simples.
        - **Avaliação de Pronúncia:** Utiliza o modelo `gpt-4`, que é mais poderoso e oferece a nuance necessária para um feedback de alta qualidade. Essa é a parte mais cara, mas justificada pela funcionalidade principal do bot.

Essa abordagem garante que o custo seja o menor possível sem sacrificar a qualidade da avaliação de pronúncia.

---

Feito com ❤️ para ajudar você a praticar novos idiomas!