import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';

type RequestWithHeaders = {
  headers: {
    authorization?: string;
  };
};

@Injectable()
export class BearerTokenFormatMiddleware implements NestMiddleware {
  use(request: RequestWithHeaders, _response: unknown, next: () => void): void {
    const authHeader = request.headers.authorization;

    if (authHeader && !/^Bearer\s+\S+$/i.test(authHeader)) {
      throw new UnauthorizedException('Malformed Authorization header. Expected: Bearer <token>.');
    }

    next();
  }
}
