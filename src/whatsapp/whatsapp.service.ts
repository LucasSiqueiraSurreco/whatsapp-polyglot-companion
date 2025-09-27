import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
} from "@nestjs/common";
import {
  EvaluationService,
  AudioEvaluation,
  LanguageEvaluation,
} from "../evaluation/evaluation.service";
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

@Injectable()
export class WhatsAppService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WhatsAppService.name);
  private client: any;

  constructor(private readonly evaluationService: EvaluationService) {
    this.logger.log("WhatsAppService initialized");
  }

  async onModuleInit() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    this.client.on("qr", (qr: string) => {
      this.logger.log("QR Code received, scan it with your phone:");
      qrcode.generate(qr, { small: true });
    });

    this.client.on("ready", () => {
      this.logger.log("✅ WhatsApp client is ready!");
    });

    this.client.on("authenticated", () => {
      this.logger.log("🔐 WhatsApp authenticated successfully!");
    });

    this.client.on("auth_failure", (msg: string) => {
      this.logger.error("❌ Authentication failed:", msg);
    });

    this.client.on("disconnected", (reason: string) => {
      this.logger.log("📱 WhatsApp client disconnected:", reason);
    });

    this.client.on("message", async (message: any) => {
      await this.handleMessage(message);
    });

    await this.client.initialize();
  }

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`Shutting down WhatsApp client (signal: ${signal})`);
    await this.client.destroy();
  }

  private async handleMessage(message: any) {
    try {
      if (message.from.includes("@g.us") || message.fromMe) {
        return;
      }

      this.logger.log(`Received message from ${message.from}: ${message.type}`);

      if (message.type === "ptt" || message.type === "audio") {
        this.logger.log("Processing voice message...");

        const media = await message.downloadMedia();
        if (!media) {
          await message.reply(
            "❌ Não foi possível baixar o áudio. Tente novamente."
          );
          return;
        }

        const audioBuffer = Buffer.from(media.data, "base64");

        try {
          const evaluation = await this.evaluationService.evaluateAudio(
            audioBuffer
          );
          const responseMessage = this.formatResponse(evaluation);

          await message.reply(responseMessage);
          this.logger.log("Response sent successfully");
        } catch (error) {
          this.logger.error("Error processing audio:", error);
          await message.reply(
            "❌ Houve um erro ao processar seu áudio. Tente novamente mais tarde."
          );
        }
      } else if (message.type === "chat") {
        const text = message.body.toLowerCase();
        if (
          text.includes("ajuda") ||
          text.includes("help") ||
          text === "/start"
        ) {
          const helpMessage = `🎤 *WhatsApp English Companion*\n\n📝 *Como usar:*\n• Digite um texto em qualquer idioma para análise\n• Ou envie um áudio em qualquer idioma\n\n✅ Receba feedback sobre pronúncia\n✅ Dicas para melhorar\n✅ Pontuação de 1-10\n\n🚀 Vamos praticar juntos!`;
          await message.reply(helpMessage);
        } else if (text.length > 3) {
          try {
            const evaluation = await this.evaluationService.evaluateText(text);
            const responseMessage = this.formatTextResponse(text, evaluation);
            await message.reply(responseMessage);
            this.logger.log("Text evaluation sent successfully");
          } catch (error) {
            this.logger.error("Error evaluating text:", error);
            await message.reply(
              "❌ Houve um erro ao analisar seu texto. Tente novamente."
            );
          }
        }
      }
    } catch (error) {
      this.logger.error("Error handling message:", error);
    }
  }

  private formatResponse(evaluation: AudioEvaluation): string {
    const languageEmoji = this.getLanguageEmoji(evaluation.language);

    return `${languageEmoji} *Idioma detectado:* ${evaluation.language}

🎤 *Você disse:*
"${evaluation.transcription}"

📊 *Análise da Pronúncia:*
${evaluation.feedback}

⭐ *Pontuação:* ${evaluation.score}/10

💡 *Dicas:*
${evaluation.tips}`;
  }

  private getLanguageEmoji(language: string): string {
    const emojiMap: { [key: string]: string } = {
      inglês: "🇺🇸",
      português: "🇧🇷",
      espanhol: "🇪🇸",
      francês: "🇫🇷",
      italiano: "🇮🇹",
      alemão: "🇩🇪",
      japonês: "🇯🇵",
      coreano: "🇰🇷",
      chinês: "🇨🇳",
      russo: "🇷🇺",
      árabe: "🇸🇦",
    };

    return emojiMap[language] || "🌍";
  }

  private formatTextResponse(
    text: string,
    evaluation: LanguageEvaluation
  ): string {
    const languageEmoji = this.getLanguageEmoji(evaluation.language);

    return `${languageEmoji} *Idioma detectado:* ${evaluation.language}

📝 *Texto analisado:*
"${text}"

📊 *Análise da Pronúncia:*
${evaluation.feedback}

⭐ *Pontuação:* ${evaluation.score}/10

💡 *Dicas:*
${evaluation.tips}`;
  }
}
