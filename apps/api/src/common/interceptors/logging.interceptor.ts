import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, originalUrl } = req;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          this.logger.log(`${method} ${originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
        },
        error: (err) => {
          this.logger.warn(
            `${method} ${originalUrl} failed in ${Date.now() - startedAt}ms: ${err?.message || err}`
          );
        },
      })
    );
  }
}
