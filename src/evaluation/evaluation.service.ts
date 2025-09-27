import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import * as fs from "fs/promises";
import * as path from "path";
import { createReadStream, existsSync } from "fs";

export interface PronunciationEvaluation {
  score: number;
  feedback: string;
  tips: string;
}

export interface LanguageEvaluation extends PronunciationEvaluation {
  language: string;
}

export interface AudioEvaluation extends LanguageEvaluation {
  transcription: string;
}

interface TranscriptionResult {
  text: string;
  language: string;
  audioMetrics?: AudioMetrics;
}

interface AudioMetrics {
  duration: number;
  words: any[];
  segments: any[];
  avgLogprob: number;
  noSpeechProb: number;
}

interface EvaluationResponse {
  score: number;
  feedback: string;
  tips: string;
}

const LANGUAGE_MAP: Record<string, string> = {
  // English
  en: "inglês",
  eng: "inglês",
  english: "inglês",
  "en-us": "inglês",
  "en-gb": "inglês",

  // Portuguese
  pt: "português",
  por: "português",
  portuguese: "português",
  "pt-br": "português",
  "pt-pt": "português",

  // Spanish
  es: "espanhol",
  esp: "espanhol",
  spanish: "espanhol",
  "es-es": "espanhol",
  "es-mx": "espanhol",

  // French
  fr: "francês",
  fra: "francês",
  french: "francês",
  "fr-fr": "francês",
  "fr-ca": "francês",

  // Italian
  it: "italiano",
  ita: "italiano",
  italian: "italiano",
  "it-it": "italiano",

  // German
  de: "alemão",
  deu: "alemão",
  german: "alemão",
  "de-de": "alemão",

  // Japanese
  ja: "japonês",
  jpn: "japonês",
  japanese: "japonês",
  "ja-jp": "japonês",

  // Korean
  ko: "coreano",
  kor: "coreano",
  korean: "coreano",
  "ko-kr": "coreano",

  // Chinese
  zh: "chinês",
  zho: "chinês",
  chinese: "chinês",
  "zh-cn": "chinês",
  "zh-tw": "chinês",
  mandarin: "chinês",

  // Russian
  ru: "russo",
  rus: "russo",
  russian: "russo",
  "ru-ru": "russo",

  // Arabic
  ar: "árabe",
  ara: "árabe",
  arabic: "árabe",
  "ar-sa": "árabe",

  // Unknown
  latin: "desconhecido",
  la: "desconhecido",
  unknown: "desconhecido",
  und: "desconhecido",
};

const VALID_LANGUAGES = [
  "inglês",
  "espanhol",
  "francês",
  "italiano",
  "alemão",
  "japonês",
  "coreano",
  "chinês",
  "russo",
  "árabe",
];

const LANGUAGE_TO_ENGLISH: Record<string, string> = {
  inglês: "English",
  português: "Portuguese",
  espanhol: "Spanish",
  francês: "French",
  italiano: "Italian",
  alemão: "German",
  japonês: "Japanese",
  coreano: "Korean",
  chinês: "Chinese",
  russo: "Russian",
  árabe: "Arabic",
};

const DEFAULT_RESPONSES = {
  transcriptionError: {
    transcription: "Não foi possível transcrever automaticamente.",
    score: 0,
    feedback:
      "Tente enviar o áudio novamente ou digite o texto que você falou.",
    tips: "Para melhor resultado, grave em ambiente silencioso e fale claramente.",
    language: "desconhecido",
  },
  unknownLanguage: (text: string) => ({
    transcription: text,
    score: 0,
    feedback: `Consegui transcrever "${text}", mas não consegui identificar o idioma. Pode repetir mais claramente?`,
    tips: "Fale um pouco mais devagar para melhor detecção.",
    language: "desconhecido",
  }),
  defaultEvaluation: {
    transcription: "Não foi possível processar o áudio.",
    score: 5,
    feedback: "Não foi possível analisar a pronúncia no momento.",
    tips: "Continue praticando!",
    language: "desconhecido",
  },
};

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);
  private readonly openai: OpenAI;
  private readonly tempDir = "/tmp/claude";

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>("OPENAI_API_KEY"),
    });
  }

  async evaluateAudio(
    audioBuffer: Buffer,
    language?: string
  ): Promise<AudioEvaluation> {
    try {
      const transcriptionResult = await this.transcribeAudioLocal(audioBuffer);

      if (transcriptionResult.text === "Erro na transcrição do áudio.") {
        return DEFAULT_RESPONSES.transcriptionError;
      }

      if (transcriptionResult.language === "desconhecido") {
        return DEFAULT_RESPONSES.unknownLanguage(transcriptionResult.text);
      }

      const evaluation = await this.evaluateAudioPronunciation(
        transcriptionResult.text,
        transcriptionResult.language,
        transcriptionResult.audioMetrics
      );

      return {
        transcription: transcriptionResult.text,
        ...evaluation,
        language: transcriptionResult.language,
      };
    } catch (error) {
      this.logger.error("Error evaluating pronunciation:", error);
      return DEFAULT_RESPONSES.defaultEvaluation;
    }
  }

  async evaluateText(text: string): Promise<LanguageEvaluation> {
    const detectedLanguage = await this.detectTextLanguage(text);
    return this.evaluatePronunciation(text, detectedLanguage);
  }

  private async transcribeAudioLocal(
    audioBuffer: Buffer
  ): Promise<TranscriptionResult> {
    const tempFile = await this.createTempFile(audioBuffer);

    try {
      const response = await this.callWhisperAPI(tempFile);
      const audioMetrics = this.extractAudioMetrics(response);

      const whisperLang = response.language || "unknown";
      const normalizedLang = whisperLang.toLowerCase().trim();
      let detectedLanguage = LANGUAGE_MAP[normalizedLang] || "desconhecido";

      if (
        detectedLanguage === "português" ||
        detectedLanguage === "desconhecido"
      ) {
        detectedLanguage = await this.quickLanguageCheck(response.text || "");
      }

      this.logger.log(`Language detected: ${detectedLanguage}`);

      return {
        text: response.text || "Não foi possível transcrever o áudio.",
        language: detectedLanguage,
        audioMetrics,
      };
    } catch (error) {
      this.logger.error("Error transcribing audio:", error);
      return {
        text: "Erro na transcrição do áudio.",
        language: "desconhecido",
      };
    } finally {
      await this.cleanupTempFile(tempFile);
    }
  }

  private async createTempFile(audioBuffer: Buffer): Promise<string> {
    const tempFile = path.join(this.tempDir, `audio_${Date.now()}.ogg`);

    if (!existsSync(this.tempDir)) {
      await fs.mkdir(this.tempDir, { recursive: true });
    }

    await fs.writeFile(tempFile, audioBuffer);
    return tempFile;
  }

  private async callWhisperAPI(tempFile: string): Promise<any> {
    this.logger.log("Transcribing audio with OpenAI Whisper...");

    return this.openai.audio.transcriptions.create({
      file: createReadStream(tempFile),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });
  }

  private extractAudioMetrics(response: any): AudioMetrics {
    const segments = response.segments || [];

    return {
      duration: response.duration,
      words: response.words || [],
      segments,
      avgLogprob: this.calculateAvgLogprob(segments),
      noSpeechProb: this.calculateNoSpeechProb(segments),
    };
  }

  private calculateAvgLogprob(segments: any[]): number {
    if (segments.length === 0) return -0.5;
    return (
      segments.reduce((acc, seg) => acc + (seg.avg_logprob || 0), 0) /
      segments.length
    );
  }

  private calculateNoSpeechProb(segments: any[]): number {
    if (segments.length === 0) return 0.1;
    return (
      segments.reduce((acc, seg) => acc + (seg.no_speech_prob || 0), 0) /
      segments.length
    );
  }

  private async cleanupTempFile(tempFile: string): Promise<void> {
    try {
      if (existsSync(tempFile)) {
        await fs.unlink(tempFile);
      }
    } catch (error) {
      this.logger.warn(`Failed to cleanup temp file: ${tempFile}`, error);
    }
  }

  private async quickLanguageCheck(text: string): Promise<string> {
    if (!text || text.trim().length < 3) {
      return "desconhecido";
    }

    try {
      const prompt = `Lang of "${text.substring(0, 50)}"?
Reply ONLY: en/es/fr/it/de/ja/ko/zh/ru/ar/unknown`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 50,
        temperature: 0.0,
      });

      const detected =
        completion.choices[0]?.message?.content?.trim().toLowerCase() ||
        "unknown";

      const quickMap: Record<string, string> = {
        en: "inglês",
        es: "espanhol",
        fr: "francês",
        it: "italiano",
        de: "alemão",
        ja: "japonês",
        ko: "coreano",
        zh: "chinês",
        ru: "russo",
        ar: "árabe",
        unknown: "desconhecido",
      };

      return quickMap[detected] || "desconhecido";
    } catch (error) {
      this.logger.error("Quick language check failed:", error);
      return "desconhecido";
    }
  }

  private async detectTextLanguage(text: string): Promise<string> {
    try {
      const prompt = `Lang: "${text.substring(0, 50)}"
Reply: inglês/espanhol/francês/italiano/alemão/japonês/coreano/chinês/russo/árabe`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 10,
        temperature: 0.0,
      });

      const detectedLanguage =
        completion.choices[0]?.message?.content?.trim().toLowerCase() ||
        "inglês";

      if (VALID_LANGUAGES.includes(detectedLanguage)) {
        return detectedLanguage;
      }

      return "inglês";
    } catch (error) {
      this.logger.error("Error detecting text language:", error);
      return "inglês";
    }
  }

  private async evaluateAudioPronunciation(
    transcription: string,
    detectedLanguage: string,
    audioMetrics?: AudioMetrics
  ): Promise<LanguageEvaluation> {
    try {
      this.logger.log("Evaluating pronunciation with optimized GPT-4...");

      const targetLanguage = LANGUAGE_TO_ENGLISH[detectedLanguage] || "English";
      const qualityLevel = this.getQualityLevel(audioMetrics);

      const prompt = `Professor de ${targetLanguage} avaliando aluno brasileiro.
Transcrição: "${transcription}"
Qualidade áudio: ${qualityLevel}

Avaliar:
1) Gramática correta?
2) Pronúncia clara?
3) Nota 1-10 (seja rigoroso)

JSON apenas:
{"score":N,"feedback":"max 100 chars","tips":"max 50 chars"}`;

      const response = await this.callGPT(prompt, 200, 0.3, "gpt-4o-mini");
      const evaluation = this.parseEvaluationResponse(response);

      return {
        ...evaluation,
        language: detectedLanguage,
      };
    } catch (error) {
      this.logger.error("Error with GPT evaluation:", error);
      return this.evaluatePronunciation(transcription, detectedLanguage);
    }
  }

  private async evaluatePronunciation(
    transcription: string,
    detectedLanguage: string
  ): Promise<LanguageEvaluation> {
    try {
      const prompt = `Avalie texto em ${detectedLanguage}:
"${transcription}"
JSON: {"score":1-10,"feedback":"erro se houver","tips":"dica breve"}`;

      const response = await this.callGPT(prompt, 150, 0.5, "gpt-3.5-turbo");
      const evaluation = this.parseEvaluationResponse(response);

      return {
        ...evaluation,
        language: detectedLanguage,
      };
    } catch (error) {
      this.logger.error("Error evaluating pronunciation:", error);
      return {
        score: 5,
        feedback: "Erro ao analisar.",
        tips: "Tente novamente.",
        language: detectedLanguage,
      };
    }
  }

  private getQualityLevel(audioMetrics?: AudioMetrics): string {
    if (!audioMetrics) return "regular";

    const confidence = -audioMetrics.avgLogprob;
    if (confidence > 0.7) return "excelente";
    if (confidence > 0.4) return "boa";
    if (confidence > 0.2) return "regular";
    return "difícil";
  }

  private parseEvaluationResponse(response: string): EvaluationResponse {
    try {
      const evaluation = JSON.parse(response.trim());
      return {
        score: evaluation.score || 5,
        feedback: evaluation.feedback || "Feedback não disponível",
        tips: evaluation.tips || "Continue praticando!",
      };
    } catch (error) {
      this.logger.error("Error parsing evaluation JSON:", error);
      return {
        score: 5,
        feedback: "Não foi possível analisar no momento.",
        tips: "Continue praticando!",
      };
    }
  }

  private async callGPT(
    prompt: string,
    maxTokens: number,
    temperature: number,
    model: string = "gpt-3.5-turbo"
  ): Promise<string> {
    const completion = await this.openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
    });

    return completion.choices[0]?.message?.content || "";
  }
}
