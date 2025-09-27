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

  // Unknown ?
  latin: "desconhecido",
  la: "desconhecido",
  unknown: "desconhecido",
  und: "desconhecido",
};

const VALID_LANGUAGES = [
  "inglês",
  "português",
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
    feedback: `Consegui transcrever "${text}", mas não consegui identificar o idioma com certeza. Pode me dizer qual idioma você falou ou tentar falar um pouco mais claramente?`,
    tips: "Tente falar um pouco mais devagar ou repita a frase para melhor detecção do idioma.",
    language: "desconhecido",
  }),
  defaultEvaluation: {
    transcription: "Não foi possível processar o áudio.",
    score: 5,
    feedback:
      "Não foi possível analisar a pronúncia no momento. Tente novamente.",
    tips: "Continue praticando a pronúncia regularmente!",
    language: "desconhecido",
  },
};

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);
  private readonly openai: OpenAI;
  private readonly tempDir = "/tmp";

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
        audioBuffer,
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
      const detectedLanguage = await this.detectLanguageWithFallback(
        response.language || "unknown",
        response.text || ""
      );

      this.logger.log(`Final detected language: ${detectedLanguage}`);

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

  private async detectLanguageWithFallback(
    whisperLanguage: string,
    text: string
  ): Promise<string> {
    const normalizedLanguage = whisperLanguage.toLowerCase().trim();
    let detectedLanguageName = LANGUAGE_MAP[normalizedLanguage];

    // Sempre verificar com análise baseada em conteúdo
    const contentBasedLanguage = await this.detectLanguageFromContent(text);

    this.logger.log(
      `Whisper: "${detectedLanguageName}", Content: "${contentBasedLanguage}"`
    );

    // Priorizar análise de conteúdo se divergir
    if (
      this.shouldUseContentAnalysis(contentBasedLanguage, detectedLanguageName)
    ) {
      this.logger.log(`Using content analysis: ${contentBasedLanguage}`);
      return contentBasedLanguage;
    }

    return detectedLanguageName || "desconhecido";
  }

  private shouldUseContentAnalysis(
    contentLanguage: string,
    whisperLanguage: string | undefined
  ): boolean {
    return (
      contentLanguage &&
      contentLanguage !== "desconhecido" &&
      (contentLanguage !== whisperLanguage ||
        !whisperLanguage ||
        whisperLanguage === "desconhecido")
    );
  }

  private async detectLanguageFromContent(text: string): Promise<string> {
    if (!text || text.trim().length < 3) {
      return "desconhecido";
    }

    try {
      const prompt = this.buildLanguageDetectionPrompt(text);
      const completion = await this.callGPT(prompt, 20, 0.0);
      const detected = completion.trim().toLowerCase();

      this.logger.log(`Content-based detection: "${detected}"`);

      return VALID_LANGUAGES.includes(detected) ? detected : "desconhecido";
    } catch (error) {
      this.logger.error("Error in content-based language detection:", error);
      return "desconhecido";
    }
  }

  private async detectTextLanguage(text: string): Promise<string> {
    try {
      const prompt = this.buildTextLanguagePrompt(text);
      const completion = await this.callGPT(prompt, 20, 0.0);
      const detectedLanguage = completion.trim().toLowerCase();

      // Verificar correspondência exata primeiro
      if (VALID_LANGUAGES.includes(detectedLanguage)) {
        return detectedLanguage;
      }

      // Tentar correspondência parcial
      const partialMatch = VALID_LANGUAGES.find(
        (lang) =>
          detectedLanguage.includes(lang) || lang.includes(detectedLanguage)
      );

      if (partialMatch) {
        return partialMatch;
      }

      this.logger.warn(
        `Unknown language: ${detectedLanguage}, defaulting to inglês`
      );
      return "inglês";
    } catch (error) {
      this.logger.error("Error detecting text language:", error);
      return "inglês";
    }
  }

  private async evaluateAudioPronunciation(
    audioBuffer: Buffer,
    transcription: string,
    detectedLanguage: string,
    audioMetrics?: AudioMetrics
  ): Promise<LanguageEvaluation> {
    try {
      this.logger.log("Analyzing pronunciation with GPT-4...");

      const targetLanguage = LANGUAGE_TO_ENGLISH[detectedLanguage] || "English";
      const audioContext = this.buildAudioContext(audioMetrics, transcription);
      const prompt = this.buildEvaluationPrompt(
        transcription,
        targetLanguage,
        audioContext
      );

      const response = await this.callGPT(prompt, 1000, 0.3);
      const evaluation = this.parseEvaluationResponse(response);

      return {
        ...evaluation,
        language: detectedLanguage,
      };
    } catch (error) {
      this.logger.error("Error with GPT-4 evaluation:", error);
      return this.evaluatePronunciation(transcription, detectedLanguage);
    }
  }

  private async evaluatePronunciation(
    transcription: string,
    detectedLanguage: string
  ): Promise<LanguageEvaluation> {
    try {
      const prompt = this.buildTextEvaluationPrompt(
        transcription,
        detectedLanguage
      );
      const response = await this.callGPT(prompt, 1000, 0.7);
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
        tips: "Tente novamente em alguns instantes.",
        language: detectedLanguage,
      };
    }
  }

  private buildAudioContext(
    audioMetrics: AudioMetrics | undefined,
    transcription: string
  ): string {
    if (!audioMetrics) return "";

    const confidence = -audioMetrics.avgLogprob;
    const speechRate = transcription.split(" ").length / audioMetrics.duration;
    const qualityLevel = this.getQualityLevel(confidence);

    return `
CONTEXTO INTERNO PARA AVALIAÇÃO (NÃO MENCIONE NÚMEROS TÉCNICOS):
- A pronúncia parece estar no nível: ${qualityLevel}
- Velocidade da fala: ${speechRate?.toFixed(1)} palavras/segundo
- Duração: ${audioMetrics.duration?.toFixed(1)}s
- Número de palavras: ${transcription.split(" ").length}

IMPORTANTE: NÃO mencione "confiança", "métricas" ou números técnicos na resposta ao usuário.
`;
  }

  private getQualityLevel(confidence: number): string {
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
        tips: "Continue praticando regularmente!",
      };
    }
  }

  private async callGPT(
    prompt: string,
    maxTokens: number,
    temperature: number
  ): Promise<string> {
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
    });

    return completion.choices[0]?.message?.content || "";
  }

  private buildLanguageDetectionPrompt(text: string): string {
    return `Sua tarefa é identificar o idioma do texto abaixo.

IMPORTANTE: O usuário que enviou este texto NUNCA fala português. Se o texto parecer português, é um erro de transcrição ou detecção. Você deve escolher o idioma mais provável da lista abaixo, excluindo o português.

Texto para analisar:
"${text}"

Com base no texto, escolha um dos seguintes idiomas:
- inglês
- francês
- espanhol
- italiano
- alemão
- japonês
- coreano
- chinês
- russo
- árabe

Responda apenas com o nome do idioma em português.`;
  }

  private buildTextLanguagePrompt(text: string): string {
    return `Identifique o idioma do seguinte texto. Responda APENAS com uma das seguintes opções exatas:
- inglês
- português
- espanhol
- francês
- italiano
- alemão
- japonês
- coreano
- chinês
- russo
- árabe

Texto: "${text}"

Responda apenas uma palavra (o nome do idioma em português):`;
  }

  private buildEvaluationPrompt(
    transcription: string,
    targetLanguage: string,
    audioContext: string
  ): string {
    return `Você é um professor de ${targetLanguage} extremamente rigoroso. Seu objetivo é ajudar um estudante brasileiro a atingir a fluência, corrigindo erros de pronúncia e gramática de forma precisa.

TRANSCRIÇÃO: "${transcription}"
IDIOMA DETECTADO DO ÁUDIO: ${targetLanguage}

${audioContext}

🎯 AVALIAÇÃO GERAL (PRONÚNCIA E GRAMÁTICA):

PRIMEIRO PASSO: Verifique se o idioma da TRANSCRIÇÃO acima é o mesmo que o IDIOMA DETECTADO DO ÁUDIO (${targetLanguage}). Se a transcrição estiver em um idioma diferente, a transcrição falhou. Nesse caso, ignore o resto das instruções e responda APENAS com o seguinte JSON:
{
  "score": 0,
  "feedback": "Houve um erro na transcrição. O áudio parece ser em ${targetLanguage}, mas foi transcrito em outro idioma. Por favor, tente falar um pouco mais devagar e com mais clareza.",
  "tips": "Grave em um ambiente sem ruído para ajudar a IA a entender o idioma corretamente."
}

Se o idioma estiver correto, continue com a avaliação abaixo:

1. ANÁLISE GRAMATICAL:
   - Verifique se a frase transcrita está gramaticalmente correta.
   - Erros gramaticais graves DEVEM impactar NEGATIVAMENTE a pontuação final, mesmo que a pronúncia seja boa. O objetivo é a comunicação eficaz e CORRETA.

2. QUALIDADE DA PRONÚNCIA:
   - A transcrição correta é o requisito mínimo, não garante nota alta.
   - Avalie clareza, precisão dos fonemas, entonação e ritmo.
   - Sotaque é aceitável, mas erros de pronúncia que se distanciam muito do padrão devem diminuir a nota.

3. CRITÉRIOS DE PONTUAÇÃO (1 a 10) - SEJA MUITO RIGOROSO:
   - 10: Perfeito. Gramática impecável e pronúncia nativa.
   - 8-9: Excelente. Gramática correta e pronúncia muito clara com sotaque leve.
   - 6-7: Bom. Gramática correta com pequenos deslizes E/OU pronúncia clara com erros notáveis que não atrapalham.
   - 4-5: Regular. Erros gramaticais E/OU de pronúncia que dificultam a compreensão.
   - 1-3: Fraco. Erros graves de gramática e/ou pronúncia que impedem a comunicação.

4. NO SEU FEEDBACK:
   - Se houver erro gramatical, mencione-o PRIMEIRO e mostre a forma correta.
   - Fale sobre clareza, entonação e ritmo da pronúncia.
   - Seja específico sobre sons ou palavras que podem melhorar.

Responda no formato JSON SEM DADOS TÉCNICOS:
{
  "score": [um número de 1 a 10, baseado nos critérios RIGOROSOS acima],
  "feedback": "[Primeiro, a correção gramatical (se houver). Depois, a análise da pronúncia.]",
  "tips": "[Dicas para gramática e/ou pronúncia.]"
}`;
  }

  private buildTextEvaluationPrompt(
    transcription: string,
    detectedLanguage: string
  ): string {
    return `Você é um professor de ${detectedLanguage} brasileiro. Analise a seguinte transcrição de texto:

"${transcription}"

IMPORTANTE: Baseie-se apenas na correção textual, já que não há áudio disponível.

Forneça um feedback no formato JSON:
{
  "score": [número de 1 a 10],
  "feedback": "[análise da correção textual]",
  "tips": "[2-3 dicas para melhorar]"
}

Responda APENAS o JSON.`;
  }
}
