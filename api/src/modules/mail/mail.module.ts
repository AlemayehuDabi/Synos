import { Global, Module } from '@nestjs/common';
import { MAIL_PROVIDER } from './mail.interface.js';
import { DevMailProvider } from './dev-mail.provider.js';

@Global()
@Module({
  providers: [{ provide: MAIL_PROVIDER, useClass: DevMailProvider }],
  exports: [MAIL_PROVIDER],
})
export class MailModule {}
