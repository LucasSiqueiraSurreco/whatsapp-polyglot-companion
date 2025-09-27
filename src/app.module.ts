import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppService } from './whatsapp/whatsapp.service';
import { EvaluationService } from './evaluation/evaluation.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  providers: [WhatsAppService, EvaluationService],
})
export class AppModule {}
